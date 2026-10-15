/**
 * Effacement des données métier, base et fichiers stockés.
 *   pnpm data:purge          inventaire : ce qui serait effacé, rien n'est touché
 *   pnpm data:purge --yes    effacement, puis attestation dans data/effacements/
 * Hors édition démo, refusé dès qu'un document a été émis : conservation légale. Les compteurs de
 * numérotation ne sont remis à zéro qu'en édition démo.
 * Origine : egm-app `scripts/purge-client-data.ts`.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { editionOf } from "../src/config/app";
import { attestation, inventory, purgeData } from "../src/server/maintenance/purge";
import { storageFromEnv } from "../src/server/storage/from-env";

async function main() {
  const confirmed = process.argv.includes("--yes");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  const edition = editionOf(process.env.APP_EDITION);
  const target = new URL(url).host + new URL(url).pathname;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (!confirmed) {
      const b = await inventory(sql);
      console.log(`Base ${target}, édition ${edition}. Serait effacé :`);
      console.log(`- ${b.clients} clients, ${b.articles} articles, ${b.drafts} brouillons, ${b.issued} documents émis`);
      console.log(`- ${b.attachments} pièces jointes, ${b.files} fichiers stockés`);
      console.log(edition === "demo" ? "- compteurs de numérotation remis à zéro" : "- compteurs de numérotation conservés");
      console.log("Rien n'a été effacé. Relancer avec --yes pour effacer.");
      return;
    }
    const result = await purgeData(sql, storageFromEnv(), { edition });
    if (result.filesFailed.length > 0) {
      throw new Error(`${result.filesFailed.length} fichier(s) n'ont pas pu être supprimés : la base n'a pas été vidée. Relancez la commande.`);
    }
    const now = new Date();
    const text = `${attestation(result, now, target)}\n`;
    mkdirSync("data/effacements", { recursive: true });
    const path = `data/effacements/attestation-${now.toISOString().slice(0, 10)}.txt`;
    writeFileSync(path, text);
    console.log(text);
    console.log(`Attestation : ${path}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
