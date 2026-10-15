import type { NumberingRule } from "@/config/numbering";

/**
 * Format des numéros de document, fonctions pures. L'attribution du numéro, sans trou ni doublon,
 * est dans `src/server/numbering.ts`.
 * Origine : egm-app `src/domain/numbering.ts`, rendu paramétrable par `src/config/numbering.ts`.
 */

/** Année de numérotation, en heure de Paris : un document du 31/12 à 23 h reste sur son année. */
export function numberingYear(date: Date): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(date));
}

/** Période du compteur : l'année pour une remise à zéro annuelle, 0 sinon. */
export function numberingPeriod(rule: NumberingRule, date: Date): number {
  return rule.remiseAZero === "annuelle" ? numberingYear(date) : 0;
}

/** Ex. formatDocumentNumber(règle DV annuelle sur 5, 2026, 42) → « DV-2026-00042 ». */
export function formatDocumentNumber(rule: NumberingRule, date: Date, value: number): string {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Numéro invalide : ${value}`);
  const year = numberingYear(date);
  if (!Number.isInteger(year) || year < 2000 || year > 2999) throw new Error(`Année invalide : ${year}`);
  return rule.motif
    .replaceAll("{prefixe}", rule.prefixe)
    .replaceAll("{annee}", String(year))
    .replaceAll("{numero}", String(value).padStart(rule.largeur, "0"));
}
