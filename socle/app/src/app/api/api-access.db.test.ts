// Nouveau dans le socle.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, type Profile } from "@/config/access";
import { hiddenFields } from "@/domain/access";
import { storeUpload } from "@/server/attachments/service";
import { saveSketch } from "@/server/attachments/sketches";
import type { CurrentUser } from "@/server/auth/session";
import { emptySketch } from "@/domain/sketch";
import { createUser, openTestDb, resetData, seedDocument, sessionCookie } from "@/test/db";
import { issueDocument, saveDraft } from "@/server/documents/service";

/**
 * Droits au champ vérifiés par l'API elle-même, route par route et profil par profil.
 * Le test découvre seul toutes les routes GET de `src/app/api` : une route ajoutée plus tard est
 * contrôlée sans rien écrire. Un profil ne doit jamais recevoir un champ que FIELD_POLICY lui interdit,
 * ni la valeur d'un prix, même en appelant l'API directement.
 */
const { client, db } = openTestDb();
afterAll(() => client.end());

const API_DIR = path.join(process.cwd(), "src", "app", "api");
const PRICE = 987_654;
const COST = 456_789;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Identifiant de test pour chaque paramètre de route, selon la ressource qui le précède. */
let ids: Record<string, string> = {};
const users: Partial<Record<Profile, CurrentUser>> = {};
const cookies: Partial<Record<Profile, string>> = {};

beforeAll(async () => {
  await resetData(db);
  for (const p of PROFILES) {
    users[p] = await createUser(db, p);
    cookies[p] = await sessionCookie(db, users[p]!.id);
  }
  const { doc, article, client: c } = await seedDocument(db);
  await saveDraft(users.gestion!, doc.id, {
    clientId: c.id,
    subject: "Objet",
    lines: [{ type: "item", articleId: article.id, code: "A", label: "Article", unit: "h", quantityMilli: 1000, unitPriceCents: PRICE, vatRateBp: 2000 }],
  });
  const photo = new Uint8Array(await (await import("sharp")).default({ create: { width: 20, height: 20, channels: 3, background: "#123456" } }).jpeg().toBuffer());
  const [attachment] = await storeUpload(users.gestion!, { type: "document", id: doc.id }, { name: "p.jpg", type: "image/jpeg", bytes: photo });
  const sketch = await saveSketch(users.gestion!, { owner: { type: "document", id: doc.id }, attachmentId: null, backgroundId: null, doc: emptySketch(100, 100), image: photo });
  const { doc: issued, client: c2 } = await seedDocument(db);
  await saveDraft(users.gestion!, issued.id, { clientId: c2.id, subject: "Émis", lines: [{ type: "item", label: "x", unit: "u", quantityMilli: 1000, unitPriceCents: PRICE, vatRateBp: 2000 }] });
  await issueDocument(users.gestion!, issued.id);
  ids = { clients: c.id, articles: article.id, documents: issued.id, attachments: attachment.id, sketches: sketch.id, fichiers: attachment.id };
});

function paramsFor(file: string): Record<string, string> {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep);
  const params: Record<string, string> = {};
  rel.forEach((segment, i) => {
    const match = /^\[(.+)\]$/.exec(segment);
    if (!match) return;
    const resource = rel[i - 1];
    if (!ids[resource]) throw new Error(`Ajouter un identifiant de test pour la ressource « ${resource} » dans api-access.db.test.ts`);
    params[match[1]] = ids[resource];
  });
  return params;
}

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out); }
  return out;
}

const forbiddenFor = (profile: Profile) => new Set(["clients", "articles", "documents", "documentLines"].flatMap((r) => hiddenFields(profile, r as "clients")));

describe("aucune route GET de l'API ne livre un champ interdit", () => {
  const files = routeFiles(API_DIR);
  it("découvre les routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const profile of PROFILES) {
    it(`profil ${profile}`, async () => {
      const forbidden = forbiddenFor(profile);
      let checked = 0;
      for (const file of files) {
        const mod = (await import(file)) as { GET?: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response> };
        if (!mod.GET) continue;
        const rel = path.relative(API_DIR, path.dirname(file));
        const url = `http://localhost/api/${rel.split(path.sep).join("/")}`;
        const response = await mod.GET(new Request(url, { headers: { cookie: cookies[profile]!, host: "localhost" } }), { params: Promise.resolve(paramsFor(file)) });
        checked += 1;
        const type = response.headers.get("content-type") ?? "";
        const body = Buffer.from(await response.arrayBuffer());
        if (type.includes("application/json")) {
          const keys = keysOf(JSON.parse(body.toString("utf8")));
          for (const k of forbidden) expect(keys.has(k), `${rel} livre ${k} au profil ${profile}`).toBe(false);
        }
        if (forbidden.has("unitPriceCents")) {
          // Ni prix, ni coût, ni montant dérivé, sous quelque forme que ce soit, PDF compris.
          expect(body.toString("latin1"), `${rel} livre un prix au profil ${profile}`).not.toMatch(new RegExp(`${PRICE}|${COST}|9 876,54|9876[.,]54`));
          expect(type.includes("application/pdf"), `${rel} livre un PDF au profil ${profile}`).toBe(false);
        }
      }
      expect(checked).toBeGreaterThanOrEqual(6);
    });
  }

  it("contrôle positif : la gestion reçoit bien les prix", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const res = await GET(new Request("http://localhost/api/articles", { headers: { cookie: cookies.gestion!, host: "localhost" } }), undefined as never);
    expect(await res.text()).toContain(String(PRICE));
  });

  it("sans session : 401 ; écriture depuis un autre site : 403", async () => {
    const { GET, POST } = await import("@/app/api/clients/route");
    expect((await GET(new Request("http://localhost/api/clients"), undefined as never)).status).toBe(401);
    const res = await POST(
      new Request("http://localhost/api/clients", { method: "POST", headers: { cookie: cookies.admin!, host: "localhost", origin: "https://ailleurs.example" }, body: "{}" }),
      undefined as never,
    );
    expect(res.status).toBe(403);
  });
});
