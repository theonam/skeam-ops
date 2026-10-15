import "server-only";
import { desc, sql } from "drizzle-orm";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

/**
 * Journal d'audit en ajout seul. Chaque écriture métier y ajoute une ligne, dans la même transaction
 * que l'écriture elle-même : pas d'écriture sans trace, pas de trace sans écriture.
 * Nouveau dans le socle : egm-app ne trace que les mails préparés et les auteurs des lignes.
 */

type Executor = Pick<typeof db, "insert">;

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  details?: Record<string, unknown> | null;
};

export async function audit(executor: Executor, user: Pick<CurrentUser, "id" | "username"> | null, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    userId: user?.id ?? null,
    username: user?.username ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary ?? "",
    details: entry.details ?? null,
  });
}

/** Champs modifiés entre deux états, pour le détail d'une ligne de journal. */
export function changes(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { avant: unknown; apres: unknown }> {
  const out: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = { avant: before[key] ?? null, apres: after[key] ?? null };
  }
  return out;
}

export type AuditRow = typeof auditLog.$inferSelect;

/** Dernières lignes du journal, les plus récentes d'abord. */
export async function listAudit(limit = 5000): Promise<AuditRow[]> {
  return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
}

export async function countAudit(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog);
  return row.n;
}
