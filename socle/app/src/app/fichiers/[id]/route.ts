import type { NextRequest } from "next/server";
import { z } from "zod";
import { userFromRequest } from "@/server/auth/session";
import { openAttachment } from "@/server/attachments/service";

const NOT_FOUND = () => new Response("Fichier introuvable.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Origine : egm-app `src/app/fichiers/[id]/route.ts`.
/**
 * Ouvre une pièce jointe : `/fichiers/<id>` (original), `?vignette` (petite image), `?telecharger` (enregistrer).
 * Le fichier passe par l'application, qui vérifie que l'utilisateur peut lire la fiche.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/fichiers/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NOT_FOUND();
  const user = await userFromRequest(request);
  if (!user) return NOT_FOUND();

  const params = request.nextUrl.searchParams;
  const file = await openAttachment(user, id, params.has("vignette") ? "thumbnail" : "original");
  if (!file) return NOT_FOUND();

  const disposition = params.has("telecharger") ? "attachment" : "inline";
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(file.object.body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.object.size),
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // Un fichier enregistré ne change jamais : le navigateur peut le garder, pour cet utilisateur seulement.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
