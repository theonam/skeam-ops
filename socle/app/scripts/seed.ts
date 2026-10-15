/**
 * Crée ou met à jour les comptes de démonstration, un par profil. Idempotent.
 * Le mot de passe vient de DEMO_PASSWORD, jamais du code.
 * Origine : egm-app `scripts/seed.ts`.
 */
import "dotenv/config";
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword } from "../src/server/auth/password";
import { users } from "../src/server/db/schema";

const DEMO_USERS = [
  { username: "admin", displayName: "Administrateur (démo)", profile: "admin" },
  { username: "gestion", displayName: "Gestion (démo)", profile: "gestion" },
  { username: "terrain", displayName: "Terrain (démo)", profile: "terrain" },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  const password = process.env.DEMO_PASSWORD;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  if (!password || password.length < 10) {
    throw new Error("DEMO_PASSWORD manquant ou trop court, 10 caractères minimum : voir .env.example");
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { casing: "snake_case" });
  const passwordHash = await hashPassword(password);
  for (const u of DEMO_USERS) {
    const [existing] = await db.select({ id: users.id }).from(users).where(dsql`lower(${users.username}) = ${u.username}`);
    if (existing) {
      await db.update(users).set({ displayName: u.displayName, profile: u.profile, passwordHash, isActive: true }).where(dsql`${users.id} = ${existing.id}`);
    } else {
      await db.insert(users).values({ ...u, passwordHash });
    }
    console.log(`Compte de démonstration prêt : ${u.username}`);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
