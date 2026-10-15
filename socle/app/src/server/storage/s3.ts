// Origine : egm-app `src/server/storage/s3.ts`.
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertValidKey, type FileStorage, type StoredObject } from "./storage";

export type S3Settings = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Adresse du type https://hote/bucket/cle, attendue par la plupart des hébergeurs hors AWS. */
  forcePathStyle: boolean;
};

/** Stockage compatible S3. Le bucket reste privé : les fichiers passent par l'application, qui contrôle les droits. */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    assertValidKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }));
      if (!result.Body) return null;
      return { body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>, size: result.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.settings.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }
}
