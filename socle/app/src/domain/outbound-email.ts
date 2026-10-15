import { z } from "zod";

/** Saisie du mail qui accompagne un document, validée des deux côtés. Origine : egm-app `src/domain/outbound-email.ts`. */

/** « a@x.fr; b@y.fr », « a@x.fr, b@y.fr » ou une adresse par ligne, comme dans Outlook. */
export function parseAddressList(input: string): string[] {
  return input
    .split(/[;,\s]+/)
    .map((a) => a.trim().replace(/^<|>$/g, ""))
    .filter(Boolean);
}

const address = z.email({ error: (issue) => `Adresse invalide : ${String(issue.input)}` });

export const documentEmailInput = z.object({
  to: z.array(address).min(1, "Indiquez au moins un destinataire.").max(20, "20 destinataires au plus."),
  cc: z.array(address).max(20, "20 destinataires en copie au plus."),
  subject: z
    .string()
    .trim()
    .min(1, "Objet du mail manquant.")
    .max(300, "300 caractères au plus.")
    .refine((s) => !/[\r\n]/.test(s), "L'objet tient sur une ligne."),
  body: z.string().max(20_000, "Message trop long."),
});

export type DocumentEmailInput = z.infer<typeof documentEmailInput>;
