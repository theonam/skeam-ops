// Origine : egm-app `src/domain/attachments.ts`.
/**
 * Règles des pièces jointes : types acceptés, taille maximale, nature du fichier, réduction des photos.
 * Fonctions pures, partagées par le navigateur (contrôle avant envoi) et le serveur (contrôle qui fait foi).
 */

/** Taille maximale d'un fichier envoyé. Un mail Outlook avec ses pièces jointes dépasse rarement 20 Mo. */
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

/** Côté le plus long d'une photo après réduction dans le navigateur (suffisant pour l'annexe du devis). */
export const PHOTO_MAX_SIDE = 2560;

/** Une photo plus légère que ce seuil, et pas plus grande que PHOTO_MAX_SIDE, est envoyée telle quelle. */
export const PHOTO_KEEP_BELOW_BYTES = 1_500_000;

/** Côté le plus long d'une vignette. */
export const THUMBNAIL_MAX_SIDE = 480;

/**
 * Dans un mail, une image plus petite que ce seuil est presque toujours un logo de signature :
 * elle n'est pas extraite comme photo.
 */
export const MAIL_IMAGE_MIN_BYTES = 20 * 1024;

export type AttachmentKind = "photo" | "sketch" | "email" | "pdf" | "document";

const EXTENSIONS: Record<string, { mime: string; kind: AttachmentKind }> = {
  jpg: { mime: "image/jpeg", kind: "photo" },
  jpeg: { mime: "image/jpeg", kind: "photo" },
  png: { mime: "image/png", kind: "photo" },
  webp: { mime: "image/webp", kind: "photo" },
  gif: { mime: "image/gif", kind: "photo" },
  heic: { mime: "image/heic", kind: "photo" },
  heif: { mime: "image/heif", kind: "photo" },
  pdf: { mime: "application/pdf", kind: "pdf" },
  msg: { mime: "application/vnd.ms-outlook", kind: "email" },
  eml: { mime: "message/rfc822", kind: "email" },
  doc: { mime: "application/msword", kind: "document" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
  xls: { mime: "application/vnd.ms-excel", kind: "document" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document" },
  odt: { mime: "application/vnd.oasis.opendocument.text", kind: "document" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", kind: "document" },
  txt: { mime: "text/plain", kind: "document" },
};

/** Valeur de l'attribut `accept` des champs fichier. */
export const ACCEPTED_FILES = [
  "image/*",
  ...Object.keys(EXTENSIONS).map((ext) => `.${ext}`),
].join(",");

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

export type FileCheck =
  | { ok: true; kind: AttachmentKind; mimeType: string; extension: string }
  | { ok: false; reason: string };

/**
 * Vérifie un fichier d'après son nom, son type déclaré et sa taille. L'extension fait foi :
 * les navigateurs et Outlook déclarent souvent un type vide ou générique.
 */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  if (file.size <= 0) return { ok: false, reason: `${file.name} est vide.` };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: `${file.name} dépasse ${MAX_ATTACHMENT_BYTES / 1024 / 1024} Mo.` };
  }
  const extension = extensionOf(file.name);
  const known = EXTENSIONS[extension];
  if (known) return { ok: true, kind: known.kind, mimeType: known.mime, extension };
  // Photo collée depuis le presse-papiers ou issue de l'appareil photo, parfois sans extension.
  if (/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)) {
    const ext = file.type.slice("image/".length).replace("jpeg", "jpg");
    return { ok: true, kind: "photo", mimeType: file.type, extension: ext };
  }
  return { ok: false, reason: `${file.name} : type de fichier non accepté.` };
}

/** Les navigateurs savent afficher ces images ; une photo HEIC s'affiche seulement sur Apple. */
export function isDisplayableImage(mimeType: string): boolean {
  return /^image\/(jpeg|png|webp|gif)$/.test(mimeType);
}

/** Dimensions après réduction pour que le côté le plus long ne dépasse pas `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** Faut-il réduire cette photo avant l'envoi ? */
export function shouldDownscale(width: number, height: number, sizeBytes: number): boolean {
  return Math.max(width, height) > PHOTO_MAX_SIDE || sizeBytes > PHOTO_KEEP_BELOW_BYTES;
}

/** Nom de fichier sûr pour un en-tête Content-Disposition et une clé de stockage. */
export function safeFilename(filename: string): string {
  const cleaned = filename
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "fichier").slice(0, 180);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
