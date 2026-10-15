import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { can, redact, visibleColumns } from "@/domain/access";
import { HttpError } from "@/server/api";
import { audit, changes } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { articles, clients } from "@/server/db/schema";
import { articleInput, clientInput } from "@/domain/referentials";

/**
 * Référentiels génériques : clients et articles. Les lectures ne sélectionnent que les colonnes que
 * le profil a le droit de voir (modèle d'egm-app `src/server/referentials/queries.ts`), d'après la
 * politique déclarée dans `src/config/access.ts`.
 */

const clientColumns = {
  id: clients.id,
  code: clients.code,
  name: clients.name,
  email: clients.email,
  phone: clients.phone,
  line1: clients.line1,
  postalCode: clients.postalCode,
  city: clients.city,
  siret: clients.siret,
  internalNotes: clients.internalNotes,
};

export type ClientRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  line1: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  internalNotes?: string | null;
};

export async function listClients(user: CurrentUser): Promise<ClientRow[]> {
  if (!can(user.profile, "clients.read")) throw new HttpError(403, "Accès non autorisé.");
  const rows = await db.select(visibleColumns(user.profile, "clients", clientColumns)).from(clients).orderBy(asc(clients.name));
  return rows.map((r) => redact(user.profile, "clients", r) as ClientRow);
}

export async function getClient(user: CurrentUser, id: string): Promise<ClientRow | null> {
  if (!can(user.profile, "clients.read") || !z.uuid().safeParse(id).success) return null;
  const [row] = await db.select(visibleColumns(user.profile, "clients", clientColumns)).from(clients).where(eq(clients.id, id));
  return row ? (redact(user.profile, "clients", row) as ClientRow) : null;
}

export async function saveClient(user: CurrentUser, id: string | null, raw: unknown): Promise<{ id: string }> {
  if (!can(user.profile, "clients.write")) throw new HttpError(403, "Modification non autorisée pour votre profil.");
  const input = clientInput.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(clients).where(eq(clients.id, id)).for("update");
        if (!before) throw new HttpError(404, "Client introuvable.");
        await tx.update(clients).set(input).where(eq(clients.id, id));
        await audit(tx, user, { action: "modification", entity: "client", entityId: id, summary: input.name, details: changes(before, input) });
        return { id };
      }
      const [row] = await tx.insert(clients).values(input).returning({ id: clients.id });
      await audit(tx, user, { action: "creation", entity: "client", entityId: row.id, summary: input.name });
      return row;
    });
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new HttpError(409, `Le code ${input.code} existe déjà.`);
    throw error;
  }
}

const articleColumns = {
  id: articles.id,
  code: articles.code,
  label: articles.label,
  category: articles.category,
  unit: articles.unit,
  unitPriceCents: articles.unitPriceCents,
  costCents: articles.costCents,
  vatRateBp: articles.vatRateBp,
  isActive: articles.isActive,
};

export type ArticleRow = {
  id: string;
  code: string;
  label: string;
  category: string | null;
  unit: string;
  unitPriceCents?: number;
  costCents?: number | null;
  vatRateBp: number;
  isActive: boolean;
};

export async function listArticles(user: CurrentUser): Promise<ArticleRow[]> {
  if (!can(user.profile, "articles.read")) throw new HttpError(403, "Accès non autorisé.");
  const rows = await db.select(visibleColumns(user.profile, "articles", articleColumns)).from(articles).orderBy(asc(articles.code));
  return rows.map((r) => redact(user.profile, "articles", r) as ArticleRow);
}

export async function saveArticle(user: CurrentUser, id: string | null, raw: unknown): Promise<{ id: string }> {
  if (!can(user.profile, "articles.write") || !can(user.profile, "prices.read")) throw new HttpError(403, "Modification non autorisée pour votre profil.");
  const input = articleInput.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(articles).where(eq(articles.id, id)).for("update");
        if (!before) throw new HttpError(404, "Article introuvable.");
        await tx.update(articles).set(input).where(eq(articles.id, id));
        await audit(tx, user, { action: "modification", entity: "article", entityId: id, summary: input.label, details: changes(before, input) });
        return { id };
      }
      const [row] = await tx.insert(articles).values(input).returning({ id: articles.id });
      await audit(tx, user, { action: "creation", entity: "article", entityId: row.id, summary: input.label });
      return row;
    });
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new HttpError(409, `Le code ${input.code} existe déjà.`);
    throw error;
  }
}
