"use client";

import { Loader2, Mail, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Textarea, TextInput } from "@/components/ui/field";
import { documentEmailInput, parseAddressList } from "@/domain/outbound-email";

export type EmailDefaults = { to: string; subject: string; body: string; attachmentName: string };

/** Enregistre un fichier reçu du serveur (le brouillon .eml) sous son nom, comme un téléchargement. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function downloadName(header: string | null): string {
  const utf8 = header && /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = header && /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : "brouillon.eml";
}

/**
 * Préparation du mail d'un document (devis, facture) : destinataires, objet et message (gabarits de
 * l'entreprise), puis téléchargement d'un brouillon Outlook avec le PDF joint. L'envoi se fait depuis Outlook.
 * Origine : egm-app `src/components/documents/email-dialog.tsx`.
 */
export function DocumentEmailDialog({
  endpoint,
  documentLabel,
  note,
  defaults,
  beforeSend,
  onPrepared,
  onClose,
}: {
  /** Route qui renvoie le brouillon .eml (POST). */
  endpoint: string;
  /** « devis », « facture » : pour les messages. */
  documentLabel: string;
  /** Ce que la préparation change au document (« Le devis sera marqué envoyé »). */
  note: string | null;
  defaults: EmailDefaults;
  /** Enregistre d'abord les dernières modifications ; false si impossible. */
  beforeSend?: () => Promise<boolean>;
  /** Réponse du serveur : ses en-têtes portent le nouvel état du document. */
  onPrepared: (response: Response) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Écran passé en arrière-plan (navigation) : une fenêtre modale restée ouverte bloquerait toute la page.
    return () => dialog?.close();
  }, []);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    const input = { to: parseAddressList(to), cc: parseAddressList(cc), subject, body };
    const parsed = documentEmailInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Saisie invalide.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (beforeSend && !(await beforeSend())) {
        setError(`Le ${documentLabel} n'a pas pu être enregistré : corrigez le problème signalé puis réessayez.`);
        return;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        const message = await response.json().then((j: { error?: string }) => j.error, () => null);
        setError(message ?? "Préparation du mail impossible, réessayez.");
        return;
      }
      saveBlob(await response.blob(), downloadName(response.headers.get("Content-Disposition")));
      onPrepared(response);
    } catch {
      setError("Réseau indisponible : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-label={`Préparer le mail ${documentLabel === "facture" ? "de la" : "du"} ${documentLabel}`}
      className="m-auto max-h-dvh w-[min(40rem,100vw)] max-w-none overflow-auto rounded-none bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 tablet:rounded-2xl"
    >
      <form onSubmit={(e) => void prepare(e)} className="flex flex-col gap-3 p-4 tablet:p-6">
        <div className="flex items-center gap-2">
          <Mail aria-hidden className="size-5 text-brand-700" />
          <h2 className="flex-1 text-lg font-semibold">Préparer le mail</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-lg hover:bg-slate-100">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <Field label="À" htmlFor="mail-to" hint="Plusieurs adresses : séparez-les par « ; »">
          <TextInput id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Cc" htmlFor="mail-cc">
          <TextInput id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Objet" htmlFor="mail-subject">
          <TextInput id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor="mail-body">
          <Textarea id="mail-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <Paperclip aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 break-words">{defaults.attachmentName}</span>
        </p>
        <p className="text-sm text-slate-600">
          Le mail s&apos;ouvre dans Outlook, déjà rempli, avec le PDF joint : relisez, puis cliquez sur Envoyer. S&apos;il ne s&apos;ouvre pas tout seul, cliquez sur le fichier téléchargé.
          {note ? ` ${note}` : ""}
        </p>
        {error ? (
          <p role="alert" className="rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg px-4 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Mail aria-hidden className="size-4" />}
            Ouvrir dans Outlook
          </button>
        </div>
      </form>
    </dialog>
  );
}
