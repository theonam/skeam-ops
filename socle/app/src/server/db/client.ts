import "server-only";
// Origine : egm-app `src/server/db/client.ts`.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  return drizzle(postgres(url, { max: 10 }), { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof create>;

// En développement, le rechargement à chaud recrée les modules : on réutilise la connexion.
const globalForDb = globalThis as unknown as { socleDb?: Db };

function instance(): Db {
  if (!globalForDb.socleDb) globalForDb.socleDb = create();
  return globalForDb.socleDb;
}

/**
 * Accès à la base. La connexion n'est ouverte qu'à la première requête, jamais au chargement
 * du module : la compilation (`next build`) n'a ainsi pas besoin de la base.
 */
export const db = new Proxy({} as Db, {
  get(_target, property) {
    const real = instance();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
