"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Edition } from "@/config/app";
import type { NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { logout } from "@/server/auth/actions";
import { NavIcon } from "./nav-icon";

/**
 * Navigation adaptée à l'écran : onglets en bas sur téléphone, rail d'icônes sur tablette,
 * barre latérale sur écran et grand écran.
 * Origine : egm-app `src/components/shell/app-nav.tsx`, sans pastilles ni sous-menu, nom de l'application paramétrable.
 */
type Props = {
  app: { name: string; shortName: string };
  edition: Edition;
  items: NavItem[];
  user: { displayName: string; profileLabel: string };
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/[\s-]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function AppNav({ app, edition, items, user }: Props) {
  const pathname = usePathname();
  const tabs = items.filter((i) => i.phoneTab).slice(0, 4);
  return (
    <>
      <nav data-app-nav aria-label="Navigation principale" className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col bg-brand-900 text-white tablet:flex tablet:w-20 desktop:w-60 wide:w-64">
        <div className="flex h-20 items-center justify-center gap-3 desktop:justify-start desktop:px-5">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-brand-900">
            {initials(app.shortName)}
          </span>
          <span className="hidden min-w-0 flex-col desktop:flex">
            <span className="truncate text-[15px] font-extrabold">{app.name}</span>
          </span>
          {edition === "demo" ? (
            <span data-edition="demo" className="ml-auto hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 desktop:inline">
              Démo
            </span>
          ) : null}
        </div>
        <ul className="flex-1 space-y-1 px-2 desktop:px-3">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition-colors desktop:h-11 desktop:flex-row desktop:gap-3 desktop:rounded-full desktop:px-4 desktop:text-sm",
                    active ? "bg-white font-bold text-brand-900" : "text-white/85 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <NavIcon name={item.icon} className="size-6 desktop:size-5" />
                  <span className="text-center desktop:hidden">{item.shortLabel}</span>
                  <span className="hidden desktop:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="p-2 desktop:p-3">
          <div className="hidden items-center gap-3 rounded-2xl bg-white/10 p-3 desktop:flex">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-extrabold text-brand-900">
              {initials(user.displayName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{user.displayName}</span>
              <span className="block truncate text-xs text-white/70">{user.profileLabel}</span>
            </span>
          </div>
          <form action={logout}>
            <button type="submit" className="mt-1 flex w-full flex-col items-center gap-1 rounded-full px-2 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white desktop:flex-row desktop:gap-3 desktop:px-4 desktop:text-sm">
              <LogOut aria-hidden className="size-5" />
              <span>Déconnexion</span>
            </button>
          </form>
        </div>
      </nav>

      <nav data-app-nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgb(19_50_94/0.07)] tablet:hidden">
        <ul className="flex h-(--tabbar-h)">
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-1 text-xs font-medium", active ? "font-bold text-brand-900" : "text-slate-500")}>
                  <NavIcon name={item.icon} className="size-6" />
                  {item.shortLabel}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <Link href="/plus" aria-current={pathname === "/plus" ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-1 text-xs font-medium", pathname === "/plus" ? "font-bold text-brand-900" : "text-slate-500")}>
              <Menu aria-hidden className="size-6" />
              Plus
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
