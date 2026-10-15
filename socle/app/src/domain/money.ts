/**
 * Règles monétaires du projet : montants en centimes entiers, quantités en millièmes,
 * taux en points de base. Aucun calcul en nombre flottant.
 */

/**
 * Division entière arrondie à l'unité la plus proche, demi-unité arrondie en s'éloignant de zéro
 * (arrondi commercial). Calcul en BigInt : exact quelle que soit la taille des nombres.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Division par zéro");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Montant hors limites");
  }
  return Number(value);
}

/** Total d'une ligne : quantité (millièmes) × prix unitaire (centimes), arrondi au centime. */
export function lineTotalCents(quantityMilli: number, unitPriceCents: number): number {
  assertInteger(quantityMilli, "quantité");
  assertInteger(unitPriceCents, "prix unitaire");
  return toSafeNumber(divRound(BigInt(quantityMilli) * BigInt(unitPriceCents), 1000n));
}

/** Part d'un montant selon un taux en points de base (TVA, rabais), arrondie au centime. */
export function applyRateCents(amountCents: number, rateBp: number): number {
  assertInteger(amountCents, "montant");
  assertInteger(rateBp, "taux");
  return toSafeNumber(divRound(BigInt(amountCents) * BigInt(rateBp), 10_000n));
}

/** Prix après rabais : arrondi(prix × (1 − rabais)). */
export function discountedCents(priceCents: number, discountBp: number): number {
  assertInteger(priceCents, "prix");
  assertInteger(discountBp, "rabais");
  if (discountBp < 0 || discountBp > 10_000) throw new Error("Rabais hors limites");
  return toSafeNumber(divRound(BigInt(priceCents) * BigInt(10_000 - discountBp), 10_000n));
}

function assertInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} : entier attendu, reçu ${value}`);
}

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 123456 → « 1 234,56 € » (espaces insécables, comme Excel en français). */
export function formatCents(cents: number): string {
  return euro.format(cents / 100);
}

/** 2000 → « 20 % », 550 → « 5,5 % ». */
export function formatRateBp(bp: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(bp / 100)} %`;
}

/** 1500 → « 1,5 » ; 2000 → « 2 ». */
export function formatQuantityMilli(milli: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(milli / 1000);
}

/**
 * Lit un nombre saisi à la française (« 1 234,56 », « 12.5 », « -3 ») et le convertit en entier
 * à l'échelle donnée (100 pour des centimes, 1 000 pour des millièmes), sans passer par un flottant.
 * Arrondi commercial au-delà des décimales permises. Renvoie null si la saisie n'est pas un nombre.
 */
export function parseScaled(input: string, scale: 100 | 1000): number | null {
  const cleaned = input.replace(/[\s  €]/g, "").replace(",", ".");
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (!match[2] && !match[3])) return null;
  const digits = scale === 100 ? 2 : 3;
  const whole = BigInt(match[2] || "0");
  const fraction = match[3] ?? "";
  const kept = BigInt((fraction.slice(0, digits) || "0").padEnd(digits, "0"));
  let value = whole * BigInt(scale) + kept;
  // Décimale suivante ≥ 5 : arrondi à l'unité supérieure, en valeur absolue.
  if ((fraction[digits] ?? "0") >= "5") value += 1n;
  if (match[1] === "-") value = -value;
  return toSafeNumber(value);
}

/** 123456 → « 1 234,56 » (sans symbole, pour un champ de saisie). */
export function formatCentsPlain(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
