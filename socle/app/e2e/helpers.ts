import { expect, type Page } from "@playwright/test";

// Origine : egm-app `e2e/helpers.ts`.
export const VIEWPORTS = [
  { name: "telephone", width: 390, height: 844 },
  { name: "tablette", width: 800, height: 1280 },
  { name: "ecran", width: 1440, height: 900 },
  { name: "grand-ecran", width: 2560, height: 1080 },
] as const;

export function demoPassword(): string {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD manquant : les tests utilisent les comptes de démonstration");
  return password;
}

export async function login(page: Page, username: "admin" | "gestion" | "terrain") {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(demoPassword());
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "Devis et factures" })).toBeVisible();
}

/** Critère d'acceptation : aucun défilement horizontal de la page. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "défilement horizontal de la page").toBeLessThanOrEqual(0);
}
