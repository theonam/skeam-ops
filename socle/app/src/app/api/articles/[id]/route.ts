// Nouveau dans le socle.
import { authorize, json, route } from "@/server/api";
import { saveArticle } from "@/server/referentials/service";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "articles.write");
  return json(await saveArticle(user, (await ctx.params).id, await request.json()));
});
