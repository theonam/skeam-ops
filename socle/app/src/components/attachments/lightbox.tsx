"use client";
// Origine : egm-app `src/components/attachments/lightbox.tsx`.

import { ChevronLeft, ChevronRight, Download, PenLine, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/format";

export type LightboxItem = {
  id: string;
  filename: string;
  src: string;
  downloadUrl: string;
  createdAt: string;
  uploadedBy: string | null;
};

/** Visionneuse plein écran : flèches du clavier, balayage du doigt, Échap pour fermer. */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onDelete,
  annotate,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  /** Action de dessin proposée pour l'image affichée (annoter une photo, modifier un croquis). */
  annotate?: (id: string) => { label: string; run: () => void } | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const item = items[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Écran passé en arrière-plan (navigation) : une fenêtre modale restée ouverte bloquerait toute la page.
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndexChange]);

  if (!item) return null;
  const action = annotate?.(item.id) ?? null;
  const nav = "absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70 disabled:hidden";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-label={`Photo ${index + 1} sur ${items.length}`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.filename}</p>
            <p className="truncate text-xs text-white/70">
              {formatDateTime(item.createdAt)}
              {item.uploadedBy ? ` · ${item.uploadedBy}` : ""} · {index + 1}/{items.length}
            </p>
          </div>
          {action ? (
            <button type="button" onClick={action.run} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-100">
              <PenLine aria-hidden className="size-4" /> {action.label}
            </button>
          ) : null}
          <a href={item.downloadUrl} aria-label="Télécharger" className="grid size-12 place-items-center rounded-full hover:bg-white/10">
            <Download aria-hidden className="size-5" />
          </a>
          {onDelete ? (
            <button
              type="button"
              aria-label="Supprimer la photo"
              onClick={() => onDelete(item.id)}
              className="grid size-12 place-items-center rounded-full hover:bg-white/10"
            >
              <Trash2 aria-hidden className="size-5" />
            </button>
          ) : null}
          <button type="button" aria-label="Fermer" onClick={onClose} className="grid size-12 place-items-center rounded-full hover:bg-white/10">
            <X aria-hidden className="size-6" />
          </button>
        </div>
        <div
          className="relative min-h-0 flex-1"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start === null || end === undefined || Math.abs(end - start) < 50) return;
            if (end < start && index < items.length - 1) onIndexChange(index + 1);
            if (end > start && index > 0) onIndexChange(index - 1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par l'application */}
          <img key={item.id} src={item.src} alt={item.filename} className="size-full object-contain" />
          <button type="button" aria-label="Photo précédente" disabled={index === 0} onClick={() => onIndexChange(index - 1)} className={`${nav} left-3`}>
            <ChevronLeft aria-hidden className="size-6" />
          </button>
          <button
            type="button"
            aria-label="Photo suivante"
            disabled={index === items.length - 1}
            onClick={() => onIndexChange(index + 1)}
            className={`${nav} right-3`}
          >
            <ChevronRight aria-hidden className="size-6" />
          </button>
        </div>
      </div>
    </dialog>
  );
}
