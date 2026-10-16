// Origine : egm-app `src/server/storage/storage.test.ts`.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalFileStorage } from "./local";
import { S3FileStorage } from "./s3";
import type { FileStorage } from "./storage";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

function contract(name: string, make: () => FileStorage) {
  describe(name, () => {
    it("enregistre, relit et supprime un fichier", async () => {
      const store = make();
      const key = `tests/${crypto.randomUUID()}/note.txt`;
      await store.put(key, new TextEncoder().encode("Fuite sous évier"), "text/plain");
      const object = await store.get(key);
      expect(object?.size).toBe(new TextEncoder().encode("Fuite sous évier").byteLength);
      expect(await readAll(object!.body)).toBe("Fuite sous évier");
      await store.delete(key);
      expect(await store.get(key)).toBeNull();
    });

    it("renvoie null pour un fichier absent", async () => {
      expect(await make().get(`tests/${crypto.randomUUID()}/absent.jpg`)).toBeNull();
    });

    it("liste les clés d'un préfixe", async () => {
      const storage = make();
      await storage.put("listes/a/1.txt", new Uint8Array([1]), "text/plain");
      await storage.put("listes/b/2.txt", new Uint8Array([2]), "text/plain");
      await storage.put("autres/3.txt", new Uint8Array([3]), "text/plain");
      expect(await storage.list("listes/")).toEqual(["listes/a/1.txt", "listes/b/2.txt"]);
    });

    it("refuse une clé qui sortirait du dossier", async () => {
      await expect(make().put("../etc/passwd", new Uint8Array([1]), "text/plain")).rejects.toThrow(/invalide/);
      await expect(make().get("tests/../../x")).rejects.toThrow(/invalide/);
    });
  });
}

let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "socle-storage-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

contract("stockage local", () => new LocalFileStorage(root));

// Le pilote S3 se teste contre un émulateur (ex. `moto_server -p 9100`) : S3_TEST_ENDPOINT=http://localhost:9100.
const endpoint = process.env.S3_TEST_ENDPOINT;
describe.runIf(Boolean(endpoint))("stockage S3 (émulateur)", () => {
  const settings = {
    endpoint,
    region: "eu-west-3",
    bucket: "socle-test",
    accessKeyId: "test",
    secretAccessKey: "test",
    forcePathStyle: true,
  };
  beforeAll(async () => {
    const { CreateBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ ...settings, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    await client.send(new CreateBucketCommand({ Bucket: settings.bucket, CreateBucketConfiguration: { LocationConstraint: "eu-west-3" } })).catch(() => {});
  });
  contract("S3", () => new S3FileStorage(settings));
});
