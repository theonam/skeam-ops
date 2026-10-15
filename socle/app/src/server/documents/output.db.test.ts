// Nouveau dans le socle.
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { storeUpload } from "@/server/attachments/service";
import type { CurrentUser } from "@/server/auth/session";
import * as s from "@/server/db/schema";
import { createUser, openTestDb, resetData, seedDocument } from "@/test/db";
import { documentPdf, prepareDocumentEmail, type PdfRenderer } from "./output";
import { issueDocument, saveDraft } from "./service";

/**
 * PDF archivé unique et brouillon Outlook. Le rendu par Chromium est remplacé par un double qui
 * produit un fichier différent à chaque appel : c'est le pire cas pour une course à la génération.
 */
const { client, db } = openTestDb();
afterAll(() => client.end());

let gestion: CurrentUser;
let terrain: CurrentUser;
let calls = 0;
let lastHtml = "";
const fakeRender: PdfRenderer = async (html) => {
  calls += 1;
  lastHtml = html;
  await new Promise((r) => setTimeout(r, 30));
  return new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(32)]));
};

beforeEach(async () => {
  await resetData(db);
  await db.insert(s.companySettings).values({ legalName: "Société Exemple", iban: "FR76 0000 0000 0000 0000 0000 000", bic: "EXEMFRPP", legalMentions: "Mentions de test" });
  gestion = await createUser(db, "gestion");
  terrain = await createUser(db, "terrain");
  calls = 0;
});

async function issued() {
  const { doc, client: c } = await seedDocument(db);
  await saveDraft(gestion, doc.id, {
    clientId: c.id,
    subject: "Objet",
    lines: [{ type: "item", label: "Article", unit: "u", quantityMilli: 1000, unitPriceCents: 10000, vatRateBp: 2000 }],
  });
  const photo = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  await storeUpload(gestion, { type: "document", id: doc.id }, { name: "annexe.jpg", type: "image/jpeg", bytes: new Uint8Array(photo) });
  await issueDocument(gestion, doc.id);
  return doc.id;
}

describe("PDF d'un document émis", () => {
  it("dix demandes simultanées : un seul rendu, dix fois le même fichier, un seul fichier archivé", async () => {
    const id = await issued();
    const results = await Promise.all(Array.from({ length: 10 }, () => documentPdf(gestion, id, fakeRender)));
    expect(calls).toBe(1);
    const first = Buffer.from(results[0]!.pdf);
    for (const r of results) expect(Buffer.from(r!.pdf).equals(first)).toBe(true);
    const files = await readdir(path.join(process.env.STORAGE_LOCAL_DIR!, "documents", id));
    expect(files.filter((f) => f.endsWith(".pdf"))).toHaveLength(1);
    // Plus tard, toujours le même fichier, sans nouveau rendu.
    expect(Buffer.from((await documentPdf(gestion, id, fakeRender))!.pdf).equals(first)).toBe(true);
    expect(calls).toBe(1);
  });

  it("en-tête, mentions, IBAN figé et annexe photo sont dans le document imprimé", async () => {
    const id = await issued();
    await documentPdf(gestion, id, fakeRender);
    expect(lastHtml).toContain("Société Exemple");
    expect(lastHtml).toContain("Mentions de test");
    expect(lastHtml).toContain("IBAN FR76 0000");
    expect(lastHtml).toContain("Annexe : photos et croquis");
    expect(lastHtml).toMatch(/data:image\/jpeg;base64,/);
  });

  it("le terrain n'obtient aucun PDF", async () => {
    const id = await issued();
    expect(await documentPdf(terrain, id, fakeRender)).toBeNull();
  });
});

describe("brouillon Outlook", () => {
  it("joint le PDF archivé, passe le document à envoyé et trace l'envoi", async () => {
    const id = await issued();
    const archived = await documentPdf(gestion, id, fakeRender);
    const { download, status } = await prepareDocumentEmail(gestion, id, { to: ["client@exemple.example"], cc: [], subject: "Votre facture", body: "Bonjour" }, fakeRender);
    expect(status).toBe("sent");
    expect(download.filename).toMatch(/\.eml$/);
    expect(download.content).toContain("X-Unsent: 1");
    expect(download.content).toContain(Buffer.from(archived!.pdf).toString("base64").slice(0, 40));
    const [mail] = await db.select().from(s.outboundEmails).where(eq(s.outboundEmails.documentId, id));
    expect(mail.toAddresses).toEqual(["client@exemple.example"]);
  });

  it("refuse un brouillon de document et le profil terrain", async () => {
    const { doc } = await seedDocument(db);
    await expect(prepareDocumentEmail(gestion, doc.id, { to: ["a@exemple.example"], cc: [], subject: "x", body: "" }, fakeRender)).rejects.toThrow(/Émettez/);
    await expect(prepareDocumentEmail(terrain, doc.id, { to: ["a@exemple.example"], cc: [], subject: "x", body: "" }, fakeRender)).rejects.toThrow(/non autorisé/);
  });
});
