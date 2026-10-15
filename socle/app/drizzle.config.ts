import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Origine : egm-app `drizzle.config.ts`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
