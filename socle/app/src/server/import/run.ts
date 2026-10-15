import { IMPORT_SCHEMAS, type ImportEntity } from "@/config/import";
import { detectEntity, mapColumns, parseSheet } from "@/domain/import";
import { applyImport, type Db, type EntityResult, type ImportBatch } from "./apply";
import { readWorkbook, type ReportSheet } from "./xlsx";

/**
 * Import complet : lit les classeurs, reconnaît chaque onglet, contrôle les lignes, puis écrit tout
 * dans l'ordre déclaré. `overrides` : intitulé du fichier → champ, par onglet ; `entities` : contenu
 * forcé d'un onglet. `allowed` : contenus que l'utilisateur a le droit d'importer.
 * Origine : egm-app `src/server/import/run.ts`.
 */
export async function runImport(
  db: Db,
  files: readonly { name: string; bytes: Uint8Array }[],
  options: {
    dryRun: boolean;
    overrides?: Record<string, Record<string, string>>;
    entities?: Record<string, ImportEntity>;
    allowed?: (entity: ImportEntity) => boolean;
    after?: Parameters<typeof applyImport>[3];
  },
): Promise<ReportSheet[]> {
  const report: ReportSheet[] = [];
  const batches: ImportBatch[] = [];
  for (const file of files) {
    for (const sheet of await readWorkbook(file.bytes)) {
      const source = `${file.name} › ${sheet.name}`;
      const overrides = options.overrides?.[source] ?? options.overrides?.[sheet.name] ?? {};
      const entity = options.entities?.[source] ?? options.entities?.[sheet.name] ?? detectEntity(IMPORT_SCHEMAS, sheet.name, sheet.headers);
      const nonEmpty = sheet.rows.filter((r) => r.some((c) => c !== null && String(c).trim() !== "")).length;
      if (!entity) {
        report.push({ source, entity: null, mapping: {}, ignored: sheet.headers.filter(Boolean), missing: [], read: nonEmpty, parseRejects: [], result: null });
        continue;
      }
      const schema = IMPORT_SCHEMAS[entity];
      const mapping = mapColumns(schema, sheet.headers, overrides);
      const labelled = Object.fromEntries(
        Object.entries(mapping.columns).map(([key, index]) => [schema.fields.find((f) => f.key === key)?.label ?? key, sheet.headers[index]]),
      );
      if (options.allowed && !options.allowed(entity)) {
        report.push({ source, entity, mapping: labelled, ignored: mapping.ignored, missing: ["droit d'import de ce contenu"], read: nonEmpty, parseRejects: [], result: null });
        continue;
      }
      if (mapping.missing.length > 0) {
        report.push({ source, entity, mapping: labelled, ignored: mapping.ignored, missing: mapping.missing, read: nonEmpty, parseRejects: [], result: null });
        continue;
      }
      const parsed = parseSheet(schema, mapping, sheet.rows, { firstRow: sheet.firstRow });
      report.push({ source, entity, mapping: labelled, ignored: mapping.ignored, missing: [], read: nonEmpty, parseRejects: parsed.rejects, result: null });
      batches.push({ entity, source, records: parsed.records });
    }
  }
  const results: EntityResult[] = await applyImport(db, batches, { dryRun: options.dryRun }, options.after);
  for (const result of results) {
    const entry = report.find((r) => r.source === result.source);
    if (entry) entry.result = result;
  }
  return report;
}

export type ImportSummary = { source: string; entity: string; read: number; created: number; updated: number; rejected: number; missing: string[]; ignored: string[] };

export function summarize(report: readonly ReportSheet[]): ImportSummary[] {
  return report.map((s) => ({
    source: s.source,
    entity: s.entity ? IMPORT_SCHEMAS[s.entity].label : "non reconnu",
    read: s.read,
    created: s.result?.created ?? 0,
    updated: s.result?.updated ?? 0,
    rejected: s.parseRejects.length + (s.result?.rejects.length ?? 0),
    missing: s.missing,
    ignored: s.ignored,
  }));
}

/** Résumé lisible dans le terminal. */
export function describeReport(report: readonly ReportSheet[], dryRun: boolean): string {
  const lines = [dryRun ? "SIMULATION : rien n'est écrit en base, relancer avec --apply pour importer." : "IMPORT effectué."];
  for (const s of summarize(report)) {
    const done = dryRun ? `${s.created} à créer, ${s.updated} à mettre à jour` : `${s.created} créées, ${s.updated} mises à jour`;
    lines.push(`• ${s.source} → ${s.entity} : ${s.read} lignes, ${done}, ${s.rejected} rejetées`);
    if (s.missing.length > 0) lines.push(`    colonnes obligatoires absentes : ${s.missing.join(", ")}`);
    if (s.ignored.length > 0) lines.push(`    colonnes ignorées : ${s.ignored.join(", ")}`);
  }
  return lines.join("\n");
}
