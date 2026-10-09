import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTx } from '../db/pool.js';
import type { Queryable } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import {
  activeMemberIds, assertCanDirectMessage, directPeerId, isAdmin, requireMember,
  type ConvRow, type MemberRow,
} from '../lib/conversations.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../lib/guard.js';
import { createMessage, hydrateMessages, publishNewMessage, type MsgRow, type MessageView } from '../lib/messages.js';
import { parse, uuid } from '../lib/validate.js';

const VISIBLE = `m.seq > cm.history_from_seq and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = $2)`;

export async function messageRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, hub, cfg } = ctx;
  const auth = { preHandler: requireAuth };

  /** Prüft, ob der Benutzer in diesem Chat senden darf. */
  async function assertCanSend(conv: ConvRow, me: MemberRow, uid: string) {
    if (conv.type === 'group') {
      if (conv.send_admins_only && !isAdmin(me)) throw forbidden('admin_only', 'In dieser Gruppe dürfen nur Admins schreiben.');
    } else {
      const peer = await directPeerId(db, conv.id, uid);
      if (!peer) throw forbidden('peer_gone', 'Dieser Nutzer ist nicht mehr erreichbar.');
      await assertCanDirectMessage(db, uid, peer);
    }
  }

  async function loadMessage(db: Queryable, messageId: string, uid: string) {
    const { rows } = await db.query(
      `select m.*, cm.role as my_role from messages m
         join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = $2 and cm.left_at is null
        where m.id = $1 and ${VISIBLE}`,
      [messageId, uid],
    ).catch((e) => { if (e.code === '22P02') return { rows: [] }; throw e; });
    if (!rows[0]) throw notFound('message_not_found', 'Nachricht nicht gefunden.');
    return rows[0] as MsgRow & { my_role: MemberRow['role'] };
  }

  async function emitUpdated(row: MsgRow) {
    const [view] = await hydrateMessages(db, [row]);
    hub.sendMany(await activeMemberIds(db, row.conversation_id), { type: 'message.updated', message: view });
    return view!;
  }

  const KIND_TO_MEDIA: Record<string, string> = { image: 'image', video: 'video', audio: 'audio', voice: 'audio', file: 'file' };

  const sendSchema = z.object({
    clientMsgId: z.string().min(8).max(64),
    kind: z.enum(['text', 'image', 'video', 'audio', 'voice', 'file']).default('text'),
    body: z.string().max(8000).default(''),
    mediaId: uuid.optional(),
    replyToId: uuid.optional(),
  });

  app.post('/api/conversations/:id/messages', {
    ...auth,
    config: { rateLimit: { max: cfg.MESSAGE_RATE_PER_MINUTE, timeWindow: '1 minute', keyGenerator: (r: { auth?: { userId: string } | null; ip: string }) => r.auth?.userId ?? r.ip } },
  }, async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const body = parse(sendSchema, req.body);
    const { conv, me } = await requireMember(db, id, uid);
    await assertCanSend(conv, me, uid);

    if (body.kind === 'text') {
      if (!body.body.trim()) throw badRequest('empty_message', 'Nachricht ist leer.');
      if (body.mediaId) throw badRequest('invalid_message');
    } else {
      if (!body.mediaId) throw badRequest('media_required', 'Anhang fehlt.');
      const m = (await db.query(`select kind from media where id = $1 and owner_id = $2 and purpose = 'message' and deleted_at is null`, [body.mediaId, uid])).rows[0];
      if (!m || m.kind !== KIND_TO_MEDIA[body.kind]) throw badRequest('invalid_media', 'Ungültiger Anhang.');
    }
    if (body.replyToId) {
      const r = await db.query('select 1 from messages where id = $1 and conversation_id = $2', [body.replyToId, id]);
      if (!r.rowCount) throw badRequest('invalid_reply', 'Die zitierte Nachricht existiert nicht.');
    }

    const { row, created } = await withTx(db, (tx) =>
      createMessage(ctx, tx, {
        conversationId: id, senderId: uid, kind: body.kind, body: body.body, mediaId: body.mediaId, replyToId: body.replyToId, clientMsgId: body.clientMsgId,
      }),
    );
    const [view] = await hydrateMessages(db, [row]);
    if (created) await publishNewMessage(ctx, view!);
    return reply.code(created ? 201 : 200).send({ message: view, duplicate: !created });
  });

  app.get('/api/conversations/:id/messages', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const q = parse(
      z.object({
        before: z.coerce.number().int().optional(), after: z.coerce.number().int().optional(),
        around: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const uid = req.auth!.userId;
    await requireMember(db, id, uid);
    const base = `select m.* from messages m join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = $2
                  where m.conversation_id = $1 and ${VISIBLE}`;
    let rows: MsgRow[];
    let hasMore: boolean;
    if (q.around) {
      const t = (await db.query('select seq from messages where id = $1 and conversation_id = $2', [q.around, id])).rows[0];
      if (!t) throw notFound('message_not_found');
      const half = Math.floor(q.limit / 2);
      rows = (await db.query(`${base} and m.seq between $3 and $4 order by m.seq`, [id, uid, t.seq - half, t.seq + half])).rows;
      hasMore = true;
    } else if (q.after !== undefined) {
      const r = (await db.query(`${base} and m.seq > $3 order by m.seq limit $4`, [id, uid, q.after, q.limit + 1])).rows;
      hasMore = r.length > q.limit;
      rows = r.slice(0, q.limit);
    } else {
      const r = (await db.query(`${base} ${q.before !== undefined ? 'and m.seq < $3' : 'and $3::bigint is null'} order by m.seq desc limit $4`, [id, uid, q.before ?? null, q.limit + 1])).rows;
      hasMore = r.length > q.limit;
      rows = r.slice(0, q.limit).reverse();
    }
    return { messages: await hydrateMessages(db, rows), hasMore };
  });

  app.get('/api/conversations/:id/search', { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(100) }), req.query);
    const uid = req.auth!.userId;
    await requireMember(db, id, uid);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await db.query(
      `select m.* from messages m join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = $2
        where m.conversation_id = $1 and ${VISIBLE} and m.deleted_at is null and m.kind <> 'system' and m.body ilike $3
        order by m.seq desc limit 50`,
      [id, uid, like],
    );
    return { messages: await hydrateMessages(db, rows) };
  });

  app.patch('/api/messages/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { body } = parse(z.object({ body: z.string().max(8000) }), req.body);
    const uid = req.auth!.userId;
    const m = await loadMessage(db, id, uid);
    if (m.sender_id !== uid || m.kind === 'system' || m.deleted_at) throw forbidden('cannot_edit', 'Diese Nachricht kann nicht bearbeitet werden.');
    if (m.kind === 'text' && !body.trim()) throw badRequest('empty_message');
    if (Date.now() - m.created_at.getTime() > cfg.MESSAGE_EDIT_WINDOW_MINUTES * 60_000) throw forbidden('edit_window_over', 'Die Bearbeitungszeit ist abgelaufen.');
    const { rows } = await db.query('update messages set body = $2, edited_at = now() where id = $1 returning *', [id, body]);
    return { message: await emitUpdated(rows[0]) };
  });

  app.delete('/api/messages/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { scope } = parse(z.object({ scope: z.enum(['me', 'all']).default('me') }), req.query);
    const uid = req.auth!.userId;
    const m = await loadMessage(db, id, uid);
    if (m.kind === 'system') throw forbidden('cannot_delete');
    if (scope === 'me') {
      await db.query('insert into message_hidden(message_id, user_id) values ($1,$2) on conflict do nothing', [id, uid]);
      hub.send(uid, { type: 'message.hidden', conversationId: m.conversation_id, messageId: id });
      return { ok: true };
    }
    const own = m.sender_id === uid;
    const admin = m.my_role === 'admin' || m.my_role === 'owner';
    const { conv } = await requireMember(db, m.conversation_id, uid);
    if (own) {
      if (Date.now() - m.created_at.getTime() > cfg.MESSAGE_DELETE_ALL_WINDOW_MINUTES * 60_000) throw forbidden('delete_window_over', 'Für alle löschen ist nicht mehr möglich.');
    } else if (!(conv.type === 'group' && admin)) {
      throw forbidden('cannot_delete', 'Du darfst diese Nachricht nicht für alle löschen.');
    }
    if (m.deleted_at) return { ok: true };
    const { rows } = await db.query(`update messages set deleted_at = now(), deleted_by = $2, body = '' where id = $1 returning *`, [id, uid]);
    await db.query('delete from message_reactions where message_id = $1', [id]);
    await audit(db, req, uid, 'message_deleted_for_all', { messageId: id, own });
    await emitUpdated(rows[0]);
    return { ok: true };
  });

  app.put('/api/messages/:id/reaction', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { emoji } = parse(z.object({ emoji: z.string().min(1).max(16).nullable() }), req.body);
    const uid = req.auth!.userId;
    const m = await loadMessage(db, id, uid);
    if (m.deleted_at || m.kind === 'system') throw forbidden('cannot_react');
    if (emoji && !/\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]/u.test(emoji)) throw badRequest('invalid_emoji', 'Ungültiges Emoji.');
    const { conv, me } = await requireMember(db, m.conversation_id, uid);
    if (conv.type === 'direct') {
      const peer = await directPeerId(db, conv.id, uid);
      if (peer && (await db.query('select is_blocked_between($1,$2) b', [uid, peer])).rows[0].b) throw forbidden('cannot_message');
    }
    void me;
    if (emoji) {
      await db.query(
        `insert into message_reactions(message_id, user_id, emoji) values ($1,$2,$3)
         on conflict (message_id, user_id) do update set emoji = $3, created_at = now()`, [id, uid, emoji]);
    } else await db.query('delete from message_reactions where message_id = $1 and user_id = $2', [id, uid]);
    const row = (await db.query('select * from messages where id = $1', [id])).rows[0];
    return { message: await emitUpdated(row) };
  });

  app.post('/api/messages/:id/forward', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { conversationIds } = parse(z.object({ conversationIds: z.array(uuid).min(1).max(10) }), req.body);
    const uid = req.auth!.userId;
    const src = await loadMessage(db, id, uid);
    if (src.deleted_at || src.kind === 'system') throw forbidden('cannot_forward', 'Diese Nachricht kann nicht weitergeleitet werden.');
    const out: MessageView[] = [];
    for (const cid of new Set(conversationIds)) {
      const { conv, me } = await requireMember(db, cid, uid);
      await assertCanSend(conv, me, uid);
      const { row } = await withTx(db, (tx) =>
        createMessage(ctx, tx, { conversationId: cid, senderId: uid, kind: src.kind as never, body: src.body, mediaId: src.media_id, forwarded: true, clientMsgId: randomUUID() }));
      const [view] = await hydrateMessages(db, [row]);
      await publishNewMessage(ctx, view!);
      out.push(view!);
    }
    return { messages: out };
  });
}
