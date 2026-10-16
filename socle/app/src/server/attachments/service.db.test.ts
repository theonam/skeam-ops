import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptySketch } from "@/domain/sketch";
import type { CurrentUser } from "@/server/auth/session";
import * as s from "@/server/db/schema";
import { createUser, openTestDb, resetData } from "@/test/db";
import { deleteAttachment, listAttachments, openAttachment, storeUpload } from "./service";
import { saveSketch } from "./sketches";

// Origine : egm-app `src/server/attachments/service.db.test.ts`, propriétaire document générique.
const { client, db } = openTestDb();
let gestion: CurrentUser;
let terrain: CurrentUser;
let documentId = "";
const owner = () => ({ type: "document" as const, id: documentId });

async function photo(width: number, height: number): Promise<Uint8Array> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7919 + (i >> 4) * 31) % 251;
  return new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer());
}

async function mailWithPhoto(): Promise<Uint8Array> {
  const image = Buffer.from(await photo(500, 400)).toString("base64").replace(/(.{76})/g, "$1\r\n");
  const logo = Buffer.from(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#123456" } }).png().toBuffer()).toString("base64");
  return new TextEncoder().encode(
    [
      "From: Gardien <gardien@example.com>",
      "Subject: Infiltration plafond",
      "Date: Tue, 13 Oct 2026 09:00:00 +0200",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Voir photo.",
      "--b",
      'Content-Type: image/jpeg; name="plafond.jpg"',
      'Content-Disposition: attachment; filename="plafond.jpg"',
      "Content-Transfer-Encoding: base64",
      "",
      image,
      "--b",
      'Content-Type: image/png; name="logo.png"',
      'Content-Disposition: attachment; filename="logo.png"',
      "Content-Transfer-Encoding: base64",
      "",
      logo,
      "--b--",
      "",
    ].join("\r\n"),
  );
}

beforeAll(async () => {
  await resetData(db);
  gestion = await createUser(db, "gestion");
  terrain = await createUser(db, "terrain");
  const [c] = await db.insert(s.clients).values({ code: "C1", name: "Client test" }).returning();
  const [d] = await db.insert(s.documents).values({ type: "quote", clientId: c.id, subject: "Test" }).returning();
  documentId = d.id;
});

afterAll(async () => {
  await client.end();
});

async function storedFiles(): Promise<string[]> {
  const dir = path.join(process.env.STORAGE_LOCAL_DIR!, "documents", documentId);
  return readdir(dir).catch(() => []);
}

describe("pièces jointes d'un document", () => {
  it("une photo est enregistrée avec ses dimensions et sa vignette, et tracée au journal", async () => {
    const [view] = await storeUpload(gestion, owner(), { name: "photo.jpg", type: "image/jpeg", bytes: await photo(1200, 900) });
    expect(view).toMatchObject({ kind: "photo", width: 1200, height: 900, hasThumbnail: true, displayable: true, uploadedBy: "Test gestion" });
    const thumb = await openAttachment(gestion, view.id, "thumbnail");
    const bytes = new Uint8Array(await new Response(thumb!.object.body).arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(480);
    const log = await db.select().from(s.auditLog);
    expect(log.some((l) => l.action === "ajout_fichier" && l.entityId === documentId)).toBe(true);
  });

  it("un mail .eml apporte sa photo, sans le logo de signature, et se supprime avec elle", async () => {
    const views = await storeUpload(gestion, owner(), { name: "mail.eml", type: "", bytes: await mailWithPhoto() }, { isOriginEmail: true });
    const mail = views.find((v) => v.kind === "email")!;
    expect(mail.email).toMatchObject({ subject: "Infiltration plafond", from: "Gardien <gardien@example.com>", attachmentCount: 2 });
    const children = views.filter((v) => v.parentId === mail.id);
    expect(children.map((c) => c.filename)).toEqual(["plafond.jpg"]);
    const before = (await storedFiles()).length;
    await deleteAttachment(gestion, mail.id);
    const after = await listAttachments(gestion, owner());
    expect(after.some((a) => a.id === mail.id || a.parentId === mail.id)).toBe(false);
    expect((await storedFiles()).length).toBe(before - 3);
  });

  it("un PDF déposé est enregistré comme PDF", async () => {
    const [view] = await storeUpload(gestion, owner(), { name: "plan.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4\n%%EOF") });
    expect(view.kind).toBe("pdf");
  });

  it("refuse un type de fichier inconnu", async () => {
    await expect(storeUpload(gestion, owner(), { name: "outil.exe", type: "application/x-msdownload", bytes: new Uint8Array([1, 2]) })).rejects.toThrow(/non accepté/);
  });
});

describe("profil terrain : ajoute photos et croquis, sans rien supprimer", () => {
  it("ajoute une photo puis un croquis dessus, qui remplace la photo dans la liste", async () => {
    const [view] = await storeUpload(terrain, owner(), { name: "porte.jpg", type: "image/jpeg", bytes: await photo(800, 600) });
    const sketch = await saveSketch(terrain, { owner: owner(), attachmentId: null, backgroundId: view.id, doc: emptySketch(800, 600), image: await photo(800, 600) });
    expect(sketch.kind).toBe("sketch");
    const kinds = (await listAttachments(terrain, owner())).map((a) => a.id);
    expect(kinds).toContain(sketch.id);
    expect(kinds).not.toContain(view.id);
  });

  it("un croquis sur page blanche reste modifiable par la gestion", async () => {
    const blank = await saveSketch(gestion, { owner: owner(), attachmentId: null, backgroundId: null, doc: emptySketch(1000, 700), image: await photo(1000, 700) });
    const edited = await saveSketch(gestion, { owner: owner(), attachmentId: blank.id, backgroundId: null, doc: emptySketch(1000, 700), image: await photo(1000, 700) });
    expect(edited.id).toBe(blank.id);
    expect(edited.version).toBeGreaterThanOrEqual(blank.version);
  });

  it("mais ni document, ni suppression, ni retouche d'un croquis existant", async () => {
    await expect(storeUpload(terrain, owner(), { name: "plan.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4\n%%EOF") })).rejects.toThrow(/Seules les photos/);
    const sketch = (await listAttachments(terrain, owner())).find((a) => a.kind === "sketch")!;
    await expect(deleteAttachment(terrain, sketch.id)).rejects.toThrow(/non autorisée/);
    await expect(saveSketch(terrain, { owner: owner(), attachmentId: sketch.id, backgroundId: null, doc: emptySketch(800, 600), image: await photo(800, 600) })).rejects.toThrow(/non autorisée/);
  });
});
