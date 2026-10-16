"use client";

import { useEffect } from "react";

/** Enregistre le service worker, condition pour installer l'application sur l'écran d'accueil. Origine : egm-app. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Sans service worker l'application reste utilisable, seulement pas installable.
      });
  }, []);
  return null;
}
