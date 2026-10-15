import { authorize, HttpError, route } from "@/server/api";
import { documentPdf } from "@/server/documents/output";

/**
 * PDF du document : `?telecharger` pour l'enregistrer. Un profil sans droit sur les prix reçoit 404,
 * comme si le document n'existait pas.
 * Origine : egm-app `src/app/(app)/factures/[id]/pdf/route.ts`.
 */
export const GET = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await authorize(request, "documents.read");
  const rendered = await documentPdf(user, (await ctx.params).id);
  if (!rendered) throw new HttpError(404, "Document introuvable.");
  const disposition = new URL(request.url).searchParams.has("telecharger") ? "attachment" : "inline";
  const ascii = rendered.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(Buffer.from(rendered.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(rendered.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
