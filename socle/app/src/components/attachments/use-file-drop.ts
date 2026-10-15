"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Glisser-déposer de fichiers sur toute une fiche (photos, PDF, mails glissés depuis Outlook),
 * et collage d'images (Ctrl+V d'une photo copiée dans un mail).
 * Tant que la fiche est affichée, un fichier lâché à côté n'ouvre pas le fichier à la place de l'application.
 */
export function useFileDrop(target: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void, enabled = true): boolean {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const callback = useRef(onFiles);
  useEffect(() => {
    callback.current = onFiles;
  });

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;

    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) callback.current(files);
    };
    // À côté de la zone : on empêche le navigateur d'ouvrir le fichier.
    const block = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      callback.current(files);
    };

    element.addEventListener("dragenter", enter);
    element.addEventListener("dragover", overHandler);
    element.addEventListener("dragleave", leave);
    element.addEventListener("drop", drop);
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    document.addEventListener("paste", paste);
    return () => {
      element.removeEventListener("dragenter", enter);
      element.removeEventListener("dragover", overHandler);
      element.removeEventListener("dragleave", leave);
      element.removeEventListener("drop", drop);
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
      document.removeEventListener("paste", paste);
    };
  }, [target, enabled]);

  return over;
}
