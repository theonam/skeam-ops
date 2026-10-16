// Nouveau dans le socle.
import { LogOut } from "lucide-react";
import Link from "next/link";
import { NavIcon } from "@/components/shell/nav-icon";
import { PageHeader } from "@/components/ui/page-header";
import { PROFILE_LABELS } from "@/config/access";
import { NAV_ITEMS } from "@/config/navigation";
import { can } from "@/domain/access";
import { logout } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";

/** Téléphone : les écrans qui ne tiennent pas dans la barre d'onglets, et la déconnexion. */
export default async function Page() {
  const user = await requireUser();
  const items = NAV_ITEMS.filter((i) => can(user.profile, i.permission));
  return (
    <>
      <PageHeader title="Plus" />
      <div className="space-y-4 px-4 pb-6">
        <p className="text-sm text-slate-600">
          {user.displayName}, {PROFILE_LABELS[user.profile]}
        </p>
        <ul className="divide-y divide-slate-200 rounded-2xl bg-white shadow-card">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex h-14 items-center gap-3 px-4 font-medium">
                <NavIcon name={item.icon} className="size-5 text-brand-600" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <form action={logout}>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white font-medium shadow-card ring-1 ring-slate-200">
            <LogOut aria-hidden className="size-5" /> Déconnexion
          </button>
        </form>
      </div>
    </>
  );
}
