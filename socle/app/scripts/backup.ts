/**
 * Sauvegarde de la base dans le stockage de fichiers, préfixe backups/, avec rotation.
 *   pnpm db:backup            sauvegarde maintenant ; garde BACKUP_RETENTION_DAYS jours, 30 par défaut
 *   pnpm db:backup --liste    liste les sauvegardes disponibles
 * Sur Render : tâche planifiée décrite dans render.yaml.
 */
import "dotenv/config";
import { backupDatabase, listBackups } from "../src/server/maintenance/backup";
import { storageFromEnv } from "../src/server/storage/from-env";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  const storage = storageFromEnv();
  if (process.argv.includes("--liste")) {
    for (const key of await listBackups(storage)) console.log(key);
    return;
  }
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30) || 30;
  const { key, size, pruned } = await backupDatabase({ databaseUrl: url, storage, retentionDays });
  console.log(`Sauvegarde ${key} : ${Math.round(size / 1024)} Ko. ${pruned.length} ancienne(s) sauvegarde(s) supprimée(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
