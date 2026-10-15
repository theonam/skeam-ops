// Origine : egm-app `src/domain/money.test.ts`.
import { describe, expect, it } from "vitest";
import {
  applyRateCents,
  discountedCents,
  divRound,
  formatCents,
  formatQuantityMilli,
  formatRateBp,
  lineTotalCents,
  parseScaled,
} from "./money";

describe("arrondi commercial", () => {
  it("arrondit la demi-unité en s'éloignant de zéro", () => {
    expect(divRound(5n, 10n)).toBe(1n);
    expect(divRound(4n, 10n)).toBe(0n);
    expect(divRound(15n, 10n)).toBe(2n);
    expect(divRound(25n, 10n)).toBe(3n);
    expect(divRound(-5n, 10n)).toBe(-1n);
    expect(divRound(-4n, 10n)).toBe(0n);
  });
});

describe("total de ligne", () => {
  it("multiplie quantité et prix puis arrondit au centime", () => {
    expect(lineTotalCents(1000, 1234)).toBe(1234); // 1 × 12,34
    expect(lineTotalCents(2500, 1999)).toBe(4998); // 2,5 × 19,99 = 49,975 → 49,98
    expect(lineTotalCents(333, 100)).toBe(33); // 0,333 × 1,00 = 0,333 → 0,33
    expect(lineTotalCents(1, 500)).toBe(1); // 0,001 × 5,00 = 0,005 → 0,01
  });

  it("ne souffre d'aucune erreur de flottant", () => {
    // 0,1 + 0,2 en flottant ≠ 0,3 ; ici tout est entier
    expect(lineTotalCents(3000, 10) + lineTotalCents(1000, 20)).toBe(50);
    expect(lineTotalCents(1_000_000, 1_000_000_00)).toBe(1_000_000_00_000);
  });

  it("refuse les nombres décimaux", () => {
    expect(() => lineTotalCents(1.5, 100)).toThrow();
    expect(() => lineTotalCents(1000, 12.34)).toThrow();
  });
});

describe("taux et rabais", () => {
  it("calcule une TVA arrondie au centime", () => {
    expect(applyRateCents(10000, 2000)).toBe(2000);
    expect(applyRateCents(1234, 550)).toBe(68); // 67,87 → 68
    expect(applyRateCents(999, 1000)).toBe(100); // 99,9 → 100
  });

  it("applique un rabais", () => {
    expect(discountedCents(10000, 500)).toBe(9500);
    expect(discountedCents(1999, 300)).toBe(1939); // 19,99 × 0,97 = 19,3903
    expect(discountedCents(1000, 0)).toBe(1000);
    expect(() => discountedCents(1000, 12000)).toThrow();
  });
});

describe("affichage", () => {
  it("formate en français", () => {
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("1 234,56 €");
    expect(formatRateBp(2000)).toBe("20 %");
    expect(formatRateBp(550)).toBe("5,5 %");
    expect(formatQuantityMilli(1500)).toBe("1,5");
  });
});

describe("saisie de nombres à la française", () => {
  it("lit les montants en centimes, avec virgule, point, espaces et symbole", () => {
    expect(parseScaled("1 234,56 €", 100)).toBe(123456);
    expect(parseScaled("12.5", 100)).toBe(1250);
    expect(parseScaled(",5", 100)).toBe(50);
    expect(parseScaled("-3", 100)).toBe(-300);
  });

  it("lit les quantités en millièmes et arrondit au-delà de 3 décimales", () => {
    expect(parseScaled("2,345", 1000)).toBe(2345);
    expect(parseScaled("0,0005", 1000)).toBe(1);
    expect(parseScaled("0,0004", 1000)).toBe(0);
  });

  it("refuse ce qui n'est pas un nombre", () => {
    expect(parseScaled("", 100)).toBeNull();
    expect(parseScaled("abc", 100)).toBeNull();
    expect(parseScaled("1,2,3", 100)).toBeNull();
  });
});
