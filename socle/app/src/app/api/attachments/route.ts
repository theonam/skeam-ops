import type { NextRequest } from "next/server";
import { userFromRequest } from "@/server/auth/session";
import { AttachmentError, ownerSchema, storeUpload } from "@/server/attachments/service";

// Origine : egm-app `src/app/api/attachments/route.ts`.
/**
 * Envoi d'un fichier sur une fiche (un fichier par requête, pour suivre la progression de chacun).
 * Champs : ownerType, ownerId, file, et en option takenAt (millisecondes) et originEmail=1.
 */
export async function POST(request: NextRequest) {
  // Défense contre l'envoi depuis un autre site, en plus du cookie SameSite=Lax.
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
  const file = form.get("file");
  if (!owner.success || !(file instanceof File)) {
    return Response.json({ error: "Envoi incomplet." }, { status: 400 });
  }
  const takenAtMs = Number(form.get("takenAt"));
  const takenAt = Number.isFinite(takenAtMs) && takenAtMs > 0 ? new Date(takenAtMs) : null;

  try {
    const attachments = await storeUpload(
      user,
      owner.data,
      { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
      { takenAt, isOriginEmail: form.get("originEmail") === "1" },
    );
    return Response.json({ attachments });
  } catch (error) {
    if (error instanceof AttachmentError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Envoi de pièce jointe en échec", error);
    return Response.json({ error: "Enregistrement impossible, réessayez." }, { status: 500 });
  }
}
