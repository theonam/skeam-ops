// Origine : egm-app `src/server/attachments/images.ts`.
import "server-only";
import sharp from "sharp";
import { THUMBNAIL_MAX_SIDE } from "@/domain/attachments";

export type ImageInfo = {
  /** Dimensions affichées (après prise en compte de l'orientation de l'appareil photo). */
  width: number;
  height: number;
  thumbnail: Uint8Array;
};

/**
 * Lit les dimensions d'une photo et fabrique sa vignette JPEG, tournée dans le bon sens.
 * Renvoie null si le format n'est pas lisible ici (ex. HEIC d'iPhone) : la photo reste enregistrée, sans vignette.
 */
export async function describeImage(bytes: Uint8Array): Promise<ImageInfo | null> {
  try {
    const image = sharp(bytes, { failOn: "none" });
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return null;
    const thumbnail = await image
      .autoOrient()
      .resize({ width: THUMBNAIL_MAX_SIDE, height: THUMBNAIL_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    return { width, height, thumbnail: new Uint8Array(thumbnail) };
  } catch {
    return null;
  }
}
