import { formatCents, formatQuantityMilli, formatRateBp } from "@/domain/money";
import { formatDate } from "@/lib/format";
import type { CompanyInfo, DocumentLine, DocumentView } from "./view";

/**
 * Modèle HTML unique des documents commerciaux : le même HTML sert à l'aperçu à l'écran, dans un iframe,
 * et au PDF imprimé par Chromium. Une seule mise en page à maintenir.
 * Origine : egm-app `src/lib/documents/template.ts`, sans adresse de travaux ni assurance décennale ;
 * en-tête et mentions viennent des paramètres de l'entreprise.
 */

export type FontSources = { latin: string; latinExt: string };

/** Police intégrée au document (Inter, licence OFL) : rendu identique quel que soit le serveur. */
export const PUBLIC_FONTS: FontSources = { latin: "/fonts/inter-latin.woff2", latinExt: "/fonts/inter-latin-ext.woff2" };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Texte saisi sur plusieurs lignes : échappé, retours à la ligne conservés. */
function multiline(value: string): string {
  return escapeHtml(value.trim()).replace(/\r?\n/g, "<br>");
}

function cssUrl(src: string): string {
  return `url("${src.replace(/["\\\n]/g, "")}")`;
}

export function documentStyles(fonts: FontSources): string {
  return `
@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: block; src: ${cssUrl(fonts.latin)} format("woff2-variations");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: block; src: ${cssUrl(fonts.latinExt)} format("woff2-variations");
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@page { size: A4; margin: 12mm 12mm 16mm; }
:root { --ink: #111827; --muted: #4b5563; --line: #d1d5db; --soft: #f3f4f6; --accent: #1f4fd1; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Inter", Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: var(--ink); font-variant-numeric: tabular-nums; }
h1, h2, h3, p { margin: 0; }
.sheet { background: #fff; }
@media screen {
  body { background: #e5e7eb; padding: 16px 0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 16px; padding: 12mm 12mm 16mm; box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
}
.watermark { margin-bottom: 4mm; padding: 2mm 3mm; border: 1px solid #fca5a5; border-radius: 2mm; background: #fef2f2; color: #b91c1c; font-weight: 600; text-align: center; }
.head { display: flex; justify-content: space-between; gap: 8mm; padding-bottom: 4mm; border-bottom: 2px solid var(--accent); }
.company-name { font-size: 16pt; font-weight: 700; letter-spacing: .02em; color: var(--accent); }
.company p, .meta { color: var(--muted); }
.header-text { margin-top: 1mm; }
.doc-id { text-align: right; }
.doc-title { font-size: 18pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.doc-number { font-size: 11pt; font-weight: 600; margin-bottom: 2mm; }
.meta { display: grid; grid-template-columns: auto auto; gap: .5mm 3mm; justify-content: end; }
.meta dt { text-align: right; }
.meta dd { margin: 0; color: var(--ink); font-weight: 500; text-align: right; }
.parties { display: flex; gap: 6mm; margin: 5mm 0 4mm; }
.party { flex: 1; padding: 3mm 4mm; border: 1px solid var(--line); border-radius: 2mm; }
.party.recipient { background: var(--soft); border-color: var(--soft); }
.party h3 { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 1mm; }
.party .name { font-size: 10.5pt; font-weight: 600; }
.subject { font-size: 10.5pt; margin-bottom: 3mm; }
table { width: 100%; border-collapse: collapse; }
.lines thead th { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); text-align: left; padding: 1.5mm 1.5mm; border-bottom: 1px solid var(--ink); }
.lines td { padding: 1.5mm; vertical-align: top; border-bottom: 1px solid var(--line); }
.lines tr { break-inside: avoid; }
.lines .num { text-align: right; white-space: nowrap; }
.lines .code { white-space: nowrap; color: var(--muted); }
.lines tr.title td { padding-top: 3mm; font-weight: 700; font-size: 9.5pt; border-bottom-color: var(--ink); }
.lines tr.note td { font-style: italic; color: var(--muted); white-space: pre-line; }
.lines tr.subtotal td { font-weight: 600; background: var(--soft); }
.summary { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-top: 4mm; break-inside: avoid; }
.vat-table { width: auto; min-width: 70mm; }
.vat-table th, .vat-table td { padding: 1mm 2mm; border-bottom: 1px solid var(--line); text-align: right; }
.vat-table th { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; color: var(--muted); }
.totals { width: 70mm; }
.totals td { padding: 1.2mm 2mm; }
.totals td:last-child { text-align: right; white-space: nowrap; }
.totals tr.ttc td { font-size: 11pt; font-weight: 700; color: #fff; background: var(--accent); }
.signature { display: flex; justify-content: flex-end; margin-top: 6mm; break-inside: avoid; }
.signature div { width: 80mm; min-height: 28mm; padding: 3mm; border: 1px solid var(--line); border-radius: 2mm; color: var(--muted); font-size: 8pt; }
.signature strong { display: block; color: var(--ink); font-size: 9pt; margin-bottom: 1mm; }
.payment { margin-top: 5mm; padding: 3mm; border: 1px solid var(--line); border-radius: 2mm; break-inside: avoid; }
.payment p + p { margin-top: 1mm; }
.legal { margin-top: 6mm; color: var(--muted); font-size: 7.5pt; white-space: pre-line; break-inside: avoid; }
.legal p + p { margin-top: 1.5mm; }
.annex-title { font-size: 12pt; font-weight: 700; margin-bottom: 4mm; }
.annex-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.annex-grid figure { margin: 0; break-inside: avoid; }
.annex-grid img { display: block; width: 100%; height: 62mm; object-fit: contain; background: var(--soft); border-radius: 1.5mm; }
.annex-grid figcaption { margin-top: 1mm; color: var(--muted); font-size: 7.5pt; overflow-wrap: anywhere; }
@media print { .annex { break-before: page; } }
`;
}

/** Ligne d'identité légale de l'entreprise : forme, capital, SIRET, RCS, TVA. */
export function companyLegalLine(c: CompanyInfo): string {
  return [
    [c.legalName, c.legalForm, c.shareCapital ? `au capital de ${c.shareCapital}` : null].filter(Boolean).join(" "),
    c.siret ? `SIRET ${c.siret}` : null,
    c.rcs ? `RCS ${c.rcs}` : null,
    c.vatNumber ? `TVA intracommunautaire ${c.vatNumber}` : null,
  ]
    .filter(Boolean)
    .join(" – ");
}

function lineRow(line: DocumentLine): string {
  switch (line.type) {
    case "title":
      return `<tr class="title"><td colspan="7">${escapeHtml(line.text)}</td></tr>`;
    case "note":
      return `<tr class="note"><td></td><td colspan="6">${multiline(line.text)}</td></tr>`;
    case "subtotal":
      return `<tr class="subtotal"><td></td><td colspan="5">Sous-total</td><td class="num">${formatCents(line.totalHtCents)}</td></tr>`;
    default:
      return `<tr class="item"><td class="code">${escapeHtml(line.code ?? "")}</td><td>${escapeHtml(line.label)}</td><td>${escapeHtml(line.unit)}</td><td class="num">${formatQuantityMilli(line.quantityMilli)}</td><td class="num">${formatCents(line.unitPriceCents)}</td><td class="num">${formatRateBp(line.vatRateBp)}</td><td class="num">${formatCents(line.totalHtCents)}</td></tr>`;
  }
}

/** Contenu du document (sans `<html>` ni styles) : l'aperçu en direct ne remplace que cette partie. */
export function documentBody(view: DocumentView): string {
  const c = view.company;
  const companyCity = [c.postalCode, c.city].filter(Boolean).join(" ");
  const companyLines = [c.line1, c.line2, companyCity || null, c.phone ? `Tél. ${c.phone}` : null, c.email].filter(
    (l): l is string => Boolean(l),
  );
  const legal = [companyLegalLine(c), view.legalMentions?.trim() || null].filter((l): l is string => Boolean(l));
  const vatRows = view.vat
    .map((v) => `<tr><td>${formatRateBp(v.rateBp)}</td><td>${formatCents(v.baseCents)}</td><td>${formatCents(v.vatCents)}</td></tr>`)
    .join("");
  const vatTotals = view.vat.map((v) => `<tr><td>TVA ${formatRateBp(v.rateBp)}</td><td>${formatCents(v.vatCents)}</td></tr>`).join("");

  const main = `<section class="sheet" data-document="${view.kind}">
${view.watermark ? `<p class="watermark">${escapeHtml(view.watermark)}</p>` : ""}
<header class="head">
  <div class="company">
    <p class="company-name">${escapeHtml(c.tradeName || c.legalName)}</p>
    ${companyLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
    ${c.headerText?.trim() ? `<p class="header-text">${multiline(c.headerText)}</p>` : ""}
  </div>
  <div class="doc-id">
    <h1 class="doc-title">${escapeHtml(view.title)}</h1>
    <p class="doc-number">${view.number ? `N° ${escapeHtml(view.number)}` : "Numéro attribué à l'émission"}</p>
    <dl class="meta">${view.meta.map((m) => `<dt>${escapeHtml(m.label)}</dt><dd>${escapeHtml(m.value)}</dd>`).join("")}</dl>
  </div>
</header>
<div class="parties">
  <div class="party recipient"><h3>Client</h3><p class="name">${escapeHtml(view.recipient.name)}</p>${view.recipient.lines
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("")}</div>
</div>
<p class="subject"><strong>Objet :</strong> ${escapeHtml(view.subject)}</p>
<table class="lines">
  <colgroup><col style="width:15mm"><col><col style="width:12mm"><col style="width:14mm"><col style="width:22mm"><col style="width:13mm"><col style="width:24mm"></colgroup>
  <thead><tr><th>Code</th><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">TVA</th><th class="num">Total HT</th></tr></thead>
  <tbody>${view.lines.map(lineRow).join("")}</tbody>
</table>
<div class="summary">
  <table class="vat-table"><thead><tr><th>Taux TVA</th><th>Base HT</th><th>TVA</th></tr></thead><tbody>${vatRows}</tbody></table>
  <table class="totals"><tbody>
    <tr><td>Total HT</td><td>${formatCents(view.totalHtCents)}</td></tr>
    ${vatTotals}
    <tr class="ttc"><td>Total TTC</td><td>${formatCents(view.totalTtcCents)}</td></tr>
  </tbody></table>
</div>
${
  view.payment
    ? `<div class="payment"><p><strong>Net à payer : ${formatCents(view.totalTtcCents)}</strong>, au plus tard le ${escapeHtml(formatDate(view.payment.dueDate))}.</p>${view.payment.lines
        .map((l) => `<p>${escapeHtml(l)}</p>`)
        .join("")}</div>`
    : ""
}
${
  view.signature
    ? `<div class="signature"><div><strong>Bon pour accord</strong>Date, cachet et signature du client, précédés de la mention « Bon pour accord »</div></div>`
    : ""
}
<div class="legal">${legal.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
</section>`;

  const annex = view.annex.length
    ? `<section class="sheet annex"><h2 class="annex-title">Annexe : photos et croquis${view.number ? ` (${escapeHtml(view.title.toLowerCase())} ${escapeHtml(view.number)})` : ""}</h2>
<div class="annex-grid">${view.annex
        .map((a) => `<figure><img src="${escapeHtml(a.src)}" alt="${escapeHtml(a.caption)}"><figcaption>${escapeHtml(a.caption)}</figcaption></figure>`)
        .join("")}</div></section>`
    : "";

  return main + annex;
}

/** Document HTML complet, pour l'iframe d'aperçu et pour Chromium. */
export function renderDocumentHtml(view: DocumentView, fonts: FontSources): string {
  const title = `${view.title}${view.number ? ` ${view.number}` : ""}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${documentStyles(fonts)}</style></head><body>${documentBody(view)}</body></html>`;
}
