import { authorize, json, route } from "@/server/api";
import { listAudit } from "@/server/audit";

/** Journal d'audit, réservé au profil qui a le droit de le lire. */
export const GET = route(async (request: Request) => {
  await authorize(request, "audit.read");
  return json({ entries: await listAudit(1000) });
});
