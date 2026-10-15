// Nouveau dans le socle.
import { authorize, json, route } from "@/server/api";
import { issueDocument } from "@/server/documents/service";

/** Émission : numéro légal attribué, contenu figé. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await authorize(request, "documents.issue");
  return json(await issueDocument(user, (await ctx.params).id));
});
