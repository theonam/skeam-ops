import type { LineType } from "./enums";
import { applyRateCents, lineTotalCents } from "./money";

/**
 * Totaux d'un document à lignes :
 * - total de ligne = arrondi(quantité × prix unitaire) ;
 * - un sous-total additionne les articles depuis le titre ou le sous-total précédent le plus proche ;
 * - TVA calculée par taux, sur la base HT cumulée de ce taux, puis arrondie ;
 * - TTC = HT + somme des TVA.
 * Le même module calcule l'affichage en direct et les montants enregistrés par le serveur.
 *
 * Origine : egm-app `src/domain/quote-totals.ts`, sans le vocabulaire du devis.
 */
export type TotalsLineInput = {
  type: LineType;
  quantityMilli?: number | null;
  unitPriceCents?: number | null;
  vatRateBp?: number | null;
};

export type VatBreakdown = { rateBp: number; baseCents: number; vatCents: number };

export type DocumentTotals = {
  /** Pour chaque ligne, dans l'ordre : son total HT, article ou sous-total, sinon null. */
  lineTotals: (number | null)[];
  vat: VatBreakdown[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
};

export function computeTotals(lines: readonly TotalsLineInput[]): DocumentTotals {
  const lineTotals: (number | null)[] = [];
  const baseByRate = new Map<number, number>();
  let totalHtCents = 0;
  let sinceBreak = 0;

  for (const line of lines) {
    if (line.type === "item") {
      const total = lineTotalCents(line.quantityMilli ?? 0, line.unitPriceCents ?? 0);
      const rate = line.vatRateBp ?? 0;
      lineTotals.push(total);
      totalHtCents += total;
      sinceBreak += total;
      baseByRate.set(rate, (baseByRate.get(rate) ?? 0) + total);
    } else if (line.type === "subtotal") {
      lineTotals.push(sinceBreak);
      sinceBreak = 0;
    } else {
      if (line.type === "title") sinceBreak = 0;
      lineTotals.push(null);
    }
  }

  const vat = [...baseByRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBp, baseCents]) => ({ rateBp, baseCents, vatCents: applyRateCents(baseCents, rateBp) }));
  const totalVatCents = vat.reduce((sum, v) => sum + v.vatCents, 0);
  return { lineTotals, vat, totalHtCents, totalVatCents, totalTtcCents: totalHtCents + totalVatCents };
}
