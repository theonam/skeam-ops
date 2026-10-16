import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/domain/access";
import { checkFile, isDisplayableImage, safeFilename, type AttachmentKind } from "@/domain/attachments";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { attachments, clients, documents, sketches, users } from "@/server/db/schema";
import { storage, type StoredObject } from "@/server/storage";
import { describeImage } from "./images";
import { readMail, type EmailMeta } from "./mail";

/**
 * Pièces jointes des fiches : envoi, liste, ouverture, suppression.
 * Les droits sont ceux de la fiche propriétaire : lire la fiche, c'est voir ses photos.
 * Origine : egm-app `src/server/attachments/service.ts`, propriétaires génériques document et client,
 * trace dans le journal d'audit.
 */

export const OWNER_TYPES = ["document", "client"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
export const ownerSchema = z.object({ type: z.enum(OWNER_TYPES), id: z.uuid() });
export type AttachmentOwner = z.infer<typeof ownerSchema>;

/** « add » : ajouter des photos et croquis, sans rien supprimer ni modifier. */
type OwnerAccess = "none" | "read" | "add" | "write";

function accessFor(user: CurrentUser, readPermission: "documents.read" | "clients.read"): OwnerAccess {
  if (!can(user.profile, readPermission)) return "none";
  if (can(user.profile, "attachments.write")) return "write";
  if (can(user.profile, "attachments.add")) return "add";
  return "read";
}

export const OWNERS: Record<OwnerType, { field: "documentId" | "clientId"; keyPrefix: string; access: (user: CurrentUser, id: string) => Promise<OwnerAccess> }> = {
  document: {
    field: "documentId",
    keyPrefix: "documents",
    access: async (user, id) => {
      const [row] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
      return row ? accessFor(user, "documents.read") : "none";
    },
  },
  client: {
    field: "clientId",
    keyPrefix: "clients",
    access: async (user, id) => {
      const [row] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id));
      return row ? accessFor(user, "clients.read") : "none";
    },
  },
};

export class AttachmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

export type AttachmentView = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  /** Le navigateur sait afficher l'original (JPEG, PNG…). */
  displayable: boolean;
  parentId: string | null;
  isOriginEmail: boolean;
  email: EmailMeta | null;
  uploadedBy: string | null;
  createdAt: string;
  /** Change à chaque modification (croquis réédité) : sert à contourner le cache du navigateur. */
  version: number;
};

export async function requireOwnerAccess(user: CurrentUser, owner: AttachmentOwner, needed: "read" | "add" | "write"): Promise<OwnerAccess> {
  const access = await OWNERS[owner.type].access(user, owner.id);
  if (access === "none") throw new AttachmentError("Fiche introuvable.", 404);
  const allowed = needed === "read" || access === "write" || (needed === "add" && access === "add");
  if (!allowed) throw new AttachmentError("Modification non autorisée.", 403);
  return access;
}

/**
 * Exclut les photos devenues le fond d'un croquis : le croquis les remplace partout (galerie, annexe),
 * elles ne restent stockées que pour pouvoir rééditer le croquis, et partent avec lui.
 */
export function notSketchBackground(): SQL {
  // Table extérieure nommée en clair : Drizzle n'écrit pas toujours le nom de table devant la colonne.
  return sql`not exists (select 1 from "sketches" where "sketches"."background_attachment_id" = "attachments"."id")`;
}

export async function selectViews(where: SQL | undefined): Promise<AttachmentView[]> {
  const rows = await db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      filename: attachments.originalFilename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      width: attachments.width,
      height: attachments.height,
      thumbnailKey: attachments.thumbnailStorageKey,
      parentId: attachments.parentAttachmentId,
      isOriginEmail: attachments.isOriginEmail,
      emailMeta: attachments.emailMeta,
      uploadedBy: users.displayName,
      createdAt: attachments.createdAt,
      updatedAt: attachments.updatedAt,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.uploadedById))
    .where(where)
    .orderBy(asc(attachments.createdAt), asc(attachments.sortOrder));
  return rows.map(({ thumbnailKey, emailMeta, createdAt, updatedAt, ...row }) => ({
    ...row,
    hasThumbnail: thumbnailKey !== null,
    displayable: isDisplayableImage(row.mimeType),
    email: (emailMeta as EmailMeta | null) ?? null,
    createdAt: createdAt.toISOString(),
    version: updatedAt.getTime(),
  }));
}

export async function listAttachments(user: CurrentUser, owner: AttachmentOwner): Promise<AttachmentView[]> {
  await requireOwnerAccess(user, owner, "read");
  return selectViews(and(eq(attachments[OWNERS[owner.type].field], owner.id), notSketchBackground()));
}

type PreparedFile = {
  row: typeof attachments.$inferInsert;
  objects: { key: string; body: Uint8Array; contentType: string }[];
};

async function prepare(
  owner: AttachmentOwner,
  file: { name: string; type: string; bytes: Uint8Array },
  extra: { parentId?: string; isOriginEmail?: boolean; takenAt?: Date | null; userId: string },
): Promise<{ prepared: PreparedFile; mailChildren: { name: string; type: string; bytes: Uint8Array }[] }> {
  const check = checkFile({ name: file.name, type: file.type, size: file.bytes.byteLength });
  if (!check.ok) throw new AttachmentError(check.reason, 400);

  const id = randomUUID();
  const base = `${OWNERS[owner.type].keyPrefix}/${owner.id}/${id}`;
  const key = `${base}.${check.extension.replace(/[^a-z0-9]/g, "") || "bin"}`;
  const objects: PreparedFile["objects"] = [{ key, body: file.bytes, contentType: check.mimeType }];
  const row: typeof attachments.$inferInsert = {
    id,
    [OWNERS[owner.type].field]: owner.id,
    kind: check.kind,
    storageKey: key,
    originalFilename: safeFilename(file.name),
    mimeType: check.mimeType,
    sizeBytes: file.bytes.byteLength,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    parentAttachmentId: extra.parentId ?? null,
    isOriginEmail: extra.isOriginEmail ?? false,
    takenAt: extra.takenAt ?? null,
    uploadedById: extra.userId,
  };
  let mailChildren: { name: string; type: string; bytes: Uint8Array }[] = [];

  if (check.kind === "photo") {
    const image = await describeImage(file.bytes);
    if (image) {
      row.width = image.width;
      row.height = image.height;
      row.thumbnailStorageKey = `${base}-thumb.jpg`;
      objects.push({ key: row.thumbnailStorageKey, body: image.thumbnail, contentType: "image/jpeg" });
    }
  } else if (check.kind === "email" && !extra.parentId) {
    const mail = await readMail(file.bytes, file.name, check.mimeType);
    if (mail) {
      row.emailMeta = mail.meta;
      mailChildren = mail.extracted.map((a) => ({ name: a.filename, type: a.mimeType, bytes: a.content }));
    }
  }
  return { prepared: { row, objects }, mailChildren };
}

/**
 * Enregistre un fichier déposé sur une fiche. Un mail apporte aussi ses photos et ses PDF,
 * rattachés au mail (supprimer le mail les supprime).
 */
export async function storeUpload(
  user: CurrentUser,
  owner: AttachmentOwner,
  file: { name: string; type: string; bytes: Uint8Array },
  options: { isOriginEmail?: boolean; takenAt?: Date | null } = {},
): Promise<AttachmentView[]> {
  const access = await requireOwnerAccess(user, owner, "add");
  // Sans droit de modifier les pièces jointes : des photos seulement.
  if (access === "add") {
    const check = checkFile({ name: file.name, type: file.type, size: file.bytes.byteLength });
    if (check.ok && check.kind !== "photo") throw new AttachmentError("Seules les photos peuvent être ajoutées ici.", 403);
  }

  const main = await prepare(owner, file, { ...options, userId: user.id });
  const all: PreparedFile[] = [main.prepared];
  for (const child of main.mailChildren) {
    try {
      const { prepared } = await prepare(owner, child, { parentId: main.prepared.row.id, userId: user.id });
      all.push(prepared);
    } catch {
      // Une pièce jointe illisible ou refusée n'empêche pas d'enregistrer le mail.
    }
  }

  const written: string[] = [];
  try {
    for (const { objects } of all) {
      for (const object of objects) {
        await storage().put(object.key, object.body, object.contentType);
        written.push(object.key);
      }
    }
    await db.transaction(async (tx) => {
      await tx.insert(attachments).values(all.map((p) => p.row));
      await audit(tx, user, { action: "ajout_fichier", entity: owner.type, entityId: owner.id, summary: safeFilename(file.name), details: { attachmentId: main.prepared.row.id } });
    });
  } catch (error) {
    await Promise.allSettled(written.map((key) => storage().delete(key)));
    throw error;
  }
  return selectViews(inArray(attachments.id, all.map((p) => p.row.id!)));
}

export async function findWithOwner(id: string) {
  const [row] = await db
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      thumbnailKey: attachments.thumbnailStorageKey,
      filename: attachments.originalFilename,
      mimeType: attachments.mimeType,
      kind: attachments.kind,
      documentId: attachments.documentId,
      clientId: attachments.clientId,
    })
    .from(attachments)
    .where(eq(attachments.id, id));
  if (!row) return null;
  const owner: AttachmentOwner | null = row.documentId
    ? { type: "document", id: row.documentId }
    : row.clientId
      ? { type: "client", id: row.clientId }
      : null;
  return owner ? { ...row, owner } : null;
}

/** Ouvre le fichier (ou sa vignette) si l'utilisateur peut lire la fiche. Null sinon, sans dire pourquoi. */
export async function openAttachment(
  user: CurrentUser,
  id: string,
  variant: "original" | "thumbnail",
): Promise<{ object: StoredObject; filename: string; mimeType: string } | null> {
  const row = await findWithOwner(id);
  if (!row) return null;
  try {
    await requireOwnerAccess(user, row.owner, "read");
  } catch {
    return null;
  }
  const key = variant === "thumbnail" ? row.thumbnailKey : row.storageKey;
  if (!key) return null;
  const object = await storage().get(key);
  if (!object) return null;
  return {
    object,
    filename: variant === "thumbnail" ? `vignette-${row.filename}.jpg` : row.filename,
    mimeType: variant === "thumbnail" ? "image/jpeg" : row.mimeType,
  };
}

/**
 * Supprime une pièce jointe et celles qu'elle contient (photos d'un mail ; photo de fond d'un croquis),
 * en base puis dans le stockage.
 */
export async function deleteAttachment(user: CurrentUser, id: string): Promise<void> {
  const row = await findWithOwner(id);
  if (!row) throw new AttachmentError("Pièce jointe introuvable.", 404);
  await requireOwnerAccess(user, row.owner, "write");
  // Le fond d'un croquis n'est visible nulle part ailleurs : il part avec lui (sauf s'il sert encore à un autre croquis).
  const backgrounds = await db
    .select({ id: sketches.backgroundAttachmentId })
    .from(sketches)
    .where(eq(sketches.attachmentId, id));
  let backgroundIds = backgrounds.map((b) => b.id).filter((b): b is string => b !== null);
  if (backgroundIds.length > 0) {
    const shared = await db
      .select({ id: sketches.backgroundAttachmentId })
      .from(sketches)
      .where(and(inArray(sketches.backgroundAttachmentId, backgroundIds), sql`${sketches.attachmentId} <> ${id}`));
    backgroundIds = backgroundIds.filter((b) => !shared.some((s) => s.id === b));
  }
  const ids = [id, ...backgroundIds];
  const family = await db
    .select({ storageKey: attachments.storageKey, thumbnailKey: attachments.thumbnailStorageKey })
    .from(attachments)
    .where(or(inArray(attachments.id, ids), eq(attachments.parentAttachmentId, id)));
  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, id));
    if (backgroundIds.length > 0) await tx.delete(attachments).where(inArray(attachments.id, backgroundIds));
    await audit(tx, user, { action: "suppression_fichier", entity: row.owner.type, entityId: row.owner.id, summary: row.filename, details: { attachmentId: id } });
  });
  const keys = family.flatMap((f) => [f.storageKey, f.thumbnailKey]).filter((k): k is string => Boolean(k));
  await Promise.allSettled(keys.map((key) => storage().delete(key)));
}
