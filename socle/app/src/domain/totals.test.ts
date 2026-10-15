// Origine : egm-app `src/domain/quote-totals.test.ts`.
import { describe, expect, it } from "vitest";
import { computeTotals, type TotalsLineInput } from "./totals";

const svc = (quantityMilli: number, unitPriceCents: number, vatRateBp = 2000): TotalsLineInput => ({
  type: "item",
  quantityMilli,
  unitPriceCents,
  vatRateBp,
});

describe("totaux d'un document", () => {
  it("total de ligne = arrondi(quantité × prix unitaire)", () => {
    // 2,345 m² × 38,00 € = 89,11 € ; 0,333 u × 0,05 € = 0,01665 € → 0,02 €
    const { lineTotals } = computeTotals([svc(2345, 3800), svc(333, 5)]);
    expect(lineTotals).toEqual([8911, 2]);
  });

  it("TVA calculée par taux sur la base cumulée, pas ligne par ligne", () => {
    // Trois lignes à 0,05 € : 3 × arrondi(0,01) = 0,03 € ligne par ligne, mais 20 % de 0,15 € = 0,03 €.
    // Avec 0,07 € : 3 × arrondi(0,014) = 0,03 € ; sur la base cumulée 0,21 € × 20 % = 0,042 → 0,04 €.
    const totals = computeTotals([svc(1000, 7), svc(1000, 7), svc(1000, 7)]);
    expect(totals.vat).toEqual([{ rateBp: 2000, baseCents: 21, vatCents: 4 }]);
    expect(totals.totalTtcCents).toBe(25);
  });

  it("gère plusieurs taux, du plus élevé au plus bas, et TTC = HT + somme des TVA", () => {
    const totals = computeTotals([svc(1000, 10000, 2000), svc(2000, 5000, 1000), svc(1000, 9999, 550)]);
    expect(totals.vat).toEqual([
      { rateBp: 2000, baseCents: 10000, vatCents: 2000 },
      { rateBp: 1000, baseCents: 10000, vatCents: 1000 },
      { rateBp: 550, baseCents: 9999, vatCents: 550 },
    ]);
    expect(totals.totalHtCents).toBe(29999);
    expect(totals.totalVatCents).toBe(3550);
    expect(totals.totalTtcCents).toBe(33549);
  });

  it("un sous-total additionne les articles depuis le titre ou le sous-total précédent", () => {
    const totals = computeTotals([
      { type: "title" },
      svc(1000, 100),
      { type: "note" },
      svc(2000, 100),
      { type: "subtotal" },
      svc(1000, 50),
      { type: "subtotal" },
      { type: "title" },
      svc(1000, 7),
      { type: "subtotal" },
      { type: "subtotal" },
    ]);
    expect(totals.lineTotals).toEqual([null, 100, null, 200, 300, 50, 50, null, 7, 7, 0]);
    // Les sous-totaux ne s'ajoutent jamais au total général.
    expect(totals.totalHtCents).toBe(357);
  });

  it("un sous-total avant tout titre part du début du document", () => {
    expect(computeTotals([svc(1000, 100), svc(1000, 200), { type: "subtotal" }]).lineTotals[2]).toBe(300);
  });

  it("document vide : tout à zéro", () => {
    expect(computeTotals([])).toEqual({ lineTotals: [], vat: [], totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0 });
  });
});
