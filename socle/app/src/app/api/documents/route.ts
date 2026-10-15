import { authorize, json, route } from "@/server/api";
import { createDraft, listDocuments } from "@/server/documents/service";

/** Documents : liste, sans aucun montant pour un profil sans droit sur les prix ; création d'un brouillon. */
export const GET = route(async (request: Request) => {
  const user = await authorize(request, "documents.read");
  return json({ documents: await listDocuments(user) });
});

export const POST = route(async (request: Request) => {
  const user = await authorize(request, "documents.write");
  return json(await createDraft(user, await request.json()), 201);
});
