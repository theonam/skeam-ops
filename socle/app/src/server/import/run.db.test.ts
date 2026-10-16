import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { openTestDb, resetData } from "@/test/db";
import { runImport, summarize } from "./run";
import { readWorkbook, writeReport } from "./xlsx";

// Origine : egm-app `src/server/import/run.db.test.ts`, classeur fictif générique.
const { client, db } = openTestDb();
afterAll(() => client.end());

async function workbook(sheets: Record<string, (string | number | Date | null)[][]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const row of rows) ws.addRow(row);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

let file: { name: string; bytes: Uint8Array };
beforeAll(async () => {
  await resetData(db);
  file = {
    name: "reprise.xlsx",
    bytes: await workbook({
      "Liste clients": [
        ["Export du 01/10/2026"],
        ["N° client", "Raison sociale", "C.P.", "Ville", "Colonne libre"],
        ["C001", "Client Alpha", 1000, "Démoville", "x"],
        ["C002", "Client Bêta", "75011", "Exempleville", null],
        [null, "Client sans code", null, null, null],
      ],
      Catalogue: [
        ["Code", "Désignation", "Unité", "PU HT", "TVA"],
        ["A01", "Main d'œuvre", "h", 45, 0.2],
        ["A02", "Fourniture", "u", "douze", 0.2],
        ["A03", "Déplacement", "forfait", "30,00", "10 %"],
      ],
      Notes: [["Rien", "à importer"], ["x", "y"]],
    }),
  };
});

describe("import Excel", () => {
  it("simulation : rapport exact, rien d'écrit", async () => {
    const report = await runImport(db, [file], { dryRun: true });
    expect(summarize(report)).toEqual([
      expect.objectContaining({ entity: "Clients", read: 3, created: 2, rejected: 1, ignored: ["Colonne libre"] }),
      expect.objectContaining({ entity: "Articles", read: 3, created: 2, rejected: 1 }),
      expect.objectContaining({ entity: "non reconnu" }),
    ]);
    expect(await db.select().from(s.clients)).toHaveLength(0);
  });

  it("import réel, puis relance : mise à jour sans doublon", async () => {
    await runImport(db, [file], { dryRun: false });
    expect(await db.select().from(s.clients)).toHaveLength(2);
    const again = summarize(await runImport(db, [file], { dryRun: false }));
    expect(again[0]).toMatchObject({ created: 0, updated: 2 });
    expect(await db.select().from(s.articles)).toHaveLength(2);
  });

  it("le rapport Excel liste les lignes rejetées avec leur motif", async () => {
    const report = await runImport(db, [file], { dryRun: true });
    const bytes = await writeReport(report, { dryRun: true, date: "15/10/2026" });
    const [summary, rejects] = await readWorkbook(bytes);
    expect(summary.name).toBe("Résumé");
    expect(rejects.name).toBe("Rejets");
    expect(rejects.rows.map((r) => r[1])).toEqual([5, 3]);
    expect(String(rejects.rows[1][2])).toMatch(/montant illisible « douze »/);
  });

  it("un contenu non autorisé n'est pas importé", async () => {
    const report = await runImport(db, [file], { dryRun: true, allowed: (e) => e !== "articles" });
    expect(summarize(report)[1]).toMatchObject({ entity: "Articles", created: 0, missing: ["droit d'import de ce contenu"] });
  });
});
