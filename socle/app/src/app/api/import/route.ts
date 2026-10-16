// Nouveau dans le socle.
import { IMPORT_SCHEMAS } from "@/config/import";
import { can } from "@/domain/access";
import { parisDate } from "@/domain/dates";
import { authorize, HttpError, json, route } from "@/server/api";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { runImport, summarize } from "@/server/import/run";
import { writeReport } from "@/server/import/xlsx";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Import Excel depuis l'écran Données : champs `file`, un ou plusieurs classeurs, et `apply=1` pour
 * écrire ; sans `apply`, simulation. Réponse : résumé par onglet et rapport .xlsx des rejets, en base64.
 */
export const POST = route(async (request: Request) => {
  const user = await authorize(request, "data.import");
  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new HttpError(400, "Aucun classeur reçu.");
  if (files.some((f) => f.size > MAX_BYTES)) throw new HttpError(413, "Classeur trop lourd : 20 Mo au plus.");
  const dryRun = form.get("apply") !== "1";
  const report = await runImport(
    db,
    await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
    {
      dryRun,
      allowed: (entity) => {
        const permission = (IMPORT_SCHEMAS[entity] as { permission?: "prices.read" }).permission;
        return !permission || can(user.profile, permission);
      },
      after: async (tx, results) => {
        await audit(tx, user, {
          action: "import",
          entity: "donnees",
          summary: `Import de ${files.map((f) => f.name).join(", ")}`,
          details: { results: results.map((r) => ({ source: r.source, created: r.created, updated: r.updated, rejected: r.rejects.length })) },
        });
      },
    },
  );
  const xlsx = await writeReport(report, { dryRun, date: parisDate(new Date()) });
  return json({ dryRun, sheets: summarize(report), report: Buffer.from(xlsx).toString("base64") });
});
