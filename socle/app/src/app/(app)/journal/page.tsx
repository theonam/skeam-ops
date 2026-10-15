// Nouveau dans le socle.
import type { Metadata } from "next";
import { AuditList } from "@/components/lists/audit-list";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/domain/access";
import { listAudit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { readListPreferences } from "@/server/preferences/list-preferences";

export const metadata: Metadata = { title: "Journal d'audit" };

/** Journal d'audit : qui a fait quoi et quand. En ajout seul, garanti par la base. */
export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "audit.read")) return <NoAccess />;
  const [entries, preferences] = await Promise.all([listAudit(5000), readListPreferences(user.id, "list:audit")]);
  const rows = entries.map((e) => ({
    id: e.id,
    at: e.at.toISOString(),
    username: e.username,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    summary: e.summary,
    details: e.details ? JSON.stringify(e.details) : "",
  }));
  return (
    <>
      <PageHeader title="Journal d'audit" />
      <AuditList rows={rows} preferences={preferences} />
    </>
  );
}
