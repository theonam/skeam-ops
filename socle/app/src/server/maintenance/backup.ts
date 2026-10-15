import { spawn } from "node:child_process";
import path from "node:path";
import type { FileStorage } from "@/server/storage/storage";

/**
 * Sauvegarde et restauration de la base par pg_dump et pg_restore, format personnalisé compressé.
 * La sauvegarde est rangée dans le stockage de fichiers, préfixe `backups/`, puis les sauvegardes plus
 * anciennes que la durée de conservation sont supprimées. Les fichiers stockés, photos et PDF, se
 * sauvegardent par la réplication ou le versionnement du stockage S3 de l'hébergeur.
 * Nouveau dans le socle : egm-app n'a ni sauvegarde ni procédure de restauration.
 */

const PREFIX = "backups/";

function binary(name: "pg_dump" | "pg_restore", env: NodeJS.ProcessEnv): string {
  return env.PG_BIN_DIR ? path.join(env.PG_BIN_DIR, name) : name;
}

function run(command: string, args: string[], input?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(new Uint8Array(Buffer.concat(out)));
      else reject(new Error(`${path.basename(command)} a échoué, code ${code} : ${Buffer.concat(err).toString("utf8").trim().slice(0, 500)}`));
    });
    if (input) child.stdin.end(Buffer.from(input));
    else child.stdin.end();
  });
}

/** Horodatage de clé triable : 2026-10-15T21-04-05Z. */
function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-").toLowerCase();
}

export async function backupDatabase(options: {
  databaseUrl: string;
  storage: FileStorage;
  retentionDays: number;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<{ key: string; size: number; pruned: string[] }> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const dump = await run(binary("pg_dump", env), ["--format=custom", "--no-owner", "--no-privileges", `--dbname=${options.databaseUrl}`]);
  const key = `${PREFIX}db-${stamp(now)}.dump`;
  await options.storage.put(key, dump, "application/octet-stream");
  const limit = now.getTime() - options.retentionDays * 86_400_000;
  const pruned: string[] = [];
  for (const old of await options.storage.list(PREFIX)) {
    const match = /db-(\d{4}-\d{2}-\d{2})t(\d{2})-(\d{2})-(\d{2})z\.dump$/.exec(old);
    if (!match || old === key) continue;
    const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
    if (time < limit) {
      await options.storage.delete(old);
      pruned.push(old);
    }
  }
  return { key, size: dump.byteLength, pruned };
}

export async function listBackups(storage: FileStorage): Promise<string[]> {
  return (await storage.list(PREFIX)).filter((k) => k.endsWith(".dump"));
}

/** Restaure une sauvegarde dans la base indiquée, en remplaçant les objets existants. */
export async function restoreDatabase(options: { databaseUrl: string; storage: FileStorage; key: string; env?: NodeJS.ProcessEnv }): Promise<void> {
  const object = await options.storage.get(options.key);
  if (!object) throw new Error(`Sauvegarde introuvable : ${options.key}`);
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  await run(binary("pg_restore", options.env ?? process.env), ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", `--dbname=${options.databaseUrl}`], bytes);
}
