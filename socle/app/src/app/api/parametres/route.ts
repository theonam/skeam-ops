// Nouveau dans le socle.
import { authorize, json, route } from "@/server/api";
import { getSettings, updateSettings } from "@/server/settings";

/** Paramètres de l'entreprise : en-tête, mentions, IBAN, gabarits de mail. */
export const GET = route(async (request: Request) => {
  await authorize(request, "settings.write");
  return json(await getSettings());
});

export const PUT = route(async (request: Request) => {
  const user = await authorize(request, "settings.write");
  await updateSettings(user, await request.json());
  return json({ ok: true });
});
