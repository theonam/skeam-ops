"use client";
// Nouveau dans le socle.

import { DataList, type DataListPreferences } from "@/components/data-list/data-list";
import type { DataColumn } from "@/components/data-list/types";
import { formatCents, formatRateBp } from "@/domain/money";
import type { ArticleRow } from "@/server/referentials/service";

/** Catalogue d'articles : plusieurs milliers de lignes, filtres et tris sur toutes les colonnes. */
export function ArticlesList({ rows, preferences, showPrices }: { rows: ArticleRow[]; preferences: DataListPreferences; showPrices: boolean }) {
  const columns: DataColumn<ArticleRow>[] = [
    { id: "code", header: "Code", value: (r) => r.code, width: 100, defaultVisible: true, phone: "meta" },
    { id: "label", header: "Libellé", value: (r) => r.label, width: 300, defaultVisible: true, phone: "title" },
    { id: "category", header: "Catégorie", value: (r) => r.category, width: 180, defaultVisible: true, phone: "subtitle" },
    { id: "unit", header: "Unité", value: (r) => r.unit, width: 80, defaultVisible: true },
    { id: "vat", header: "TVA", kind: "number", value: (r) => r.vatRateBp, text: (r) => formatRateBp(r.vatRateBp), width: 80, defaultVisible: "desktop" },
    { id: "active", header: "Actif", kind: "boolean", value: (r) => r.isActive, width: 80, defaultVisible: "wide" },
  ];
  if (showPrices) {
    columns.splice(4, 0, { id: "price", header: "Prix unitaire HT", kind: "money", value: (r) => r.unitPriceCents ?? null, text: (r) => formatCents(r.unitPriceCents ?? 0), width: 140, defaultVisible: true, phone: "badge" });
    columns.push({ id: "cost", header: "Coût de revient", kind: "money", value: (r) => r.costCents ?? null, text: (r) => (r.costCents == null ? "" : formatCents(r.costCents)), width: 140, defaultVisible: "wide" });
  }
  return <DataList listKey="list:articles" rows={rows} columns={columns} rowKey={(r) => r.id} initialPreferences={preferences} exportName="Articles" />;
}
