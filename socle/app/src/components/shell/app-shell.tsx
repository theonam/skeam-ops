import type { ReactNode } from "react";
import { PROFILE_LABELS } from "@/config/access";
import { appIdentity, currentEdition } from "@/config/app";
import { NAV_ITEMS } from "@/config/navigation";
import { can } from "@/domain/access";
import { requireUser } from "@/server/auth/session";
import { AppNav } from "./app-nav";

/** Cadre de l'application connectée : menu selon le profil, contenu. Origine : egm-app `src/components/shell/app-shell.tsx`. */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const app = appIdentity();
  return (
    <div className="flex min-h-dvh">
      <AppNav
        app={{ name: app.name, shortName: app.shortName }}
        edition={currentEdition()}
        items={NAV_ITEMS.filter((item) => can(user.profile, item.permission))}
        user={{ displayName: user.displayName, profileLabel: PROFILE_LABELS[user.profile] }}
      />
      <main className="min-w-0 flex-1 bg-canvas pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] tablet:pb-0">{children}</main>
    </div>
  );
}
