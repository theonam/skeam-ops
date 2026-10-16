// Nouveau dans le socle.
import { authorize, HttpError, json, route } from "@/server/api";
import { AttachmentError, deleteAttachment } from "@/server/attachments/service";

/** Supprime une pièce jointe, et celles qu'elle contient. Droits de la fiche propriétaire. */
export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await authorize(request);
  try {
    await deleteAttachment(user, (await ctx.params).id);
  } catch (error) {
    if (error instanceof AttachmentError) throw new HttpError(error.status, error.message);
    throw error;
  }
  return json({ ok: true });
});
