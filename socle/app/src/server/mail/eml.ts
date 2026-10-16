import { randomUUID } from "node:crypto";

/**
 * Construit un message MIME (.eml) à partir d'un brouillon.
 * Avec `unsent: true`, l'en-tête `X-Unsent: 1` fait qu'Outlook classique l'ouvre comme un
 * brouillon prêt à envoyer : l'envoi part alors du compte de l'utilisateur et reste
 * dans ses éléments envoyés.
 * Origine : egm-app `src/server/mail/eml.ts`.
 */
export type EmlAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export type EmlDraft = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmlAttachment[];
  unsent?: boolean;
  date?: Date;
};

const CRLF = "\r\n";

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/** En-tête encodé selon la RFC 2047 si besoin (accents dans l'objet, par exemple). */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  // Morceaux de 39 octets au plus : chaque ligne d'en-tête reste sous 78 caractères.
  const words: string[] = [];
  let chunk = "";
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 39) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString("base64")}?=`).join(`${CRLF} `);
}

/** Nom de fichier : forme ASCII de repli plus forme UTF-8 (RFC 2231) lue par Outlook. */
function filenameParams(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, "_");
  if (isAscii(safe)) return `filename="${safe}"`;
  const fallback = safe.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  return `filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function base64Lines(content: Uint8Array | string): string {
  const b64 = Buffer.from(content).toString("base64");
  return b64.match(/.{1,76}/g)?.join(CRLF) ?? "";
}

function addressList(list: string[]): string {
  for (const address of list) {
    if (/[\r\n]/.test(address)) throw new Error("Adresse de messagerie invalide");
  }
  return list.join(", ");
}

function formatDate(d: Date): string {
  // Format RFC 5322, en UTC.
  return d.toUTCString().replace("GMT", "+0000");
}

function boundary(): string {
  return `=_SOCLE_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function textPart(contentType: string, body: string): string {
  return [
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(body),
  ].join(CRLF);
}

export function buildEml(draft: EmlDraft): string {
  if (/[\r\n]/.test(draft.subject)) throw new Error("Objet invalide");

  const headers = [
    "MIME-Version: 1.0",
    `Date: ${formatDate(draft.date ?? new Date())}`,
    `Message-ID: <${randomUUID()}@app.local>`,
    `To: ${addressList(draft.to)}`,
    ...(draft.cc?.length ? [`Cc: ${addressList(draft.cc)}`] : []),
    `Subject: ${encodeHeaderValue(draft.subject)}`,
    ...(draft.unsent ? ["X-Unsent: 1"] : []),
  ];

  const altBoundary = boundary();
  const body = draft.html
    ? [
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
        `--${altBoundary}`,
        textPart("text/plain", draft.text),
        `--${altBoundary}`,
        textPart("text/html", draft.html),
        `--${altBoundary}--`,
      ].join(CRLF)
    : textPart("text/plain", draft.text);

  const attachments = draft.attachments ?? [];
  if (attachments.length === 0) {
    return [...headers, body].join(CRLF) + CRLF;
  }

  const mixed = boundary();
  const parts = attachments.map((a) =>
    [
      `Content-Type: ${a.contentType}; name="${a.filename.replace(/["\\\r\n]/g, "_")}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; ${filenameParams(a.filename)}`,
      "",
      base64Lines(a.content),
    ].join(CRLF),
  );

  return (
    [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      body,
      ...parts.flatMap((p) => [`--${mixed}`, p]),
      `--${mixed}--`,
    ].join(CRLF) + CRLF
  );
}
