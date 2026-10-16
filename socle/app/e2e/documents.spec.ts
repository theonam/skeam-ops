// Nouveau dans le socle.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login } from "./helpers";

/**
 * Parcours d'un document : brouillon, lignes et totaux en direct, aperçu, émission numérotée,
 * PDF archivé identique d'une demande à l'autre, brouillon Outlook avec le PDF joint.
 */
test("facture : brouillon, émission, PDF, brouillon Outlook", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "gestion");

  await page.getByRole("button", { name: "Nouveau" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau document" });
  await dialog.getByLabel("Type").selectOption("invoice");
  await dialog.getByLabel("Client").selectOption({ index: 1 });
  await dialog.getByLabel("Objet").fill("Prestations de test");
  await dialog.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const editor = page.locator("[data-document-editor]");
  await expect(editor.getByRole("heading", { name: "Facture brouillon" })).toBeVisible();

  // Un article du catalogue, puis une ligne libre : 2,5 h à 45,00 € et 1 u à 19,99 € à 5,5 %.
  await editor.getByLabel("Ajouter un article").fill("AR0000");
  await editor.getByRole("listbox").getByRole("option").first().click();
  await editor.getByLabel("Quantité").first().fill("2,5");
  await editor.getByLabel("Prix unitaire HT").first().fill("45");
  await editor.getByRole("button", { name: "Ligne libre" }).click();
  await editor.getByLabel("Libellé").last().fill("Fourniture spéciale");
  await editor.getByLabel("Prix unitaire HT").last().fill("19,99");
  await editor.getByLabel("TVA").last().selectOption("550");
  const totals = editor.locator("[data-totals]");
  await expect(totals).toContainText("132,49");
  await expect(totals).toContainText("TVA 5,5");
  await expect(page.frameLocator('iframe[title^="Aperçu"]').getByText("Fourniture spéciale")).toBeVisible();
  await editor.getByRole("button", { name: "Enregistrer" }).click();
  await expect(editor.getByRole("status")).toContainText("Brouillon enregistré");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "e2e/screenshots/document-brouillon.png" });

  page.once("dialog", (d) => void d.accept());
  await editor.getByRole("button", { name: "Émettre" }).click();
  const heading = editor.getByRole("heading", { name: /^Facture FA-\d{4}-\d{5}$/ });
  await expect(heading).toBeVisible();
  const number = (await heading.innerText()).replace("Facture ", "");
  await expect(editor.getByLabel("Quantité")).toHaveCount(0);

  // PDF : produit une fois puis resservi à l'identique.
  const id = page.url().split("/").pop()!;
  const first = await page.request.get(`/api/documents/${id}/pdf`);
  expect(first.headers()["content-type"]).toBe("application/pdf");
  const bytes = await first.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect((await (await page.request.get(`/api/documents/${id}/pdf`)).body()).equals(bytes)).toBe(true);

  // Brouillon Outlook, PDF joint ; la facture passe à « Envoyé ».
  await editor.getByRole("button", { name: "Préparer le mail" }).click();
  const mail = page.getByRole("dialog", { name: /Préparer le mail/ });
  await expect(mail.getByLabel("Objet")).toHaveValue(new RegExp(number));
  await mail.getByLabel("À").fill("client@exemple.example");
  const downloading = page.waitForEvent("download");
  await mail.getByRole("button", { name: "Ouvrir dans Outlook" }).click();
  const eml = await readFile((await (await downloading).path())!, "utf8");
  expect(eml).toContain("X-Unsent: 1");
  expect(eml).toMatch(/Content-Type: application\/pdf/);
  await expect(editor.getByText("Envoyé", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/document-emis.png" });
});
