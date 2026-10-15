import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inject } from "vitest";

// Chaque fichier de test parle à la base du lancement et range ses fichiers dans un dossier temporaire.
process.env.DATABASE_URL = inject("testDatabaseUrl");
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(os.tmpdir(), "socle-test-"));
process.env.DEMO_PASSWORD ??= "mot-de-passe-de-test";
