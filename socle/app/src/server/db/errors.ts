// Origine : egm-app `src/server/db/errors.ts`.
/**
 * Code d'erreur PostgreSQL (23505 doublon, 23P01 chevauchement, 23503 référence…) d'une requête en
 * échec. Drizzle enveloppe l'erreur du pilote : le code est sur l'erreur elle-même ou sur sa cause.
 */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
