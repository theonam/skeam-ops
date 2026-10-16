// Nouveau dans le socle.
import type { Metadata } from "next";
import Link from "next/link";
import { ImportPanel } from "@/components/data/import-panel";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { IMPORT_SCHEMAS } from "@/config/import";
import { can } from "@/domain/access";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Import et export" };

/** Import Excel avec rapport des rejets ; l'export se fait depuis chaque liste, colonnes et filtres compris. */
export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "data.import")) return <NoAccess />;
  return (
    <>
      <PageHeader title="Import et export" />
      <div className="grid gap-6 px-4 pb-8 tablet:px-6 desktop:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-semibold">Importer des classeurs Excel</h2>
          <ImportPanel entities={Object.values(IMPORT_SCHEMAS).map((s) => s.label)} />
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Exporter</h2>
          <p className="text-sm text-slate-700">
            Chaque liste s&apos;exporte en Excel avec ses colonnes, ses filtres et son tri : bouton Exporter de la barre d&apos;outils. Un profil n&apos;exporte jamais un champ qu&apos;il n&apos;a pas le droit de voir.
          </p>
          <ul className="list-inside list-disc text-sm">
            <li>
              <Link className="text-brand-700 underline" href="/clients">
                Clients
              </Link>
            </li>
            <li>
              <Link className="text-brand-700 underline" href="/articles">
                Articles
              </Link>
            </li>
            <li>
              <Link className="text-brand-700 underline" href="/documents">
                Devis et factures
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
