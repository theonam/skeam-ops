// Nouveau dans le socle.
import { describe, expect, it } from "vitest";
import type { NumberingRule } from "@/config/numbering";
import { formatDocumentNumber, numberingPeriod, numberingYear } from "./numbering";

const annual: NumberingRule = { prefixe: "DV", motif: "{prefixe}-{annee}-{numero}", largeur: 5, remiseAZero: "annuelle" };
const d = new Date("2026-10-14T10:00:00Z");

describe("format des numéros de document", () => {
  it("complète le compteur à la largeur demandée", () => {
    expect(formatDocumentNumber(annual, d, 42)).toBe("DV-2026-00042");
    expect(formatDocumentNumber(annual, d, 123456)).toBe("DV-2026-123456");
  });

  it("suit le motif configuré", () => {
    const rule: NumberingRule = { prefixe: "F", motif: "{annee}{prefixe}{numero}", largeur: 4, remiseAZero: "jamais" };
    expect(formatDocumentNumber(rule, d, 7)).toBe("2026F0007");
  });

  it("refuse un numéro nul, négatif ou décimal", () => {
    expect(() => formatDocumentNumber(annual, d, 0)).toThrow();
    expect(() => formatDocumentNumber(annual, d, -3)).toThrow();
    expect(() => formatDocumentNumber(annual, d, 1.5)).toThrow();
  });

  it("prend l'année en heure de Paris", () => {
    // 31 décembre 2026 à 23 h 30 à Paris = 22 h 30 UTC
    expect(numberingYear(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
    // 1er janvier 2027 à 0 h 30 à Paris = 31 décembre 23 h 30 UTC
    expect(numberingYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });

  it("période : l'année si remise à zéro annuelle, 0 sinon", () => {
    expect(numberingPeriod(annual, d)).toBe(2026);
    expect(numberingPeriod({ ...annual, remiseAZero: "jamais" }, d)).toBe(0);
  });
});
