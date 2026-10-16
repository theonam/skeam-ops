// Origine : egm-app `src/server/storage/storage.ts`.
/**
 * Stockage des fichiers (photos, PDF, mails). Les fichiers ne sont jamais en base : la base garde
 * la clé, le nom, le type et l'empreinte. Deux implémentations derrière la même interface :
 * - « local » : un dossier sur le disque, pour le développement et les tests ;
 * - « s3 » : tout stockage compatible S3 (Clever Cloud Cellar, Scaleway, OVH, AWS…), pour la démo et la production.
 * Changer d'hébergeur ne change que des variables d'environnement.
 */
export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
};

export interface FileStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Renvoie null si le fichier n'existe pas (ou plus). */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Clés qui commencent par le préfixe, ex. « backups/ ». Sert à la rotation des sauvegardes. */
  list(prefix: string): Promise<string[]>;
}

/** Clé de stockage : segments en minuscules, chiffres, points et tirets, séparés par « / ». */
const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9][a-z0-9._-]*)+$/;

export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error(`Clé de stockage invalide : ${key}`);
}
