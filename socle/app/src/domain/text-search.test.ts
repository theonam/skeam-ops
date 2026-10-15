// Origine : egm-app `src/domain/text-search.test.ts`.
import { describe, expect, it } from "vitest";
import { fold, highlight, hitsAny, matchesAll, searchWords } from "./text-search";

describe("recherche sans accents ni majuscules", () => {
  it("replie accents et majuscules", () => {
    expect(fold("Créteil – Bâtiment Œ")).toBe("creteil – batiment œ");
    expect(searchWords("  Évier   LOGEMENT 12 ")).toEqual(["evier", "logement", "12"]);
  });

  it("chaque mot doit se trouver, dans n'importe quel champ et n'importe quel ordre", () => {
    const fields = ["DD-2026-00118", "Fuite sous évier", "Habitat Marne Sud", null, "Mme Durand"];
    expect(matchesAll(fields, searchWords("durand evier"))).toBe(true);
    expect(matchesAll(fields, searchWords("00118 marne"))).toBe(true);
    expect(matchesAll(fields, searchWords("durand plafond"))).toBe(false);
    expect(matchesAll(fields, [])).toBe(true);
  });

  it("ne colle pas deux champs voisins pour trouver un mot", () => {
    expect(matchesAll(["Marne", "Sud"], searchWords("marnesud"))).toBe(false);
  });

  it("dit quel champ a répondu", () => {
    expect(hitsAny("Mme Durand", searchWords("durand"))).toBe(true);
    expect(hitsAny("Bât. B", searchWords("durand"))).toBe(false);
  });

  it("surligne en gardant les accents d'origine", () => {
    expect(highlight("Fuite sous évier", searchWords("EVIER"))).toEqual([
      { text: "Fuite sous ", hit: false },
      { text: "évier", hit: true },
    ]);
    expect(highlight("Créteil", [])).toEqual([{ text: "Créteil", hit: false }]);
    expect(highlight("12 rue 12", ["12"]).filter((s) => s.hit).map((s) => s.text)).toEqual(["12", "12"]);
  });
});
