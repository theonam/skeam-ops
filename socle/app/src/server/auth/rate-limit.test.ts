import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./rate-limit";

describe("limitation des tentatives de connexion", () => {
  it("bloque après le nombre maximal d'échecs, puis libère après la fenêtre", () => {
    const limiter = new AttemptLimiter(3, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(limiter.isAllowed("charge", t0 + i)).toBe(true);
      limiter.recordFailure("charge", t0 + i);
    }
    expect(limiter.isAllowed("charge", t0 + 10)).toBe(false);
    expect(limiter.isAllowed("autre", t0 + 10)).toBe(true);
    expect(limiter.isAllowed("charge", t0 + 60_005)).toBe(true);
  });

  it("une connexion réussie efface les échecs", () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.recordFailure("charge", 0);
    expect(limiter.isAllowed("charge", 1)).toBe(false);
    limiter.reset("charge");
    expect(limiter.isAllowed("charge", 2)).toBe(true);
  });
});
