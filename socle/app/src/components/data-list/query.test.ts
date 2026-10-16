// Origine : egm-app `src/components/data-list/query.test.ts`.
import { describe, expect, it } from "vitest";
import { applyQuery, EMPTY_VALUE, filterOptions, resolveVisibleColumns, type ListQuery, type QueryColumn } from "./query";

type Row = { id: number; client: string; ville: string; montant: number | null; urgent: boolean };

const rows: Row[] = [
  { id: 1, client: "Habitat Val d'Orge", ville: "Évry", montant: 1200, urgent: true },
  { id: 2, client: "Logis des Trois Boucles", ville: "Melun", montant: 300, urgent: false },
  { id: 3, client: "Habitat Val d'Orge", ville: "Mennecy", montant: null, urgent: false },
  { id: 4, client: "Commune de Bréville", ville: "Évry", montant: 50, urgent: true },
  { id: 5, client: "Logis des Trois Boucles", ville: "", montant: 300, urgent: false },
];

const columns: QueryColumn<Row>[] = [
  { id: "client", value: (r) => r.client },
  { id: "ville", value: (r) => r.ville },
  { id: "montant", value: (r) => r.montant },
  { id: "urgent", value: (r) => r.urgent },
];

const q = (over: Partial<ListQuery<Row>> = {}): ListQuery<Row> => ({ search: "", filters: {}, sort: null, ...over });
const ids = (list: Row[]) => list.map((r) => r.id);

describe("filtres à cases à cocher", () => {
  it("combine plusieurs colonnes (ET) et plusieurs valeurs d'une colonne (OU)", () => {
    const result = applyQuery(rows, columns, columns, q({
      filters: { client: ["Habitat Val d'Orge", "Commune de Bréville"], ville: ["Évry"] },
    }));
    expect(ids(result)).toEqual([1, 4]);
  });

  it("propose les valeurs dans l'ordre de la colonne : montants croissants, vides à la fin", () => {
    const money: QueryColumn<Row>[] = [...columns, { id: "euros", value: (r) => r.montant, text: (r) => (r.montant === null ? "" : `${r.montant} €`) }];
    expect(filterOptions(rows, money, "euros", {}).map((o) => o.value)).toEqual(["50 €", "300 €", "1200 €", EMPTY_VALUE]);
  });

  it("filtre sur la valeur de filtre quand elle diffère du texte (jour d'une date et heure)", () => {
    const stamped = rows.map((r, i) => ({ ...r, at: `2026-10-${10 + (i % 2)}T0${i}:00:00Z` }));
    const at: QueryColumn<(typeof stamped)[number]> = { id: "at", value: (r) => r.at, text: (r) => r.at.replace("T", " "), filterText: (r) => r.at.slice(0, 10) };
    expect(filterOptions(stamped, [at], "at", {})).toEqual([{ value: "2026-10-10", count: 3 }, { value: "2026-10-11", count: 2 }]);
    expect(applyQuery(stamped, [at], [at], { search: "", filters: { at: ["2026-10-11"] }, sort: null }).map((r) => r.id)).toEqual([2, 4]);
  });

  it("sait filtrer les valeurs vides et les booléens", () => {
    expect(ids(applyQuery(rows, columns, columns, q({ filters: { ville: [EMPTY_VALUE] } })))).toEqual([5]);
    expect(ids(applyQuery(rows, columns, columns, q({ filters: { urgent: ["Oui"] } })))).toEqual([1, 4]);
  });

  it("propose les valeurs d'une colonne selon les filtres des autres colonnes, comme Excel", () => {
    const options = filterOptions(rows, columns, "ville", { client: ["Habitat Val d'Orge"] });
    expect(options).toEqual([
      { value: "Évry", count: 1 },
      { value: "Mennecy", count: 1 },
    ]);
    // Le filtre de la colonne elle-même n'est pas appliqué : on peut cocher d'autres valeurs.
    expect(filterOptions(rows, columns, "ville", { ville: ["Évry"] }).length).toBe(4);
    // (vide) toujours en dernier
    expect(filterOptions(rows, columns, "ville", {}).at(-1)).toEqual({ value: EMPTY_VALUE, count: 1 });
  });
});

describe("recherche", () => {
  it("cherche tous les mots, sans tenir compte des accents ni de la casse", () => {
    expect(ids(applyQuery(rows, columns, columns, q({ search: "evry habitat" })))).toEqual([1]);
    expect(ids(applyQuery(rows, columns, columns, q({ search: "BREVILLE" })))).toEqual([4]);
  });

  it("ne cherche que dans les colonnes indiquées", () => {
    expect(applyQuery(rows, columns, [columns[1]], q({ search: "habitat" }))).toEqual([]);
  });
});

describe("tri", () => {
  it("trie les nombres et place les vides à la fin dans les deux sens", () => {
    expect(ids(applyQuery(rows, columns, columns, q({ sort: { id: "montant", desc: false } })))).toEqual([4, 2, 5, 1, 3]);
    expect(ids(applyQuery(rows, columns, columns, q({ sort: { id: "montant", desc: true } })))).toEqual([1, 2, 5, 4, 3]);
  });

  it("trie le texte à la française et reste stable à égalité", () => {
    expect(ids(applyQuery(rows, columns, columns, q({ sort: { id: "client", desc: false } })))).toEqual([4, 1, 3, 2, 5]);
  });
});

describe("colonnes mémorisées", () => {
  it("reprend l'ordre enregistré et ignore les colonnes disparues", () => {
    expect(resolveVisibleColumns(["a", "b", "c"], ["a", "b"], ["c", "x", "a"])).toEqual(["c", "a"]);
    expect(resolveVisibleColumns(["a", "b", "c"], ["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(resolveVisibleColumns(["a", "b", "c"], ["a", "b"], ["x"])).toEqual(["a", "b"]);
  });
});

describe("lignes épinglées", () => {
  it("garde les urgentes en tête quel que soit le tri", () => {
    const pinned = (r: Row) => r.urgent;
    const byCity = applyQuery(rows, columns, columns, q({ sort: { id: "ville", desc: true }, pinned }));
    expect(byCity.slice(0, 2).every((r) => r.urgent)).toBe(true);
    expect(byCity.slice(2).some((r) => r.urgent)).toBe(false);
    const unsorted = applyQuery(rows, columns, columns, q({ pinned }));
    expect(ids(unsorted)).toEqual([1, 4, ...ids(rows).filter((id) => id !== 1 && id !== 4)]);
  });
});
