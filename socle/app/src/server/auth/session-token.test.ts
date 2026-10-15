// Origine : egm-app `src/server/auth/session-token.test.ts`.
import { describe, expect, it } from "vitest";
import { generateSessionToken, sessionIdFromToken, shouldRenew } from "./session-token";

describe("jetons de session", () => {
  it("génère des jetons uniques et assez longs", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(26);
  });

  it("stocke une empreinte stable, différente du jeton", () => {
    const token = generateSessionToken();
    expect(sessionIdFromToken(token)).toBe(sessionIdFromToken(token));
    expect(sessionIdFromToken(token)).not.toContain(token);
    expect(sessionIdFromToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prolonge une session entamée de plus de moitié", () => {
    const ttl = 30 * 86_400_000;
    const now = new Date("2026-10-14T10:00:00Z");
    expect(shouldRenew(new Date(now.getTime() + ttl * 0.4), now, ttl)).toBe(true);
    expect(shouldRenew(new Date(now.getTime() + ttl * 0.9), now, ttl)).toBe(false);
  });
});
