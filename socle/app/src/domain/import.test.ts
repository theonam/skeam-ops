import { describe, expect, it } from "vitest";
import { IMPORT_SCHEMAS } from "@/config/import";
import { cellCents, cellDate, cellRateBp, detectEntity, mapColumns, normalizeHeader, parseSheet, type Cell } from "./import";

// Origine : egm-app `src/domain/import.test.ts`, sur les contenus génériques du socle.
const parse = (entity: keyof typeof IMPORT_SCHEMAS, headers: string[], rows: Cell[][]) =>
  parseSheet(IMPORT_SCHEMAS[entity], mapColumns(IMPORT_SCHEMAS[entity], headers), rows, { firstRow: 2 });

describe("colonnes", () => {
  it("intitulés reconnus sans accents, casse ni ponctuation", () => {
    expect(normalizeHeader("  N° de TVA  ")).toBe("n de tva");
    const mapping = mapColumns(IMPORT_SCHEMAS.clients, ["Code Client", "Raison sociale", "C.P.", "Ville", "Colonne inconnue"]);
    expect(mapping.columns).toMatchObject({ code: 0, name: 1, postalCode: 2, city: 3 });
    expect(mapping.ignored).toEqual(["Colonne inconnue"]);
    expect(mapping.missing).toEqual([]);
  });

  it("signale les colonnes obligatoires absentes", () => {
    expect(mapColumns(IMPORT_SCHEMAS.articles, ["Code", "Désignation"]).missing).toEqual(["Unité", "Prix unitaire HT"]);
  });

  it("une correspondance forcée l'emporte", () => {
    expect(mapColumns(IMPORT_SCHEMAS.clients, ["Réf.", "Nom"], { "Réf.": "code" }).columns).toMatchObject({ code: 0, name: 1 });
  });

  it("reconnaît le contenu d'un onglet", () => {
    expect(detectEntity(IMPORT_SCHEMAS, "Feuil1", ["Code client", "Raison sociale", "Ville"])).toBe("clients");
    expect(detectEntity(IMPORT_SCHEMAS, "Catalogue", ["Code", "Désignation", "Unité", "PU HT"])).toBe("articles");
    expect(detectEntity(IMPORT_SCHEMAS, "Feuil2", ["A", "B"])).toBeNull();
  });
});

describe("cellules", () => {
  it("montants, taux et dates au format français ou Excel", () => {
    expect(cellCents("1 234,56 €")).toEqual({ ok: true, value: 123456 });
    expect(cellCents(19.9)).toEqual({ ok: true, value: 1990 });
    expect(cellCents("douze").ok).toBe(false);
    expect(cellRateBp(0.055)).toEqual({ ok: true, value: 550 });
    expect(cellRateBp("20 %")).toEqual({ ok: true, value: 2000 });
    expect(cellDate("31/12/2026")).toEqual({ ok: true, value: "2026-12-31" });
    expect(cellDate(46022)).toEqual({ ok: true, value: "2025-12-31" });
    expect(cellDate("31/02/2026").ok).toBe(false);
  });
});

describe("lignes", () => {
  it("rejette une ligne fautive avec ses motifs, garde les autres, détecte les doublons", () => {
    const { records, rejects } = parse(
      "articles",
      ["Code", "Libellé", "Unité", "Prix", "TVA"],
      [
        ["A1", "Article un", "u", 10, 0.2],
        ["A2", "", "u", "abc", 0.2],
        ["A3", "Article trois", "h", "12,50", 0.07],
        [null, null, null, null, null],
        ["a1", "Doublon", "u", 1, 0.2],
      ],
    );
    expect(records.map((r) => r.record.code)).toEqual(["A1"]);
    expect(records[0].record).toMatchObject({ unitPriceCents: 1000, vatRateBp: 2000, isActive: true });
    expect(rejects.map((r) => r.row)).toEqual([3, 4, 6]);
    expect(rejects[0].reasons.join(" ")).toMatch(/Prix unitaire HT : montant illisible/);
    expect(rejects[0].reasons.join(" ")).toMatch(/Libellé/);
    expect(rejects[1].reasons.join(" ")).toMatch(/TVA/);
    expect(rejects[2].reasons).toEqual(["en double avec la ligne 2"]);
  });

  it("complète le code postal et contrôle le SIRET", () => {
    const { records, rejects } = parse("clients", ["Code", "Nom", "CP", "SIRET"], [
      ["C1", "Client un", 1000, "000 000 000 00000"],
      ["C2", "Client deux", "75011", "123"],
    ]);
    expect(records[0].record).toMatchObject({ postalCode: "01000", siret: "00000000000000" });
    expect(rejects[0].reasons.join(" ")).toMatch(/SIRET : 14 chiffres/);
  });
});
