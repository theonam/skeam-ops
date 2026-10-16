// Origine : egm-app `src/domain/outbound-email.test.ts`.
import { describe, expect, it } from "vitest";
import { documentEmailInput, parseAddressList } from "./outbound-email";

describe("adresses saisies", () => {
  it("accepte les séparateurs d'Outlook", () => {
    expect(parseAddressList("a@x.fr; b@y.fr,c@z.fr\n <d@w.fr> ")).toEqual(["a@x.fr", "b@y.fr", "c@z.fr", "d@w.fr"]);
    expect(parseAddressList("  ")).toEqual([]);
  });
});

describe("mail d'un document", () => {
  const valid = { to: ["gardien@exemple.fr"], cc: [], subject: "Devis DV-2026-00012", body: "Bonjour" };

  it("exige un destinataire valide", () => {
    expect(documentEmailInput.safeParse(valid).success).toBe(true);
    expect(documentEmailInput.safeParse({ ...valid, to: [] }).success).toBe(false);
    const bad = documentEmailInput.safeParse({ ...valid, cc: ["pas-une-adresse"] });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toContain("pas-une-adresse");
  });

  it("refuse un objet sur plusieurs lignes (injection d'en-tête)", () => {
    expect(documentEmailInput.safeParse({ ...valid, subject: "Devis\r\nBcc: x@y.fr" }).success).toBe(false);
  });
});
