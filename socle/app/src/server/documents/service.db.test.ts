import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth/session";
import * as s from "@/server/db/schema";
import { createUser, openTestDb, resetData, seedDocument } from "@/test/db";
import { cancelDocument, deleteDraft, getDocument, issueDocument, listDocuments, saveDraft } from "./service";

/**
 * Cycle d'un document : brouillon, émission numérotée, annulation ; contenu figé par la base.
 * Origine : egm-app `src/server/invoices/service.db.test.ts`, assertions relatives et concurrence étendue.
 */
const { client, db } = openTestDb();
afterAll(() => client.end());

let gestion: CurrentUser;
let terrain: CurrentUser;
beforeEach(async () => {
  await resetData(db);
  gestion = await createUser(db, "gestion");
  terrain = await createUser(db, "terrain");
});

const lines = (articleId: string) => [
  { type: "title" as const, label: "Partie 1" },
  { type: "item" as const, articleId, code: "A1", label: "Article", unit: "h", quantityMilli: 2500, unitPriceCents: 4500, vatRateBp: 2000 },
  { type: "item" as const, code: "A2", label: "Fourniture", unit: "u", quantityMilli: 1000, unitPriceCents: 1999, vatRateBp: 550 },
  { type: "subtotal" as const },
];

async function draftReady(type: "quote" | "invoice" = "invoice") {
  const { doc, article, client: c } = await seedDocument(db, type);
  await saveDraft(gestion, doc.id, { clientId: c.id, subject: "Prestations", lines: lines(article.id) });
  return doc.id;
}

describe("brouillon", () => {
  it("le serveur recalcule les totaux et la TVA par taux", async () => {
    const id = await draftReady();
    const d = await getDocument(gestion, id);
    expect(d).toMatchObject({ status: "draft", number: null, totalHtCents: 11250 + 1999, totalVatCents: 2250 + 110, totalTtcCents: 13249 + 2360 });
    expect(d!.lines.map((l) => l.totalHtCents)).toEqual([null, 11250, 1999, 13249]);
  });

  it("le terrain lit le document sans aucun montant", async () => {
    const id = await draftReady();
    const d = await getDocument(terrain, id);
    expect(d).not.toHaveProperty("totalHtCents");
    expect(d).not.toHaveProperty("vat");
    expect(d!.lines[1]).not.toHaveProperty("unitPriceCents");
    expect(JSON.stringify(await listDocuments(terrain))).not.toMatch(/total(Ht|Vat|Ttc)Cents/);
    await expect(saveDraft(terrain, id, { clientId: d!.clientId, subject: "x", lines: [] })).rejects.toThrow(/non autorisée/);
  });
});

describe("émission", () => {
  it("attribue le numéro, fige acheteur, totaux et TVA, trace au journal", async () => {
    const id = await draftReady();
    const { number } = await issueDocument(gestion, id, new Date("2026-10-15T09:00:00Z"));
    expect(number).toBe("FA-2026-00001");
    const d = await getDocument(gestion, id);
    expect(d).toMatchObject({ status: "issued", number, documentDate: "2026-10-15", dueDate: "2026-11-14", buyerName: "Client test" });
    expect(d!.vat).toEqual([
      { rateBp: 2000, baseCents: 11250, vatCents: 2250 },
      { rateBp: 550, baseCents: 1999, vatCents: 110 },
    ]);
    const log = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "emission"));
    expect(log).toHaveLength(1);
  });

  it("cinq émissions simultanées du même document : une seule réussit, un seul numéro consommé", async () => {
    const id = await draftReady();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => issueDocument(gestion, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [counter] = await db.select().from(s.documentCounters);
    expect(counter.lastValue).toBe(1);
  });

  it("vingt documents émis en même temps reçoivent vingt numéros consécutifs", async () => {
    const ids = [];
    for (let i = 0; i < 20; i++) ids.push(await draftReady());
    const issued = await Promise.all(ids.map((id) => issueDocument(gestion, id)));
    const values = issued.map((r) => Number(r.number.split("-")[2])).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("devis et factures ont chacun leur suite", async () => {
    const q = await draftReady("quote");
    const f = await draftReady("invoice");
    const now = new Date("2026-03-01T10:00:00Z");
    expect((await issueDocument(gestion, q, now)).number).toBe("DV-2026-00001");
    expect((await issueDocument(gestion, f, now)).number).toBe("FA-2026-00001");
  });

  it("refuse un document sans ligne d'article, sans consommer de numéro", async () => {
    const { doc } = await seedDocument(db);
    await expect(issueDocument(gestion, doc.id)).rejects.toThrow(/au moins une ligne/);
    expect(await db.select().from(s.documentCounters)).toHaveLength(0);
  });

  it("le terrain ne peut pas émettre", async () => {
    const id = await draftReady();
    await expect(issueDocument(terrain, id)).rejects.toThrow(/non autorisée/);
  });
});

describe("document émis figé, y compris en écrivant directement en base", () => {
  it("lignes, totaux et numéro ne changent plus ; il ne se supprime pas", async () => {
    const id = await draftReady();
    await issueDocument(gestion, id);
    await expect(saveDraft(gestion, id, { clientId: (await getDocument(gestion, id))!.clientId, subject: "x", lines: [] })).rejects.toThrow(/ne se modifie plus/);
    await expect(db.execute(sql`update document_lines set unit_price_cents = 1 where document_id = ${id}`)).rejects.toThrow();
    await expect(db.execute(sql`update documents set total_ht_cents = 1 where id = ${id}`)).rejects.toThrow();
    await expect(db.execute(sql`update documents set number = 'FA-2026-99999' where id = ${id}`)).rejects.toThrow();
    await expect(db.execute(sql`delete from documents where id = ${id}`)).rejects.toThrow();
    await expect(deleteDraft(gestion, id)).rejects.toThrow(/annulez-le/);
  });

  it("l'annulation garde le numéro et le motif", async () => {
    const id = await draftReady();
    const { number } = await issueDocument(gestion, id);
    await cancelDocument(gestion, id, { reason: "Erreur de client" });
    const d = await getDocument(gestion, id);
    expect(d).toMatchObject({ status: "cancelled", number, cancelReason: "Erreur de client" });
  });

  it("un brouillon se supprime", async () => {
    const id = await draftReady();
    await deleteDraft(gestion, id);
    expect(await getDocument(gestion, id)).toBeNull();
  });

  it("le journal d'audit refuse toute modification ou suppression", async () => {
    await draftReady();
    await expect(db.execute(sql`update audit_log set summary = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
