import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { issueDocument, saveDraft } from "@/server/documents/service";
import { LocalFileStorage } from "@/server/storage/local";
import { createUser, openTestDb, resetData, seedDocument } from "@/test/db";
import { backupDatabase, listBackups, restoreDatabase } from "./backup";
import { purgeData, PurgeRefused } from "./purge";

// Effacement protégé et sauvegarde restaurable. Origine de l'effacement : egm-app `src/server/maintenance/purge.db.test.ts`.
const { client, db } = openTestDb();
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
afterAll(async () => {
  await client.end();
  await sql.end();
});

const storage = new LocalFileStorage(process.env.STORAGE_LOCAL_DIR!);

async function issuedInvoice() {
  const gestion = await createUser(db, "gestion", `g-${randomBytes(3).toString("hex")}`);
  const { doc, client: c } = await seedDocument(db);
  await saveDraft(gestion, doc.id, { clientId: c.id, subject: "Objet", lines: [{ type: "item", label: "x", unit: "u", quantityMilli: 1000, unitPriceCents: 100, vatRateBp: 2000 }] });
  await issueDocument(gestion, doc.id);
}

beforeEach(() => resetData(db));

describe("effacement des données", () => {
  it("édition démo : tout est vidé, compteurs compris, comptes conservés, effacement tracé", async () => {
    await issuedInvoice();
    const result = await purgeData(sql, storage, { edition: "demo" });
    expect(result.before).toMatchObject({ issued: 1, clients: 1 });
    expect(result.countersReset).toBe(true);
    expect(await db.select().from(s.documents)).toHaveLength(0);
    expect(await db.select().from(s.documentCounters)).toHaveLength(0);
    expect((await db.select().from(s.users)).length).toBeGreaterThan(0);
    const log = await db.select().from(s.auditLog);
    expect(log.map((l) => l.action)).toEqual(["effacement"]);
  });

  it("version finale : refusé dès qu'un document a été émis, rien n'est touché", async () => {
    await issuedInvoice();
    await expect(purgeData(sql, storage, { edition: "full" })).rejects.toBeInstanceOf(PurgeRefused);
    expect(await db.select().from(s.documents)).toHaveLength(1);
  });

  it("version finale sans document émis : données vidées, compteurs conservés", async () => {
    await db.insert(s.documentCounters).values({ documentType: "invoice", period: 2026, lastValue: 12 });
    await seedDocument(db);
    const result = await purgeData(sql, storage, { edition: "full" });
    expect(result.countersReset).toBe(false);
    const [counter] = await db.select().from(s.documentCounters);
    expect(counter.lastValue).toBe(12);
  });
});

describe("sauvegarde et restauration", () => {
  it("une sauvegarde restaurée dans une base neuve redonne les mêmes données et la même numérotation", async () => {
    await issuedInvoice();
    const env = process.env;
    const { key, size } = await backupDatabase({ databaseUrl: process.env.DATABASE_URL!, storage, retentionDays: 30, env });
    expect(size).toBeGreaterThan(1000);
    expect(await listBackups(storage)).toContain(key);

    const admin = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const name = `test_restore_${randomBytes(4).toString("hex")}`;
    await admin.unsafe(`create database "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    try {
      await restoreDatabase({ databaseUrl: url.toString(), storage, key, env });
      const restored = postgres(url.toString(), { max: 1, onnotice: () => {} });
      const [doc] = await restored`select number, status from documents`;
      const [counter] = await restored`select last_value from document_counters`;
      expect(doc).toMatchObject({ status: "issued" });
      expect(doc.number).toMatch(/^FA-\d{4}-00001$/);
      expect(Number(counter.last_value)).toBe(1);
      // Les garanties d'intégrité sont restaurées avec la base.
      await expect(restored`delete from documents`).rejects.toThrow();
      await restored.end();
    } finally {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin.end();
    }
  });

  it("supprime les sauvegardes plus anciennes que la durée de conservation", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "socle-backups-"));
    const local = new LocalFileStorage(dir);
    await local.put("backups/db-2026-01-01t00-00-00z.dump", new Uint8Array([1]));
    await local.put("backups/db-2026-10-10t00-00-00z.dump", new Uint8Array([1]));
    const { pruned } = await backupDatabase({ databaseUrl: process.env.DATABASE_URL!, storage: local, retentionDays: 30, now: new Date("2026-10-15T12:00:00Z") });
    expect(pruned).toEqual(["backups/db-2026-01-01t00-00-00z.dump"]);
    expect(await listBackups(local)).toHaveLength(2);
  });
});
