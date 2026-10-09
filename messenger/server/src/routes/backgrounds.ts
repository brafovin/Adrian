import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound, badRequest } from '../lib/errors.js';
import { requireAuth } from '../lib/guard.js';
import { requireMember } from '../lib/conversations.js';
import { parse, uuid } from '../lib/validate.js';

/** Persönliche Chat-Hintergründe. Sie werden nur dem Besitzer gezeigt und nie mit anderen Teilnehmern geteilt. */
const paramsSchema = z
  .object({
    zoom: z.number().min(1).max(5).default(1),
    x: z.number().min(-1).max(1).default(0),
    y: z.number().min(-1).max(1).default(0),
    brightness: z.number().min(0.3).max(1.7).default(1),
    overlay: z.number().min(0).max(0.85).default(0),
    blur: z.number().min(0).max(20).default(0),
  })
  .strip();

export async function backgroundRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, hub } = ctx;
  const auth = { preHandler: requireAuth };

  const shape = (r: Record<string, any>) => ({
    conversationId: r.conversation_id as string | null,
    url: `/api/media/${r.media_id}`,
    mediaId: r.media_id as string,
    sourceMediaId: (r.source_media_id as string | null) ?? null,
    sourceUrl: r.source_media_id ? `/api/media/${r.source_media_id}` : null,
    params: r.params,
    updatedAt: r.updated_at.toISOString(),
  });

  app.get('/api/chat-backgrounds', auth, async (req) => {
    const { rows } = await db.query('select * from chat_backgrounds where user_id = $1', [req.auth!.userId]);
    return { backgrounds: rows.map(shape) };
  });

  async function target(uid: string, t: string): Promise<string | null> {
    if (t === 'default') return null;
    const id = parse(uuid, t);
    await requireMember(db, id, uid);
    return id;
  }

  app.put('/api/chat-backgrounds/:target', auth, async (req) => {
    const uid = req.auth!.userId;
    const { target: t } = parse(z.object({ target: z.string() }), req.params);
    const conversationId = await target(uid, t);
    const body = parse(z.object({ mediaId: uuid, sourceMediaId: uuid.nullable().optional(), params: paramsSchema.default({ zoom: 1, x: 0, y: 0, brightness: 1, overlay: 0, blur: 0 }) }), req.body);
    const ok = await db.query(
      `select id from media where id = any($1) and owner_id = $2 and purpose = 'background' and kind = 'image' and deleted_at is null`,
      [[body.mediaId, body.sourceMediaId].filter(Boolean), uid],
    );
    if (ok.rowCount !== new Set([body.mediaId, body.sourceMediaId].filter(Boolean)).size) throw badRequest('invalid_media', 'Ungültiges Bild.');
    const old = (await db.query('select media_id, source_media_id from chat_backgrounds where user_id = $1 and conversation_id is not distinct from $2', [uid, conversationId])).rows[0];
    const { rows } = await db.query(
      conversationId
        ? `insert into chat_backgrounds(user_id, conversation_id, media_id, source_media_id, params) values ($1,$2,$3,$4,$5)
           on conflict (user_id, conversation_id) where conversation_id is not null do update set media_id = $3, source_media_id = $4, params = $5, updated_at = now() returning *`
        : `insert into chat_backgrounds(user_id, conversation_id, media_id, source_media_id, params) values ($1,$2,$3,$4,$5)
           on conflict (user_id) where conversation_id is null do update set media_id = $3, source_media_id = $4, params = $5, updated_at = now() returning *`,
      [uid, conversationId, body.mediaId, body.sourceMediaId ?? null, JSON.stringify(body.params)],
    );
    if (old) await dropIfOrphan(ctx, uid, [old.media_id, old.source_media_id]);
    hub.send(uid, { type: 'background.updated', conversationId, background: shape(rows[0]) });
    return { background: shape(rows[0]) };
  });

  app.delete('/api/chat-backgrounds/:target', auth, async (req) => {
    const uid = req.auth!.userId;
    const { target: t } = parse(z.object({ target: z.string() }), req.params);
    const conversationId = await target(uid, t);
    const old = (await db.query('delete from chat_backgrounds where user_id = $1 and conversation_id is not distinct from $2 returning media_id, source_media_id', [uid, conversationId])).rows[0];
    if (!old) throw notFound('background_not_found');
    await dropIfOrphan(ctx, uid, [old.media_id, old.source_media_id]);
    hub.send(uid, { type: 'background.updated', conversationId, background: null });
    return { ok: true };
  });
}

async function dropIfOrphan(ctx: import('../context.js').Ctx, uid: string, ids: (string | null)[]) {
  const list = ids.filter(Boolean) as string[];
  if (!list.length) return;
  const { rows } = await ctx.db.query(
    `select m.id, m.storage_key, m.thumb_key from media m
      where m.id = any($1) and m.owner_id = $2 and m.purpose = 'background'
        and not exists (select 1 from chat_backgrounds b where b.media_id = m.id or b.source_media_id = m.id)`, [list, uid]);
  const { purgeMedia } = await import('./media.js');
  await purgeMedia(ctx, rows);
}
