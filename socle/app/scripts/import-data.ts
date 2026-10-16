/**
 * Import des classeurs Excel du client, en ligne de commande :
 *   pnpm data:import fichier.xlsx [autre.xlsx…]           simulation, rien n'est écrit
 *   pnpm data:import fichier.xlsx --apply                 import réel, relançable
 *   pnpm data:import fichier.xlsx --correspondances c.json  intitulés inattendus
 * Le rapport complet, onglets Résumé et Rejets, est écrit à côté du premier fichier.
 * Les données réelles du client restent dans data/raw/, exclu du dépôt.
 * Origine : egm-app `scripts/import-client-data.ts`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { describeReport, runImport } from "../src/server/import/run";
import { writeReport } from "../src/server/import/xlsx";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const mapIndex = args.indexOf("--correspondances");
  const mappingFile = mapIndex >= 0 ? args[mapIndex + 1] : null;
  const paths = args.filter((a, i) => !a.startsWith("--") && i !== mapIndex + 1);
  if (paths.length === 0) {
    console.error("Usage : pnpm data:import fichier.xlsx [--apply] [--correspondances correspondances.json]");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  const mapping = mappingFile ? (JSON.parse(await readFile(mappingFile, "utf8")) as { colonnes?: Record<string, Record<string, string>>; onglets?: Record<string, "clients" | "articles"> }) : {};
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const files = await Promise.all(paths.map(async (p) => ({ name: path.basename(p), bytes: new Uint8Array(await readFile(p)) })));
  const report = await runImport(db, files, { dryRun: !apply, overrides: mapping.colonnes, entities: mapping.onglets });
  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(path.dirname(paths[0]), `rapport-import-${date}.xlsx`);
  await writeFile(out, await writeReport(report, { dryRun: !apply, date }));
  console.log(describeReport(report, !apply));
  console.log(`Rapport : ${out}`);
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
