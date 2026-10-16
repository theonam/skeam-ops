"use client";
// Origine : egm-app `src/components/attachments/use-attachments.ts`.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { checkFile, isDisplayableImage } from "@/domain/attachments";
import type { AttachmentOwner, AttachmentView } from "@/server/attachments/service";
import { preparePhoto, runWithLimit, uploadFile } from "./upload";

export type PendingUpload = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "error";
  progress: number;
  error?: string;
  /** Aperçu local d'une photo, affiché avant la fin de l'envoi. */
  previewUrl?: string;
  originEmail: boolean;
  takenAt: number;
};

export type AttachmentsState = ReturnType<typeof useAttachments>;

/**
 * Pièces jointes d'une fiche : celles déjà enregistrées et celles en cours d'envoi.
 * Sans propriétaire (fiche pas encore créée), les fichiers attendent : `uploadQueued` les envoie après la création.
 */
export function useAttachments({
  owner,
  initial,
  onMailAdded,
}: {
  owner: AttachmentOwner | null;
  initial: AttachmentView[];
  /** Appelé pour chaque mail ajouté ; renvoie vrai si c'est le mail à l'origine de la demande. */
  onMailAdded?: (file: File) => boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    // Données relues sur le serveur (après un enregistrement) : elles font foi.
    setPreviousInitial(initial);
    setItems(initial);
  }
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const counter = useRef(0);

  function patch(key: string, change: Partial<PendingUpload>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }

  function forget(key: string) {
    setPending((list) => {
      const found = list.find((p) => p.key === key);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return list.filter((p) => p.key !== key);
    });
  }

  async function send(target: AttachmentOwner, uploads: PendingUpload[]): Promise<number> {
    const results = await runWithLimit(
      uploads.map((upload) => async () => {
        patch(upload.key, { status: "uploading", progress: 0, error: undefined });
        try {
          const file = upload.file.type.startsWith("image/") ? await preparePhoto(upload.file) : upload.file;
          const views = await uploadFile(target, file, {
            originEmail: upload.originEmail,
            takenAt: upload.takenAt,
            onProgress: (ratio) => patch(upload.key, { progress: ratio }),
          });
          setItems((list) => [...list.filter((i) => !views.some((v) => v.id === i.id)), ...views]);
          forget(upload.key);
        } catch (error) {
          patch(upload.key, { status: "error", error: error instanceof Error ? error.message : "Envoi impossible." });
          throw error;
        }
      }),
      3,
    );
    return results.filter((r) => r.status === "rejected").length;
  }

  function addFiles(files: File[]) {
    const accepted: PendingUpload[] = [];
    const refused: string[] = [];
    for (const file of files) {
      const check = checkFile(file);
      if (!check.ok) {
        refused.push(check.reason);
        continue;
      }
      const originEmail = check.kind === "email" ? (onMailAdded?.(file) ?? false) : false;
      accepted.push({
        key: `u${++counter.current}`,
        file,
        status: "queued",
        progress: 0,
        previewUrl: check.kind === "photo" && isDisplayableImage(check.mimeType) ? URL.createObjectURL(file) : undefined,
        originEmail,
        takenAt: file.lastModified || Date.now(),
      });
    }
    setRejected(refused);
    if (accepted.length === 0) return;
    setPending((list) => [...list, ...accepted]);
    if (owner) {
      void send(owner, accepted).finally(() => router.refresh());
    }
  }

  /** Après la création de la fiche : envoie les fichiers en attente. Renvoie le nombre d'échecs. */
  async function uploadQueued(target: AttachmentOwner): Promise<number> {
    const queued = pending.filter((p) => p.status !== "uploading");
    return queued.length === 0 ? 0 : send(target, queued);
  }

  function retry(key: string) {
    const upload = pending.find((p) => p.key === key);
    if (upload && owner) void send(owner, [upload]).finally(() => router.refresh());
  }

  return {
    items,
    setItems,
    pending,
    rejected,
    dismissRejected: () => setRejected([]),
    addFiles,
    uploadQueued,
    retry,
    cancel: forget,
    busy: pending.some((p) => p.status === "uploading"),
  };
}
