// Origine : egm-app `src/server/mail/eml.test.ts`.
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { buildEml, encodeHeaderValue } from "./eml";

const pdf = new TextEncoder().encode("%PDF-1.4 contenu de test");

describe("génération de brouillon .eml", () => {
  it("marque le message comme brouillon non envoyé pour Outlook", () => {
    const eml = buildEml({ to: ["a@b.fr"], subject: "Test", text: "Bonjour", unsent: true });
    expect(eml).toContain("\r\nX-Unsent: 1\r\n");
    expect(eml).not.toMatch(/^From:/m);
  });

  it("produit un message que l'on relit à l'identique, accents et pièce jointe compris", async () => {
    const eml = buildEml({
      to: ["gardien@bailleur.fr", "agence@bailleur.fr"],
      cc: ["suivi@exemple.example"],
      subject: "Devis DV-2026-00042 — réfection salle de bain, bâtiment B",
      text: "Bonjour,\nVeuillez trouver ci-joint notre devis.\nCordialement",
      html: "<p>Bonjour,</p><p>Veuillez trouver ci-joint notre devis.</p>",
      attachments: [{ filename: "Devis DV-2026-00042 – Résidence Les Érables.pdf", contentType: "application/pdf", content: pdf }],
      unsent: true,
    });

    const parsed = await PostalMime.parse(eml);
    expect(parsed.subject).toBe("Devis DV-2026-00042 — réfection salle de bain, bâtiment B");
    expect(parsed.to?.map((a) => ("address" in a ? a.address : ""))).toEqual([
      "gardien@bailleur.fr",
      "agence@bailleur.fr",
    ]);
    expect(parsed.cc?.map((a) => ("address" in a ? a.address : ""))).toEqual(["suivi@exemple.example"]);
    expect(parsed.text?.trim()).toBe("Bonjour,\nVeuillez trouver ci-joint notre devis.\nCordialement");
    expect(parsed.html).toContain("Veuillez trouver ci-joint notre devis.");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("Devis DV-2026-00042 – Résidence Les Érables.pdf");
    expect(parsed.attachments[0].mimeType).toBe("application/pdf");
    expect(new Uint8Array(parsed.attachments[0].content as ArrayBuffer)).toEqual(pdf);
  });

  it("utilise des fins de ligne CRLF et des lignes courtes", () => {
    const eml = buildEml({
      to: ["a@b.fr"],
      subject: "Objet très long avec des accents éèàù ".repeat(4),
      text: "x".repeat(500),
      attachments: [{ filename: "a.pdf", contentType: "application/pdf", content: new Uint8Array(3000) }],
    });
    expect(eml.replace(/\r\n/g, "")).not.toContain("\n");
    const lines = eml.split("\r\n");
    // Limite absolue de la RFC 5322, et 78 caractères pour l'objet et le contenu encodé.
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(998);
    for (const line of lines.filter((l) => /^(Subject:| =\?|[A-Za-z0-9+/=]+$)/.test(l))) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it("refuse une injection d'en-tête par l'objet ou une adresse", () => {
    expect(() => buildEml({ to: ["a@b.fr"], subject: "x\r\nBcc: pirate@x.fr", text: "" })).toThrow();
    expect(() => buildEml({ to: ["a@b.fr\r\nBcc: pirate@x.fr"], subject: "x", text: "" })).toThrow();
  });

  it("laisse un objet ASCII tel quel", () => {
    expect(encodeHeaderValue("Devis 42")).toBe("Devis 42");
    expect(encodeHeaderValue("Été")).toMatch(/^=\?UTF-8\?B\?/);
  });
});
