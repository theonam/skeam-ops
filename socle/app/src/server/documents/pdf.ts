import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { escapeHtml, type FontSources } from "@/lib/documents/template";

/**
 * Impression en PDF par Chromium sans interface (playwright-core, Apache-2.0) : le PDF est exactement
 * le HTML de l'aperçu. Le navigateur est lancé à la demande et fermé après une minute sans impression,
 * pour ne pas garder sa mémoire sur un petit serveur.
 *
 * Variables d'environnement : PLAYWRIGHT_BROWSERS_PATH (dossier des navigateurs installés par
 * `playwright-core install chromium-headless-shell`), PDF_CHROMIUM_PATH (exécutable imposé, facultatif).
 * Origine : egm-app `src/server/documents/pdf.ts`.
 */

const IDLE_CLOSE_MS = 60_000;
let browser: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let active = 0;

function launch(): Promise<Browser> {
  if (!browser) {
    browser = chromium
      .launch({
        executablePath: process.env.PDF_CHROMIUM_PATH || undefined,
        args: ["--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
      })
      .then((b) => {
        b.on("disconnected", () => {
          browser = null;
        });
        return b;
      })
      .catch((error: unknown) => {
        browser = null;
        throw error;
      });
  }
  return browser;
}

function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active > 0 || !browser) return;
    const closing = browser;
    browser = null;
    void closing.then((b) => b.close()).catch(() => {});
  }, IDLE_CLOSE_MS);
}

let fonts: Promise<FontSources> | null = null;

/** La police du document, intégrée au HTML : le PDF ne dépend pas des polices installées sur le serveur. */
export function embeddedFonts(): Promise<FontSources> {
  fonts ??= (async () => {
    const dir = path.join(process.cwd(), "public", "fonts");
    const [latin, latinExt] = await Promise.all([readFile(path.join(dir, "inter-latin.woff2")), readFile(path.join(dir, "inter-latin-ext.woff2"))]);
    return {
      latin: `data:font/woff2;base64,${latin.toString("base64")}`,
      latinExt: `data:font/woff2;base64,${latinExt.toString("base64")}`,
    };
  })().catch((error: unknown) => {
    fonts = null;
    throw error;
  });
  return fonts;
}

/**
 * Imprime un document HTML autonome (images et police en data: URI) en A4.
 * Aucun accès réseau ni script dans la page imprimée : seul le HTML fourni compte.
 */
export async function htmlToPdf(html: string, footerLabel: string): Promise<Uint8Array> {
  active += 1;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    const context = await (await launch()).newContext({ javaScriptEnabled: false });
    try {
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      const footer = `<div style="width:100%;padding:0 12mm;font-family:Arial,sans-serif;font-size:7pt;color:#6b7280;display:flex;justify-content:space-between"><span>${escapeHtml(footerLabel)}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: footer,
        margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
      });
      return new Uint8Array(pdf);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    active -= 1;
    scheduleClose();
  }
}
