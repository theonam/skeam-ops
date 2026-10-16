// Nouveau dans le socle.
/**
 * Restauration d'une sauvegarde : remplace le contenu de la base cible.
 *   pnpm db:restore backups/db-2026-10-15t02-00-00z.dump --cible <adresse de la base> --oui
 * La cible est obligatoire et distincte de DATABASE_URL sauf confirmation explicite : on restaure
 * d'abord dans une base neuve pour vérifier, puis on bascule l'application.
 */
import "dotenv/config";
import { restoreDatabase } from "../src/server/maintenance/backup";
import { storageFromEnv } from "../src/server/storage/from-env";

async function main() {
  const args = process.argv.slice(2);
  const key = args.find((a) => a.startsWith("backups/"));
  const target = args[args.indexOf("--cible") + 1];
  if (!key || !args.includes("--cible") || !target) {
    console.error("Usage : pnpm db:restore backups/<fichier>.dump --cible <adresse de la base> --oui");
    process.exit(2);
  }
  if (!args.includes("--oui")) {
    console.error(`La base ${new URL(target).host}${new URL(target).pathname} sera remplacée. Relancer avec --oui pour confirmer.`);
    process.exit(2);
  }
  if (target === process.env.DATABASE_URL && !args.includes("--base-en-service")) {
    console.error("La cible est la base en service : ajouter --base-en-service pour confirmer, application arrêtée.");
    process.exit(2);
  }
  await restoreDatabase({ databaseUrl: target, storage: storageFromEnv(), key });
  console.log(`Sauvegarde ${key} restaurée.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
