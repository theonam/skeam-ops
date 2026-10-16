/**
 * Icônes de l'application installée, tirées de son identité : initiales de APP_SHORT_NAME sur la
 * couleur APP_THEME_COLOR. À relancer après avoir réglé ces variables, ou remplacer
 * public/icons/icon.svg par le logo du client puis lancer `pnpm icons --svg`.
 * Origine : egm-app `scripts/generate-icons.ts`, rendu par sharp au lieu de Chromium.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { appIdentity } from "../src/config/app";

const TARGETS = [
  { file: "public/icons/icon-192.png", size: 192, padding: 0 },
  { file: "public/icons/icon-512.png", size: 512, padding: 0 },
  { file: "public/icons/apple-touch-icon.png", size: 180, padding: 0 },
  // Icône « maskable » : Android la découpe en cercle ; le logo reste dans la zone sûre centrale.
  { file: "public/icons/icon-maskable-512.png", size: 512, padding: 0.12 },
];

function initials(name: string): string {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\s-]+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((w) => w[0]) : [name.slice(0, 2)]).join("").toUpperCase() || "A";
}

async function main() {
  const identity = appIdentity();
  let svg: string;
  if (process.argv.includes("--svg")) {
    svg = readFileSync("public/icons/icon.svg", "utf8");
  } else {
    const text = initials(identity.shortName);
    const size = text.length > 2 ? 150 : 200;
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${identity.themeColor}"/>
  <text x="256" y="${256 + size * 0.35}" text-anchor="middle" font-family="DejaVu Sans, Segoe UI, Roboto, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#ffffff">${text}</text>
</svg>
`;
    writeFileSync("public/icons/icon.svg", svg);
  }
  for (const t of TARGETS) {
    const inner = Math.round(t.size * (1 - 2 * t.padding));
    const logo = await sharp(Buffer.from(svg)).resize(inner, inner).png().toBuffer();
    await sharp({ create: { width: t.size, height: t.size, channels: 4, background: identity.themeColor } })
      .composite([{ input: logo, gravity: "center" }])
      .png()
      .toFile(t.file);
    console.log(`${t.file} (${t.size} px)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
