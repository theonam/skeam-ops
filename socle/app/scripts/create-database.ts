/**
 * Crée une base sur le serveur de DATABASE_URL si elle n'existe pas encore. Idempotent.
 * Sert à loger plusieurs bases dans une même instance PostgreSQL : `pnpm db:create app_test`.
 * Origine : egm-app `scripts/create-database.ts`.
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const name = process.argv[2];
  if (!name || !/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error("Nom de base attendu, en minuscules : pnpm db:create app_test");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [exists] = await sql`select 1 from pg_database where datname = ${name}`;
  // Nom vérifié par l'expression ci-dessus : il peut être écrit tel quel dans la commande.
  if (!exists) await sql.unsafe(`create database "${name}"`);
  await sql.end();
  console.log(exists ? `Base ${name} déjà présente.` : `Base ${name} créée.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
