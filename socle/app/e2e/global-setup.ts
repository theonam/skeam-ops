// Nouveau dans le socle.
import { execSync } from "node:child_process";

/** Base remise au jeu de démonstration fictif, à l'identique, avant les tests. */
export default function globalSetup() {
  const env = { ...process.env, APP_EDITION: "demo" };
  execSync("pnpm db:migrate && pnpm db:seed && pnpm demo:seed --reset", { stdio: "inherit", env });
}
