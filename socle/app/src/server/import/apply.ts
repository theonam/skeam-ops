import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { IMPORT_ORDER, type ImportEntity } from "@/config/import";
import type { Reject } from "@/domain/import";
import type { ArticleInput, ClientInput } from "@/domain/referentials";
import { pgErrorCode } from "@/server/db/errors";
import * as s from "@/server/db/schema";

/**
 * Écriture des lignes importées. Relançable : chaque ligne est retrouvée par son code et mise à jour
 * au lieu d'être doublée. Une ligne qui échoue est rejetée seule, les autres passent, grâce à un point
 * de reprise par ligne. En simulation, tout est fait puis annulé : le rapport est exact.
 * N'importe pas le client de base de Next : utilisé aussi par le script d'import, qui ouvre sa connexion.
 * Origine : egm-app `src/server/import/apply.ts`, écrivains déclarés par contenu.
 */

export type Db = PostgresJsDatabase<typeof s>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ImportBatch = { entity: ImportEntity; source: string; records: { row: number; record: Record<string, unknown> }[] };
export type EntityResult = { entity: ImportEntity; source: string; created: number; updated: number; rejects: Reject[] };

/** Écrit une ligne ; renvoie « created » ou « updated ». */
const WRITERS: Record<ImportEntity, (tx: Tx, record: Record<string, unknown>) => Promise<"created" | "updated">> = {
  clients: async (tx, record) => {
    const r = record as ClientInput;
    const [row] = await tx
      .insert(s.clients)
      .values(r)
      .onConflictDoUpdate({ target: s.clients.code, set: { ...r, updatedAt: new Date() } })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    return row.inserted ? "created" : "updated";
  },
  articles: async (tx, record) => {
    const r = record as ArticleInput;
    const [row] = await tx
      .insert(s.articles)
      .values(r)
      .onConflictDoUpdate({ target: s.articles.code, set: { ...r, updatedAt: new Date() } })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    return row.inserted ? "created" : "updated";
  },
};

class DryRun extends Error {}

export async function applyImport(db: Db, batches: readonly ImportBatch[], options: { dryRun: boolean }, after?: (tx: Tx, results: EntityResult[]) => Promise<void>): Promise<EntityResult[]> {
  const results: EntityResult[] = [];
  const ordered = [...batches].sort((a, b) => IMPORT_ORDER.indexOf(a.entity) - IMPORT_ORDER.indexOf(b.entity));
  try {
    await db.transaction(async (tx) => {
      for (const batch of ordered) {
        const result: EntityResult = { entity: batch.entity, source: batch.source, created: 0, updated: 0, rejects: [] };
        for (const { row, record } of batch.records) {
          try {
            const outcome = await tx.transaction((line) => WRITERS[batch.entity](line, record));
            result[outcome]++;
          } catch (error) {
            result.rejects.push({ row, reasons: [rejectReason(error)], values: Object.values(record).filter((v) => v !== null && v !== "").join(" | ") });
          }
        }
        results.push(result);
      }
      if (options.dryRun) throw new DryRun();
      await after?.(tx, results);
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return results;
}

function rejectReason(error: unknown): string {
  switch (pgErrorCode(error)) {
    case "23505":
      return "valeur déjà utilisée par une autre ligne";
    case "23503":
      return "lien vers une donnée inexistante";
    case "23514":
      return "valeur hors des limites autorisées";
    default:
      return `erreur inattendue : ${error instanceof Error ? error.message : String(error)}`;
  }
}
