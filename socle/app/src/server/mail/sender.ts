import "server-only";
import { buildEml, type EmlAttachment } from "./eml";

/**
 * Envoi des mails de l'application, derrière une interface unique :
 * - `EmlDraftSender` : prépare un brouillon Outlook, .eml avec X-Unsent: 1, que l'utilisateur ouvre et
 *   envoie depuis son Outlook ; le mail part de son compte et reste tracé dans ses éléments envoyés ;
 * - un envoi direct, Microsoft 365 par Graph API par exemple, peut s'ajouter sans toucher au reste.
 * Origine : egm-app `src/server/mail/sender.ts`.
 */

export type OutgoingMail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: EmlAttachment[];
};

export type MailOutcome =
  /** Brouillon à télécharger puis à envoyer depuis Outlook. */
  | { status: "draft_generated"; download: { filename: string; contentType: string; content: string } }
  /** Envoyé directement par le fournisseur de messagerie. */
  | { status: "sent"; providerMessageId: string | null };

export interface MailSender {
  readonly impl: "eml_draft";
  deliver(mail: OutgoingMail, draftName: string): Promise<MailOutcome>;
}

/** Corps HTML simple : un paragraphe par ligne, texte échappé. */
export function textToHtml(text: string): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${text
    .split(/\r?\n/)
    .map((l) => `<p style="margin:0">${escape(l) || "&nbsp;"}</p>`)
    .join("")}</div>`;
}

export class EmlDraftSender implements MailSender {
  readonly impl = "eml_draft" as const;

  async deliver(mail: OutgoingMail, draftName: string): Promise<MailOutcome> {
    const content = buildEml({
      to: mail.to,
      cc: mail.cc,
      subject: mail.subject,
      text: mail.text,
      html: textToHtml(mail.text),
      attachments: mail.attachments,
      unsent: true,
    });
    // Nom du brouillon sans accents : certains navigateurs renomment « download » un fichier au nom accentué.
    const ascii = draftName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_");
    return { status: "draft_generated", download: { filename: `${ascii}.eml`, contentType: "message/rfc822", content } };
  }
}

export function mailSender(): MailSender {
  return new EmlDraftSender();
}
