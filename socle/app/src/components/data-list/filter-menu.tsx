"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { normalize, type FilterOption } from "./query";
import type { ColumnKind } from "./types";

const MAX_SHOWN = 300;

/** Libellés du tri, comme dans Excel, selon la nature de la colonne. */
const SORT_LABELS: Record<ColumnKind, [string, string]> = {
  text: ["Trier de A à Z", "Trier de Z à A"],
  boolean: ["Trier de Non à Oui", "Trier de Oui à Non"],
  number: ["Du plus petit au plus grand", "Du plus grand au plus petit"],
  money: ["Du plus petit au plus grand", "Du plus grand au plus petit"],
  date: ["Du plus ancien au plus récent", "Du plus récent au plus ancien"],
};

export type ColumnSort = {
  kind: ColumnKind;
  /** Sens du tri actuel sur cette colonne, `null` si elle n'est pas triée. */
  current: "asc" | "desc" | null;
  /** `null` retire le tri. */
  onChange: (direction: "asc" | "desc" | null) => void;
};

type Props = {
  /** Calculées à l'ouverture du menu seulement : une liste de 4 000 lignes reste fluide. */
  getOptions: () => FilterOption[];
  sort?: ColumnSort;
  /** Valeurs retenues ; `undefined` = pas de filtre (tout est coché). */
  selected: string[] | undefined;
  onChange: (selected: string[] | undefined) => void;
};

/** Menu de colonne façon Excel : tri croissant ou décroissant, puis recherche, « Tout sélectionner », une case par valeur avec son nombre. */
export function FilterMenu({ getOptions, sort, selected, onChange }: Props) {
  const [search, setSearch] = useState("");
  // Le menu n'existe que tant qu'il est ouvert : le calcul ne pèse pas sur la liste.
  const options = getOptions();
  const visible = useMemo(() => {
    const term = normalize(search);
    return term ? options.filter((o) => normalize(o.value).includes(term)) : options;
  }, [options, search]);

  const isChecked = (value: string) => selected === undefined || selected.includes(value);
  const allValues = options.map((o) => o.value);
  const visibleValues = visible.map((o) => o.value);
  const allVisibleChecked = visibleValues.every(isChecked);

  function toggle(value: string) {
    const base = selected ?? allValues;
    const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
    onChange(next.length === allValues.length && allValues.every((v) => next.includes(v)) ? undefined : next);
  }

  function toggleVisible() {
    const base = new Set(selected ?? allValues);
    if (allVisibleChecked) visibleValues.forEach((v) => base.delete(v));
    else visibleValues.forEach((v) => base.add(v));
    const next = [...base];
    onChange(next.length === allValues.length ? undefined : next);
  }

  return (
    <div className="flex max-h-[min(32rem,75dvh)] w-72 max-w-[calc(100vw-2rem)] flex-col">
      {sort ? (
        <div className="border-b border-slate-100 py-1">
          {(["asc", "desc"] as const).map((direction) => {
            const active = sort.current === direction;
            const Icon = direction === "asc" ? ArrowUp : ArrowDown;
            return (
              <button
                key={direction}
                type="button"
                aria-pressed={active}
                onClick={() => sort.onChange(active ? null : direction)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-slate-50",
                  active && "font-medium text-brand-700",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {SORT_LABELS[sort.kind][direction === "asc" ? 0 : 1]}
              </button>
            );
          })}
        </div>
      ) : null}
      <label className="relative block p-2">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une valeur"
          aria-label="Rechercher une valeur"
          className="h-10 w-full rounded-md bg-slate-50 pr-2 pl-8 text-sm ring-1 ring-slate-200 focus:ring-brand-600 focus:outline-none"
        />
      </label>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 border-y border-slate-100 px-3 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={allVisibleChecked} onChange={toggleVisible} />
        {search ? "Sélectionner les résultats" : "Tout sélectionner"}
      </label>
      <ul className="flex-1 overflow-y-auto py-1">
        {visible.slice(0, MAX_SHOWN).map((o) => (
          <li key={o.value}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm hover:bg-slate-50">
              <input type="checkbox" className="size-4 shrink-0" checked={isChecked(o.value)} onChange={() => toggle(o.value)} />
              <span className="min-w-0 flex-1 truncate" title={o.value}>
                {o.value}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{o.count}</span>
            </label>
          </li>
        ))}
        {visible.length > MAX_SHOWN ? (
          <li className="px-3 py-2 text-xs text-slate-500">
            {visible.length - MAX_SHOWN} autres valeurs : affinez la recherche.
          </li>
        ) : null}
        {visible.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">Aucune valeur</li> : null}
      </ul>
      {selected !== undefined ? (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="min-h-10 border-t border-slate-100 text-sm font-medium text-brand-700 hover:bg-slate-50"
        >
          Effacer ce filtre
        </button>
      ) : null}
    </div>
  );
}
