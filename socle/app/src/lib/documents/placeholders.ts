import { formatDate } from "@/lib/format";

/**
 * Champs remplaçables dans les gabarits de mail et dans la règle de nommage des PDF, paramètres de
 * l'entreprise. Exemple : « Devis {numero}, {objet} ».
 * Origine : egm-app `src/lib/documents/placeholders.ts`, sans la référence logement.
 */
export const PLACEHOLDERS = ["numero", "client", "objet", "date"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type PlaceholderValues = Record<Placeholder, string>;

export function documentPlaceholders(doc: {
  number: string;
  clientName: string;
  subject: string;
  date: string;
}): PlaceholderValues {
  return {
    numero: doc.number,
    client: doc.clientName,
    objet: doc.subject,
    date: formatDate(doc.date),
  };
}

/** Remplace les champs connus ; un champ inconnu reste tel quel, pour que l'erreur de paramétrage se voie. */
export function fillTemplate(template: string, values: PlaceholderValues): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    (PLACEHOLDERS as readonly string[]).includes(key) ? values[key as Placeholder] : match,
  );
}

const MAX_BASENAME = 120;

/**
 * Nom de fichier du PDF selon la règle paramétrée, valable sous Windows (Outlook, serveur de fichiers) :
 * caractères interdits remplacés, espaces regroupés, longueur bornée, extension .pdf.
 */
export function pdfFilename(pattern: string, values: PlaceholderValues): string {
  const base = fillTemplate(pattern, values)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/(\s-)+\s*$/, "")
    .trim()
    .slice(0, MAX_BASENAME)
    .replace(/[\s.]+$/, "");
  return `${base || values.numero || "document"}.pdf`;
}
