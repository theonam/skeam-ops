// Origine : egm-app `src/server/storage/from-env.ts`.
import path from "node:path";
import { LocalFileStorage } from "./local";
import { S3FileStorage } from "./s3";
import type { FileStorage } from "./storage";

// Sans « server-only » : les scripts (effacement des données) en ont aussi besoin.
/** Construit le stockage décrit par les variables d'environnement (cf. .env.example). */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): FileStorage {
  const driver = env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return new LocalFileStorage(path.resolve(env.STORAGE_LOCAL_DIR || ".storage"));
  }
  if (driver === "s3") {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    const missing = required.filter((name) => !env[name]);
    if (missing.length > 0) throw new Error(`Stockage S3 : variable(s) manquante(s) ${missing.join(", ")}`);
    return new S3FileStorage({
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION || "us-east-1",
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    });
  }
  throw new Error(`STORAGE_DRIVER inconnu : ${driver} (attendu : local ou s3)`);
}

