"use client";
// Origine : egm-app `src/components/attachments/camera-dialog.tsx`.

import { Camera, RefreshCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Appareil photo dans la page, pour les appareils où le champ fichier n'ouvre pas la caméra
 * (tablette Windows). La fenêtre reste ouverte : on enchaîne les photos, chacune part aussitôt.
 */
export function CameraDialog({ onPhoto, onClose }: { onPhoto: (file: File) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Écran passé en arrière-plan (navigation) : une fenêtre modale restée ouverte bloquerait toute la page.
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setReady(false);
      setError(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "L'accès à la caméra a été refusé. Autorisez-le dans le navigateur (icône à gauche de l'adresse), puis réessayez."
            : name === "NotFoundError"
              ? "Aucune caméra n'a été trouvée sur cet appareil."
              : "La caméra n'a pas pu s'ouvrir.",
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const takenAt = Date.now();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const stamp = new Date(takenAt).toISOString().slice(0, 19).replace(/[-:T]/g, "");
        onPhoto(new File([blob], `photo-${stamp}.jpg`, { type: "image/jpeg", lastModified: takenAt }));
        setCount((c) => c + 1);
      },
      "image/jpeg",
      0.88,
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-label="Appareil photo"
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="relative flex h-full flex-col">
        <video ref={videoRef} playsInline muted className="min-h-0 flex-1 bg-black object-contain" />
        {flash ? <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/70" /> : null}
        {error ? (
          <div className="absolute inset-x-4 top-1/3 rounded-xl bg-white p-4 text-slate-900">
            <p>{error}</p>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 bg-black/80 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" size="lg" onClick={onClose} className="min-w-28">
            <X aria-hidden className="size-5" /> {count > 0 ? "Terminer" : "Fermer"}
          </Button>
          <button
            type="button"
            onClick={shoot}
            disabled={!ready}
            aria-label="Prendre la photo"
            className="grid size-20 place-items-center rounded-full bg-white ring-4 ring-white/40 disabled:opacity-40"
          >
            <Camera aria-hidden className="size-8 text-slate-900" />
          </button>
          <div className="flex min-w-28 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label="Changer de caméra"
              className="grid size-12 place-items-center rounded-full bg-white/15"
            >
              <RefreshCcw aria-hidden className="size-5" />
            </button>
            <span className="text-sm" aria-live="polite">
              {count > 0 ? `${count} photo${count > 1 ? "s" : ""} envoyée${count > 1 ? "s" : ""}` : ""}
            </span>
          </div>
        </div>
      </div>
    </dialog>
  );
}
