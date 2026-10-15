import type { DataColumn } from "./types";

/**
 * Exporte les lignes affichées (filtrées, triées, colonnes choisies) en fichier Excel .xlsx.
 * exceljs n'est chargé qu'au clic, pour ne pas alourdir l'affichage de la liste.
 * Les colonnes exportées sont celles reçues du serveur : un champ interdit au profil n'y figure jamais.
 * Origine : egm-app `src/components/data-list/export-xlsx.ts`.
 */
export async function exportXlsx<R>(filename: string, sheetName: string, columns: DataColumn<R>[], rows: R[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = document.title || "Application";
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.id,
    width: Math.max(10, Math.round((c.width ?? 140) / 7)),
    style:
      c.kind === "money"
        ? { numFmt: '#,##0.00 "€"' }
        : c.kind === "date"
          ? { numFmt: "dd/mm/yyyy" }
          : {},
  }));
  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(
        columns.map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined) return [c.id, null];
          if (c.kind === "money" && typeof v === "number") return [c.id, v / 100];
          if (c.kind === "date" && typeof v === "string") return [c.id, new Date(v)];
          if (c.kind === "boolean") return [c.id, v ? "Oui" : "Non"];
          if (c.text) return [c.id, c.kind === "number" ? v : c.text(row)];
          return [c.id, v];
        }),
      ),
    );
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
