// Origine : egm-app `src/domain/dates.test.ts`.
import { describe, expect, it } from "vitest";
import { addDays, parisDate } from "./dates";

describe("dates calendaires", () => {
  it("donne la date de Paris, même tard le soir en heure universelle", () => {
    expect(parisDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(parisDate(new Date("2026-10-14T21:59:00Z"))).toBe("2026-10-14");
  });

  it("ajoute des jours en passant les fins de mois et le changement d'heure", () => {
    expect(addDays("2026-10-14", 90)).toBe("2027-01-12");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
  });
});
