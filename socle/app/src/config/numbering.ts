/**
 * Numérotation légale des documents. À reprendre du cadrage du client : préfixe, motif, largeur du
 * compteur et remise à zéro. Le mécanisme, lui, ne change pas (`src/server/numbering.ts`).
 *
 * Motif : `{prefixe}`, `{annee}` et `{numero}` ; `{numero}` est complété de zéros jusqu'à `largeur`.
 * Remise à zéro : `annuelle`, le compteur repart à 1 chaque année civile de Paris ; `jamais`.
 *
 * Origine : egm-app `src/domain/numbering.ts`, préfixes et largeur auparavant écrits en dur.
 */
export type NumberingRule = {
  prefixe: string;
  motif: string;
  largeur: number;
  remiseAZero: "annuelle" | "jamais";
};

export const NUMBERING = {
  quote: { prefixe: "DV", motif: "{prefixe}-{annee}-{numero}", largeur: 5, remiseAZero: "annuelle" },
  invoice: { prefixe: "FA", motif: "{prefixe}-{annee}-{numero}", largeur: 5, remiseAZero: "annuelle" },
} as const satisfies Record<string, NumberingRule>;

export type NumberedDocumentType = keyof typeof NUMBERING;
