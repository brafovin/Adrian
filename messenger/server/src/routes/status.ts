import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../lib/guard.js';
import { parse, uuid } from '../lib/validate.js';
import { publicUserCols, toPublicUser } from '../lib/users.js';
import { mediaFromRow } from './media.js';

const styleSchema = z
  .object({
    bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    font: z.enum(['sans', 'serif', 'mono', 'hand']).optional(),
    emoji: z.string().max(16).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .strip();

export async function statusRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, hub, cfg } = ctx;
  const auth = { preHandler: requireAuth };

  async function shapeStatuses(rows: Record<string, any>[], viewerId: string) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const mids = rows.map((r) => r.media_id).filter(Boolean);
    const [media, views, reacts, mine, viewed, aud] = await Promise.all([
      mids.length ? db.query('select * from media where id = any($1)', [mids]) : { rows: [] as Record<string, any>[] },
      db.query('select status_id, count(*)::int c from status_views where status_id = any($1) group by 1', [ids]),
      db.query('select status_id, count(*)::int c from status_reactions where status_id = any($1) group by 1', [ids]),
      db.query('select status_id, emoji from status_reactions where status_id = any($1) and user_id = $2', [ids, viewerId]),
      db.query('select status_id from status_views where status_id = any($1) and viewer_id = $2', [ids, viewerId]),
      db.query('select status_id, user_id from status_audience where status_id = any($1)', [ids]),
    ]);
    const mm = new Map(media.rows.map((m) => [m.id, m]));
    const vc = new Map(views.rows.map((r) => [r.status_id, r.c]));
    const rc = new Map(reacts.rows.map((r) => [r.status_id, r.c]));
    const my = new Map(mine.rows.map((r) => [r.status_id, r.emoji]));
    const vs = new Set(viewed.rows.map((r) => r.status_id));
    return rows.map((r) => {
      const own = r.user_id === viewerId;
      return {
        id: r.id, userId: r.user_id, kind: r.kind, body: r.body, style: r.style,
        media: r.media_id && mm.get(r.media_id) ? mediaFromRow(mm.get(r.media_id)!) : null,
        visibility: own ? r.visibility : undefined,
        audienceIds: own ? aud.rows.filter((a) => a.status_id === r.id).map((a) => a.user_id) : undefined,
        createdAt: r.created_at.toISOString(),
        publishedAt: r.published_at ? r.published_at.toISOString() : null,
        expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
        viewed: own ? undefined : vs.has(r.id),
        myReaction: own ? undefined : (my.get(r.id) ?? null),
        viewCount: own ? (vc.get(r.id) ?? 0) : undefined,
        reactionCount: own ? (rc.get(r.id) ?? 0) : undefined,
      };
    });
  }

  const input = z.object({
    kind: z.enum(['text', 'image', 'video']),
    body: z.string().max(700).default(''),
    style: styleSchema.default({}),
    mediaId: uuid.optional(),
    visibility: z.enum(['contacts', 'only', 'except']).default('contacts'),
    audienceIds: z.array(uuid).max(500).default([]),
    publish: z.boolean().default(true),
  });

  async function validate(uid: string, b: z.infer<typeof input>) {
    if (b.kind === 'text') {
      if (!b.body.trim()) throw badRequest('empty_status', 'Text fehlt.');
      if (b.mediaId) throw badRequest('invalid_status');
    } else {
      if (!b.mediaId) throw badRequest('media_required', 'Bild/Video fehlt.');
      const m = (await db.query(`select kind from media where id = $1 and owner_id = $2 and purpose = 'status' and deleted_at is null`, [b.mediaId, uid])).rows[0];
      if (!m || m.kind !== b.kind) throw badRequest('invalid_media', 'Ungültiger Anhang.');
    }
    if (b.visibility !== 'contacts') {
      if (b.visibility === 'only' && !b.audienceIds.length) throw badRequest('audience_required', 'Bitte Personen auswählen.');
      const c = await db.query('select count(*)::int c from contacts where user_id = $1 and contact_id = any($2)', [uid, b.audienceIds]);
      if (c.rows[0].c !== new Set(b.audienceIds).size) throw badRequest('invalid_audience', 'Nur Kontakte können ausgewählt werden.');
    }
  }

  async function publish(id: string, uid: string) {
    const { rows } = await db.query(
      `update statuses set published_at = now(), expires_at = now() + make_interval(hours => $2) where id = $1 and published_at is null returning *`,
      [id, cfg.STATUS_TTL_HOURS],
    );
    if (!rows[0]) return;
    const viewers = (await db.query(`select c.contact_id from contacts c where c.user_id = $1 and status_visible_to(c.contact_id, $2)`, [uid, id])).rows.map((r) => r.contact_id);
    hub.sendMany(viewers, { type: 'status.new', userId: uid, statusId: id });
    const me = (await db.query('select display_name from users where id = $1', [uid])).rows[0];
    await Promise.all(viewers.map((v) => ctx.push.notifyUser(v, { kind: 'status', title: 'Neuer Status', body: `${me.display_name} hat einen Status veröffentlicht`, url: '/status', tag: `status-${uid}` }).catch(() => 0)));
    hub.send(uid, { type: 'status.mine.updated' });
  }

  app.post('/api/statuses', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const uid = req.auth!.userId;
    const b = parse(input, req.body);
    await validate(uid, b);
    const active = (await db.query(`select count(*)::int c from statuses where user_id = $1 and deleted_at is null and (expires_at is null or expires_at > now())`, [uid])).rows[0].c;
    if (active >= 30) throw conflict('status_limit', 'Du hast bereits 30 aktive Status.');
    const { rows } = await db.query(
      `insert into statuses(user_id, kind, body, style, media_id, visibility) values ($1,$2,$3,$4,$5,$6) returning *`,
      [uid, b.kind, b.body, JSON.stringify(b.style), b.mediaId ?? null, b.visibility],
    );
    for (const a of new Set(b.audienceIds)) await db.query('insert into status_audience(status_id, user_id) values ($1,$2)', [rows[0].id, a]);
    if (b.publish) await publish(rows[0].id, uid);
    const fresh = (await db.query('select * from statuses where id = $1', [rows[0].id])).rows;
    return reply.code(201).send({ status: (await shapeStatuses(fresh, uid))[0] });
  });

  app.patch('/api/statuses/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const cur = (await db.query('select * from statuses where id = $1 and user_id = $2 and deleted_at is null', [id, uid])).rows[0];
    if (!cur) throw notFound('status_not_found');
    if (cur.published_at) throw conflict('already_published', 'Veröffentlichte Status können nicht mehr bearbeitet werden.');
    const b = parse(input, { ...cur, kind: cur.kind, mediaId: cur.media_id ?? undefined, audienceIds: [], ...(req.body as object), publish: false });
    await validate(uid, b);
    const body = req.body as { audienceIds?: string[] };
    await db.query(`update statuses set kind=$2, body=$3, style=$4, media_id=$5, visibility=$6 where id = $1`, [id, b.kind, b.body, JSON.stringify(b.style), b.mediaId ?? null, b.visibility]);
    if (body.audienceIds) {
      await db.query('delete from status_audience where status_id = $1', [id]);
      for (const a of new Set(b.audienceIds)) await db.query('insert into status_audience(status_id, user_id) values ($1,$2)', [id, a]);
    }
    const fresh = (await db.query('select * from statuses where id = $1', [id])).rows;
    return { status: (await shapeStatuses(fresh, uid))[0] };
  });

  app.post('/api/statuses/:id/publish', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const cur = (await db.query('select * from statuses where id = $1 and user_id = $2 and deleted_at is null', [id, uid])).rows[0];
    if (!cur) throw notFound('status_not_found');
    if (cur.published_at) throw conflict('already_published');
    await publish(id, uid);
    const fresh = (await db.query('select * from statuses where id = $1', [id])).rows;
    return { status: (await shapeStatuses(fresh, uid))[0] };
  });

  app.delete('/api/statuses/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { rowCount } = await db.query('update statuses set deleted_at = now() where id = $1 and user_id = $2 and deleted_at is null', [id, uid]);
    if (!rowCount) throw notFound('status_not_found');
    const viewers = (await db.query('select contact_id from contacts where user_id = $1', [uid])).rows.map((r) => r.contact_id);
    hub.sendMany(viewers, { type: 'status.removed', userId: uid, statusId: id });
    hub.send(uid, { type: 'status.mine.updated' });
    return { ok: true };
  });

  app.get('/api/statuses/mine', auth, async (req) => {
    const uid = req.auth!.userId;
    const { rows } = await db.query(
      `select * from statuses where user_id = $1 and deleted_at is null and (published_at is null or expires_at > now()) order by coalesce(published_at, created_at)`, [uid]);
    return { statuses: await shapeStatuses(rows, uid) };
  });

  app.get('/api/statuses/feed', auth, async (req) => {
    const uid = req.auth!.userId;
    const { rows } = await db.query(
      `select s.* from statuses s where s.user_id <> $1 and status_visible_to($1, s.id) order by s.published_at`, [uid]);
    const shaped = await shapeStatuses(rows, uid);
    const userIds = [...new Set(shaped.map((s) => s.userId))];
    const users = userIds.length
      ? (await db.query(`select ${publicUserCols('$1')} from users u join user_privacy p on p.user_id = u.id where u.id = any($2)`, [uid, userIds])).rows
      : [];
    const uMap = new Map(users.map((u) => [u.id, toPublicUser(u, hub)]));
    const groups = userIds.map((id) => {
      const list = shaped.filter((s) => s.userId === id);
      return { user: uMap.get(id)!, statuses: list, allViewed: list.every((s) => s.viewed), latestAt: list[list.length - 1]!.publishedAt! };
    }).filter((g) => g.user);
    groups.sort((a, b) => Number(a.allViewed) - Number(b.allViewed) || b.latestAt.localeCompare(a.latestAt));
    return { groups };
  });

  async function assertVisible(db: Db, uid: string, id: string) {
    const r = await db.query('select s.user_id, status_visible_to($1, s.id) as ok from statuses s where s.id = $2', [uid, id]).catch(() => ({ rows: [] as any[] }));
    if (!r.rows[0]?.ok) throw notFound('status_not_found', 'Status nicht gefunden oder abgelaufen.');
    return r.rows[0].user_id as string;
  }

  app.post('/api/statuses/:id/view', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const owner = await assertVisible(db, uid, id);
    if (owner === uid) return { ok: true };
    const rr = (await db.query('select read_receipts from user_privacy where user_id = $1', [uid])).rows[0]?.read_receipts;
    if (rr) {
      const ins = await db.query('insert into status_views(status_id, viewer_id) values ($1,$2) on conflict do nothing', [id, uid]);
      if (ins.rowCount) hub.send(owner, { type: 'status.viewed', statusId: id, viewerId: uid });
    }
    return { ok: true };
  });

  app.get('/api/statuses/:id/views', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const s = (await db.query('select 1 from statuses where id = $1 and user_id = $2 and deleted_at is null', [id, uid])).rows[0];
    if (!s) throw notFound('status_not_found');
    const rr = (await db.query('select read_receipts from user_privacy where user_id = $1', [uid])).rows[0]?.read_receipts;
    // Wer selbst keine Lesebestätigungen sendet, sieht auch keine fremden Aufrufe (wie bei Messengern üblich).
    if (!rr) return { hidden: true, views: [], reactions: [] };
    const views = (await db.query(
      `select v.viewed_at, ${publicUserCols('$1')} from status_views v join users u on u.id = v.viewer_id join user_privacy p on p.user_id = u.id
        where v.status_id = $2 and not is_blocked_between($1, u.id) order by v.viewed_at desc`, [uid, id])).rows;
    const reactions = (await db.query(
      `select r.emoji, r.created_at, ${publicUserCols('$1')} from status_reactions r join users u on u.id = r.user_id join user_privacy p on p.user_id = u.id
        where r.status_id = $2 and not is_blocked_between($1, u.id) order by r.created_at desc`, [uid, id])).rows;
    return {
      hidden: false,
      views: views.map((v) => ({ user: toPublicUser(v, hub), viewedAt: v.viewed_at.toISOString() })),
      reactions: reactions.map((v) => ({ user: toPublicUser(v, hub), emoji: v.emoji, createdAt: v.created_at.toISOString() })),
    };
  });

  app.put('/api/statuses/:id/reaction', { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { emoji } = parse(z.object({ emoji: z.string().min(1).max(16).nullable() }), req.body);
    const uid = req.auth!.userId;
    const owner = await assertVisible(db, uid, id);
    if (owner === uid) throw forbidden('own_status', 'Auf den eigenen Status kann nicht reagiert werden.');
    if (emoji) {
      await db.query(`insert into status_reactions(status_id, user_id, emoji) values ($1,$2,$3) on conflict (status_id, user_id) do update set emoji = $3, created_at = now()`, [id, uid, emoji]);
      const me = (await db.query('select display_name from users where id = $1', [uid])).rows[0];
      hub.send(owner, { type: 'status.reaction', statusId: id, userId: uid, emoji });
      void ctx.push.notifyUser(owner, { kind: 'status', title: 'Reaktion auf deinen Status', body: `${me.display_name}: ${emoji}`, url: '/status', tag: `sreact-${id}` }, { force: false }).catch(() => 0);
    } else await db.query('delete from status_reactions where status_id = $1 and user_id = $2', [id, uid]);
    return { ok: true };
  });
}
