import { authorize, json, route } from "@/server/api";
import { cancelDocument } from "@/server/documents/service";

/** Annulation d'un document émis, avec motif. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await authorize(request, "documents.issue");
  await cancelDocument(user, (await ctx.params).id, await request.json());
  return json({ ok: true });
});
