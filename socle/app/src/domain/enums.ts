/**
 * Listes fermées du modèle, avec leur libellé affiché. Les types PostgreSQL correspondants sont
 * déclarés dans `src/server/db/schema.ts`.
 * Origine : egm-app `src/domain/enums.ts`, réduit aux listes génériques.
 */
function labels<const T extends readonly string[]>(values: T, map: Record<T[number], string>) {
  return { values, labels: map };
}

export const DOCUMENT_TYPE = labels(["quote", "invoice"], { quote: "Devis", invoice: "Facture" });
export type DocumentType = (typeof DOCUMENT_TYPE.values)[number];

/** Brouillon modifiable, puis émis : numéro attribué, contenu figé. Un document émis s'annule, il ne se supprime jamais. */
export const DOCUMENT_STATUS = labels(["draft", "issued", "sent", "cancelled"], {
  draft: "Brouillon",
  issued: "Émis",
  sent: "Envoyé",
  cancelled: "Annulé",
});
export type DocumentStatus = (typeof DOCUMENT_STATUS.values)[number];

export const LINE_TYPE = labels(["item", "title", "note", "subtotal"], {
  item: "Article",
  title: "Titre",
  note: "Note",
  subtotal: "Sous-total",
});
export type LineType = (typeof LINE_TYPE.values)[number];

export const ATTACHMENT_KIND = labels(["photo", "sketch", "email", "pdf", "document"], {
  photo: "Photo",
  sketch: "Croquis",
  email: "Mail",
  pdf: "PDF",
  document: "Document",
});

export const MAIL_SENDER_IMPL = labels(["eml_draft"], { eml_draft: "Brouillon Outlook" });

/** Taux de TVA proposés, en points de base : 2000 = 20 %. */
export const VAT_RATES_BP = [2000, 1000, 550, 210, 0] as const;
