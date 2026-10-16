import ExcelJS from "exceljs";
import { IMPORT_SCHEMAS, type ImportEntity } from "@/config/import";
import type { Cell, Reject } from "@/domain/import";
import type { EntityResult } from "./apply";

/**
 * Lecture des classeurs et écriture du rapport d'import, exceljs sous licence MIT.
 * Origine : egm-app `src/server/import/xlsx.ts`, lecture et écriture en mémoire pour l'API.
 */

export type Sheet = { name: string; headers: string[]; rows: Cell[][]; firstRow: number };

/** Valeur simple d'une cellule exceljs (texte enrichi, formule, lien : leur valeur affichée). */
function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if ("error" in value) return null;
  }
  return String(value);
}

/**
 * Onglets d'un classeur. La ligne d'en-tête est la première qui a au moins deux cellules remplies
 * (un titre au-dessus du tableau est ignoré).
 */
export async function readWorkbook(bytes: Uint8Array): Promise<Sheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheets: Sheet[] = [];
  workbook.eachSheet((worksheet) => {
    const all: { number: number; cells: Cell[] }[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, number) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= worksheet.columnCount; c++) cells.push(cellValue(row.getCell(c).value));
      all.push({ number, cells });
    });
    const headerIndex = all.findIndex((r) => r.cells.filter((c) => c !== null && String(c).trim() !== "").length >= 2);
    if (headerIndex < 0) return;
    const header = all[headerIndex];
    const rows = all.slice(headerIndex + 1);
    // Lignes vides intercalées : numéros réels conservés pour le rapport.
    const dense: Cell[][] = [];
    const firstRow = header.number + 1;
    for (const r of rows) dense[r.number - firstRow] = r.cells;
    for (let i = 0; i < dense.length; i++) dense[i] ??= [];
    sheets.push({ name: worksheet.name, headers: header.cells.map((c) => (c === null ? "" : String(c).trim())), rows: dense, firstRow });
  });
  return sheets;
}

export type ReportSheet = {
  source: string;
  entity: ImportEntity | null;
  /** Champ reconnu → intitulé du fichier. */
  mapping: Record<string, string>;
  ignored: string[];
  missing: string[];
  read: number;
  parseRejects: Reject[];
  result: EntityResult | null;
};

/** Rapport d'import : un onglet « Résumé » et un onglet « Rejets » (ligne, motif, valeurs lues). */
export async function writeReport(sheets: readonly ReportSheet[], options: { dryRun: boolean; date: string }): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Résumé");
  summary.columns = [
    { header: "Fichier et onglet", width: 40 },
    { header: "Contenu", width: 16 },
    { header: "Lignes lues", width: 12 },
    { header: options.dryRun ? "À créer" : "Créées", width: 10 },
    { header: options.dryRun ? "À mettre à jour" : "Mises à jour", width: 15 },
    { header: "Rejetées", width: 10 },
    { header: "Colonnes reconnues", width: 60 },
    { header: "Colonnes ignorées", width: 40 },
    { header: "Colonnes obligatoires absentes", width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const s of sheets) {
    const rejected = s.parseRejects.length + (s.result?.rejects.length ?? 0);
    summary.addRow([
      s.source,
      s.entity ? IMPORT_SCHEMAS[s.entity].label : "non reconnu",
      s.read,
      s.result?.created ?? 0,
      s.result?.updated ?? 0,
      rejected,
      Object.entries(s.mapping)
        .map(([field, header]) => `${header} → ${field}`)
        .join(" ; "),
      s.ignored.join(" ; "),
      s.missing.join(" ; "),
    ]);
  }
  summary.addRow([]);
  summary.addRow([options.dryRun ? `Simulation du ${options.date} : rien n'a été écrit en base.` : `Import du ${options.date}.`]);

  const rejects = workbook.addWorksheet("Rejets");
  rejects.columns = [
    { header: "Fichier et onglet", width: 40 },
    { header: "Ligne", width: 8 },
    { header: "Motif", width: 70 },
    { header: "Valeurs lues", width: 80 },
  ];
  rejects.getRow(1).font = { bold: true };
  for (const s of sheets) {
    for (const r of [...s.parseRejects, ...(s.result?.rejects ?? [])].sort((a, b) => a.row - b.row)) {
      rejects.addRow([s.source, r.row, r.reasons.join(" ; "), r.values]);
    }
  }
  rejects.autoFilter = { from: "A1", to: "D1" };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
