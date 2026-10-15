// Origine : egm-app `src/server/storage/local.ts`.
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertValidKey, type FileStorage, type StoredObject } from "./storage";

/** Stockage dans un dossier du disque. Pour le développement et les tests uniquement. */
export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private pathOf(key: string): string {
    assertValidKey(key);
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.pathOf(key);
    try {
      const { size } = await stat(file);
      return { body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const entries = await readdir(this.root, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.isFile())
      .map((e) => path.relative(this.root, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
      .filter((key) => key.startsWith(prefix))
      .sort();
  }
}
