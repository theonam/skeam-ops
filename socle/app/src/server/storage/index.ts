// Origine : egm-app `src/server/storage/index.ts`.
import "server-only";
import { storageFromEnv } from "./from-env";
import type { FileStorage } from "./storage";

export type { FileStorage, StoredObject } from "./storage";
export { storageFromEnv };

const globalForStorage = globalThis as unknown as { socleStorage?: FileStorage };

/** Stockage de l'application, créé à la première utilisation (jamais pendant la compilation). */
export function storage(): FileStorage {
  if (!globalForStorage.socleStorage) globalForStorage.socleStorage = storageFromEnv();
  return globalForStorage.socleStorage;
}
