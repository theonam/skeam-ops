/**
 * Deux éditions du même code (décision de Théo, 14/10) :
 * - `demo` : la démo présentée au client, limitée au périmètre vendu (devis de démo du 14/10) ;
 * - `full` : la version finale, sur laquelle on avance.
 * Choisie par la variable d'environnement APP_EDITION (« demo » ; tout le reste = version finale).
 */
export type Edition = "demo" | "full";

export function editionOf(value: string | undefined): Edition {
  return value === "demo" ? "demo" : "full";
}

/** Édition du serveur en cours d'exécution. */
export function currentEdition(): Edition {
  return editionOf(process.env.APP_EDITION);
}
