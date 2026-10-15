import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Teste l'application compilée (pnpm build), comme en démo.
    command: `pnpm start -p ${PORT}`,
    // Lecture de PDF : double de test (lecture rangée dans le PDF fictif), jamais l'API réelle.
    env: { ...(process.env as Record<string, string>), PDF_EXTRACTOR: "fake" },
    url: `http://localhost:${PORT}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
