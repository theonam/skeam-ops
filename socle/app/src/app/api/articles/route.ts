import { authorize, json, route } from "@/server/api";
import { listArticles, saveArticle } from "@/server/referentials/service";

/** Articles : liste, création. Prix et coût retirés pour un profil sans droit sur les prix. */
export const GET = route(async (request: Request) => {
  const user = await authorize(request, "articles.read");
  return json({ articles: await listArticles(user) });
});

export const POST = route(async (request: Request) => {
  const user = await authorize(request, "articles.write");
  return json(await saveArticle(user, null, await request.json()), 201);
});
