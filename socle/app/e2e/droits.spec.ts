// Nouveau dans le socle.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** Le profil terrain ne voit aucun prix : ni à l'écran, ni par l'API appelée directement, ni en PDF. */
test("terrain : aucun prix à l'écran ni par l'API", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "terrain");
  await expect(page.locator("main")).not.toContainText("€");
  await page.goto("/articles");
  await expect(page.getByRole("heading", { name: "Articles" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("€");
  await expect(page.getByRole("button", { name: /Prix unitaire/ })).toHaveCount(0);

  for (const path of ["/api/articles", "/api/documents", "/api/clients"]) {
    const text = await (await page.request.get(path)).text();
    expect(text, path).not.toMatch(/unitPriceCents|costCents|totalHtCents|totalTtcCents|internalNotes/);
  }
  const { documents } = (await (await page.request.get("/api/documents")).json()) as { documents: { id: string; status: string }[] };
  const issued = documents.find((d) => d.status !== "draft")!;
  const detail = await (await page.request.get(`/api/documents/${issued.id}`)).text();
  expect(detail).not.toMatch(/unitPriceCents|totalHtCents|"vat"/);
  expect((await page.request.get(`/api/documents/${issued.id}/pdf`)).status()).toBe(404);
  expect((await page.request.post(`/api/documents/${issued.id}/emettre`)).status()).toBe(403);

  await page.goto(`/documents/${issued.id}`);
  await expect(page.locator("[data-document-editor]")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("€");
  await expect(page.getByRole("link", { name: "PDF" })).toHaveCount(0);
});

test("gestion : les prix sont là ; journal et paramètres réservés à l'administrateur", async ({ page }) => {
  await login(page, "gestion");
  await page.goto("/articles");
  await expect(page.locator("main")).toContainText("€");
  await page.goto("/journal");
  await expect(page.getByText("Cette page n'est pas accessible avec votre profil.")).toBeVisible();
  expect((await page.request.get("/api/journal")).status()).toBe(403);
});
