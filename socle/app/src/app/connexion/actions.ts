"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { burnPasswordCheck, verifyPassword } from "@/server/auth/password";
import { AttemptLimiter } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import { createSession } from "@/server/auth/session";

// Origine : egm-app `src/app/connexion/actions.ts`, avec trace des connexions dans le journal d'audit.

export type LoginState = { error?: string; username?: string };

const schema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

// 10 échecs par identifiant et 30 par adresse IP sur 15 minutes.
const byUsername = new AttemptLimiter(10, 15 * 60_000);
const byIp = new AttemptLimiter(30, 15 * 60_000);

const INVALID = "Identifiant ou mot de passe incorrect.";

/** N'accepte qu'une redirection interne, pour ne jamais renvoyer vers un autre site. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/documents";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Saisissez votre identifiant et votre mot de passe." };
  const { username, password, next } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const userKey = username.toLowerCase();
  if (!byUsername.isAllowed(userKey) || !byIp.isAllowed(ip)) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes.", username };
  }

  const [user] = await db
    .select({ id: users.id, username: users.username, passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(eq(sql`lower(${users.username})`, userKey));

  const valid = user?.isActive
    ? await verifyPassword(user.passwordHash, password)
    : (await burnPasswordCheck(password), false);

  if (!user || !valid) {
    byUsername.recordFailure(userKey);
    byIp.recordFailure(ip);
    await audit(db, null, { action: "connexion_refusee", entity: "compte", summary: `Échec de connexion pour « ${userKey} »`, details: { ip } });
    return { error: INVALID, username };
  }

  byUsername.reset(userKey);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  await audit(db, { id: user.id, username: user.username }, { action: "connexion", entity: "compte", entityId: user.id, summary: "Connexion", details: { ip } });
  redirect(safeNext(next));
}
