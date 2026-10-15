"use client";

import { DataList, type DataListPreferences } from "@/components/data-list/data-list";
import type { DataColumn } from "@/components/data-list/types";
import type { ClientRow } from "@/server/referentials/service";

// Origine : egm-app `src/components/lists/clients-list.tsx`, colonnes génériques.
export function ClientsList({ rows, preferences, showNotes, actions }: { rows: ClientRow[]; preferences: DataListPreferences; showNotes: boolean; actions?: React.ReactNode }) {
  const columns: DataColumn<ClientRow>[] = [
    { id: "code", header: "Code", value: (r) => r.code, width: 90, defaultVisible: true, phone: "meta" },
    { id: "name", header: "Nom", value: (r) => r.name, width: 260, defaultVisible: true, phone: "title" },
    { id: "city", header: "Ville", value: (r) => r.city, width: 160, defaultVisible: true, phone: "subtitle" },
    { id: "postalCode", header: "Code postal", value: (r) => r.postalCode, width: 100, defaultVisible: "desktop" },
    { id: "email", header: "Mail", value: (r) => r.email, width: 220, defaultVisible: "desktop" },
    { id: "phone", header: "Téléphone", value: (r) => r.phone, width: 140, defaultVisible: "desktop", phone: "meta" },
    { id: "siret", header: "SIRET", value: (r) => r.siret, width: 150, defaultVisible: "wide" },
  ];
  if (showNotes) columns.push({ id: "notes", header: "Notes internes", value: (r) => r.internalNotes ?? null, width: 240, defaultVisible: "wide" });
  return <DataList listKey="list:clients" rows={rows} columns={columns} rowKey={(r) => r.id} initialPreferences={preferences} exportName="Clients" actions={actions} />;
}
