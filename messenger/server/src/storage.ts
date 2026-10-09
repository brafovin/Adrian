import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Config } from './config.js';

export interface ByteRange {
  start: number;
  end: number;
}
export interface Storage {
  /** Verschiebt/lädt eine lokale Datei unter `key`. */
  putFile(key: string, localPath: string, mime: string): Promise<void>;
  putBuffer(key: string, data: Buffer, mime: string): Promise<void>;
  read(key: string, range?: ByteRange): Promise<Readable>;
  delete(key: string): Promise<void>;
}

function safeJoin(root: string, key: string): string {
  const full = path.resolve(root, key);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('ungültiger Speicherschlüssel');
  return full;
}

export class LocalStorage implements Storage {
  constructor(private root: string) {}
  async putFile(key: string, localPath: string): Promise<void> {
    const dest = safeJoin(this.root, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(localPath, dest).catch(async (e) => {
      if (e.code !== 'EXDEV') throw e;
      await new Promise<void>((res, rej) => {
        createReadStream(localPath).pipe(createWriteStream(dest)).on('finish', res).on('error', rej);
      });
      await rm(localPath, { force: true });
    });
  }
  async putBuffer(key: string, data: Buffer): Promise<void> {
    const dest = safeJoin(this.root, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await new Promise<void>((res, rej) => {
      const ws = createWriteStream(dest);
      ws.on('finish', res).on('error', rej);
      ws.end(data);
    });
  }
  async read(key: string, range?: ByteRange): Promise<Readable> {
    const p = safeJoin(this.root, key);
    await stat(p);
    return createReadStream(p, range);
  }
  async delete(key: string): Promise<void> {
    await rm(safeJoin(this.root, key), { force: true });
  }
}

/** S3-kompatibel (AWS S3, Cloudflare R2, MinIO, Hetzner …). */
export class S3Storage implements Storage {
  private clientP: Promise<{ client: import('@aws-sdk/client-s3').S3Client; sdk: typeof import('@aws-sdk/client-s3') }>;
  constructor(private cfg: Config) {
    this.clientP = import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: cfg.S3_REGION,
        endpoint: cfg.S3_ENDPOINT,
        forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
        credentials:
          cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
            ? { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY }
            : undefined,
      }),
    }));
  }
  async putFile(key: string, localPath: string, mime: string): Promise<void> {
    const { client, sdk } = await this.clientP;
    const size = (await stat(localPath)).size;
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.cfg.S3_BUCKET,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
        ContentType: mime,
      }),
    );
    await rm(localPath, { force: true });
  }
  async putBuffer(key: string, data: Buffer, mime: string): Promise<void> {
    const { client, sdk } = await this.clientP;
    await client.send(new sdk.PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key, Body: data, ContentType: mime }));
  }
  async read(key: string, range?: ByteRange): Promise<Readable> {
    const { client, sdk } = await this.clientP;
    const out = await client.send(
      new sdk.GetObjectCommand({
        Bucket: this.cfg.S3_BUCKET,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    return out.Body as Readable;
  }
  async delete(key: string): Promise<void> {
    const { client, sdk } = await this.clientP;
    await client.send(new sdk.DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }));
  }
}

export function createStorage(cfg: Config): Storage {
  if (cfg.STORAGE_DRIVER === 's3') {
    if (!cfg.S3_BUCKET) throw new Error('S3_BUCKET fehlt');
    return new S3Storage(cfg);
  }
  return new LocalStorage(cfg.STORAGE_DIR);
}
