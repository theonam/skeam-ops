import { authorize, HttpError, json, route } from "@/server/api";
import { getClient, saveClient } from "@/server/referentials/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "clients.read");
  const client = await getClient(user, (await ctx.params).id);
  if (!client) throw new HttpError(404, "Client introuvable.");
  return json({ client });
});

export const PUT = route(async (request: Request, ctx: Ctx) => {
  const user = await authorize(request, "clients.write");
  return json(await saveClient(user, (await ctx.params).id, await request.json()));
});
