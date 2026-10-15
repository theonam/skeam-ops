// Origine : egm-app `src/components/data-list/types.ts`.
import type { ReactNode } from "react";
import type { QueryColumn } from "./query";

export type ColumnKind = "text" | "number" | "money" | "date" | "boolean";

export type DataColumn<R> = QueryColumn<R> & {
  header: string;
  kind?: ColumnKind;
  /** Largeur minimale en pixels. */
  width?: number;
  /**
   * Affichage par défaut selon le format : true = dès la tablette ; « desktop » = à partir de l'écran
   * standard ; « wide » = seulement sur grand écran ; false = masquée (ajoutable par l'utilisateur).
   */
  defaultVisible?: boolean | "desktop" | "wide";
  /** Filtre à cases à cocher (vrai par défaut). */
  filterable?: boolean;
  /** Rôle dans la carte affichée sur téléphone (« badge » : rendu à droite du titre, plusieurs possibles). */
  phone?: "title" | "subtitle" | "meta" | "badge";
  /** Rendu particulier de la cellule (pastille, lien…). Le texte reste celui de `text`. */
  cell?: (row: R) => ReactNode;
};
