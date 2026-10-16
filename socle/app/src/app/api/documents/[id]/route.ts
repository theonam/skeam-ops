// Nouveau dans le socle.
import { authorize, HttpError, json, route } from "@/server/api";
import { deleteDraft, getDocument, saveDraft } from "@/server/documents/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.read");
  const document = await getDocument(user, (await ctx.params).id);
  if (!document) throw new HttpError(404, "Document introuvable.");
  return json({ document });
});

/** Enregistre le brouillon : en-tête et lignes, totaux recalculés par le serveur. */
export const PUT = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.write");
  return json({ document: await saveDraft(user, (await ctx.params).id, await request.json()) });
});

export const DELETE = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.write");
  await deleteDraft(user, (await ctx.params).id);
  return json({ ok: true });
});
