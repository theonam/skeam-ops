import { describe, expect, it } from "vitest";
import { documentPlaceholders, fillTemplate, pdfFilename } from "./placeholders";
import { renderDocumentHtml } from "./template";
import { buildDocumentView, DEFAULT_INVOICE_MENTIONS, type CompanyInfo } from "./view";

// Origine : egm-app `src/lib/documents/documents.test.ts`, entreprise fictive.
const company: CompanyInfo = {
  legalName: "Société Exemple",
  tradeName: null,
  legalForm: "SAS",
  shareCapital: "10 000 €",
  siret: "00000000000000",
  rcs: "Exempleville",
  vatNumber: "FR00000000000",
  line1: "1 rue de l'Exemple",
  line2: null,
  postalCode: "00000",
  city: "Exempleville",
  phone: null,
  email: "contact@exemple.example",
  iban: "FR76 0000 0000 0000 0000 0000 000",
  bic: "EXEMFRPP",
  headerText: "Entreprise fictive de démonstration",
  legalMentions: null,
};

const base = {
  number: "FA-2026-00001",
  status: "issued" as const,
  date: "2026-10-15",
  dueDate: "2026-11-14",
  subject: "Prestations d'octobre",
  company,
  buyer: { name: "Client Démo", address: "2 avenue Fictive\n00000 Démoville" },
  lines: [
    { type: "title" as const, label: "Lot A" },
    { type: "item" as const, code: "A1", label: "Main d'œuvre", unit: "h", quantityMilli: 2500, unitPriceCents: 4500, vatRateBp: 2000 },
    { type: "item" as const, code: "A2", label: "Fourniture", unit: "u", quantityMilli: 1000, unitPriceCents: 1999, vatRateBp: 550 },
    { type: "subtotal" as const, label: "" },
  ],
  annex: [{ id: "x", src: "data:image/png;base64,AAAA", caption: "photo-1.jpg" }],
};

describe("vue et gabarit de document", () => {
  it("facture : totaux, TVA par taux, règlement avec IBAN, mentions par défaut", () => {
    const view = buildDocumentView({ ...base, type: "invoice" });
    expect(view.totalHtCents).toBe(11250 + 1999);
    expect(view.vat.map((v) => v.rateBp)).toEqual([2000, 550]);
    expect(view.payment?.lines[0]).toContain("FR76 0000");
    expect(view.legalMentions).toBe(DEFAULT_INVOICE_MENTIONS);
    expect(view.signature).toBe(false);
    const html = renderDocumentHtml(view, { latin: "a.woff2", latinExt: "b.woff2" });
    expect(html).toContain("N° FA-2026-00001");
    expect(html).toContain("Entreprise fictive de démonstration");
    expect(html).toContain("Annexe : photos et croquis");
    expect(html).toContain("SIRET 00000000000000");
  });

  it("devis en brouillon : bandeau, zone Bon pour accord, pas de règlement", () => {
    const view = buildDocumentView({ ...base, type: "quote", number: null, status: "draft" });
    expect(view.watermark).toMatch(/Brouillon/);
    expect(view.signature).toBe(true);
    expect(view.payment).toBeNull();
    expect(renderDocumentHtml(view, { latin: "a", latinExt: "b" })).toContain("Numéro attribué à l'émission");
  });

  it("échappe le texte saisi", () => {
    const view = buildDocumentView({ ...base, type: "invoice", subject: "<script>x</script>" });
    expect(renderDocumentHtml(view, { latin: "a", latinExt: "b" })).not.toContain("<script>x");
  });

  it("nom de fichier et gabarits de mail", () => {
    const values = documentPlaceholders({ number: "FA-2026-00001", clientName: "Client : Démo", subject: "Objet", date: "2026-10-15" });
    expect(pdfFilename("{numero} - {client}", values)).toBe("FA-2026-00001 - Client - Démo.pdf");
    expect(fillTemplate("Facture {numero} du {date} {inconnu}", values)).toBe("Facture FA-2026-00001 du 15/10/2026 {inconnu}");
  });
});
