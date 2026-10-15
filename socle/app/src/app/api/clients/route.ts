import { authorize, json, route } from "@/server/api";
import { listClients, saveClient } from "@/server/referentials/service";

/** Clients : liste, création. Les champs protégés sont retirés selon le profil (src/config/access.ts). */
export const GET = route(async (request: Request) => {
  const user = await authorize(request, "clients.read");
  return json({ clients: await listClients(user) });
});

export const POST = route(async (request: Request) => {
  const user = await authorize(request, "clients.write");
  return json(await saveClient(user, null, await request.json()), 201);
});
