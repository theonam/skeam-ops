import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission, Profile } from "@/config/access";
import { sessionCookieName } from "@/config/app";
import { can } from "@/domain/access";
import { db } from "@/server/db/client";
import { authSessions, users } from "@/server/db/schema";
import { generateSessionToken, sessionIdFromToken, sessionTtlMs, shouldRenew } from "./session-token";

/**
 * Sessions en base, jeton dans un cookie httpOnly. Les pages et les actions lisent le cookie par
 * `getCurrentUser` ; les routes de l'API le lisent dans la requête par `userFromRequest`, ce qui
 * permet de les tester sans serveur.
 * Origine : egm-app `src/server/auth/session.ts`, nom du cookie paramétrable et lecture depuis la requête.
 */

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  profile: Profile;
};

export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(authSessions).values({ id: sessionIdFromToken(token), userId, expiresAt, userAgent });
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) await db.delete(authSessions).where(eq(authSessions.id, sessionIdFromToken(token)));
  store.delete(sessionCookieName());
}

/** Utilisateur d'un jeton de session, ou null : session absente, expirée ou compte désactivé. */
export async function userFromToken(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const sessionId = sessionIdFromToken(token);
  const [row] = await db
    .select({
      expiresAt: authSessions.expiresAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      profile: users.profile,
      isActive: users.isActive,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.id, sessionId));
  const now = new Date();
  if (!row || row.expiresAt <= now || !row.isActive) {
    if (row) await db.delete(authSessions).where(eq(authSessions.id, sessionId));
    return null;
  }
  const ttl = sessionTtlMs();
  if (shouldRenew(row.expiresAt, now, ttl)) {
    await db.update(authSessions).set({ expiresAt: new Date(now.getTime() + ttl) }).where(eq(authSessions.id, sessionId));
  }
  return { id: row.id, username: row.username, displayName: row.displayName, profile: row.profile };
}

/** Utilisateur de la page ou de l'action en cours, mémorisé pour la durée de la requête. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return userFromToken((await cookies()).get(sessionCookieName())?.value);
});

/** Utilisateur d'une requête d'API, d'après son en-tête Cookie. */
export async function userFromRequest(request: Request): Promise<CurrentUser | null> {
  const header = request.headers.get("cookie") ?? "";
  const name = sessionCookieName();
  const token = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return userFromToken(token ? decodeURIComponent(token) : undefined);
}

/** Pour une page protégée : renvoie vers la connexion si personne n'est connecté. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export function hasPermission(user: CurrentUser, permission: Permission): boolean {
  return can(user.profile, permission);
}
