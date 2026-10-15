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

/**
 * Brouillon Outlook, PDF archivé joint : renvoyé comme un fichier .eml que le navigateur enregistre et
 * qu'Outlook ouvre prêt à envoyer. Le nouvel état du document est dans l'en-tête X-Document-Status.
 * Origine : egm-app `src/app/api/invoices/[id]/email/route.ts`.
 */
export const POST = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "documents.write");
  const { download, status } = await prepareDocumentEmail(user, (await ctx.params).id, await request.json());
  const ascii = download.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(download.content, {
    headers: {
      "Content-Type": download.contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Document-Status": status,
    },
  });
});
