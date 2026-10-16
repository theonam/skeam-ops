import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { can, redact, visibleColumns } from "@/domain/access";
import { addDays, parisDate } from "@/domain/dates";
import { DOCUMENT_STATUS, DOCUMENT_TYPE, type DocumentStatus, type DocumentType } from "@/domain/enums";
import { computeTotals } from "@/domain/totals";
import { HttpError } from "@/server/api";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { clients, documentLines, documents, documentVat } from "@/server/db/schema";
import { nextDocumentNumber } from "@/server/numbering";
import { getSettings } from "@/server/settings";

/**
 * Documents commerciaux à lignes, devis et factures : brouillon, émission numérotée, annulation.
 * Toute lecture passe par `visibleColumns` : un profil sans droit sur les prix ne reçoit aucun montant,
 * ni à l'écran ni par l'API.
 *
 * Origine : egm-app `src/server/quotes/` et `src/server/invoices/service.ts`, réunis en un service
 * générique ; l'émission reprend le verrou et la numérotation dans la même transaction.
 */

const lineSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    articleId: z.uuid().nullable().optional(),
    code: z.string().trim().max(40).nullable().optional(),
    label: z.string().trim().min(1, "Libellé de ligne manquant.").max(500),
    unit: z.string().trim().max(20).nullable().optional(),
    quantityMilli: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    unitPriceCents: z.number().int().min(-100_000_000_00).max(100_000_000_00),
    vatRateBp: z.number().int().min(0).max(10_000),
  }),
  z.object({ type: z.literal("title"), label: z.string().trim().max(300) }),
  z.object({ type: z.literal("note"), label: z.string().trim().max(4000) }),
  z.object({ type: z.literal("subtotal"), label: z.string().optional() }),
]);

export const draftInput = z.object({
  clientId: z.uuid({ error: "Client manquant." }),
  subject: z.string().trim().max(300),
  lines: z.array(lineSchema).max(1000, "1 000 lignes au plus."),
});
export type DraftInput = z.infer<typeof draftInput>;

export const createInput = z.object({
  type: z.enum(DOCUMENT_TYPE.values),
  clientId: z.uuid({ error: "Client manquant." }),
  subject: z.string().trim().max(300).default(""),
});

const documentColumns = {
  id: documents.id,
  type: documents.type,
  status: documents.status,
  number: documents.number,
  clientId: documents.clientId,
  clientName: clients.name,
  subject: documents.subject,
  documentDate: documents.documentDate,
  dueDate: documents.dueDate,
  totalHtCents: documents.totalHtCents,
  totalVatCents: documents.totalVatCents,
  totalTtcCents: documents.totalTtcCents,
  issuedAt: documents.issuedAt,
  cancelReason: documents.cancelReason,
  updatedAt: documents.updatedAt,
};

export type DocumentRow = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  clientId: string;
  clientName: string;
  subject: string;
  documentDate: string | null;
  dueDate: string | null;
  totalHtCents?: number;
  totalVatCents?: number;
  totalTtcCents?: number;
  issuedAt: string | null;
  cancelReason: string | null;
  updatedAt: string;
};

function toRow(r: Record<string, unknown>): DocumentRow {
  return {
    ...(r as Omit<DocumentRow, "issuedAt" | "updatedAt">),
    issuedAt: r.issuedAt instanceof Date ? r.issuedAt.toISOString() : null,
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

function requireRead(user: CurrentUser) {
  if (!can(user.profile, "documents.read")) throw new HttpError(404, "Document introuvable.");
}

/** Écrire un brouillon suppose de voir ses prix : sans ce droit, pas de modification. */
function requireWrite(user: CurrentUser) {
  if (!can(user.profile, "documents.write") || !can(user.profile, "prices.read")) throw new HttpError(403, "Modification non autorisée pour votre profil.");
}

export async function listDocuments(user: CurrentUser): Promise<DocumentRow[]> {
  requireRead(user);
  const rows = await db
    .select(visibleColumns(user.profile, "documents", documentColumns))
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .orderBy(desc(documents.createdAt));
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

export type LineView = {
  id: string;
  position: number;
  type: "item" | "title" | "note" | "subtotal";
  articleId: string | null;
  code: string | null;
  label: string;
  unit: string | null;
  quantityMilli: number | null;
  unitPriceCents?: number | null;
  vatRateBp: number | null;
  totalHtCents?: number | null;
};

export type DocumentDetail = DocumentRow & {
  buyerName: string | null;
  buyerAddress: string | null;
  lines: LineView[];
  vat?: { rateBp: number; baseCents: number; vatCents: number }[];
  pdfAvailable: boolean;
};

export async function getDocument(user: CurrentUser, id: string): Promise<DocumentDetail | null> {
  requireRead(user);
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({
      ...visibleColumns(user.profile, "documents", documentColumns),
      buyerName: documents.buyerName,
      buyerAddress: documents.buyerAddress,
    })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(eq(documents.id, id));
  if (!row) return null;
  const lines = await db
    .select(
      visibleColumns(user.profile, "documentLines", {
        id: documentLines.id,
        position: documentLines.position,
        type: documentLines.type,
        articleId: documentLines.articleId,
        code: documentLines.code,
        label: documentLines.label,
        unit: documentLines.unit,
        quantityMilli: documentLines.quantityMilli,
        unitPriceCents: documentLines.unitPriceCents,
        vatRateBp: documentLines.vatRateBp,
        totalHtCents: documentLines.totalHtCents,
      }),
    )
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(asc(documentLines.position));
  const detail: DocumentDetail = {
    ...toRow(row as Record<string, unknown>),
    buyerName: row.buyerName,
    buyerAddress: row.buyerAddress,
    lines: lines as LineView[],
    pdfAvailable: can(user.profile, "prices.read"),
  };
  if (can(user.profile, "prices.read")) {
    detail.vat = await db
      .select({ rateBp: documentVat.rateBp, baseCents: documentVat.baseCents, vatCents: documentVat.vatCents })
      .from(documentVat)
      .where(eq(documentVat.documentId, id))
      .orderBy(desc(documentVat.rateBp));
  }
  return redact(user.profile, "documents", detail) as DocumentDetail;
}

export async function createDraft(user: CurrentUser, raw: unknown): Promise<{ id: string }> {
  requireWrite(user);
  const input = createInput.parse(raw);
  return db.transaction(async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
    if (!client) throw new HttpError(400, "Client introuvable.");
    const [doc] = await tx
      .insert(documents)
      .values({ type: input.type, clientId: input.clientId, subject: input.subject, createdById: user.id, updatedById: user.id })
      .returning({ id: documents.id });
    await audit(tx, user, { action: "creation", entity: "document", entityId: doc.id, summary: `${DOCUMENT_TYPE.labels[input.type]} en brouillon` });
    return doc;
  });
}

/** Enregistre un brouillon : en-tête et lignes remplacées, totaux recalculés par le serveur. */
export async function saveDraft(user: CurrentUser, id: string, raw: unknown): Promise<DocumentDetail> {
  requireWrite(user);
  const input = draftInput.parse(raw);
  const totals = computeTotals(input.lines);
  await db.transaction(async (tx) => {
    const [doc] = await tx.select({ status: documents.status }).from(documents).where(eq(documents.id, id)).for("update");
    if (!doc) throw new HttpError(404, "Document introuvable.");
    if (doc.status !== "draft") throw new HttpError(409, "Document émis : il ne se modifie plus.");
    await tx.delete(documentLines).where(eq(documentLines.documentId, id));
    if (input.lines.length > 0) {
      await tx.insert(documentLines).values(
        input.lines.map((l, i) => ({
          documentId: id,
          position: i,
          type: l.type,
          articleId: l.type === "item" ? (l.articleId ?? null) : null,
          code: l.type === "item" ? (l.code ?? null) : null,
          label: l.label ?? "",
          unit: l.type === "item" ? (l.unit ?? null) : null,
          quantityMilli: l.type === "item" ? l.quantityMilli : null,
          unitPriceCents: l.type === "item" ? l.unitPriceCents : null,
          vatRateBp: l.type === "item" ? l.vatRateBp : null,
          totalHtCents: totals.lineTotals[i],
        })),
      );
    }
    await tx
      .update(documents)
      .set({
        clientId: input.clientId,
        subject: input.subject,
        totalHtCents: totals.totalHtCents,
        totalVatCents: totals.totalVatCents,
        totalTtcCents: totals.totalTtcCents,
        updatedById: user.id,
      })
      .where(eq(documents.id, id));
    await audit(tx, user, {
      action: "modification",
      entity: "document",
      entityId: id,
      summary: `Brouillon enregistré, ${input.lines.length} ligne(s)`,
      details: { totalHtCents: totals.totalHtCents },
    });
  });
  return (await getDocument(user, id))!;
}

export async function deleteDraft(user: CurrentUser, id: string): Promise<void> {
  requireWrite(user);
  await db.transaction(async (tx) => {
    const [doc] = await tx.select({ status: documents.status }).from(documents).where(eq(documents.id, id)).for("update");
    if (!doc) throw new HttpError(404, "Document introuvable.");
    if (doc.status !== "draft") throw new HttpError(409, "Un document émis ne se supprime pas : annulez-le.");
    await tx.delete(documents).where(eq(documents.id, id));
    await audit(tx, user, { action: "suppression", entity: "document", entityId: id, summary: "Brouillon supprimé" });
  });
}

export type IssueResult = { id: string; number: string };

/**
 * Émission : dans une seule transaction, le document est verrouillé, les contrôles refaits sur l'état
 * en base, les totaux recalculés depuis les lignes enregistrées, le numéro attribué, l'acheteur et les
 * coordonnées bancaires figés. Deux émissions simultanées du même document : une seule réussit, un seul
 * numéro est consommé.
 */
export async function issueDocument(user: CurrentUser, id: string, now: Date = new Date()): Promise<IssueResult> {
  if (!can(user.profile, "documents.issue")) throw new HttpError(403, "Émission non autorisée pour votre profil.");
  const settings = await getSettings();
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ type: documents.type, status: documents.status, clientId: documents.clientId, subject: documents.subject })
      .from(documents)
      .where(eq(documents.id, id))
      .for("update");
    if (!doc) throw new HttpError(404, "Document introuvable.");
    if (doc.status !== "draft") throw new HttpError(409, "Ce document est déjà émis.");
    const lines = await tx
      .select({ type: documentLines.type, quantityMilli: documentLines.quantityMilli, unitPriceCents: documentLines.unitPriceCents, vatRateBp: documentLines.vatRateBp })
      .from(documentLines)
      .where(eq(documentLines.documentId, id))
      .orderBy(asc(documentLines.position));
    if (!lines.some((l) => l.type === "item")) throw new HttpError(400, "Ajoutez au moins une ligne d'article avant d'émettre.");
    if (!doc.subject.trim()) throw new HttpError(400, "Objet du document manquant.");
    const [client] = await tx
      .select({ name: clients.name, line1: clients.line1, postalCode: clients.postalCode, city: clients.city })
      .from(clients)
      .where(eq(clients.id, doc.clientId));
    const totals = computeTotals(lines);
    const issueDate = parisDate(now);
    const dueDate = addDays(issueDate, doc.type === "quote" ? settings.quoteValidityDays : settings.paymentTermsDays);
    const number = await nextDocumentNumber(tx, doc.type, now);
    // TVA figée tant que le document est encore un brouillon : les lignes et la TVA d'un document émis sont verrouillées en base.
    if (totals.vat.length > 0) {
      await tx.insert(documentVat).values(totals.vat.map((v) => ({ documentId: id, rateBp: v.rateBp, baseCents: v.baseCents, vatCents: v.vatCents })));
    }
    await tx
      .update(documents)
      .set({
        status: "issued",
        number,
        documentDate: issueDate,
        dueDate,
        totalHtCents: totals.totalHtCents,
        totalVatCents: totals.totalVatCents,
        totalTtcCents: totals.totalTtcCents,
        buyerName: client.name,
        buyerAddress: [client.line1, [client.postalCode, client.city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
        iban: settings.company.iban,
        bic: settings.company.bic,
        issuedAt: now,
        issuedById: user.id,
        updatedById: user.id,
      })
      .where(eq(documents.id, id));
    await audit(tx, user, {
      action: "emission",
      entity: "document",
      entityId: id,
      summary: `${DOCUMENT_TYPE.labels[doc.type]} ${number} émis`,
      details: { number, totalTtcCents: totals.totalTtcCents },
    });
    return { id, number };
  });
}

export const cancelInput = z.object({ reason: z.string().trim().min(3, "Motif d'annulation obligatoire.").max(500) });

/** Annulation d'un document émis : il garde son numéro, reste consultable et ne se supprime jamais. */
export async function cancelDocument(user: CurrentUser, id: string, raw: unknown): Promise<void> {
  if (!can(user.profile, "documents.issue")) throw new HttpError(403, "Annulation non autorisée pour votre profil.");
  const { reason } = cancelInput.parse(raw);
  await db.transaction(async (tx) => {
    const [doc] = await tx.select({ status: documents.status, number: documents.number }).from(documents).where(eq(documents.id, id)).for("update");
    if (!doc) throw new HttpError(404, "Document introuvable.");
    if (doc.status === "draft") throw new HttpError(409, "Un brouillon se supprime, il ne s'annule pas.");
    if (doc.status === "cancelled") throw new HttpError(409, "Document déjà annulé.");
    await tx.update(documents).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, updatedById: user.id }).where(eq(documents.id, id));
    await audit(tx, user, { action: "annulation", entity: "document", entityId: id, summary: `${doc.number} annulé`, details: { reason } });
  });
}

/** Passe un document émis à « envoyé » : appelé quand un brouillon de mail est préparé. */
export async function markSent(executor: Pick<typeof db, "update">, id: string): Promise<DocumentStatus> {
  const [row] = await executor
    .update(documents)
    .set({ status: sql`case when ${documents.status} = 'issued' then 'sent'::document_status else ${documents.status} end` })
    .where(and(eq(documents.id, id)))
    .returning({ status: documents.status });
  return row.status;
}

export const STATUS_LABELS = DOCUMENT_STATUS.labels;
