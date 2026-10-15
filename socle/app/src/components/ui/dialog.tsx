"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fenêtre modale native : plein écran sur téléphone, centrée ailleurs. Échap la ferme.
 * Origine : egm-app, motif repris de `src/components/documents/email-dialog.tsx`.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className="m-auto max-h-dvh w-[min(36rem,100vw)] max-w-none overflow-auto rounded-none bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 tablet:rounded-2xl"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 tablet:px-6">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-lg hover:bg-slate-100">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="p-4 tablet:p-6">{children}</div>
    </dialog>
  );
}

/** Appel JSON à l'API de l'application ; renvoie le message d'erreur du serveur, en français. */
export async function callApi<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: data.error ?? "Opération impossible, réessayez." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Réseau indisponible : réessayez." };
  }
}
