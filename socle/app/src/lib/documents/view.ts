import type { DocumentType, LineType } from "@/domain/enums";
import { computeTotals, type VatBreakdown } from "@/domain/totals";
import { formatDate } from "@/lib/format";

/**
 * Contenu d'un document commercial, devis ou facture, indépendant de sa mise en page.
 * Construit à l'identique dans le navigateur, pour l'aperçu en direct, et sur le serveur, pour le PDF :
 * ce module n'importe ni la base ni React.
 * Origine : egm-app `src/lib/documents/view.ts`, un seul constructeur pour les deux types, sans le vocabulaire BTP.
 */

/** Identité et mentions de l'entreprise, issues des paramètres : rien n'est écrit en dur. */
export type CompanyInfo = {
  legalName: string;
  tradeName: string | null;
  legalForm: string | null;
  shareCapital: string | null;
  siret: string | null;
  rcs: string | null;
  vatNumber: string | null;
  line1: string | null;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
  headerText: string | null;
  legalMentions: string | null;
};

export type AnnexImage = { id: string; src: string; caption: string };

/** Ligne saisie, telle qu'enregistrée dans un brouillon. */
export type LineInput = {
  type: LineType;
  code?: string | null;
  label: string;
  unit?: string | null;
  quantityMilli?: number | null;
  unitPriceCents?: number | null;
  vatRateBp?: number | null;
};

export type DocumentLine =
  | { type: "title"; text: string }
  | { type: "note"; text: string }
  | { type: "subtotal"; totalHtCents: number }
  | { type: "item"; code: string | null; label: string; unit: string; quantityMilli: number; unitPriceCents: number; vatRateBp: number; totalHtCents: number };

export type DocumentView = {
  kind: DocumentType;
  title: string;
  /** Vide tant que le document n'est pas émis. */
  number: string | null;
  /** Bandeau d'avertissement : brouillon, annulé. */
  watermark: string | null;
  company: CompanyInfo;
  recipient: { name: string; lines: string[] };
  meta: { label: string; value: string }[];
  subject: string;
  lines: DocumentLine[];
  vat: VatBreakdown[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  legalMentions: string | null;
  payment: { dueDate: string; lines: string[] } | null;
  signature: boolean;
  annex: AnnexImage[];
};

/** Mentions minimales d'une facture entre professionnels, tant que l'entreprise n'a pas saisi les siennes. */
export const DEFAULT_INVOICE_MENTIONS =
  "En cas de retard de paiement : pénalités au taux de trois fois le taux d'intérêt légal, et indemnité forfaitaire pour frais de recouvrement de 40 €. Pas d'escompte pour paiement anticipé.";

export function documentLines(lines: readonly LineInput[]): { lines: DocumentLine[]; totals: ReturnType<typeof computeTotals> } {
  const totals = computeTotals(lines);
  return {
    totals,
    lines: lines.map((line, i): DocumentLine => {
      switch (line.type) {
        case "title":
        case "note":
          return { type: line.type, text: line.label };
        case "subtotal":
          return { type: "subtotal", totalHtCents: totals.lineTotals[i] ?? 0 };
        default:
          return {
            type: "item",
            code: line.code ?? null,
            label: line.label,
            unit: line.unit ?? "",
            quantityMilli: line.quantityMilli ?? 0,
            unitPriceCents: line.unitPriceCents ?? 0,
            vatRateBp: line.vatRateBp ?? 0,
            totalHtCents: totals.lineTotals[i] ?? 0,
          };
      }
    }),
  };
}

export type DocumentInput = {
  type: DocumentType;
  number: string | null;
  status: "draft" | "issued" | "sent" | "cancelled";
  date: string;
  dueDate: string | null;
  subject: string;
  company: CompanyInfo;
  buyer: { name: string; address: string | null };
  lines: readonly LineInput[];
  annex: AnnexImage[];
};

export function buildDocumentView(input: DocumentInput): DocumentView {
  const { lines, totals } = documentLines(input.lines);
  const isQuote = input.type === "quote";
  const meta = [{ label: "Date", value: formatDate(input.date) }];
  if (input.dueDate) meta.push({ label: isQuote ? "Valable jusqu'au" : "Échéance", value: formatDate(input.dueDate) });
  const c = input.company;
  const bank = c.iban ? `Par virement : IBAN ${c.iban}${c.bic ? `, BIC ${c.bic}` : ""}` : null;
  const watermark =
    input.status === "cancelled" ? "Document annulé" : input.status === "draft" ? `Brouillon, ${isQuote ? "devis" : "facture"} non émis${isQuote ? "" : "e"}` : null;
  return {
    kind: input.type,
    title: isQuote ? "Devis" : "Facture",
    number: input.number,
    watermark,
    company: c,
    recipient: { name: input.buyer.name, lines: (input.buyer.address ?? "").split("\n").map((l) => l.trim()).filter(Boolean) },
    meta,
    subject: input.subject,
    lines,
    vat: totals.vat,
    totalHtCents: totals.totalHtCents,
    totalVatCents: totals.totalVatCents,
    totalTtcCents: totals.totalTtcCents,
    legalMentions: isQuote ? c.legalMentions : c.legalMentions?.trim() || DEFAULT_INVOICE_MENTIONS,
    payment: !isQuote && input.dueDate ? { dueDate: input.dueDate, lines: bank ? [bank] : [] } : null,
    signature: isQuote,
    annex: input.annex,
  };
}
