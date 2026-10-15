"use client";
// Nouveau dans le socle.

import { DataList, type DataListPreferences } from "@/components/data-list/data-list";
import type { DataColumn } from "@/components/data-list/types";
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from "@/domain/enums";
import { formatCents } from "@/domain/money";
import { formatDate } from "@/lib/format";
import type { DocumentRow } from "@/server/documents/service";
import { StatusBadge } from "./status-badge";

/** Liste des devis et factures ; les colonnes de montants n'existent que si le serveur les a envoyées. */
export function DocumentsList({ rows, preferences, showPrices, actions }: { rows: DocumentRow[]; preferences: DataListPreferences; showPrices: boolean; actions?: React.ReactNode }) {
  const columns: DataColumn<DocumentRow>[] = [
    { id: "number", header: "Numéro", value: (r) => r.number ?? "Brouillon", width: 140, defaultVisible: true, phone: "title" },
    { id: "type", header: "Type", value: (r) => DOCUMENT_TYPE.labels[r.type], width: 90, defaultVisible: true, phone: "meta" },
    { id: "status", header: "Statut", value: (r) => DOCUMENT_STATUS.labels[r.status], width: 110, defaultVisible: true, phone: "badge", cell: (r) => <StatusBadge status={r.status} /> },
    { id: "client", header: "Client", value: (r) => r.clientName, width: 220, defaultVisible: true, phone: "subtitle" },
    { id: "subject", header: "Objet", value: (r) => r.subject, width: 260, defaultVisible: "desktop" },
    { id: "date", header: "Date", kind: "date", value: (r) => r.documentDate, text: (r) => formatDate(r.documentDate), width: 110, defaultVisible: true, phone: "meta" },
    { id: "due", header: "Échéance", kind: "date", value: (r) => r.dueDate, text: (r) => formatDate(r.dueDate), width: 110, defaultVisible: "wide" },
  ];
  if (showPrices) {
    columns.push(
      { id: "ht", header: "Total HT", kind: "money", value: (r) => r.totalHtCents ?? null, text: (r) => formatCents(r.totalHtCents ?? 0), width: 120, defaultVisible: true },
      { id: "ttc", header: "Total TTC", kind: "money", value: (r) => r.totalTtcCents ?? null, text: (r) => formatCents(r.totalTtcCents ?? 0), width: 120, defaultVisible: "desktop", phone: "meta" },
    );
  }
  return (
    <DataList
      listKey="list:documents"
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/documents/${r.id}`}
      initialPreferences={preferences}
      exportName="Documents"
      actions={actions}
    />
  );
}
