import type { z } from "zod";
import type { Permission } from "@/config/access";
import { parseScaled } from "./money";

/**
 * Moteur d'import Excel : reconnaissance des onglets et des colonnes, conversion des cellules et
 * contrôles, ligne par ligne. Une ligne fautive est rejetée avec ses motifs, les autres passent.
 * Les contenus importables se déclarent dans `src/config/import.ts`.
 *
 * Origine : egm-app `src/domain/import.ts`, rendu générique : schémas d'onglets fournis par la configuration.
 */

export type Cell = string | number | boolean | Date | null;

export type FieldKind = "text" | "cents" | "rateBp" | "date" | "boolean" | "int" | "postalCode";

export type FieldSpec = {
  key: string;
  label: string;
  synonyms: readonly string[];
  required?: boolean;
  kind?: FieldKind;
  /** Valeur retenue quand la cellule est vide. */
  fallback?: string | number | boolean | null;
};

export type ImportSchema = {
  label: string;
  sheetHint: RegExp;
  /** Champ qui identifie une ligne : sert au contrôle des doublons et à la mise à jour en base. */
  key: string;
  permission?: Permission;
  fields: readonly FieldSpec[];
  schema: z.ZodType;
};

/** Minuscules, sans accents ni ponctuation : « N° de TVA » → « n de tva ». */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bn o\b|\bno\b/g, "n");
}

export type ColumnMapping = {
  /** Champ → index de colonne. */
  columns: Record<string, number>;
  /** Intitulés du fichier non reconnus, ignorés. */
  ignored: string[];
  /** Champs obligatoires sans colonne. */
  missing: string[];
};

/**
 * Associe les colonnes du fichier aux champs. `overrides`, intitulé du fichier → champ, l'emporte.
 * Une colonne ne sert qu'une fois, au premier champ qui la reconnaît.
 */
export function mapColumns(schema: ImportSchema, headers: readonly string[], overrides: Record<string, string> = {}): ColumnMapping {
  const normalized = headers.map((h) => normalizeHeader(h ?? ""));
  const forced = new Map(Object.entries(overrides).map(([header, key]) => [normalizeHeader(header), key]));
  const columns: Record<string, number> = {};
  const used = new Set<number>();
  normalized.forEach((h, i) => {
    const key = forced.get(h);
    if (key && schema.fields.some((field) => field.key === key)) {
      columns[key] = i;
      used.add(i);
    }
  });
  for (const field of schema.fields) {
    if (columns[field.key] !== undefined) continue;
    const names = [normalizeHeader(field.label), normalizeHeader(field.key), ...field.synonyms];
    const index = normalized.findIndex((h, i) => !used.has(i) && h !== "" && names.includes(h));
    if (index >= 0) {
      columns[field.key] = index;
      used.add(index);
    }
  }
  return {
    columns,
    ignored: headers.filter((h, i) => !used.has(i) && String(h ?? "").trim() !== ""),
    missing: schema.fields.filter((field) => field.required && columns[field.key] === undefined).map((field) => field.label),
  };
}

/**
 * Contenu d'un onglet : celui dont tous les champs obligatoires sont trouvés et qui reconnaît le plus
 * de colonnes ; le nom de l'onglet départage. Null si rien ne colle.
 */
export function detectEntity<K extends string>(schemas: Record<K, ImportSchema>, sheetName: string, headers: readonly string[]): K | null {
  const name = normalizeHeader(sheetName);
  let best: { entity: K; score: number } | null = null;
  for (const entity of Object.keys(schemas) as K[]) {
    const mapping = mapColumns(schemas[entity], headers);
    if (mapping.missing.length > 0) continue;
    const score = Object.keys(mapping.columns).length + (schemas[entity].sheetHint.test(name) ? 5 : 0);
    if (!best || score > best.score) best = { entity, score };
  }
  return best?.entity ?? null;
}

// --- Conversion des cellules ---------------------------------------------------------------

type Converted<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Converted<T> => ({ ok: true, value });
const fail = (error: string): Converted<never> => ({ ok: false, error });

function isBlank(cell: Cell): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/** Texte d'une cellule : un nombre entier reste sans décimales, pour les codes. */
export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number") return Number.isInteger(cell) ? String(cell) : String(cell).replace(".", ",");
  if (typeof cell === "boolean") return cell ? "oui" : "non";
  return cell.trim();
}

/** Montant en euros, nombre Excel ou texte « 1 234,56 € » → centimes. */
export function cellCents(cell: Cell): Converted<number | null> {
  if (isBlank(cell)) return ok(null);
  const cents = parseScaled(typeof cell === "number" ? String(cell) : cellText(cell), 100);
  return cents === null ? fail(`montant illisible « ${cellText(cell)} »`) : ok(cents);
}

/** Taux de TVA : 20, « 20 % », « 5,5 », ou 0,2 au format pourcentage d'Excel → points de base. */
export function cellRateBp(cell: Cell): Converted<number | null> {
  if (isBlank(cell)) return ok(null);
  if (typeof cell === "number" && cell > 0 && cell < 1) return ok(Math.round(cell * 10000));
  const bp = parseScaled(cellText(cell).replace("%", ""), 100);
  return bp === null ? fail(`taux illisible « ${cellText(cell)} »`) : ok(bp);
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Date : cellule date d'Excel, numéro de série, « JJ/MM/AAAA » ou « AAAA-MM-JJ » → AAAA-MM-JJ. */
export function cellDate(cell: Cell): Converted<string | null> {
  if (isBlank(cell)) return ok(null);
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? fail("date illisible") : ok(cell.toISOString().slice(0, 10));
  if (typeof cell === "number" && cell > 0 && cell < 100000) return ok(new Date(EXCEL_EPOCH + Math.round(cell) * 86_400_000).toISOString().slice(0, 10));
  const text = cellText(cell);
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const [y, m, d] = fr ? [fr[3], fr[2], fr[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!y) return fail(`date illisible « ${text} »`);
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(m) - 1) return fail(`date illisible « ${text} »`);
  return ok(date.toISOString().slice(0, 10));
}

/** Oui / non et leurs variantes : x, 1, vrai. Vide = non. */
export function cellBoolean(cell: Cell): Converted<boolean> {
  if (typeof cell === "boolean") return ok(cell);
  const text = normalizeHeader(cellText(cell));
  if (["", "non", "n", "no", "0", "faux", "false"].includes(text)) return ok(false);
  if (["oui", "o", "yes", "y", "x", "1", "vrai", "true"].includes(text)) return ok(true);
  return fail(`oui ou non attendu, lu « ${cellText(cell)} »`);
}

function cellInt(cell: Cell): Converted<number | null> {
  if (isBlank(cell)) return ok(null);
  const text = cellText(cell).replace(/\s/g, "");
  return /^-?\d+$/.test(text) ? ok(Number(text)) : fail(`nombre entier attendu, lu « ${cellText(cell)} »`);
}

function convert(field: FieldSpec, cell: Cell): Converted<unknown> {
  if (isBlank(cell) && field.fallback !== undefined) return ok(field.fallback);
  switch (field.kind ?? "text") {
    case "cents":
      return cellCents(cell);
    case "rateBp":
      return cellRateBp(cell);
    case "date":
      return cellDate(cell);
    case "boolean":
      return cellBoolean(cell);
    case "int":
      return cellInt(cell);
    case "postalCode": {
      const text = cellText(cell);
      return ok(text ? text.padStart(5, "0") : null);
    }
    default:
      return ok(cellText(cell));
  }
}

// --- Lignes ---------------------------------------------------------------------------------

export type Reject = { row: number; reasons: string[]; values: string };
export type ParsedSheet = { records: { row: number; record: Record<string, unknown> }[]; rejects: Reject[] };

/**
 * Convertit et contrôle les lignes d'un onglet. `rows` ne contient que les lignes de données ;
 * `firstRow` est le numéro Excel de la première, pour que le rapport cite la bonne ligne.
 */
export function parseSheet(schema: ImportSchema, mapping: ColumnMapping, rows: readonly (readonly Cell[])[], options: { firstRow: number }): ParsedSheet {
  const records: ParsedSheet["records"] = [];
  const rejects: Reject[] = [];
  const seen = new Map<string, number>();
  rows.forEach((cells, i) => {
    const row = options.firstRow + i;
    if (cells.every(isBlank)) return;
    const values = cells.map(cellText).filter(Boolean).join(" | ");
    const reasons: string[] = [];
    const candidate: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const index = mapping.columns[field.key];
      if (index === undefined) {
        if (field.fallback !== undefined) candidate[field.key] = field.fallback;
        continue;
      }
      const converted = convert(field, cells[index] ?? null);
      if (converted.ok) candidate[field.key] = converted.value;
      else reasons.push(`${field.label} : ${converted.error}`);
    }
    const parsed = schema.schema.safeParse(candidate);
    if (!parsed.success) reasons.push(...parsed.error.issues.map((issue) => `${labelOf(schema, issue.path[0])}${issue.message}`));
    if (reasons.length > 0 || !parsed.success) {
      rejects.push({ row, reasons: [...new Set(reasons)], values });
      return;
    }
    const record = parsed.data as Record<string, unknown>;
    const key = normalizeHeader(String(record[schema.key] ?? ""));
    const first = seen.get(key);
    if (first !== undefined) {
      rejects.push({ row, reasons: [`en double avec la ligne ${first}`], values });
      return;
    }
    seen.set(key, row);
    records.push({ row, record });
  });
  return { records, rejects };
}

function labelOf(schema: ImportSchema, key: PropertyKey | undefined): string {
  const field = schema.fields.find((f) => f.key === key);
  return field ? `${field.label} : ` : "";
}
