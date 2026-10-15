// Origine : egm-app `src/lib/mail-files.ts`.
import MsgReader from "@kenjiuno/msgreader";
import PostalMime from "postal-mime";

/**
 * Lecture des mails Outlook glissés sur une fiche : .msg (Outlook classique) et .eml.
 * Fonctionne dans le navigateur comme sur le serveur (aucune dépendance à Node).
 */
export type ParsedMailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  content: Uint8Array;
  /** Image insérée dans le corps du mail (photo collée ou logo de signature) plutôt que jointe. */
  inline: boolean;
};

export type ParsedMail = {
  format: "msg" | "eml";
  subject: string;
  from: string;
  date: string | null;
  bodyText: string;
  attachments: ParsedMailAttachment[];
};

export function mailFormatOf(file: { name: string; type: string }): "msg" | "eml" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".msg") || file.type === "application/vnd.ms-outlook") return "msg";
  if (name.endsWith(".eml") || file.type === "message/rfc822") return "eml";
  return null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  heic: "image/heic",
  webp: "image/webp",
  pdf: "application/pdf",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
};

export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export async function parseMailFile(file: Blob & { name: string }): Promise<ParsedMail> {
  const format = mailFormatOf(file);
  const buffer = await file.arrayBuffer();
  if (format === "msg") return parseMsg(buffer);
  if (format === "eml") return parseEml(buffer);
  throw new Error(`Format de mail non reconnu : ${file.name}`);
}

function parseMsg(buffer: ArrayBuffer): ParsedMail {
  const reader = new MsgReader(buffer);
  const data = reader.getFileData();
  if (data.error) throw new Error(`Fichier .msg illisible : ${data.error}`);
  const attachments = (data.attachments ?? [])
    // Les pièces jointes « cachées » d'un .msg sont les images insérées dans le corps : on les garde,
    // car un gardien colle souvent ses photos dans le mail.
    .filter((a) => !a.innerMsgContent)
    .map((a) => {
      const file = reader.getAttachment(a);
      const filename = file.fileName || a.fileName || "piece-jointe";
      return {
        filename,
        mimeType: a.attachMimeTag || guessMimeType(filename),
        size: file.content.byteLength,
        content: file.content,
        inline: Boolean(a.attachmentHidden || a.pidContentId),
      };
    });
  return {
    format: "msg",
    subject: data.subject ?? "",
    from: [data.senderName, data.senderEmail && `<${data.senderEmail}>`].filter(Boolean).join(" "),
    date: data.messageDeliveryTime ?? data.clientSubmitTime ?? null,
    bodyText: data.body ?? "",
    attachments,
  };
}

async function parseEml(buffer: ArrayBuffer): Promise<ParsedMail> {
  const mail = await PostalMime.parse(buffer);
  return {
    format: "eml",
    subject: mail.subject ?? "",
    from: mail.from ? [mail.from.name, "address" in mail.from && mail.from.address && `<${mail.from.address}>`].filter(Boolean).join(" ") : "",
    date: mail.date ?? null,
    bodyText: mail.text ?? "",
    attachments: mail.attachments.map((a) => {
      const content =
        typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
      const filename = a.filename ?? "piece-jointe";
      return {
        filename,
        mimeType: a.mimeType || guessMimeType(filename),
        size: content.byteLength,
        content,
        inline: a.disposition === "inline" || Boolean(a.related),
      };
    }),
  };
}
