import { expect, type Page } from "@playwright/test";

export const VIEWPORTS = [
  { name: "telephone", width: 390, height: 844 },
  { name: "tablette", width: 800, height: 1280 },
  { name: "ecran", width: 1440, height: 900 },
  { name: "grand-ecran", width: 2560, height: 1080 },
  // Écran incurvé du dirigeant (34 pouces, 21:9) : très large, peu haut.
  { name: "ecran-incurve", width: 3440, height: 1440 },
] as const;

export function demoPassword(): string {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD manquant : les tests utilisent les comptes de démo");
  return password;
}

export async function login(page: Page, username: "charge" | "ouvrier") {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(demoPassword());
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/demandes$/);
  await expect(page.getByRole("heading", { name: "Demandes de devis" })).toBeVisible();
}

/** Critère d'acceptation : aucun défilement horizontal de la page. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "défilement horizontal de la page").toBeLessThanOrEqual(0);
}

/**
 * Rien n'est coupé à droite : aucun élément ne dépasse l'écran, sauf dans une zone qui défile ou tronque
 * volontairement. (La page masque tout débordement horizontal : sans ce contrôle, un contenu trop large
 * serait simplement invisible.)
 */
export async function expectNothingCutOff(page: Page) {
  const offenders = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (el: Element | null): boolean => {
      for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
        if (["hidden", "auto", "scroll", "clip"].includes(getComputedStyle(node).overflowX)) return true;
      }
      return false;
    };
    return Array.from(document.querySelectorAll("main *"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > width + 1 && !clipped(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`);
  });
  expect(offenders, "éléments coupés à droite").toEqual([]);
}
