"use client";
// Origine : egm-app `src/components/attachments/upload.ts`.

import { fitWithin, isDisplayableImage, PHOTO_MAX_SIDE, shouldDownscale } from "@/domain/attachments";
import type { AttachmentOwner, AttachmentView } from "@/server/attachments/service";

/**
 * Réduit une photo avant l'envoi (côté le plus long ramené à 2 560 px, JPEG) : sur le chantier, en 4G,
 * l'envoi passe de plusieurs Mo à quelques centaines de Ko. L'orientation de l'appareil photo est appliquée.
 * Si le navigateur ne sait pas lire l'image (HEIC hors Apple), le fichier part tel quel.
 */
export async function preparePhoto(file: File): Promise<File> {
  if (!isDisplayableImage(file.type) || file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    if (!shouldDownscale(bitmap.width, bitmap.height, file.size)) return file;
    const size = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export class UploadError extends Error {}

/** Envoie un fichier sur une fiche, avec la progression (XMLHttpRequest : fetch ne la donne pas à l'envoi). */
export function uploadFile(
  owner: AttachmentOwner,
  file: File,
  options: { originEmail?: boolean; takenAt?: number; onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<AttachmentView[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("ownerType", owner.type);
    form.set("ownerId", owner.id);
    form.set("file", file, file.name);
    if (options.takenAt) form.set("takenAt", String(options.takenAt));
    if (options.originEmail) form.set("originEmail", "1");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachments");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { attachments?: AttachmentView[]; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.attachments) resolve(body.attachments);
      else reject(new UploadError(body?.error ?? `Envoi refusé (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new UploadError("Réseau indisponible : l'envoi reprendra quand vous réessaierez."));
    xhr.onabort = () => reject(new UploadError("Envoi annulé."));
    options.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

/** Exécute des tâches avec au plus `limit` en parallèle. */
export async function runWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** Appareil sur lequel le champ fichier `capture` ouvre directement l'appareil photo (Android, iPhone, iPad). */
export function hasNativeCameraInput(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS se présente comme un Mac, mais il est tactile.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Appareil tactile (téléphone, tablette Android ou Windows) : on y propose l'appareil photo. */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}
