import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { login } from "./helpers";

/**
 * Glisser-déposer de photos, PDF et mails Outlook sur une fiche ; croquis au stylet sur page blanche,
 * enregistré puis rouvert pour modification ; application installable.
 * Origine : egm-app `e2e/sketch.spec.ts`, `e2e/quote-requests.spec.ts`, `e2e/pwa-and-lab.spec.ts`.
 */
const editorRoot = (page: Page) => page.locator("[data-document-editor]");
const sketchEditor = (page: Page) => page.locator("dialog[data-sketch-editor][open]");
const canvas = (page: Page) => sketchEditor(page).getByRole("img", { name: /Zone de dessin/ });

async function openDraft(page: Page) {
  await page.getByRole("button", { name: "Nouveau" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau document" });
  await dialog.getByLabel("Client").selectOption({ index: 2 });
  await dialog.getByLabel("Objet").fill("Fiche avec pièces jointes");
  await dialog.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(editorRoot(page)).toBeVisible();
}

/** Lâche des fichiers sur la fiche, comme depuis l'explorateur ou Outlook. */
async function dropFiles(page: Page, files: { name: string; type: string; data: Buffer }[]) {
  const payload = files.map((f) => ({ name: f.name, type: f.type, data: f.data.toString("base64") }));
  await page.evaluate((list) => {
    const transfer = new DataTransfer();
    for (const f of list) transfer.items.add(new File([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    const target = document.querySelector("[data-document-editor]")!;
    for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, payload);
}

function eml(photo: Buffer): Buffer {
  const image = photo.toString("base64").replace(/(.{76})/g, "$1\r\n");
  return Buffer.from(
    [
      "From: Exemple <exemple@exemple.example>",
      "Subject: Photos du site",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Voir la photo.",
      "--b",
      'Content-Type: image/jpeg; name="site.jpg"',
      'Content-Disposition: attachment; filename="site.jpg"',
      "Content-Transfer-Encoding: base64",
      "",
      image,
      "--b--",
      "",
    ].join("\r\n"),
  );
}

test("glisser-déposer : photo, PDF et mail Outlook avec sa pièce jointe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "gestion");
  await openDraft(page);
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a9cc6" } }).jpeg().toBuffer();
  const noisy = await sharp(Buffer.from(Array.from({ length: 300 * 200 * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width: 300, height: 200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  await dropFiles(page, [
    { name: "facade.jpg", type: "image/jpeg", data: photo },
    { name: "plan.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n%%EOF\n") },
    { name: "message.eml", type: "message/rfc822", data: eml(noisy) },
  ]);
  const photos = editorRoot(page).getByRole("list", { name: "Photos" });
  await expect(photos.getByRole("button", { name: "Voir facade.jpg" })).toBeVisible();
  await expect(photos.getByRole("button", { name: "Voir site.jpg" })).toBeVisible();
  const documents = editorRoot(page).getByRole("list", { name: "Documents" });
  await expect(documents.getByRole("button", { name: /plan\.pdf/ })).toBeVisible();
  await expect(documents.getByRole("button", { name: /Photos du site/ })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/fichiers-deposes.png" });
});

test("croquis au stylet sur page blanche, enregistré puis modifié", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await login(page, "gestion");
  await openDraft(page);
  await editorRoot(page).getByRole("button", { name: "Croquis", exact: true }).first().click();
  await expect(canvas(page)).toBeVisible();
  await canvas(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const fire = (type: string, i: number, pressure: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "pen", isPrimary: true, pressure, bubbles: true, clientX: rect.left + rect.width * (0.2 + i * 0.02), clientY: rect.top + rect.height * (0.5 - Math.sin(i / 4) * 0.1) }));
    fire("pointerdown", 0, 0.2);
    for (let i = 1; i < 25; i++) fire("pointermove", i, 0.2 + i * 0.03);
    fire("pointerup", 25, 0);
  });
  await expect(canvas(page)).toHaveAttribute("data-shapes", "1");
  await sketchEditor(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(sketchEditor(page)).toHaveCount(0);
  const sketch = editorRoot(page).getByRole("list", { name: "Photos" }).getByRole("button", { name: /^Voir croquis-/ });
  await expect(sketch).toHaveCount(1);

  await page.reload();
  await editorRoot(page).getByRole("list", { name: "Photos" }).getByRole("button", { name: /^Voir croquis-/ }).click();
  await page.getByRole("button", { name: "Modifier le croquis" }).click();
  await expect(canvas(page)).toHaveAttribute("data-shapes", "1");
  await page.screenshot({ path: "e2e/screenshots/croquis.png" });
});

test("application installable : manifeste, icônes, service worker, page hors connexion", async ({ page }) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest.name).toBeTruthy();
  for (const icon of manifest.icons as { src: string }[]) expect((await page.request.get(icon.src)).status()).toBe(200);
  expect((await page.request.get("/sw.js")).status()).toBe(200);
  expect(await (await page.request.get("/hors-ligne.html")).text()).toContain("Pas de connexion");
  await page.goto("/connexion");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});

test("import Excel : simulation avec rapport des rejets, puis import", async ({ page }) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clients");
  ws.addRow(["Code client", "Nom", "Ville"]);
  ws.addRow(["E2E-1", "Client importé un", "Démoville"]);
  ws.addRow(["", "Client sans code", "Démoville"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await login(page, "gestion");
  await page.goto("/donnees");
  await page.getByTestId("import-input").setInputFiles({ name: "clients.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: "Simuler" }).click();
  const result = page.locator("[data-import-result]");
  await expect(result).toContainText("Simulation");
  await expect(result).toContainText("1 rejetées");
  const download = page.waitForEvent("download");
  await result.getByRole("button", { name: /Rapport/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^rapport-import-.*\.xlsx$/);
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(result).toContainText("Import effectué");
  await page.goto("/clients");
  await page.getByLabel("Rechercher dans la liste").fill("E2E-1");
  await expect(page.locator('[role="row"][aria-rowindex]')).toHaveCount(1);
});
