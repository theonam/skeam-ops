import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/test/db";
import { nextDocumentNumber } from "./numbering";

/**
 * Numérotation sans trou ni doublon, y compris en accès concurrent.
 * Les assertions portent sur la suite des numéros, jamais sur une valeur absolue tirée d'une base partagée.
 * Origine : egm-app `src/server/numbering.db.test.ts`, complété.
 */
const { client, db } = openTestDb();
afterAll(() => client.end());
beforeEach(() => db.execute(sql`truncate document_counters`));

const d = new Date("2026-10-14T10:00:00Z");
const valueOf = (n: string) => Number(n.split("-")[2]);

/** Les numéros forment-ils exactement la suite 1..n, sans trou ni doublon ? */
function expectContiguous(numbers: string[]) {
  const values = numbers.map(valueOf).sort((a, b) => a - b);
  expect(new Set(values).size).toBe(values.length);
  expect(values).toEqual(Array.from({ length: values.length }, (_, i) => i + 1));
}

describe("numérotation sans trou ni doublon", () => {
  it("numérote à partir de 1 et sépare les types de documents", async () => {
    expect(await nextDocumentNumber(db, "quote", d)).toBe("DV-2026-00001");
    expect(await nextDocumentNumber(db, "quote", d)).toBe("DV-2026-00002");
    expect(await nextDocumentNumber(db, "invoice", d)).toBe("FA-2026-00001");
  });

  it("repart à 1 au changement d'année, en heure de Paris", async () => {
    expect(await nextDocumentNumber(db, "invoice", new Date("2026-12-31T22:59:00Z"))).toBe("FA-2026-00001");
    // 1er janvier 2027 à 0 h 01 à Paris.
    expect(await nextDocumentNumber(db, "invoice", new Date("2026-12-31T23:01:00Z"))).toBe("FA-2027-00001");
    expect(await nextDocumentNumber(db, "invoice", new Date("2026-12-31T22:59:30Z"))).toBe("FA-2026-00002");
  });

  it("une émission annulée ne laisse pas de trou", async () => {
    await nextDocumentNumber(db, "invoice", d);
    await expect(
      db.transaction(async (tx) => {
        await nextDocumentNumber(tx, "invoice", d);
        throw new Error("échec de l'enregistrement");
      }),
    ).rejects.toThrow();
    expect(await nextDocumentNumber(db, "invoice", d)).toBe("FA-2026-00002");
  });

  it("50 émissions simultanées donnent 50 numéros consécutifs, compteur à 50", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () =>
        db.transaction(async (tx) => {
          const n = await nextDocumentNumber(tx, "invoice", d);
          await tx.execute(sql`select pg_sleep(0.002)`);
          return n;
        }),
      ),
    );
    expectContiguous(numbers);
    const [row] = await db.execute<{ last_value: number }>(sql`select last_value from document_counters where document_type = 'invoice'`);
    expect(Number(row.last_value)).toBe(50);
  });

  it("émissions simultanées dont une sur trois échoue : les numéros attribués restent contigus", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        db.transaction(async (tx) => {
          const n = await nextDocumentNumber(tx, "invoice", d);
          await tx.execute(sql`select pg_sleep(0.002)`);
          if (i % 3 === 0) throw new Error("annulée");
          return n;
        }),
      ),
    );
    const kept = outcomes.filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled").map((o) => o.value);
    expect(kept).toHaveLength(20);
    expectContiguous(kept);
  });
});
