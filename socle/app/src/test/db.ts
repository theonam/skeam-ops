/** Accès direct à la base de test du lancement, pour préparer et vérifier les données des tests. */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Profile } from "@/config/access";
import * as schema from "@/server/db/schema";
import type { CurrentUser } from "@/server/auth/session";

export function openTestDb() {
  const url = process.env.DATABASE_URL;
  if (!url?.includes("/test_")) throw new Error("Les tests ne parlent qu'à une base test_… créée pour le lancement");
  const client = postgres(url, { max: 20, onnotice: () => {} });
  return { client, db: drizzle(client, { schema, casing: "snake_case" }) };
}

export type TestDb = ReturnType<typeof openTestDb>["db"];

/** Vide toutes les tables métier ; les compteurs aussi, sauf demande contraire. */
export async function resetData(db: TestDb) {
  await db.execute(
    sql`truncate audit_log, outbound_emails, sketches, attachments, document_vat, document_lines, documents, document_counters, articles, clients, company_settings, user_preferences, auth_sessions, users restart identity cascade`,
  );
}

export async function createUser(db: TestDb, profile: Profile, username: string = profile): Promise<CurrentUser> {
  const [u] = await db.insert(schema.users).values({ username, displayName: `Test ${username}`, profile, passwordHash: "x" }).returning();
  return { id: u.id, username: u.username, displayName: u.displayName, profile };
}

/** Ouvre une session pour l'utilisateur et renvoie l'en-tête Cookie à joindre aux requêtes d'API. */
export async function sessionCookie(db: TestDb, userId: string): Promise<string> {
  const { generateSessionToken, sessionIdFromToken } = await import("@/server/auth/session-token");
  const { sessionCookieName } = await import("@/config/app");
  const token = generateSessionToken();
  await db.insert(schema.authSessions).values({ id: sessionIdFromToken(token), userId, expiresAt: new Date(Date.now() + 3_600_000) });
  return `${sessionCookieName()}=${token}`;
}

/** Client, articles et document de test, avec des prix reconnaissables. */
export async function seedDocument(db: TestDb, type: "quote" | "invoice" = "invoice") {
  const [client] = await db.insert(schema.clients).values({ code: `C-${Math.random().toString(36).slice(2, 8)}`, name: "Client test", city: "Démoville", internalNotes: "note interne" }).returning();
  const [article] = await db
    .insert(schema.articles)
    .values({ code: `A-${Math.random().toString(36).slice(2, 8)}`, label: "Article test", unit: "h", unitPriceCents: 987_654, costCents: 456_789, vatRateBp: 2000 })
    .returning();
  const [doc] = await db.insert(schema.documents).values({ type, clientId: client.id, subject: "Objet test" }).returning();
  return { client, article, doc };
}
