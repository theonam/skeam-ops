import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NUMBERING, type NumberedDocumentType } from "@/config/numbering";
import { formatDocumentNumber, numberingPeriod } from "@/domain/numbering";

// Accepte la base comme une transaction : le numéro doit être pris DANS la transaction de création.
type Executor = Pick<PgDatabase<PgQueryResultHKT>, "execute">;

/**
 * Attribue le numéro suivant d'un type de document, sans trou ni doublon.
 *
 * À appeler dans la transaction qui émet le document : l'UPSERT verrouille la ligne du compteur
 * jusqu'au commit. Deux émissions simultanées obtiennent deux numéros successifs ; une émission
 * annulée annule aussi l'incrément. Une séquence PostgreSQL native, elle, laisse un trou à chaque
 * annulation : elle est proscrite pour une numérotation légale.
 *
 * Origine : egm-app `src/server/numbering.ts`, format et remise à zéro tirés de `src/config/numbering.ts`.
 */
export async function nextDocumentNumber(tx: Executor, documentType: NumberedDocumentType, date: Date = new Date()): Promise<string> {
  const rule = NUMBERING[documentType];
  const period = numberingPeriod(rule, date);
  const result = await tx.execute(sql`
    insert into document_counters (document_type, period, last_value)
    values (${documentType}, ${period}, 1)
    on conflict (document_type, period)
    do update set last_value = document_counters.last_value + 1, updated_at = now()
    returning last_value
  `);
  const row = (result as unknown as Array<{ last_value: number }>)[0];
  if (!row) throw new Error("Compteur de numérotation introuvable");
  return formatDocumentNumber(rule, date, Number(row.last_value));
}
