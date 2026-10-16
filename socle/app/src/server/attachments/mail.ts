// Origine : egm-app `src/server/attachments/mail.ts`.
import "server-only";
import { MAIL_IMAGE_MIN_BYTES } from "@/domain/attachments";
import { parseMailFile, type ParsedMailAttachment } from "@/lib/mail-files";

/** Ce que l'on garde d'un mail glissé sur une fiche, pour l'afficher sans rouvrir le fichier. */
export type EmailMeta = {
  subject: string;
  from: string;
  date: string | null;
  /** Début du texte du mail. */
  excerpt: string;
  attachmentCount: number;
};

const EXCERPT_LENGTH = 4000;

export type ReadMail = { meta: EmailMeta; extracted: ParsedMailAttachment[] };

/**
 * Lit un mail .msg ou .eml : objet, expéditeur, date, texte, et les pièces jointes à extraire sur la fiche
 * (photos et PDF). Les petites images sont des logos de signature : elles ne sont pas extraites.
 * Renvoie null si le fichier est illisible ; il reste alors enregistré comme simple fichier.
 */
export async function readMail(bytes: Uint8Array, filename: string, mimeType: string): Promise<ReadMail | null> {
  try {
    const file = new File([bytes as Uint8Array<ArrayBuffer>], filename, { type: mimeType });
    const mail = await parseMailFile(file);
    const extracted = mail.attachments.filter((a) => {
      if (a.mimeType.startsWith("image/")) return a.size >= MAIL_IMAGE_MIN_BYTES;
      return a.mimeType === "application/pdf" && !a.inline;
    });
    return {
      meta: {
        subject: mail.subject.trim(),
        from: mail.from.trim(),
        date: normalizeDate(mail.date),
        excerpt: mail.bodyText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, EXCERPT_LENGTH),
        attachmentCount: mail.attachments.filter((a) => !a.inline).length,
      },
      extracted,
    };
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
