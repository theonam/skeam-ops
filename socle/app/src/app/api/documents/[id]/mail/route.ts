import { authorize, HttpError, json, route } from "@/server/api";
import { emailTemplate, prepareDocumentEmail } from "@/server/documents/output";

type Ctx = { params: Promise<{ id: string }> };

/** Modèle de mail proposé : destinataire, objet, message. */
export const GET = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.write");
  const template = await emailTemplate(user, (await ctx.params).id);
  if (!template) throw new HttpError(404, "Document introuvable.");
  return json(template);
});

/** Brouillon Outlook, PDF archivé joint : le navigateur l'enregistre, Outlook l'ouvre prêt à envoyer. */
export const POST = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.write");
  return json(await prepareDocumentEmail(user, (await ctx.params).id, await request.json()));
});
