// Nouveau dans le socle.
import type { Metadata } from "next";
import { DocumentsList } from "@/components/lists/documents-list";
import { NewDocumentButton } from "@/components/documents/new-document";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { can, canSeeField } from "@/domain/access";
import { requireUser } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/service";
import { readListPreferences } from "@/server/preferences/list-preferences";
import { listClients } from "@/server/referentials/service";

export const metadata: Metadata = { title: "Devis et factures" };

export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "documents.read")) return <NoAccess />;
  const canWrite = can(user.profile, "documents.write") && can(user.profile, "prices.read");
  const [rows, preferences, clients] = await Promise.all([
    listDocuments(user),
    readListPreferences(user.id, "list:documents"),
    canWrite ? listClients(user) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Devis et factures" />
      <DocumentsList
        rows={rows}
        preferences={preferences}
        showPrices={canSeeField(user.profile, "documents", "totalHtCents")}
        actions={canWrite ? <NewDocumentButton clients={clients.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))} /> : null}
      />
    </>
  );
}
