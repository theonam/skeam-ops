import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { isDisplayableImage, MAX_ATTACHMENT_BYTES } from "@/domain/attachments";
import { parisDate } from "@/domain/dates";
import { sketchDocSchema, SKETCH_FORMAT_VERSION, type SketchDoc } from "@/domain/sketch";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { attachments, sketches } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { storage } from "@/server/storage";
import { describeImage } from "./images";
import {
  AttachmentError,
  findWithOwner,
  OWNERS,
  requireOwnerAccess,
  selectViews,
  type AttachmentOwner,
  type AttachmentView,
} from "./service";

/**
 * Croquis : une image (pièce jointe de nature « croquis », visible partout comme une photo) et ses données
 * vectorielles (table `sketches`), qui permettent de le rouvrir et de le modifier trait par trait.
 * L'image est dessinée par le navigateur, à la taille réelle du fond.
 * Origine : egm-app `src/server/attachments/sketches.ts`.
 */

export type SketchForEditing = {
  attachmentId: string;
  owner: AttachmentOwner;
  doc: SketchDoc;
  backgroundId: string | null;
};

function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Vérifie que le fond est une photo affichable de la même fiche. */
async function checkBackground(owner: AttachmentOwner, backgroundId: string | null) {
  if (!backgroundId) return;
  const background = await findWithOwner(backgroundId);
  if (
    !background ||
    background.owner.type !== owner.type ||
    background.owner.id !== owner.id ||
    background.kind !== "photo" ||
    !isDisplayableImage(background.mimeType)
  ) {
    throw new AttachmentError("La photo de fond n'appartient pas à cette fiche.", 400);
  }
}

/**
 * Enregistre un croquis : nouveau si `attachmentId` est absent, sinon remplace l'image et les données
 * du croquis existant (l'ancienne image est supprimée du stockage).
 */
export async function saveSketch(
  user: CurrentUser,
  input: {
    owner: AttachmentOwner;
    attachmentId: string | null;
    backgroundId: string | null;
    doc: unknown;
    image: Uint8Array;
  },
): Promise<AttachmentView> {
  const parsed = sketchDocSchema.safeParse(input.doc);
  if (!parsed.success) throw new AttachmentError("Croquis illisible.", 400);
  const doc = parsed.data;
  const mimeType = imageType(input.image);
  if (!mimeType || input.image.byteLength > MAX_ATTACHMENT_BYTES) throw new AttachmentError("Image du croquis invalide.", 400);

  let existing: Awaited<ReturnType<typeof findWithOwner>> = null;
  if (input.attachmentId) {
    existing = await findWithOwner(input.attachmentId);
    if (!existing || existing.kind !== "sketch") throw new AttachmentError("Croquis introuvable.", 404);
    await requireOwnerAccess(user, existing.owner, "write");
  } else {
    await requireOwnerAccess(user, input.owner, "add");
  }
  const owner = existing?.owner ?? input.owner;
  await checkBackground(owner, input.backgroundId);

  const image = await describeImage(input.image);
  const id = existing?.id ?? randomUUID();
  // Nouvelle clé à chaque version : le navigateur n'affiche jamais une ancienne image gardée en cache.
  const base = `${OWNERS[owner.type].keyPrefix}/${owner.id}/${id}-${Date.now()}`;
  const storageKey = `${base}.${mimeType === "image/png" ? "png" : "jpg"}`;
  const thumbnailKey = image ? `${base}-thumb.jpg` : null;
  await storage().put(storageKey, input.image, mimeType);
  if (image && thumbnailKey) await storage().put(thumbnailKey, image.thumbnail, "image/jpeg");

  const fileFields = {
    storageKey,
    thumbnailStorageKey: thumbnailKey,
    mimeType,
    sizeBytes: input.image.byteLength,
    sha256: createHash("sha256").update(input.image).digest("hex"),
    width: image?.width ?? doc.width,
    height: image?.height ?? doc.height,
  };
  try {
    await db.transaction(async (tx) => {
      if (existing) {
        await tx.update(attachments).set({ ...fileFields, updatedAt: new Date() }).where(eq(attachments.id, id));
        await tx
          .update(sketches)
          .set({ vectorData: doc, width: doc.width, height: doc.height, backgroundAttachmentId: input.backgroundId, updatedById: user.id, formatVersion: SKETCH_FORMAT_VERSION })
          .where(eq(sketches.attachmentId, id));
      } else {
        await tx.insert(attachments).values({
          id,
          [OWNERS[owner.type].field]: owner.id,
          kind: "sketch",
          originalFilename: `croquis-${parisDate(new Date())}.${mimeType === "image/png" ? "png" : "jpg"}`,
          uploadedById: user.id,
          ...fileFields,
        });
        await tx.insert(sketches).values({
          attachmentId: id,
          backgroundAttachmentId: input.backgroundId,
          width: doc.width,
          height: doc.height,
          vectorData: doc,
          formatVersion: SKETCH_FORMAT_VERSION,
          updatedById: user.id,
        });
      }
      await audit(tx, user, { action: existing ? "modification_croquis" : "ajout_croquis", entity: owner.type, entityId: owner.id, summary: "Croquis", details: { attachmentId: id } });
    });
  } catch (error) {
    await Promise.allSettled([storageKey, thumbnailKey].filter((k): k is string => Boolean(k)).map((k) => storage().delete(k)));
    throw error;
  }
  if (existing) {
    await Promise.allSettled([existing.storageKey, existing.thumbnailKey].filter((k): k is string => Boolean(k)).map((k) => storage().delete(k)));
  }
  const [view] = await selectViews(eq(attachments.id, id));
  return view;
}

/** Données d'un croquis pour le rouvrir dans l'éditeur. Null s'il n'existe pas ou n'est pas lisible. */
export async function sketchForEditing(user: CurrentUser, attachmentId: string): Promise<SketchForEditing | null> {
  const row = await findWithOwner(attachmentId);
  if (!row || row.kind !== "sketch") return null;
  try {
    await requireOwnerAccess(user, row.owner, "read");
  } catch {
    return null;
  }
  const [sketch] = await db
    .select({ vectorData: sketches.vectorData, backgroundId: sketches.backgroundAttachmentId })
    .from(sketches)
    .where(and(eq(sketches.attachmentId, attachmentId)));
  if (!sketch) return null;
  const doc = sketchDocSchema.safeParse(sketch.vectorData);
  if (!doc.success) return null;
  return { attachmentId, owner: row.owner, doc: doc.data, backgroundId: sketch.backgroundId };
}
