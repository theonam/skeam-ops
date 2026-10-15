import type { NextRequest } from "next/server";
import { z } from "zod";
import { userFromRequest } from "@/server/auth/session";
import { sketchForEditing } from "@/server/attachments/sketches";

// Origine : egm-app `src/app/api/sketches/[attachmentId]/route.ts`.
/** Données vectorielles d'un croquis, pour le rouvrir dans l'éditeur. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sketches/[attachmentId]">) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Session expirée : reconnectez-vous." }, { status: 401 });
  const { attachmentId } = await ctx.params;
  const sketch = z.uuid().safeParse(attachmentId).success ? await sketchForEditing(user, attachmentId) : null;
  if (!sketch) return Response.json({ error: "Croquis introuvable." }, { status: 404 });
  return Response.json(sketch, { headers: { "Cache-Control": "no-store" } });
}
