// Nouveau dans le socle.
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, VIEWPORTS } from "./helpers";

/** Liste de 5 000 articles : recherche, filtre, tri, export ; écrans du téléphone au grand écran. */
test("5 000 articles : recherche, filtre à cases, tri, export Excel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "gestion");
  await page.goto("/articles");
  const rows = page.locator('[role="row"][aria-rowindex]');
  await expect(rows.first()).toBeVisible();
  // Défilement virtualisé : quelques dizaines de lignes dans la page, pas 5 000.
  expect(await rows.count()).toBeLessThan(200);

  await page.getByLabel("Rechercher dans la liste").fill("AR04999");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Rechercher dans la liste").fill("");

  await page.getByRole("button", { name: "Filtrer la colonne Catégorie" }).click();
  const menu = page.getByRole("dialog");
  await menu.getByLabel("Tout sélectionner").uncheck();
  await menu.getByLabel(/^Location/).check();
  await page.keyboard.press("Escape");
  await expect(rows.first()).toContainText("Location");

  await page.getByRole("button", { name: "Prix unitaire HT", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^Articles.*\.xlsx$/);
});

for (const v of VIEWPORTS) {
  test(`écrans principaux sans défilement horizontal : ${v.name}`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await login(page, "admin");
    for (const path of ["/documents", "/articles", "/clients", "/donnees", "/journal", "/parametres"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `e2e/screenshots/${v.name}${path.replace("/", "-")}.png` });
    }
  });
}
