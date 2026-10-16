// Nouveau dans le socle.
/**
 * Identité et réglages de l'application, lus dans les variables d'environnement (voir `.env.example`).
 * Rien d'un client n'est écrit dans le code : un nouveau client se règle ici et dans `src/config/`.
 */
export type Edition = "demo" | "full";

export function editionOf(value: string | undefined): Edition {
  return value === "demo" ? "demo" : "full";
}

/** Édition en cours : `demo` affiche un badge et autorise l'effacement complet ; tout le reste = version finale. */
export function currentEdition(): Edition {
  return editionOf(process.env.APP_EDITION);
}

export type AppIdentity = {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
};

/** Nom affiché, nom court de l'icône installée, description et couleur du thème. */
export function appIdentity(): AppIdentity {
  return {
    name: process.env.APP_NAME || "Application",
    shortName: process.env.APP_SHORT_NAME || process.env.APP_NAME || "Application",
    description: process.env.APP_DESCRIPTION || "Application de gestion",
    themeColor: /^#[0-9a-fA-F]{6}$/.test(process.env.APP_THEME_COLOR ?? "") ? process.env.APP_THEME_COLOR! : "#1f3a5f",
  };
}

/** Nom du cookie de session : propre à chaque application, pour ne jamais mêler deux applications d'un même domaine. */
export function sessionCookieName(): string {
  const name = process.env.SESSION_COOKIE_NAME || "app_session";
  return /^[a-z0-9_]{1,40}$/.test(name) ? name : "app_session";
}
