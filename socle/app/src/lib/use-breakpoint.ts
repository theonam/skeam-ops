"use client";

import { useSyncExternalStore } from "react";

/** Les quatre formats du projet (cf. CLAUDE.md § 7). */
export type Breakpoint = "phone" | "tablet" | "desktop" | "wide";

function current(): Breakpoint {
  const w = window.innerWidth;
  if (w < 600) return "phone";
  if (w < 1280) return "tablet";
  if (w < 2200) return "desktop";
  return "wide";
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * Format d'écran courant, pour les composants dont la structure change selon l'écran
 * (cartes sur téléphone, tableau ailleurs). Pour le simple style, préférer les classes Tailwind.
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, current, () => "desktop");
}
