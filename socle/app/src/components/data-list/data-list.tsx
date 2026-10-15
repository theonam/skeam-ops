"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Columns3, Download, Filter, Search, X } from "lucide-react";
import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { useBreakpoint } from "@/lib/use-breakpoint";
import { saveListPreferences } from "@/server/preferences/actions";
import { exportXlsx } from "./export-xlsx";
import { FilterMenu, type ColumnSort } from "./filter-menu";
import { applyQuery, cellText, filterOptions, resolveVisibleColumns, type SortState } from "./query";
import type { DataColumn } from "./types";

export type DataListPreferences = { columns: string[]; sort?: SortState } | null;

type Props<R> = {
  /** Clé de mémorisation des préférences, ex. « list:addresses ». */
  listKey: string;
  rows: R[];
  columns: DataColumn<R>[];
  rowKey: (row: R) => string;
  rowHref?: (row: R) => string | undefined;
  initialPreferences: DataListPreferences;
  /** Nom du fichier exporté, sans extension ni date. */
  exportName: string;
  /** Contenu ajouté à droite de la barre d'outils (bouton « Nouvelle demande »…). */
  actions?: ReactNode;
  /** Onglets de vues (« En cours », « Archivés »…) : liens, celui de la vue ouverte est marqué. */
  views?: { label: string; href: string; active: boolean }[];
  emptyMessage?: string;
  /** Filtres appliqués à l'ouverture (ex. demandes en attente), que l'utilisateur peut retirer. */
  defaultFilters?: Record<string, string[]>;
  /** Lignes toujours en tête, quel que soit le tri (ex. urgentes). */
  pinned?: (row: R) => boolean;
  /** Classes supplémentaires d'une ligne (ex. liseré rouge des urgentes). */
  rowClassName?: (row: R) => string | undefined;
  /** Ligne ouverte dans le panneau de détail. */
  selectedKey?: string;
  /** Liste affichée à côté d'un panneau de détail : sur grand écran, colonnes par défaut de l'écran standard. */
  besideDetail?: boolean;
};

const ROW_HEIGHT = 44;
const CARD_HEIGHT = 84;

/**
 * Liste générique : une seule page fluide à plusieurs milliers de lignes (défilement virtualisé),
 * recherche, filtres combinés à cases à cocher, tri, colonnes choisies et ordonnées par l'utilisateur
 * (mémorisées côté serveur) et export Excel. Cartes sur téléphone, tableau ailleurs.
 */
export function DataList<R>({
  listKey,
  rows,
  columns,
  rowKey,
  rowHref,
  initialPreferences,
  exportName,
  actions,
  views,
  emptyMessage = "Aucune ligne ne correspond.",
  defaultFilters,
  pinned,
  rowClassName,
  selectedKey,
  besideDetail = false,
}: Props<R>) {
  const screen = useBreakpoint();
  const isPhone = screen === "phone";
  const breakpoint = besideDetail && screen === "wide" ? "desktop" : screen;

  const allIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const defaultIds = useMemo(
    () =>
      columns
        .filter(
          (c) =>
            c.defaultVisible === true ||
            (c.defaultVisible === "desktop" && (breakpoint === "desktop" || breakpoint === "wide")) ||
            (c.defaultVisible === "wide" && breakpoint === "wide"),
        )
        .map((c) => c.id),
    [columns, breakpoint],
  );
  const [savedColumns, setSavedColumns] = useState<string[] | undefined>(initialPreferences?.columns);
  const visibleIds = resolveVisibleColumns(allIds, defaultIds, savedColumns);
  const visibleColumns = useMemo(
    () => visibleIds.map((id) => columns.find((c) => c.id === id)!).filter(Boolean),
    [visibleIds, columns],
  );

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<Record<string, string[]>>(defaultFilters ?? {});
  const [sort, setSort] = useState<SortState>(initialPreferences?.sort ?? null);

  const displayed = useMemo(
    () => applyQuery(rows, columns, visibleColumns, { search: deferredSearch, filters, sort, pinned }),
    [rows, columns, visibleColumns, deferredSearch, filters, sort, pinned],
  );

  // Mémorisation des préférences, regroupée pour ne pas solliciter le serveur à chaque clic.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persist(next: { columns?: string[]; sort?: SortState }) {
    const value = { columns: next.columns ?? savedColumns ?? [], sort: next.sort === undefined ? sort : next.sort };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveListPreferences(listKey, value).catch(() => {}), 600);
  }

  /** Une liste vide signifie « colonnes par défaut du format d'écran ». */
  function updateColumns(next: string[]) {
    setSavedColumns(next.length > 0 ? next : undefined);
    persist({ columns: next });
  }

  function changeSort(next: SortState) {
    setSort(next);
    persist({ sort: next });
  }

  function toggleSort(id: string) {
    changeSort(!sort || sort.id !== id ? { id, desc: false } : !sort.desc ? { id, desc: true } : null);
  }

  /** Tri proposé dans le menu de la colonne (croissant, décroissant, ou retiré). */
  function columnSort(column: DataColumn<R>): ColumnSort {
    return {
      kind: column.kind ?? "text",
      current: sort?.id === column.id ? (sort.desc ? "desc" : "asc") : null,
      onChange: (direction) => changeSort(direction ? { id: column.id, desc: direction === "desc" } : null),
    };
  }

  function setFilter(id: string, selected: string[] | undefined) {
    setFilters((f) => {
      const next = { ...f };
      if (selected === undefined) delete next[id];
      else next[id] = selected;
      return next;
    });
  }

  const activeFilters = Object.entries(filters);

  // --- Défilement virtualisé à l'échelle de la fenêtre : seules les lignes visibles sont dessinées.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const update = () => setScrollMargin(listRef.current ? listRef.current.getBoundingClientRect().top + window.scrollY : 0);
    update();
    const observer = new ResizeObserver(update);
    if (listRef.current?.parentElement) observer.observe(listRef.current.parentElement);
    return () => observer.disconnect();
  }, [isPhone]);

  const virtualizer = useWindowVirtualizer({
    count: displayed.length,
    estimateSize: () => (isPhone ? CARD_HEIGHT : ROW_HEIGHT),
    overscan: 12,
    scrollMargin,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [isPhone, virtualizer]);

  const gridTemplate = visibleColumns.map((c) => `minmax(0, ${(c.width ?? 140) / 100}fr)`).join(" ");
  const items = virtualizer.getVirtualItems();

  return (
    // Sur tablette et plus, la liste est une carte blanche arrondie posée sur le fond (overflow-clip
    // garde les coins arrondis sans casser la barre collée en haut).
    <div className="mb-6 bg-white tablet:m-4 tablet:overflow-clip tablet:rounded-[22px] tablet:shadow-card desktop:mx-6">
      {/* Barre d'outils et en-têtes, collées en haut pendant le défilement */}
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 tablet:px-5">
          {views ? (
            <nav aria-label="Vues" className="w-full tablet:w-auto">
              <ul className="flex gap-1.5">
                {views.map((view) => (
                  <li key={view.href} className="flex-1 tablet:flex-none">
                    <Link
                      href={view.href}
                      aria-current={view.active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-150",
                        view.active ? "bg-brand-900 font-bold text-white" : "bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200",
                      )}
                    >
                      {view.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <label className="relative min-w-0 flex-1 basis-56 desktop:max-w-xl">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher"
              aria-label="Rechercher dans la liste"
              className="h-10 w-full rounded-full bg-slate-50 pr-4 pl-10 text-base ring-1 ring-slate-200 transition-shadow focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none tablet:text-sm"
            />
          </label>
          <AllColumnsFilter rows={rows} columns={columns} filters={filters} setFilter={setFilter} columnSort={columnSort} />
          {!isPhone ? (
            <ColumnsMenu columns={columns} visibleIds={visibleIds} onChange={updateColumns} onReset={() => updateColumns([])} />
          ) : null}
          {!isPhone ? (
            <button
              type="button"
              onClick={() =>
                void exportXlsx(`${exportName}-${new Date().toISOString().slice(0, 10)}.xlsx`, exportName, visibleColumns, displayed)
              }
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
            >
              <Download aria-hidden className="size-4" /> Exporter
            </button>
          ) : null}
          {actions}
          <p className="w-full text-xs text-slate-500 tablet:ml-auto tablet:w-auto" aria-live="polite">
            {displayed.length === rows.length
              ? `${rows.length.toLocaleString("fr-FR")} lignes`
              : `${displayed.length.toLocaleString("fr-FR")} sur ${rows.length.toLocaleString("fr-FR")} lignes`}
          </p>
        </div>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 tablet:px-6">
            {activeFilters.map(([id, values]) => {
              const column = columns.find((c) => c.id === id);
              return (
                <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-xs text-brand-900">
                  <span className="truncate">
                    {column?.header} : {values.length === 1 ? values[0] : `${values.length} valeurs`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilter(id, undefined)}
                    aria-label={`Retirer le filtre ${column?.header}`}
                    className="grid size-6 place-items-center rounded-full hover:bg-brand-100"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </span>
              );
            })}
            <button type="button" onClick={() => setFilters({})} className="text-xs font-medium text-brand-700 underline underline-offset-2">
              Effacer les filtres
            </button>
          </div>
        ) : null}

        {!isPhone ? (
          <div role="row" className="grid border-t border-slate-200 bg-slate-50 px-4 tablet:px-6" style={{ gridTemplateColumns: gridTemplate }}>
            {visibleColumns.map((c) => (
              <HeaderCell
                key={c.id}
                column={c}
                sort={sort}
                onSort={() => toggleSort(c.id)}
                filtered={filters[c.id] !== undefined}
                filterMenu={
                  c.filterable === false ? null : (
                    <FilterMenu
                      getOptions={() => filterOptions(rows, columns, c.id, filters)}
                      sort={columnSort(c)}
                      selected={filters[c.id]}
                      onChange={(sel) => setFilter(c.id, sel)}
                    />
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <div ref={listRef} role="table" aria-rowcount={displayed.length} aria-label={exportName}>
        {displayed.length === 0 ? (
          <p className="px-6 py-10 text-center text-slate-500">{emptyMessage}</p>
        ) : (
          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const row = displayed[item.index];
              const href = rowHref?.(row);
              const key = rowKey(row);
              const extraClass = cn(rowClassName?.(row), key === selectedKey && "bg-brand-50 ring-2 ring-brand-600 ring-inset");
              const style = {
                position: "absolute" as const,
                top: 0,
                left: 0,
                width: "100%",
                height: item.size,
                transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
              };
              return isPhone ? (
                <PhoneCard key={key} row={row} columns={columns} href={href} style={style} index={item.index} className={extraClass} />
              ) : (
                <RowShell key={key} href={href} style={style} index={item.index} className={extraClass} selected={key === selectedKey}>
                  <div className="grid h-full items-center px-4 tablet:px-6" style={{ gridTemplateColumns: gridTemplate }}>
                    {visibleColumns.map((c) => (
                      <div
                        key={c.id}
                        role="cell"
                        title={cellText(c, row)}
                        className={cn(
                          "truncate pr-3 text-sm",
                          (c.kind === "money" || c.kind === "number") && "text-right tabular-nums",
                        )}
                      >
                        {c.cell ? c.cell(row) : displayText(c, row)}
                      </div>
                    ))}
                  </div>
                </RowShell>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function displayText<R>(column: DataColumn<R>, row: R): string {
  const text = cellText(column, row);
  return text === "(vide)" ? "" : text;
}

function RowShell({
  href,
  style,
  index,
  className: extra,
  selected,
  children,
}: {
  href?: string;
  style: React.CSSProperties;
  index: number;
  className?: string;
  selected?: boolean;
  children: ReactNode;
}) {
  const className = cn(
    "block border-b border-slate-100 bg-white",
    href && "hover:bg-brand-50/60 focus-visible:bg-brand-50",
    extra,
  );
  return href ? (
    <Link href={href} role="row" aria-rowindex={index + 1} aria-selected={selected} style={style} className={className}>
      {children}
    </Link>
  ) : (
    <div role="row" aria-rowindex={index + 1} style={style} className={className}>
      {children}
    </div>
  );
}

function PhoneCard<R>({
  row,
  columns,
  href,
  style,
  index,
  className: extra,
}: {
  row: R;
  columns: DataColumn<R>[];
  href?: string;
  style: React.CSSProperties;
  index: number;
  className?: string;
}) {
  const title = columns.find((c) => c.phone === "title");
  const subtitle = columns.find((c) => c.phone === "subtitle");
  const badges = columns.filter((c) => c.phone === "badge");
  const meta = columns.filter((c) => c.phone === "meta");
  const content = (
    <div className="flex h-full flex-col justify-center gap-0.5 px-4">
      <div className="flex min-w-0 items-center gap-2">
        {/* Titre en texte simple : sur la carte, les marqueurs (urgence…) sont portés par le badge. */}
        <p className="min-w-0 flex-1 truncate font-medium">{title ? displayText(title, row) : ""}</p>
        {badges.map((b) => (b.cell ? <span key={b.id} className="shrink-0">{b.cell(row)}</span> : null))}
      </div>
      {subtitle ? <p className="truncate text-sm text-slate-600">{displayText(subtitle, row)}</p> : null}
      {meta.length > 0 ? (
        <p className="truncate text-xs text-slate-500">
          {meta.map((c) => displayText(c, row)).filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
  const className = cn("block border-b border-slate-200 bg-white active:bg-slate-50", extra);
  return href ? (
    <Link href={href} role="row" aria-rowindex={index + 1} style={style} className={className}>
      {content}
    </Link>
  ) : (
    <div role="row" aria-rowindex={index + 1} style={style} className={className}>
      {content}
    </div>
  );
}

function HeaderCell<R>({
  column,
  sort,
  onSort,
  filtered,
  filterMenu,
}: {
  column: DataColumn<R>;
  sort: SortState;
  onSort: () => void;
  filtered: boolean;
  filterMenu: ReactNode;
}) {
  const sorted = sort?.id === column.id ? (sort.desc ? "descending" : "ascending") : "none";
  const numeric = column.kind === "money" || column.kind === "number";
  return (
    <div
      role="columnheader"
      aria-sort={sorted}
      className={cn("flex min-w-0 items-center gap-0.5 py-1 pr-2", numeric && "justify-end")}
    >
      <button
        type="button"
        onClick={onSort}
        className="flex min-h-9 min-w-0 items-center gap-1 rounded px-1 text-left text-xs font-bold text-slate-600 hover:text-slate-900"
      >
        <span className="truncate">{column.header}</span>
        {sorted === "ascending" ? <ArrowUp aria-hidden className="size-3.5 shrink-0" /> : null}
        {sorted === "descending" ? <ArrowDown aria-hidden className="size-3.5 shrink-0" /> : null}
      </button>
      {filterMenu ? (
        <Popover>
          <PopoverTrigger
            aria-label={`Filtrer la colonne ${column.header}`}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded hover:bg-slate-200",
              filtered ? "bg-brand-100 text-brand-700" : "text-slate-400",
            )}
          >
            <Filter aria-hidden className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent>{filterMenu}</PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function ColumnsMenu<R>({
  columns,
  visibleIds,
  onChange,
  onReset,
}: {
  columns: DataColumn<R>[];
  visibleIds: string[];
  onChange: (ids: string[]) => void;
  onReset: () => void;
}) {
  // Colonnes affichées dans leur ordre, puis les colonnes masquées.
  const ordered = [
    ...visibleIds.map((id) => columns.find((c) => c.id === id)!).filter(Boolean),
    ...columns.filter((c) => !visibleIds.includes(c.id)),
  ];

  function move(id: string, delta: number) {
    const i = visibleIds.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= visibleIds.length) return;
    const next = [...visibleIds];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300 transition-colors hover:bg-slate-50">
        <Columns3 aria-hidden className="size-4" /> Colonnes
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <ul className="max-h-[min(30rem,70dvh)] overflow-y-auto py-1">
          {ordered.map((c) => {
            const visible = visibleIds.includes(c.id);
            const index = visibleIds.indexOf(c.id);
            return (
              <li key={c.id} className="flex items-center gap-1 px-2">
                <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={visible}
                    disabled={visible && visibleIds.length === 1}
                    onChange={() => onChange(visible ? visibleIds.filter((v) => v !== c.id) : [...visibleIds, c.id])}
                  />
                  <span className="truncate">{c.header}</span>
                </label>
                {visible ? (
                  <>
                    <button
                      type="button"
                      onClick={() => move(c.id, -1)}
                      disabled={index === 0}
                      aria-label={`Monter ${c.header}`}
                      className="grid size-8 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronUp aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(c.id, 1)}
                      disabled={index === visibleIds.length - 1}
                      aria-label={`Descendre ${c.header}`}
                      className="grid size-8 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronDown aria-hidden className="size-4" />
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onReset}
          className="min-h-10 w-full border-t border-slate-100 text-sm font-medium text-brand-700 hover:bg-slate-50"
        >
          Revenir aux colonnes par défaut
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Bouton « Filtres » : filtre et tri sur n'importe quelle colonne, affichée ou non. Sur téléphone,
 * c'est le seul accès (pas d'en-têtes de colonnes).
 */
function AllColumnsFilter<R>({
  rows,
  columns,
  filters,
  setFilter,
  columnSort,
}: {
  rows: R[];
  columns: DataColumn<R>[];
  filters: Record<string, string[]>;
  setFilter: (id: string, selected: string[] | undefined) => void;
  columnSort: (column: DataColumn<R>) => ColumnSort;
}) {
  const filterable = columns.filter((c) => c.filterable !== false);
  const [columnId, setColumnId] = useState(filterable[0]?.id ?? "");
  const column = filterable.find((c) => c.id === columnId);
  const count = Object.keys(filters).length;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300 transition-colors hover:bg-slate-50">
        <Filter aria-hidden className="size-4" /> Filtres{count > 0 ? ` (${count})` : ""}
      </PopoverTrigger>
      <PopoverContent align="end">
        <label className="block p-2 text-sm">
          <span className="sr-only">Colonne à filtrer ou trier</span>
          <select
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
            className="h-11 w-full rounded-md bg-white px-2 ring-1 ring-slate-300"
          >
            {filterable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.header}
                {filters[c.id] ? " (filtré)" : ""}
              </option>
            ))}
          </select>
        </label>
        {column ? (
          <FilterMenu
            key={column.id}
            getOptions={() => filterOptions(rows, columns, column.id, filters)}
            sort={columnSort(column)}
            selected={filters[column.id]}
            onChange={(sel) => setFilter(column.id, sel)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
