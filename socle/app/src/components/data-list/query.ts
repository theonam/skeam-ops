/**
 * Moteur de la liste générique : recherche, filtres combinés à cases à cocher (comme Excel) et tri.
 * Fonctions pures, testées unitairement, sans dépendance à React.
 */
export type CellValue = string | number | boolean | null | undefined;

export type QueryColumn<R> = {
  id: string;
  /** Valeur brute : sert au tri et à l'export. */
  value: (row: R) => CellValue;
  /** Texte affiché : sert à la recherche et aux valeurs de filtre. Par défaut, la valeur brute en texte. */
  text?: (row: R) => string;
  /** Valeur proposée dans le filtre, si elle diffère du texte affiché (ex. le jour d'une date et heure). */
  filterText?: (row: R) => string;
};

export type SortState = { id: string; desc: boolean } | null;

export type ListQuery<R = unknown> = {
  search: string;
  /** Pour chaque colonne filtrée, les valeurs affichées retenues. */
  filters: Record<string, string[]>;
  sort: SortState;
  /** Lignes toujours affichées en tête, quel que soit le tri (ex. demandes urgentes). */
  pinned?: (row: R) => boolean;
};

export const EMPTY_VALUE = "(vide)";

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function cellText<R>(column: QueryColumn<R>, row: R): string {
  if (column.text) return column.text(row) || EMPTY_VALUE;
  const v = column.value(row);
  if (v === null || v === undefined || v === "") return EMPTY_VALUE;
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

/** Valeur d'une cellule telle qu'elle apparaît dans le filtre de sa colonne. */
export function filterKey<R>(column: QueryColumn<R>, row: R): string {
  return column.filterText ? column.filterText(row) || EMPTY_VALUE : cellText(column, row);
}

function matchesFilters<R>(
  row: R,
  columns: QueryColumn<R>[],
  filters: Record<string, string[]>,
  skipColumnId?: string,
): boolean {
  for (const column of columns) {
    if (column.id === skipColumnId) continue;
    const selected = filters[column.id];
    if (!selected) continue;
    if (!selected.includes(filterKey(column, row))) return false;
  }
  return true;
}

function matchesSearch<R>(row: R, columns: QueryColumn<R>[], terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalize(columns.map((c) => cellText(c, row)).join(" "));
  return terms.every((t) => haystack.includes(t));
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function compare(a: CellValue, b: CellValue): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  // Les valeurs vides vont toujours à la fin, quel que soit le sens.
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/**
 * Applique recherche (tous les mots, sur les colonnes visibles), filtres (ET entre colonnes,
 * OU entre valeurs d'une même colonne) et tri. Le tri est stable : à égalité, l'ordre d'origine
 * (par exemple « urgentes d'abord ») est conservé.
 */
export function applyQuery<R>(
  rows: readonly R[],
  columns: QueryColumn<R>[],
  searchColumns: QueryColumn<R>[],
  query: ListQuery<R>,
): R[] {
  const terms = normalize(query.search).split(/\s+/).filter(Boolean);
  const result = rows.filter(
    (row) => matchesFilters(row, columns, query.filters) && matchesSearch(row, searchColumns, terms),
  );
  return pinFirst(sortRows(result, columns, query.sort), query.pinned);
}

/** Remonte en tête les lignes épinglées, sans changer l'ordre relatif des autres. */
function pinFirst<R>(rows: R[], pinned: ((row: R) => boolean) | undefined): R[] {
  if (!pinned) return rows;
  const first: R[] = [];
  const rest: R[] = [];
  for (const row of rows) (pinned(row) ? first : rest).push(row);
  return first.length === 0 ? rows : [...first, ...rest];
}

function sortRows<R>(result: R[], columns: QueryColumn<R>[], sort: SortState): R[] {
  if (!sort) return result;
  const column = columns.find((c) => c.id === sort.id);
  if (!column) return result;
  const dir = sort.desc ? -1 : 1;
  return result
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const vx = column.value(x.row);
      const vy = column.value(y.row);
      const emptyX = vx === null || vx === undefined || vx === "";
      const emptyY = vy === null || vy === undefined || vy === "";
      const base = emptyX || emptyY ? compare(vx, vy) : compare(vx, vy) * dir;
      return base !== 0 ? base : x.index - y.index;
    })
    .map((x) => x.row);
}

export type FilterOption = { value: string; count: number };

/**
 * Valeurs proposées dans le filtre d'une colonne, avec leur nombre d'occurrences, dans l'ordre de la
 * colonne (chronologique pour une date, numérique pour un montant), les vides à la fin.
 * Comme dans Excel, elles tiennent compte des filtres des AUTRES colonnes.
 */
export function filterOptions<R>(
  rows: readonly R[],
  columns: QueryColumn<R>[],
  columnId: string,
  filters: Record<string, string[]>,
): FilterOption[] {
  const column = columns.find((c) => c.id === columnId);
  if (!column) return [];
  const found = new Map<string, { count: number; raw: CellValue }>();
  for (const row of rows) {
    if (!matchesFilters(row, columns, filters, columnId)) continue;
    const text = filterKey(column, row);
    const entry = found.get(text);
    if (entry) entry.count += 1;
    else found.set(text, { count: 1, raw: column.value(row) });
  }
  return [...found.entries()]
    .sort(([textA, a], [textB, b]) => {
      if (textA === EMPTY_VALUE || textB === EMPTY_VALUE) return textA === textB ? 0 : textA === EMPTY_VALUE ? 1 : -1;
      return compare(a.raw, b.raw) || collator.compare(textA, textB);
    })
    .map(([value, { count }]) => ({ value, count }));
}

/** Ordre et visibilité des colonnes : les préférences mémorisées, complétées des colonnes nouvelles. */
export function resolveVisibleColumns(
  allIds: string[],
  defaultIds: string[],
  saved: string[] | undefined,
): string[] {
  if (!saved) return defaultIds;
  const known = saved.filter((id) => allIds.includes(id));
  return known.length > 0 ? known : defaultIds;
}
