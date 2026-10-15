import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests sur une vraie base PostgreSQL, créée pour le lancement puis supprimée. Origine : egm-app `vitest.db.config.mts`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.db.test.ts"],
    environment: "node",
    globalSetup: ["src/test/db-global-setup.ts"],
    setupFiles: ["src/test/db-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
