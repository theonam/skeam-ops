import { articleInput, clientInput } from "@/domain/referentials";
import type { ImportSchema } from "@/domain/import";

/**
 * Onglets reconnus par l'import Excel : pour chaque contenu, ses colonnes, les intitulés qu'on
 * rencontre dans les exports du client, sans accents ni casse, et le contrôle de chaque ligne.
 * Pour un nouveau client, on ajoute ici ses contenus ; le moteur ne change pas.
 * Origine : egm-app `src/domain/import.ts` (`FIELDS`), sorti du moteur pour être paramétrable.
 */
export const IMPORT_SCHEMAS = {
  clients: {
    label: "Clients",
    sheetHint: /client|tiers|donneur/,
    key: "code",
    fields: [
      { key: "code", label: "Code client", synonyms: ["code", "n client", "numero client", "ref client", "reference client"], required: true },
      { key: "name", label: "Nom", synonyms: ["raison sociale", "nom client", "client", "societe", "denomination"], required: true },
      { key: "email", label: "Mail", synonyms: ["email", "e mail", "courriel", "adresse mail"] },
      { key: "phone", label: "Téléphone", synonyms: ["telephone", "tel", "portable"] },
      { key: "line1", label: "Adresse", synonyms: ["adresse", "adresse 1", "rue"] },
      { key: "postalCode", label: "Code postal", synonyms: ["cp", "c p"], kind: "postalCode" },
      { key: "city", label: "Ville", synonyms: ["ville", "commune"] },
      { key: "siret", label: "SIRET", synonyms: ["n siret", "numero siret"] },
      { key: "internalNotes", label: "Notes internes", synonyms: ["notes", "remarques", "commentaire"] },
    ],
    schema: clientInput,
  },
  articles: {
    label: "Articles",
    sheetHint: /article|catalogue|prestation|tarif|produit/,
    key: "code",
    /** Un import d'articles contient des prix : il exige le droit de les voir. */
    permission: "prices.read",
    fields: [
      { key: "code", label: "Code", synonyms: ["code article", "reference", "ref", "article"], required: true },
      { key: "label", label: "Libellé", synonyms: ["designation", "intitule", "description", "nom"], required: true },
      { key: "category", label: "Catégorie", synonyms: ["famille", "categorie", "rayon"] },
      { key: "unit", label: "Unité", synonyms: ["u", "unite de mesure"], required: true },
      { key: "unitPriceCents", label: "Prix unitaire HT", synonyms: ["prix", "pu", "pu ht", "prix ht", "tarif", "prix de vente"], required: true, kind: "cents" },
      { key: "costCents", label: "Coût de revient", synonyms: ["cout", "prix d achat", "cout unitaire"], kind: "cents" },
      { key: "vatRateBp", label: "TVA", synonyms: ["taux tva", "taux de tva"], kind: "rateBp", fallback: 2000 },
      { key: "isActive", label: "Actif", synonyms: ["actif", "en vente"], kind: "boolean", fallback: true },
    ],
    schema: articleInput,
  },
} as const satisfies Record<string, ImportSchema>;

export type ImportEntity = keyof typeof IMPORT_SCHEMAS;
export const IMPORT_ORDER: readonly ImportEntity[] = ["clients", "articles"];
