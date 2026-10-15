// Origine : egm-app `src/server/auth/rate-limit.ts`.
/**
 * Limite les tentatives de connexion par clé (identifiant ou adresse IP) sur une fenêtre glissante.
 * En mémoire : suffisant pour une instance unique (démo, MVP sur un seul serveur).
 */
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Vrai si la clé a encore droit à un essai. N'enregistre rien. */
  isAllowed(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length < this.maxAttempts;
  }

  recordFailure(key: string, now = Date.now()): void {
    this.attempts.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length === 0) this.attempts.delete(key);
    else this.attempts.set(key, list);
    return list;
  }
}
