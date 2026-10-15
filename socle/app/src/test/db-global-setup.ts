import "dotenv/config";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

/**
 * Base de test propre à chaque lancement : créée au début, migrée, supprimée à la fin.
 * Deux lancements simultanés, deux terminaux ou deux agents, ne se gênent donc jamais : c'était la
 * cause du test de facture instable d'egm-app, qui partageait une seule base de test (socle/AUDIT.md § 6).
 *
 * DATABASE_URL_TEST désigne une base du serveur sur laquelle le compte peut créer des bases,
 * par exemple `postgres://app:app@localhost:5432/postgres`.
 */
declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const adminUrl = process.env.DATABASE_URL_TEST;
  if (!adminUrl) throw new Error("DATABASE_URL_TEST manquant : voir .env.example");
  const name = `test_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const testUrl = url.toString();
  const sql = postgres(testUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "db/migrations" });
  await sql.end();
  project.provide("testDatabaseUrl", testUrl);

  return async () => {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.end();
  };
}
