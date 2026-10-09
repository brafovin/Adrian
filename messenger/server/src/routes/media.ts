import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileTypeFromFile } from 'file-type';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../lib/guard.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/opus', 'audio/flac', 'audio/vnd.wave']);
/** Dokumente, die als Anhang erlaubt sind (immer als Download ausgeliefert). */
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'md', 'json', 'zip', '7z', 'rar', 'gz', 'tar', 'epub']);
const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'js', 'mjs', 'vbs', 'ps1', 'sh', 'jar', 'apk', 'html', 'htm', 'svg', 'php', 'dll', 'lnk']);
const TEXT_EXT = new Set(['txt', 'csv', 'md', 'json']);

const PURPOSE_LIMIT_MB: Record<string, number> = { avatar: 10, group_avatar: 10, background: 15, status: 64, message: 64 };

function extOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

export function mediaFromRow(m: Record<string, any>) {
  return {
    id: m.id, kind: m.kind, mime: m.mime, size: m.size, name: m.original_name, width: m.width, height: m.height,
    durationMs: m.duration_ms, url: `/api/media/${m.id}`, thumbUrl: m.thumb_key ? `/api/media/${m.id}?thumb=1` : null,
  };
}

export async function mediaRoutes(app: FastifyInstance) {
  const { db, storage, cfg } = app.ctx;
  const tmpDir = path.join(os.tmpdir(), 'adrian-uploads');
  await mkdir(tmpDir, { recursive: true });

  app.post('/api/media', { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const userId = req.auth!.userId;
    const file = await req.file({ limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 } });
    if (!file) throw badRequest('no_file', 'Keine Datei gesendet.');
    const fields = Object.fromEntries(
      Object.entries(file.fields).map(([k, v]) => [k, (v as { value?: unknown })?.value]).filter(([, v]) => typeof v === 'string'),
    );
    const meta = parse(
      z.object({
        purpose: z.enum(['message', 'avatar', 'status', 'background', 'group_avatar']),
        asVoice: z.enum(['true', 'false']).optional(),
        durationMs: z.coerce.number().int().min(0).max(4 * 3600_000).optional(),
        width: z.coerce.number().int().min(1).max(20000).optional(),
        height: z.coerce.number().int().min(1).max(20000).optional(),
      }),
      fields,
    );
    const limitMb = Math.min(PURPOSE_LIMIT_MB[meta.purpose]!, cfg.MAX_UPLOAD_MB);

    const original = file.filename ? path.basename(file.filename).slice(0, 120) : 'datei';
    const ext = extOf(original);
    const tmp = path.join(tmpDir, randomUUID());
    const hash = createHash('sha256');
    let size = 0;
    try {
      const sink = createWriteStream(tmp, { mode: 0o600 });
      file.file.on('data', (c: Buffer) => { size += c.length; hash.update(c); });
      await pipeline(file.file, sink);
      if (file.file.truncated || size > limitMb * 1024 * 1024) throw new HttpError(413, 'file_too_large', `Datei zu groß (max. ${limitMb} MB).`);
      if (size === 0) throw badRequest('empty_file', 'Leere Datei.');

      // Kontingent pro Benutzer
      const q = await db.query('select coalesce(sum(size),0)::bigint s from media where owner_id = $1 and deleted_at is null', [userId]);
      if (q.rows[0].s + size > 2048 * 1024 * 1024) throw new HttpError(413, 'quota_exceeded', 'Speicherkontingent erreicht.');

      // Typ am Inhalt erkennen – dem Dateinamen / Content-Type des Clients wird nicht vertraut.
      const sniffed = await fileTypeFromFile(tmp);
      let mime = sniffed?.mime ?? '';
      let kind: 'image' | 'video' | 'audio' | 'file';
      if (IMAGE_MIMES.has(mime)) kind = 'image';
      else if (VIDEO_MIMES.has(mime) || mime === 'application/ogg') {
        if (mime === 'application/ogg') { mime = 'audio/ogg'; kind = 'audio'; }
        else if (meta.asVoice === 'true') {
          kind = 'audio';
          if (mime === 'video/webm') mime = 'audio/webm';
          else if (mime === 'video/mp4') mime = 'audio/mp4';
        } else kind = 'video';
      } else if (AUDIO_MIMES.has(mime)) kind = 'audio';
      else {
        if (BLOCKED_EXT.has(ext)) throw badRequest('type_not_allowed', 'Dieser Dateityp ist nicht erlaubt.');
        if (sniffed && ['application/x-msdownload', 'application/x-msdos-program', 'application/x-sh', 'application/x-executable', 'application/vnd.android.package-archive', 'application/x-mach-binary', 'application/x-elf'].includes(sniffed.mime))
          throw badRequest('type_not_allowed', 'Dieser Dateityp ist nicht erlaubt.');
        if (!sniffed && !TEXT_EXT.has(ext)) throw badRequest('type_not_allowed', 'Dateityp nicht erkannt.');
        if (!sniffed && TEXT_EXT.has(ext)) {
          // reiner Text: darf keine NUL-Bytes enthalten
          const sample = await readHead(tmp, 8192);
          if (sample.includes(0)) throw badRequest('type_not_allowed', 'Dateityp nicht erkannt.');
          mime = 'text/plain';
        } else if (!DOC_EXT.has(ext) && !sniffed) throw badRequest('type_not_allowed', 'Dateityp nicht erlaubt.');
        kind = 'file';
        if (!mime) mime = 'application/octet-stream';
      }
      if (['avatar', 'group_avatar', 'background'].includes(meta.purpose) && kind !== 'image') throw badRequest('image_required', 'Es wird ein Bild benötigt.');
      if (meta.purpose === 'status' && kind === 'file') throw badRequest('type_not_allowed', 'Status unterstützt nur Bilder und Videos.');

      const id = randomUUID();
      const base = `${userId.slice(0, 2)}/${userId}/${id}`;
      let storageKey = base;
      let thumbKey: string | null = null;
      let width = meta.width ?? null;
      let height = meta.height ?? null;
      let finalSize = size;
      let finalHash = hash.digest('hex');
      let finalPath = tmp;

      if (kind === 'image') {
        try {
          const img = sharp(tmp, { limitInputPixels: 50_000_000, animated: mime === 'image/gif' });
          const info = await img.metadata();
          if (!info.width || !info.height) throw new Error('keine Bildmaße');
          width = info.width; height = info.height;
          const maxSide = meta.purpose === 'avatar' || meta.purpose === 'group_avatar' ? 512 : meta.purpose === 'background' ? 2400 : 4096;
          if (mime !== 'image/gif') {
            // Neu kodieren: entfernt EXIF/GPS-Metadaten, normalisiert die Ausrichtung, begrenzt die Größe.
            const out = `${tmp}.out`;
            const pipe = sharp(tmp, { limitInputPixels: 50_000_000 }).rotate().resize({ width: maxSide, height: maxSide, fit: meta.purpose === 'avatar' || meta.purpose === 'group_avatar' ? 'cover' : 'inside', withoutEnlargement: true });
            const outInfo = mime === 'image/png' ? await pipe.png().toFile(out) : mime === 'image/webp' ? await pipe.webp({ quality: 88 }).toFile(out) : mime === 'image/avif' ? await pipe.avif().toFile(out) : await pipe.jpeg({ quality: 88, mozjpeg: true }).toFile(out);
            if (mime !== 'image/png' && mime !== 'image/webp' && mime !== 'image/avif') mime = 'image/jpeg';
            await rm(tmp, { force: true });
            finalPath = out; width = outInfo.width; height = outInfo.height; finalSize = outInfo.size;
            const h = createHash('sha256');
            await pipeline(createReadStream(out), async function* (src) { for await (const c of src) { h.update(c as Buffer); } });
            finalHash = h.digest('hex');
          }
          const thumb = await sharp(finalPath, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
          thumbKey = `${base}.thumb`;
          await storage.putBuffer(thumbKey, thumb, 'image/webp');
        } catch (e) {
          if (e instanceof HttpError) throw e;
          throw badRequest('invalid_image', 'Das Bild konnte nicht verarbeitet werden.');
        }
      }

      await storage.putFile(storageKey, finalPath, mime);
      const { rows } = await db.query(
        `insert into media(id, owner_id, purpose, kind, mime, size, sha256, storage_key, thumb_key, original_name, width, height, duration_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
        [id, userId, meta.purpose, kind, mime, finalSize, finalHash, storageKey, thumbKey, original, width, height, meta.durationMs ?? null],
      );
      return { media: mediaFromRow(rows[0]) };
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
      await rm(`${tmp}.out`, { force: true }).catch(() => {});
    }
  });

  app.get('/api/media/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { thumb } = parse(z.object({ thumb: z.string().optional() }), req.query);
    const uid = req.auth!.userId;
    const { rows } = await db.query(
      `select m.* from media m where m.id = $1 and m.deleted_at is null and (
         m.owner_id = $2
         or exists (select 1 from messages msg
                      join conversation_members cm on cm.conversation_id = msg.conversation_id and cm.user_id = $2 and cm.left_at is null
                     where msg.media_id = m.id and msg.deleted_at is null and msg.seq > cm.history_from_seq
                       and not exists (select 1 from message_hidden h where h.message_id = msg.id and h.user_id = $2))
         or exists (select 1 from users u join user_privacy p on p.user_id = u.id where u.avatar_media_id = m.id and can_see($2, u.id, p.avatar_vis))
         or exists (select 1 from conversations c join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $2 and cm.left_at is null where c.avatar_media_id = m.id)
         or exists (select 1 from statuses s where s.media_id = m.id and status_visible_to($2, s.id))
       )`,
      [id, uid],
    );
    const m = rows[0];
    if (!m) throw notFound('media_not_found', 'Datei nicht gefunden.');
    const useThumb = !!thumb && !!m.thumb_key;
    const key = useThumb ? m.thumb_key : m.storage_key;
    const mime = useThumb ? 'image/webp' : m.mime;
    const thumbBuf = useThumb ? await readAll(await storage.read(key)) : null;
    const total = thumbBuf ? thumbBuf.length : Number(m.size);

    reply.header('Cache-Control', 'private, max-age=3600');
    reply.header('ETag', `"${m.sha256}${useThumb ? '-t' : ''}"`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Accept-Ranges', 'bytes');
    if (req.headers['if-none-match'] === `"${m.sha256}${useThumb ? '-t' : ''}"`) return reply.code(304).send();

    const inline = !useThumb ? m.kind !== 'file' : true;
    reply.header('Content-Type', inline ? mime : 'application/octet-stream');
    if (!inline) {
      const safeName = encodeURIComponent(m.original_name || 'datei').replace(/['()]/g, escape);
      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
    }

    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && total) {
      let start = range[1] ? Number(range[1]) : NaN;
      let end = range[2] ? Number(range[2]) : NaN;
      if (Number.isNaN(start)) { start = Math.max(0, total - end); end = total - 1; }
      else if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        reply.header('Content-Range', `bytes */${total}`);
        return reply.code(416).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(thumbBuf ? thumbBuf.subarray(start, end + 1) : await storage.read(key, { start, end }));
    }
    reply.header('Content-Length', total);
    return reply.send(thumbBuf ?? (await storage.read(key)));
  });

  app.delete('/api/media/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { rows } = await db.query('select * from media where id = $1 and owner_id = $2 and deleted_at is null', [id, req.auth!.userId]);
    if (!rows[0]) throw notFound('media_not_found');
    const used = await db.query(
      `select 1 from messages where media_id = $1 and deleted_at is null union all select 1 from users where avatar_media_id = $1
       union all select 1 from statuses where media_id = $1 and deleted_at is null`,
      [id],
    );
    if (used.rowCount) throw forbidden('media_in_use', 'Datei wird noch verwendet.');
    await purgeMedia(app.ctx, [rows[0]]);
    return { ok: true };
  });
}

async function readHead(file: string, n: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const c of createReadStream(file, { start: 0, end: n - 1 })) {
    chunks.push(c as Buffer);
    len += (c as Buffer).length;
    if (len >= n) break;
  }
  return Buffer.concat(chunks);
}

async function readAll(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Löscht Medien-Datensätze und Dateien endgültig. */
export async function purgeMedia(ctx: import('../context.js').Ctx, rows: { id: string; storage_key: string; thumb_key: string | null }[]) {
  if (!rows.length) return;
  await ctx.db.query('delete from media where id = any($1)', [rows.map((r) => r.id)]);
  for (const r of rows) {
    await ctx.storage.delete(r.storage_key).catch(() => {});
    if (r.thumb_key) await ctx.storage.delete(r.thumb_key).catch(() => {});
  }
}

