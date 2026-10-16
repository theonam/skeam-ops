import type { Permission } from "./access";

/**
 * Menu de l'application : une entrée par écran, avec le droit qui la rend visible.
 * Le téléphone affiche en onglets les entrées `phoneTab`, les autres dans « Plus ».
 * Origine : egm-app `src/components/shell/nav-items.ts`, sorti en configuration.
 */
export type NavIconName = "documents" | "clients" | "articles" | "data" | "journal" | "settings";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: NavIconName;
  permission: Permission;
  phoneTab: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/documents", label: "Devis et factures", shortLabel: "Documents", icon: "documents", permission: "documents.read", phoneTab: true },
  { href: "/clients", label: "Clients", shortLabel: "Clients", icon: "clients", permission: "clients.read", phoneTab: true },
  { href: "/articles", label: "Articles", shortLabel: "Articles", icon: "articles", permission: "articles.read", phoneTab: true },
  { href: "/donnees", label: "Import et export", shortLabel: "Données", icon: "data", permission: "data.import", phoneTab: false },
  { href: "/journal", label: "Journal d'audit", shortLabel: "Journal", icon: "journal", permission: "audit.read", phoneTab: false },
  { href: "/parametres", label: "Paramètres", shortLabel: "Paramètres", icon: "settings", permission: "settings.write", phoneTab: false },
];
