import type { NextRequest } from "next/server";
import { z } from "zod";
import { userFromRequest } from "@/server/auth/session";
import { AttachmentError, ownerSchema } from "@/server/attachments/service";
import { saveSketch } from "@/server/attachments/sketches";

// Origine : egm-app `src/app/api/sketches/route.ts`.
/**
 * Enregistre un croquis : champs ownerType, ownerId, doc (JSON des formes), image (PNG ou JPEG dessiné
 * par le navigateur), et en option attachmentId (réédition) et backgroundId (photo de fond).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Session expirée : reconnectez-vous." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envoi illisible." }, { status: 400 });
  }
  const owner = ownerSchema.safeParse({ type: form.get("ownerType"), id: form.get("ownerId") });
  const optionalId = z.uuid().nullable();
  const attachmentId = optionalId.safeParse(form.get("attachmentId") || null);
  const backgroundId = optionalId.safeParse(form.get("backgroundId") || null);
  const image = form.get("image");
  let doc: unknown;
  try {
    doc = JSON.parse(String(form.get("doc") ?? ""));
  } catch {
    doc = null;
  }
  if (!owner.success || !attachmentId.success || !backgroundId.success || !(image instanceof File) || !doc) {
    return Response.json({ error: "Envoi incomplet." }, { status: 400 });
  }

  try {
    const attachment = await saveSketch(user, {
      owner: owner.data,
      attachmentId: attachmentId.data,
      backgroundId: backgroundId.data,
      doc,
      image: new Uint8Array(await image.arrayBuffer()),
    });
    return Response.json({ attachment });
  } catch (error) {
    if (error instanceof AttachmentError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Enregistrement du croquis en échec", error);
    return Response.json({ error: "Enregistrement impossible, réessayez." }, { status: 500 });
  }
}
