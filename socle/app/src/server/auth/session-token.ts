// Origine : egm-app `src/server/auth/session-token.ts`.
import { createHash, randomBytes } from "node:crypto";

/** Jeton aléatoire de 160 bits, placé dans le cookie de session. */
export function generateSessionToken(): string {
  return randomBytes(20).toString("base64url");
}

/** Identifiant stocké en base : empreinte du jeton, jamais le jeton lui-même. */
export function sessionIdFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
  return (Number.isFinite(days) && days > 0 ? days : 30) * DAY_MS;
}

/** Une session utilisée dans sa seconde moitié de vie est prolongée (session glissante). */
export function shouldRenew(expiresAt: Date, now: Date, ttlMs: number): boolean {
  return expiresAt.getTime() - now.getTime() < ttlMs / 2;
}
