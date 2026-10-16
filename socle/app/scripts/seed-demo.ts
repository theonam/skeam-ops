/**
 * Jeu de démonstration fictif : 300 clients, 5 000 articles, 400 devis et factures, dont une partie émise
 * avec une numérotation légale continue.
 *   pnpm demo:seed            ajoute le jeu s'il n'y a encore aucun client
 *   pnpm demo:seed --reset    efface toutes les données métier puis recrée le jeu à l'identique
 * Réservé à l'édition démo, APP_EDITION=demo : jamais de données fictives dans une base de production.
 * Origine : egm-app `scripts/seed-demo-data.ts`.
 */
import "dotenv/config";
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { editionOf } from "../src/config/app";
import { addDays, parisDate } from "../src/domain/dates";
import { computeTotals, type TotalsLineInput } from "../src/domain/totals";
import * as s from "../src/server/db/schema";
import { purgeData } from "../src/server/maintenance/purge";
import { nextDocumentNumber } from "../src/server/numbering";
import { storageFromEnv } from "../src/server/storage/from-env";
import { CATEGORIES, CITIES, DEMO_COMPANY, fictionPhone, NAMES, pick, PREFIXES, prng, STREETS, SUBJECTS, UNITS } from "./demo-data";

const CLIENTS = 300;
const ARTICLES = 5000;
const DOCUMENTS = 400;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  if (editionOf(process.env.APP_EDITION) !== "demo") throw new Error("Jeu de démonstration réservé à l'édition démo : APP_EDITION=demo.");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema: s, casing: "snake_case" });
  try {
    if (process.argv.includes("--reset")) {
      await purgeData(client, storageFromEnv(), { edition: "demo" });
      console.log("Données métier effacées.");
    }
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(s.clients);
    if (n > 0) {
      console.log("Des clients existent déjà : jeu de démonstration non ajouté. Utiliser --reset pour le recréer.");
      return;
    }
    const rand = prng(20261015);
    await db.insert(s.companySettings).values({ id: 1, ...DEMO_COMPANY }).onConflictDoNothing();

    const clientRows = Array.from({ length: CLIENTS }, (_, i) => {
      const name = `${pick(rand, PREFIXES)} ${pick(rand, NAMES)} ${i + 1}`;
      const city = pick(rand, CITIES);
      return {
        code: `CL${String(i + 1).padStart(4, "0")}`,
        name,
        email: `contact${i + 1}@client-demo.example`,
        phone: fictionPhone(rand),
        line1: `${1 + Math.floor(rand() * 120)} ${pick(rand, STREETS)}`,
        postalCode: `00${String(100 + Math.floor(rand() * 900))}`,
        city,
        internalNotes: rand() < 0.2 ? "Client fictif : note interne de démonstration." : null,
      };
    });
    const clients = await db.insert(s.clients).values(clientRows).returning({ id: s.clients.id, name: s.clients.name, line1: s.clients.line1, postalCode: s.clients.postalCode, city: s.clients.city });

    const articleRows = Array.from({ length: ARTICLES }, (_, i) => {
      const category = pick(rand, CATEGORIES);
      const price = 100 * (5 + Math.floor(rand() * 495)) + (rand() < 0.5 ? 50 : 0);
      return {
        code: `AR${String(i + 1).padStart(5, "0")}`,
        label: `${category} modèle ${String.fromCharCode(65 + (i % 26))}-${i + 1}`,
        category,
        unit: pick(rand, UNITS),
        unitPriceCents: price,
        costCents: Math.round(price * (0.4 + rand() * 0.3)),
        vatRateBp: rand() < 0.85 ? 2000 : pick(rand, [1000, 550] as const),
      };
    });
    const articles: { id: string; code: string; label: string; unit: string; unitPriceCents: number; vatRateBp: number }[] = [];
    for (let i = 0; i < articleRows.length; i += 1000) {
      articles.push(...(await db.insert(s.articles).values(articleRows.slice(i, i + 1000)).returning({ id: s.articles.id, code: s.articles.code, label: s.articles.label, unit: s.articles.unit, unitPriceCents: s.articles.unitPriceCents, vatRateBp: s.articles.vatRateBp })));
    }

    // Dates d'émission croissantes : la numérotation légale suit l'ordre chronologique.
    const start = Date.parse("2026-01-05T09:00:00Z");
    const step = (Date.now() - start) / DOCUMENTS;
    let issued = 0;
    for (let i = 0; i < DOCUMENTS; i++) {
      const type = rand() < 0.6 ? "quote" : "invoice";
      const buyer = pick(rand, clients);
      const lines: (TotalsLineInput & { articleId: string | null; code: string | null; label: string; unit: string | null })[] = [{ type: "title", articleId: null, code: null, label: "Prestations", unit: null }];
      const count = 1 + Math.floor(rand() * 6);
      for (let l = 0; l < count; l++) {
        const a = pick(rand, articles);
        lines.push({ type: "item", articleId: a.id, code: a.code, label: a.label, unit: a.unit, quantityMilli: 1000 * (1 + Math.floor(rand() * 10)), unitPriceCents: a.unitPriceCents, vatRateBp: a.vatRateBp });
      }
      lines.push({ type: "subtotal", articleId: null, code: null, label: "", unit: null });
      const totals = computeTotals(lines);
      const when = new Date(start + i * step);
      const issue = i < DOCUMENTS - 40 && rand() < 0.7;
      await db.transaction(async (tx) => {
        const [doc] = await tx
          .insert(s.documents)
          .values({ type, clientId: buyer.id, subject: pick(rand, SUBJECTS), totalHtCents: totals.totalHtCents, totalVatCents: totals.totalVatCents, totalTtcCents: totals.totalTtcCents, createdAt: when, updatedAt: when })
          .returning({ id: s.documents.id });
        await tx.insert(s.documentLines).values(
          lines.map((l, position) => ({ documentId: doc.id, position, type: l.type, articleId: l.articleId, code: l.code, label: l.label, unit: l.unit, quantityMilli: l.quantityMilli ?? null, unitPriceCents: l.unitPriceCents ?? null, vatRateBp: l.vatRateBp ?? null, totalHtCents: totals.lineTotals[position] })),
        );
        if (!issue) return;
        const number = await nextDocumentNumber(tx, type, when);
        await tx.insert(s.documentVat).values(totals.vat.map((v) => ({ documentId: doc.id, rateBp: v.rateBp, baseCents: v.baseCents, vatCents: v.vatCents })));
        const date = parisDate(when);
        await tx
          .update(s.documents)
          .set({
            status: rand() < 0.5 ? "sent" : "issued",
            number,
            documentDate: date,
            dueDate: addDays(date, 30),
            buyerName: buyer.name,
            buyerAddress: `${buyer.line1}\n${buyer.postalCode} ${buyer.city}`,
            iban: DEMO_COMPANY.iban,
            bic: DEMO_COMPANY.bic,
            issuedAt: when,
          })
          .where(dsql`${s.documents.id} = ${doc.id}`);
        issued += 1;
      });
    }
    await db.insert(s.auditLog).values({ action: "jeu_demo", entity: "donnees", summary: "Jeu de démonstration fictif créé", details: { clients: CLIENTS, articles: ARTICLES, documents: DOCUMENTS, issued } });
    console.log(`Jeu de démonstration créé : ${CLIENTS} clients, ${ARTICLES} articles, ${DOCUMENTS} documents dont ${issued} émis.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
