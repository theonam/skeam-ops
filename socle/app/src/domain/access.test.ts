// Nouveau dans le socle.
import { describe, expect, it } from "vitest";
import { FIELD_POLICY, MATRIX, PERMISSIONS, PROFILES } from "@/config/access";
import { can, canSeeField, hiddenFields, redact, visibleColumns } from "./access";

describe("matrice des droits", () => {
  it("ne cite que des droits déclarés", () => {
    for (const profile of PROFILES) for (const p of MATRIX[profile]) expect(PERMISSIONS).toContain(p);
    for (const fields of Object.values(FIELD_POLICY)) for (const p of Object.values(fields)) expect(PERMISSIONS).toContain(p);
  });

  it("l'administrateur a tous les droits ; le terrain ne voit aucun prix", () => {
    for (const p of PERMISSIONS) expect(can("admin", p)).toBe(true);
    expect(can("terrain", "prices.read")).toBe(false);
    expect(can("gestion", "prices.read")).toBe(true);
  });
});

describe("droits au champ", () => {
  it("masque les prix au terrain, pas à la gestion", () => {
    expect(hiddenFields("terrain", "articles")).toEqual(["unitPriceCents", "costCents"]);
    expect(hiddenFields("gestion", "articles")).toEqual([]);
    expect(canSeeField("terrain", "documents", "totalTtcCents")).toBe(false);
    expect(canSeeField("terrain", "documents", "subject")).toBe(true);
  });

  it("retire les colonnes interdites avant la requête et les champs interdits de la réponse", () => {
    const columns = { id: 1, code: 2, unitPriceCents: 3, costCents: 4 };
    expect(Object.keys(visibleColumns("terrain", "articles", columns))).toEqual(["id", "code"]);
    expect(visibleColumns("gestion", "articles", columns)).toEqual(columns);
    expect(redact("terrain", "documentLines", { label: "x", unitPriceCents: 100, totalHtCents: 100 })).toEqual({ label: "x" });
  });

  it("un champ non protégé n'exige que le droit de lire la ressource", () => {
    expect(canSeeField("terrain", "clients", "name")).toBe(true);
    expect(canSeeField("terrain", "clients", "internalNotes")).toBe(false);
  });
});
