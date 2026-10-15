/**
 * Profils, droits et droits au champ de l'application. Ce fichier est la seule source de vérité :
 * on y reporte la section « Profils et droits » du cadrage du client, sans toucher au reste du code.
 *
 * Origine : egm-app `src/domain/permissions.ts` et `src/domain/profiles.ts` (matrice par profil),
 * étendue par le socle d'une politique de champs déclarative (`FIELD_POLICY`).
 */

/** Profils. Les droits sont portés par le profil, jamais par la personne. */
export const PROFILES = ["admin", "gestion", "terrain"] as const;
export type Profile = (typeof PROFILES)[number];

export const PROFILE_LABELS: Record<Profile, string> = {
  admin: "Administrateur",
  gestion: "Gestion",
  terrain: "Terrain",
};

export const PERMISSIONS = [
  "clients.read",
  "clients.write",
  "articles.read",
  "articles.write",
  /** Voir un prix, un montant ou un total, partout : écrans, API, PDF, exports. */
  "prices.read",
  "documents.read",
  "documents.write",
  /** Émettre ou annuler un document numéroté. */
  "documents.issue",
  /** Ajouter photos, croquis, PDF et mails sur une fiche lisible. */
  "attachments.add",
  /** Supprimer une pièce jointe ou retoucher un croquis existant. */
  "attachments.write",
  "data.import",
  "audit.read",
  "settings.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const MATRIX: Record<Profile, readonly Permission[]> = {
  admin: ALL,
  gestion: [
    "clients.read",
    "clients.write",
    "articles.read",
    "articles.write",
    "prices.read",
    "documents.read",
    "documents.write",
    "documents.issue",
    "attachments.add",
    "attachments.write",
    "data.import",
  ],
  // Le terrain voit les fiches et y ajoute photos et croquis ; il ne voit jamais un prix.
  terrain: ["clients.read", "articles.read", "documents.read", "attachments.add"],
};

/**
 * Droits au champ : pour chaque ressource exposée, les champs qui exigent un droit en plus du droit de
 * lecture de la ressource. Un champ absent de cette table est visible de quiconque lit la ressource.
 *
 * La couche d'accès aux données ne sélectionne jamais en base un champ interdit (`src/server/access.ts`),
 * et chaque réponse de l'API repasse par `redact` : deux barrières, testées route par route.
 */
export const FIELD_POLICY = {
  clients: {
    internalNotes: "clients.write",
  },
  articles: {
    unitPriceCents: "prices.read",
    costCents: "prices.read",
  },
  documents: {
    totalHtCents: "prices.read",
    totalVatCents: "prices.read",
    totalTtcCents: "prices.read",
    vat: "prices.read",
  },
  documentLines: {
    unitPriceCents: "prices.read",
    totalHtCents: "prices.read",
  },
} as const satisfies Record<string, Record<string, Permission>>;

export type Resource = keyof typeof FIELD_POLICY;
