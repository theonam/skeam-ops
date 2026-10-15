"use client";
// Nouveau dans le socle.

import { DataList, type DataListPreferences } from "@/components/data-list/data-list";
import type { DataColumn } from "@/components/data-list/types";
import { formatDateTime } from "@/lib/format";

export type AuditEntryView = { id: number; at: string; username: string | null; action: string; entity: string; entityId: string | null; summary: string; details: string };

/** Journal d'audit : filtrable par utilisateur, action, objet ; exportable. */
export function AuditList({ rows, preferences }: { rows: AuditEntryView[]; preferences: DataListPreferences }) {
  const columns: DataColumn<AuditEntryView>[] = [
    { id: "at", header: "Date", kind: "date", value: (r) => r.at, text: (r) => formatDateTime(r.at), filterText: (r) => r.at.slice(0, 10), width: 170, defaultVisible: true, phone: "meta" },
    { id: "user", header: "Utilisateur", value: (r) => r.username ?? "système", width: 140, defaultVisible: true, phone: "subtitle" },
    { id: "action", header: "Action", value: (r) => r.action, width: 150, defaultVisible: true, phone: "badge" },
    { id: "entity", header: "Objet", value: (r) => r.entity, width: 110, defaultVisible: true },
    { id: "summary", header: "Résumé", value: (r) => r.summary, width: 340, defaultVisible: true, phone: "title" },
    { id: "details", header: "Détail", value: (r) => r.details, width: 380, defaultVisible: "wide", filterable: false },
    { id: "entityId", header: "Identifiant", value: (r) => r.entityId, width: 280, defaultVisible: false, filterable: false },
  ];
  return <DataList listKey="list:audit" rows={rows} columns={columns} rowKey={(r) => String(r.id)} initialPreferences={preferences} exportName="Journal" />;
}
