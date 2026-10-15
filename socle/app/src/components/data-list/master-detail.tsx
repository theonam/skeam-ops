"use client";
// Origine : egm-app `src/components/data-list/master-detail.tsx`.

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Liste et fiche. Sur grand écran, côte à côte : la liste garde ses filtres et sa position pendant
 * qu'on ouvre les fiches. Sur les autres formats, l'une ou l'autre en pleine largeur.
 */
export function MasterDetail({ list, children, wideDetail = false }: { list: ReactNode; children: ReactNode; wideDetail?: boolean }) {
  const detailOpen = useSelectedLayoutSegment() !== null;
  return (
    <div
      className={cn(
        "group/md wide:grid",
        // Une fiche peut demander toute la largeur (ex. le devis avec son aperçu à côté) : la liste s'efface.
        "wide:has-[[data-wants-full-width=true]]:grid-cols-1",
        // Un devis (lignes, totaux) demande plus de place qu'une demande.
        wideDetail ? "wide:grid-cols-[minmax(0,1fr)_minmax(0,88rem)]" : "wide:grid-cols-[minmax(0,1fr)_minmax(0,64rem)]",
      )}
    >
      <div className={cn("min-w-0", detailOpen && "hidden wide:block wide:group-has-[[data-wants-full-width=true]]/md:hidden")}>{list}</div>
      <div
        className={cn(
          "min-w-0 wide:sticky wide:top-0 wide:h-dvh wide:overflow-y-auto wide:border-l wide:border-slate-200",
          !detailOpen && "hidden wide:block",
        )}
      >
        {children}
      </div>
    </div>
  );
}
