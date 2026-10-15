"use client";

import { useEffect, useRef, useState } from "react";
import { documentBody, PUBLIC_FONTS, renderDocumentHtml } from "@/lib/documents/template";
import type { DocumentView } from "@/lib/documents/view";

/** Largeur d'une page A4 à l'écran (210 mm) avec ses marges grises. */
const SHEET_WIDTH_PX = 794 + 32;

/**
 * Aperçu d'un document dans un iframe, avec le même HTML que le PDF.
 * Mis à jour en direct sans recharger la page affichée (le défilement reste en place),
 * et mis à l'échelle de la place disponible. Aucun script ne s'exécute dans l'aperçu.
 */
export function DocumentPreview({ view, title }: { view: DocumentView; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Le HTML complet n'est écrit qu'une fois ; ensuite seul le contenu change.
  const [initialHtml] = useState(() => renderDocumentHtml(view, PUBLIC_FONTS));
  const [loaded, setLoaded] = useState(false);

  // Aperçu rendu par le serveur : le cadre a pu finir de charger avant que React n'écoute « load ».
  useEffect(() => {
    if (frameRef.current?.contentDocument?.querySelector("[data-document]")) setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      const body = frameRef.current?.contentDocument?.body;
      if (body) body.innerHTML = documentBody(view);
    }, 120);
    return () => clearTimeout(timer);
  }, [view, loaded]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !loaded) return;
    const fit = () => {
      const root = frame.contentDocument?.documentElement;
      if (root) root.style.zoom = String(Math.min(1.25, frame.clientWidth / SHEET_WIDTH_PX));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [loaded]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={initialHtml}
      // Même origine pour lire les photos de la fiche ; aucun script.
      sandbox="allow-same-origin"
      onLoad={() => setLoaded(true)}
      data-ready={loaded}
      className="size-full min-h-[60vh] rounded-xl bg-slate-200 ring-1 ring-slate-200"
    />
  );
}
