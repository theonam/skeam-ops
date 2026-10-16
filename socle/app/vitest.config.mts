import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests unitaires : sans base. Origine : egm-app `vitest.config.mts`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only refuse d'être importé hors de Next ; neutralisé pour les tests.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
    environment: "node",
  },
});
