import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout sur l'application compilée, comme en production : `pnpm build && pnpm test:e2e`.
 * La base DATABASE_URL est remise au jeu de démonstration au début : édition démo seulement.
 * Origine : egm-app `playwright.config.ts`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    env: { ...(process.env as Record<string, string>), APP_EDITION: "demo" },
    url: `http://localhost:${PORT}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
