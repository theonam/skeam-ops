import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { can } from "@/domain/access";
import { parisDate } from "@/domain/dates";
import { documentEmailInput } from "@/domain/outbound-email";
import { HttpError } from "@/server/api";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { attachments, clients, documentLines, documents, outboundEmails } from "@/server/db/schema";
import { mailSender } from "@/server/mail/sender";
import { storage } from "@/server/storage";
import { getSettings, type Settings } from "@/server/settings";
import { documentPlaceholders, fillTemplate, pdfFilename } from "@/lib/documents/placeholders";
import { renderDocumentHtml } from "@/lib/documents/template";
import { buildDocumentView, type AnnexImage, type DocumentView, type LineInput } from "@/lib/documents/view";
import { embeddedFonts, htmlToPdf } from "./pdf";
import { markSent } from "./service";

/**
 * Sorties d'un document : PDF et brouillon de mail Outlook.
 *
 * Le PDF d'un document émis est produit une seule fois, sous verrou, puis toujours resservi à
 * l'identique : deux demandes simultanées ne peuvent plus produire deux fichiers différents, et le
 * PDF joint au mail est celui de l'archive. Correction du défaut relevé dans egm-app
 * `src/server/invoices/service.ts` (`invoicePdf`), voir socle/AUDIT.md § 6.4 et socle/REPORTS-EGM.md.
 *
 * Origine : egm-app `src/server/invoices/service.ts` (`invoicePdf`, `prepareInvoiceEmail`) et
 * `src/server/quotes/annex.ts` pour les annexes.
 */

export type PdfRenderer = (html: string, footerLabel: string) => Promise<Uint8Array>;

type Executor = Pick<typeof db, "select">;

const ANNEX_MAX_SIDE = 1600;

/** Photos et croquis du document repris en annexe, en images intégrées : le PDF ne dépend d'aucun lien. */
async function annexImages(executor: Executor, documentId: string): Promise<AnnexImage[]> {
  const rows = await executor
    .select({ id: attachments.id, key: attachments.storageKey, name: attachments.originalFilename, mimeType: attachments.mimeType })
    .from(attachments)
    .where(
      and(
        eq(attachments.documentId, documentId),
        inArray(attachments.kind, ["photo", "sketch"]),
        eq(attachments.inAnnex, true),
        sql`not exists (select 1 from "sketches" where "sketches"."background_attachment_id" = "attachments"."id")`,
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.sortOrder));
  const images: AnnexImage[] = [];
  for (const row of rows) {
    const object = await storage().get(row.key);
    if (!object) continue;
    try {
      const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
      const jpeg = await sharp(bytes, { failOn: "none" }).rotate().resize(ANNEX_MAX_SIDE, ANNEX_MAX_SIDE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      images.push({ id: row.id, src: `data:image/jpeg;base64,${jpeg.toString("base64")}`, caption: row.name });
    } catch {
      // Image illisible ici, HEIC par exemple : elle reste jointe à la fiche, hors annexe.
    }
  }
  return images;
}

/** Vue du document telle qu'elle s'imprime : figée pour un document émis, courante pour un brouillon. */
async function documentView(executor: Executor, id: string, settings: Settings): Promise<{ view: DocumentView; number: string | null; clientName: string; subject: string; date: string; status: string; pdfKey: string | null }> {
  const [doc] = await executor
    .select({
      type: documents.type,
      status: documents.status,
      number: documents.number,
      subject: documents.subject,
      documentDate: documents.documentDate,
      dueDate: documents.dueDate,
      buyerName: documents.buyerName,
      buyerAddress: documents.buyerAddress,
      iban: documents.iban,
      bic: documents.bic,
      pdfKey: documents.pdfStorageKey,
      clientName: clients.name,
      clientLine1: clients.line1,
      clientPostalCode: clients.postalCode,
      clientCity: clients.city,
    })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(eq(documents.id, id));
  if (!doc) throw new HttpError(404, "Document introuvable.");
  const lines = await executor
    .select({ type: documentLines.type, code: documentLines.code, label: documentLines.label, unit: documentLines.unit, quantityMilli: documentLines.quantityMilli, unitPriceCents: documentLines.unitPriceCents, vatRateBp: documentLines.vatRateBp })
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(asc(documentLines.position));
  const draft = doc.status === "draft";
  const date = doc.documentDate ?? parisDate(new Date());
  const view = buildDocumentView({
    type: doc.type,
    number: doc.number,
    status: doc.status,
    date,
    dueDate: doc.dueDate,
    subject: doc.subject,
    // Un document émis garde l'acheteur et les coordonnées bancaires de son émission.
    company: draft ? settings.company : { ...settings.company, iban: doc.iban, bic: doc.bic },
    buyer: draft
      ? { name: doc.clientName, address: [doc.clientLine1, [doc.clientPostalCode, doc.clientCity].filter(Boolean).join(" ")].filter(Boolean).join("\n") }
      : { name: doc.buyerName ?? doc.clientName, address: doc.buyerAddress },
    lines: lines as LineInput[],
    annex: await annexImages(executor, id),
  });
  return { view, number: doc.number, clientName: doc.buyerName ?? doc.clientName, subject: doc.subject, date, status: doc.status, pdfKey: doc.pdfKey };
}

function filenameOf(settings: Settings, d: { number: string | null; clientName: string; subject: string; date: string }): string {
  return pdfFilename(settings.pdfFilenamePattern, documentPlaceholders({ number: d.number ?? "brouillon", clientName: d.clientName, subject: d.subject, date: d.date }));
}

async function readStored(key: string): Promise<Uint8Array | null> {
  const object = await storage().get(key);
  return object ? new Uint8Array(await new Response(object.body).arrayBuffer()) : null;
}

export type RenderedPdf = { pdf: Uint8Array; filename: string; number: string | null; archived: boolean };

/**
 * PDF d'un document. Brouillon : produit à la demande, jamais archivé. Document émis : le PDF archivé ;
 * s'il manque, il est produit sous le verrou de la ligne du document, archivé, et la clé enregistrée
 * une fois pour toutes. Null si le profil ne voit pas les prix.
 */
export async function documentPdf(user: CurrentUser, id: string, render: PdfRenderer = defaultRenderer): Promise<RenderedPdf | null> {
  if (!can(user.profile, "documents.read") || !can(user.profile, "prices.read")) return null;
  const settings = await getSettings();
  const [current] = await db.select({ status: documents.status, key: documents.pdfStorageKey }).from(documents).where(eq(documents.id, id));
  if (!current) return null;

  if (current.status === "draft") {
    const d = await documentView(db, id, settings);
    const pdf = await render(renderDocumentHtml(d.view, await embeddedFonts()), `${d.view.title} brouillon`);
    return { pdf, filename: filenameOf(settings, d), number: null, archived: false };
  }

  if (current.key) {
    const stored = await readStored(current.key);
    if (stored) {
      const d = await documentView(db, id, settings);
      return { pdf: stored, filename: filenameOf(settings, d), number: d.number, archived: true };
    }
  }

  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ key: documents.pdfStorageKey }).from(documents).where(eq(documents.id, id)).for("update");
    const d = await documentView(tx, id, settings);
    if (locked.key) {
      const stored = await readStored(locked.key);
      if (stored) return { pdf: stored, filename: filenameOf(settings, d), number: d.number, archived: true };
      throw new HttpError(500, "PDF archivé introuvable dans le stockage : restaurer la sauvegarde des fichiers.");
    }
    const pdf = await render(renderDocumentHtml(d.view, await embeddedFonts()), `${d.view.title} ${d.number}`);
    const key = `documents/${id}/${(d.number ?? "document").toLowerCase().replace(/[^a-z0-9-]/g, "-")}.pdf`;
    await storage().put(key, pdf, "application/pdf");
    await tx.update(documents).set({ pdfStorageKey: key }).where(eq(documents.id, id));
    await audit(tx, user, { action: "archivage_pdf", entity: "document", entityId: id, summary: `PDF de ${d.number} archivé` });
    return { pdf, filename: filenameOf(settings, d), number: d.number, archived: true };
  });
}

function defaultRenderer(html: string, footer: string) {
  return htmlToPdf(html, footer);
}

export type EmailDraft = { filename: string; contentType: string; content: string };

/** Modèle de mail proposé pour un document : objet et message tirés des paramètres. */
export async function emailTemplate(user: CurrentUser, id: string): Promise<{ to: string; subject: string; body: string } | null> {
  if (!can(user.profile, "prices.read")) return null;
  const settings = await getSettings();
  const [doc] = await db
    .select({ type: documents.type, number: documents.number, subject: documents.subject, date: documents.documentDate, clientName: clients.name, email: clients.email })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(eq(documents.id, id));
  if (!doc) return null;
  const values = documentPlaceholders({ number: doc.number ?? "", clientName: doc.clientName, subject: doc.subject, date: doc.date ?? "" });
  const quote = doc.type === "quote";
  return {
    to: doc.email ?? "",
    subject: fillTemplate(quote ? settings.quoteEmailSubject : settings.invoiceEmailSubject, values),
    body: fillTemplate(quote ? settings.quoteEmailBody : settings.invoiceEmailBody, values),
  };
}

/**
 * Brouillon Outlook du document émis, PDF archivé joint ; trace dans `outbound_emails` et dans le
 * journal, document passé à « envoyé ».
 */
export async function prepareDocumentEmail(user: CurrentUser, id: string, raw: unknown, render: PdfRenderer = defaultRenderer): Promise<{ download: EmailDraft; status: string }> {
  if (!can(user.profile, "documents.write") || !can(user.profile, "prices.read")) throw new HttpError(403, "Envoi non autorisé pour votre profil.");
  const input = documentEmailInput.parse(raw);
  const [doc] = await db.select({ status: documents.status }).from(documents).where(eq(documents.id, id));
  if (!doc) throw new HttpError(404, "Document introuvable.");
  if (doc.status === "draft") throw new HttpError(409, "Émettez le document avant de l'envoyer.");
  if (doc.status === "cancelled") throw new HttpError(409, "Ce document est annulé.");
  const rendered = await documentPdf(user, id, render);
  if (!rendered) throw new HttpError(404, "Document introuvable.");
  const sender = mailSender();
  const outcome = await sender.deliver(
    { to: input.to, cc: input.cc, subject: input.subject, text: input.body, attachments: [{ filename: rendered.filename, contentType: "application/pdf", content: rendered.pdf }] },
    rendered.filename.replace(/\.pdf$/, ""),
  );
  if (outcome.status !== "draft_generated") throw new Error("Seul le brouillon Outlook est prévu.");
  const [archived] = await db.select({ key: documents.pdfStorageKey }).from(documents).where(eq(documents.id, id));
  const status = await db.transaction(async (tx) => {
    const next = await markSent(tx, id);
    await tx.insert(outboundEmails).values({
      documentId: id,
      senderImpl: sender.impl,
      toAddresses: input.to,
      ccAddresses: input.cc,
      subject: input.subject,
      body: input.body,
      pdfStorageKey: archived?.key ?? null,
      generatedById: user.id,
    });
    await audit(tx, user, { action: "mail_prepare", entity: "document", entityId: id, summary: `Brouillon Outlook pour ${input.to.join(", ")}` });
    return next;
  });
  return { download: outcome.download, status };
}
