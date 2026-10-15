import "server-only";
import { z } from "zod";
import { audit, changes } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { HttpError } from "@/server/api";
import { can } from "@/domain/access";
import type { CompanyInfo } from "@/lib/documents/view";

/**
 * Paramètres de l'entreprise : en-tête, mentions et IBAN des documents, gabarits de mail.
 * Origine : egm-app `src/server/documents/quote-document.ts` (`documentSettings`), généralisé.
 */

const QUOTE_SUBJECT = "Devis {numero} : {objet}";
const QUOTE_BODY = "Bonjour,\n\nVeuillez trouver ci-joint notre devis {numero}.\n\nCordialement";
const INVOICE_SUBJECT = "Facture {numero} : {objet}";
const INVOICE_BODY = "Bonjour,\n\nVeuillez trouver ci-joint notre facture {numero}.\n\nCordialement";

export type Settings = {
  company: CompanyInfo;
  quoteValidityDays: number;
  paymentTermsDays: number;
  quoteEmailSubject: string;
  quoteEmailBody: string;
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  pdfFilenamePattern: string;
};

const EMPTY_COMPANY: CompanyInfo = {
  legalName: "Entreprise à paramétrer",
  tradeName: null,
  legalForm: null,
  shareCapital: null,
  siret: null,
  rcs: null,
  vatNumber: null,
  line1: null,
  line2: null,
  postalCode: null,
  city: null,
  phone: null,
  email: null,
  iban: null,
  bic: null,
  headerText: null,
  legalMentions: null,
};

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(companySettings).limit(1);
  if (!row) {
    return {
      company: EMPTY_COMPANY,
      quoteValidityDays: 30,
      paymentTermsDays: 30,
      quoteEmailSubject: QUOTE_SUBJECT,
      quoteEmailBody: QUOTE_BODY,
      invoiceEmailSubject: INVOICE_SUBJECT,
      invoiceEmailBody: INVOICE_BODY,
      pdfFilenamePattern: "{numero} - {client}",
    };
  }
  const company = Object.fromEntries(Object.keys(EMPTY_COMPANY).map((k) => [k, row[k as keyof typeof row] ?? null])) as CompanyInfo;
  return {
    company: { ...company, legalName: row.legalName },
    quoteValidityDays: row.quoteValidityDays,
    paymentTermsDays: row.paymentTermsDays,
    quoteEmailSubject: row.quoteEmailSubject || QUOTE_SUBJECT,
    quoteEmailBody: row.quoteEmailBody || QUOTE_BODY,
    invoiceEmailSubject: row.invoiceEmailSubject || INVOICE_SUBJECT,
    invoiceEmailBody: row.invoiceEmailBody || INVOICE_BODY,
    pdfFilenamePattern: row.pdfFilenamePattern,
  };
}

const text = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();

export const settingsInput = z.object({
  legalName: z.string().trim().min(1, "Raison sociale obligatoire.").max(200),
  tradeName: text(200),
  legalForm: text(60),
  shareCapital: text(60),
  siret: text(20),
  rcs: text(100),
  vatNumber: text(30),
  line1: text(200),
  line2: text(200),
  postalCode: text(10),
  city: text(100),
  phone: text(30),
  email: text(200),
  iban: text(50),
  bic: text(20),
  headerText: text(1000),
  legalMentions: text(4000),
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  paymentTermsDays: z.coerce.number().int().min(0).max(120),
  quoteEmailSubject: text(300),
  quoteEmailBody: text(4000),
  invoiceEmailSubject: text(300),
  invoiceEmailBody: text(4000),
  pdfFilenamePattern: z.string().trim().min(1).max(200),
});

export async function updateSettings(user: CurrentUser, raw: unknown): Promise<void> {
  if (!can(user.profile, "settings.write")) throw new HttpError(403, "Paramètres réservés à l'administrateur.");
  const input = settingsInput.parse(raw);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(companySettings).limit(1).for("update");
    await tx
      .insert(companySettings)
      .values({ id: 1, ...input })
      .onConflictDoUpdate({ target: companySettings.id, set: { ...input, updatedAt: new Date() } });
    await audit(tx, user, {
      action: "modification",
      entity: "parametres",
      entityId: "1",
      summary: "Paramètres de l'entreprise",
      details: changes((before ?? {}) as Record<string, unknown>, input),
    });
  });
}
