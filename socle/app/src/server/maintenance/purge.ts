import type postgres from "postgres";
import type { Edition } from "@/config/app";
import type { FileStorage } from "@/server/storage/storage";

/**
 * Effacement des données métier : référentiels, documents, pièces jointes, journal, et les fichiers
 * stockés qu'ils désignent. Les comptes de connexion restent. Utilisé par `pnpm data:purge` et par
 * `pnpm demo:seed --reset`, qui ouvrent leur propre connexion.
 *
 * Numérotation légale protégée : hors édition démo, l'effacement est refusé dès qu'un document a été
 * émis, et les compteurs ne sont jamais remis à zéro. Correction du défaut relevé dans egm-app, où
 * l'effacement vidait aussi `document_counters` (socle/AUDIT.md § 6.4).
 *
 * Origine : egm-app `src/server/maintenance/purge.ts`.
 */

export const BUSINESS_TABLES = [
  "audit_log",
  "outbound_emails",
  "sketches",
  "attachments",
  "document_vat",
  "document_lines",
  "documents",
  "articles",
  "clients",
  "company_settings",
  "user_preferences",
] as const;

/** Colonnes qui désignent un fichier du stockage. */
const FILE_COLUMNS = [
  ["attachments", "storage_key"],
  ["attachments", "thumbnail_storage_key"],
  ["outbound_emails", "pdf_storage_key"],
  ["documents", "pdf_storage_key"],
] as const;

export type Inventory = { clients: number; articles: number; drafts: number; issued: number; attachments: number; files: number };

export async function storedFileKeys(sql: postgres.Sql): Promise<string[]> {
  const union = FILE_COLUMNS.map(([table, column]) => `select ${column} as key from ${table} where ${column} is not null`).join(" union ");
  const rows = await sql.unsafe<{ key: string }[]>(union);
  return [...new Set(rows.map((r) => r.key))];
}

/** Ce que l'effacement supprimerait, sans rien toucher. */
export async function inventory(sql: postgres.Sql): Promise<Inventory> {
  const [row] = await sql<Omit<Inventory, "files">[]>`
    select
      (select count(*) from clients)::int as "clients",
      (select count(*) from articles)::int as "articles",
      (select count(*) from documents where status = 'draft')::int as "drafts",
      (select count(*) from documents where status <> 'draft')::int as "issued",
      (select count(*) from attachments)::int as "attachments"`;
  return { ...row, files: (await storedFileKeys(sql)).length };
}

export type PurgeResult = { before: Inventory; filesDeleted: number; filesFailed: string[]; countersReset: boolean };

export class PurgeRefused extends Error {}

/**
 * Supprime les fichiers puis vide les tables. Les fichiers d'abord : si l'effacement s'arrête en
 * route, la base désigne encore les fichiers restants et une nouvelle exécution les retrouve.
 */
export async function purgeData(sql: postgres.Sql, storage: FileStorage, options: { edition: Edition }): Promise<PurgeResult> {
  const before = await inventory(sql);
  if (options.edition !== "demo" && before.issued > 0) {
    throw new PurgeRefused(
      `${before.issued} document(s) émis : conservation légale. Effacement refusé hors édition démo, APP_EDITION=demo.`,
    );
  }
  const keys = await storedFileKeys(sql);
  const failed: string[] = [];
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch {
      failed.push(key);
    }
  }
  if (failed.length > 0) return { before, filesDeleted: keys.length - failed.length, filesFailed: failed, countersReset: false };
  const countersReset = options.edition === "demo";
  const tables = countersReset ? [...BUSINESS_TABLES, "document_counters"] : [...BUSINESS_TABLES];
  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate ${tables.join(", ")} restart identity cascade`);
    await tx.unsafe(
      `insert into audit_log (action, entity, summary, details) values ('effacement', 'donnees', 'Effacement des données métier', $1::jsonb)`,
      [JSON.stringify({ ...before, filesDeleted: keys.length, countersReset })],
    );
  });
  return { before, filesDeleted: keys.length, filesFailed: [], countersReset };
}

/** Texte de l'attestation d'effacement : des nombres, aucune donnée. */
export function attestation(result: PurgeResult, when: Date, target: string): string {
  const b = result.before;
  return [
    `Attestation d'effacement des données, ${when.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    `Base : ${target}`,
    "",
    "Données supprimées :",
    `- ${b.clients} clients, ${b.articles} articles ;`,
    `- ${b.drafts} brouillons et ${b.issued} documents émis ;`,
    `- ${b.attachments} pièces jointes et ${result.filesDeleted} fichiers stockés.`,
    "",
    result.countersReset ? "Compteurs de numérotation remis à zéro : édition démo." : "Compteurs de numérotation conservés.",
    "Les comptes de connexion sont conservés.",
  ].join("\n");
}
