import type { Metadata } from "next";
import { ClientsList } from "@/components/lists/clients-list";
import { NewClientButton } from "@/components/lists/new-client";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { can, canSeeField } from "@/domain/access";
import { requireUser } from "@/server/auth/session";
import { readListPreferences } from "@/server/preferences/list-preferences";
import { listClients } from "@/server/referentials/service";

export const metadata: Metadata = { title: "Clients" };

// Origine : egm-app `src/app/(app)/clients/page.tsx`.
export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "clients.read")) return <NoAccess />;
  const [rows, preferences] = await Promise.all([listClients(user), readListPreferences(user.id, "list:clients")]);
  return (
    <>
      <PageHeader title="Clients" />
      <ClientsList rows={rows} preferences={preferences} showNotes={canSeeField(user.profile, "clients", "internalNotes")} actions={can(user.profile, "clients.write") ? <NewClientButton /> : null} />
    </>
  );
}
