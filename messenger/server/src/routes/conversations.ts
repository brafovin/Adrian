import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTx } from '../db/pool.js';
import {
  activeMemberIds, assertCanDirectMessage, directKey, emitConversationUpdated, isAdmin, loadConversationViews, requireMember,
} from '../lib/conversations.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../lib/errors.js';
import { removeMemberTx } from '../lib/groups.js';
import { requireAuth } from '../lib/guard.js';
import { hydrateMessages, publishNewMessage, createMessage } from '../lib/messages.js';
import { parse, uuid } from '../lib/validate.js';
import { publicUserCols, toPublicUser } from '../lib/users.js';

const MAX_GROUP_MEMBERS = 256;

export async function conversationRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, hub, cfg } = ctx;
  const auth = { preHandler: requireAuth };

  app.get('/api/conversations', auth, async (req) => ({ conversations: await loadConversationViews(ctx, req.auth!.userId) }));

  app.get('/api/conversations/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    await requireMember(db, id, uid);
    const [conv] = await loadConversationViews(ctx, uid, id);
    const { rows } = await db.query(
      `select cm.role, cm.joined_at, cm.last_delivered_seq,
              case when p.read_receipts then cm.last_read_seq end as last_read_seq,
              ${publicUserCols('$2')}
         from conversation_members cm join users u on u.id = cm.user_id join user_privacy p on p.user_id = u.id
        where cm.conversation_id = $1 and cm.left_at is null order by cm.joined_at`,
      [id, uid],
    );
    return {
      conversation: conv,
      members: rows.map((r) => ({
        ...toPublicUser(r, hub), role: r.role, joinedAt: r.joined_at.toISOString(), deliveredSeq: r.last_delivered_seq, readSeq: r.last_read_seq,
      })),
    };
  });

  // ---- Einzelchat starten (oder bestehenden zurückgeben)
  app.post('/api/conversations/direct', { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const uid = req.auth!.userId;
    const { userId } = parse(z.object({ userId: uuid }), req.body);
    if (userId === uid) throw badRequest('invalid_user', 'Du kannst dir nicht selbst schreiben.');
    const key = directKey(uid, userId);
    const existing = await db.query('select id from conversations where direct_key = $1', [key]);
    if (existing.rows[0]) {
      await assertCanDirectMessage(db, uid, userId).catch((e) => { if (e.code !== 'not_contact') throw e; });
      await db.query('update conversation_members set left_at = null, archived = false where conversation_id = $1 and user_id = $2', [existing.rows[0].id, uid]);
      return { conversation: (await loadConversationViews(ctx, uid, existing.rows[0].id))[0] };
    }
    await assertCanDirectMessage(db, uid, userId);
    const recent = await db.query(
      `select count(*)::int c from conversations where created_by = $1 and type = 'direct' and created_at > now() - interval '1 hour'`, [uid]);
    if (recent.rows[0].c >= cfg.NEW_CHAT_LIMIT_PER_HOUR) throw tooMany('new_chat_limit', 'Zu viele neue Chats in kurzer Zeit.');
    const id = await withTx(db, async (tx) => {
      const c = await tx.query(`insert into conversations(type, direct_key, created_by) values ('direct', $1, $2) on conflict (direct_key) do update set direct_key = excluded.direct_key returning id`, [key, uid]);
      await tx.query(`insert into conversation_members(conversation_id, user_id) values ($1,$2),($1,$3) on conflict do nothing`, [c.rows[0].id, uid, userId]);
      return c.rows[0].id as string;
    });
    emitConversationUpdated(ctx, [uid, userId], id);
    return { conversation: (await loadConversationViews(ctx, uid, id))[0] };
  });

  // ---- Gruppe erstellen
  app.post('/api/conversations/group', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const uid = req.auth!.userId;
    const body = parse(
      z.object({
        title: z.string().trim().min(1).max(80),
        description: z.string().max(500).optional(),
        memberIds: z.array(uuid).max(MAX_GROUP_MEMBERS - 1),
        avatarMediaId: uuid.optional(),
      }),
      req.body,
    );
    const memberIds = [...new Set(body.memberIds)].filter((m) => m !== uid);
    await assertCanAdd(db, uid, memberIds);
    if (body.avatarMediaId) await assertOwnMedia(db, body.avatarMediaId, uid, 'group_avatar');

    const { id, sysRows } = await withTx(db, async (tx) => {
      const c = await tx.query(
        `insert into conversations(type, title, description, created_by, avatar_media_id) values ('group',$1,$2,$3,$4) returning id`,
        [body.title, body.description ?? '', uid, body.avatarMediaId ?? null],
      );
      const cid = c.rows[0].id as string;
      await tx.query(`insert into conversation_members(conversation_id, user_id, role) values ($1,$2,'owner')`, [cid, uid]);
      for (const m of memberIds) await tx.query(`insert into conversation_members(conversation_id, user_id) values ($1,$2)`, [cid, m]);
      const sys = await createMessage(ctx, tx, { conversationId: cid, senderId: uid, kind: 'system', systemEvent: { type: 'group_created', by: uid } });
      return { id: cid, sysRows: [sys.row] };
    });
    const [view] = await hydrateMessages(db, sysRows);
    if (view) await publishNewMessage(ctx, view);
    emitConversationUpdated(ctx, [uid, ...memberIds], id);
    for (const m of memberIds) void notifyAdded(ctx, m, id, uid);
    return { conversation: (await loadConversationViews(ctx, uid, id))[0] };
  });

  // ---- Gruppe ändern
  app.patch('/api/conversations/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv, me } = await requireMember(db, id, uid);
    if (conv.type !== 'group') throw badRequest('not_a_group');
    const body = parse(
      z.object({
        title: z.string().trim().min(1).max(80), description: z.string().max(500), avatarMediaId: uuid.nullable(),
        sendAdminsOnly: z.boolean(), infoAdminsOnly: z.boolean(), addAdminsOnly: z.boolean(),
      }).partial().strict(),
      req.body,
    );
    const touchesInfo = body.title !== undefined || body.description !== undefined || body.avatarMediaId !== undefined;
    if (touchesInfo && conv.info_admins_only && !isAdmin(me)) throw forbidden('admin_only', 'Nur Admins dürfen die Gruppeninfo ändern.');
    if ((body.sendAdminsOnly !== undefined || body.infoAdminsOnly !== undefined || body.addAdminsOnly !== undefined) && !isAdmin(me))
      throw forbidden('admin_only', 'Nur Admins dürfen Gruppeneinstellungen ändern.');
    if (body.avatarMediaId) await assertOwnMedia(db, body.avatarMediaId, uid, 'group_avatar');
    const sys = await withTx(db, async (tx) => {
      await tx.query(
        `update conversations set title = coalesce($2,title), description = coalesce($3,description),
           avatar_media_id = case when $4::boolean then $5 else avatar_media_id end,
           send_admins_only = coalesce($6,send_admins_only), info_admins_only = coalesce($7,info_admins_only), add_admins_only = coalesce($8,add_admins_only)
         where id = $1`,
        [id, body.title ?? null, body.description ?? null, body.avatarMediaId !== undefined, body.avatarMediaId ?? null,
          body.sendAdminsOnly ?? null, body.infoAdminsOnly ?? null, body.addAdminsOnly ?? null],
      );
      if (body.title && body.title !== conv.title) {
        return (await createMessage(ctx, tx, { conversationId: id, senderId: uid, kind: 'system', systemEvent: { type: 'title_changed', by: uid, title: body.title } })).row;
      }
      return null;
    });
    if (sys) { const [v] = await hydrateMessages(db, [sys]); if (v) await publishNewMessage(ctx, v); }
    emitConversationUpdated(ctx, await activeMemberIds(db, id), id);
    return { conversation: (await loadConversationViews(ctx, uid, id))[0] };
  });

  // ---- Mitglieder hinzufügen
  app.post('/api/conversations/:id/members', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv, me } = await requireMember(db, id, uid);
    if (conv.type !== 'group') throw badRequest('not_a_group');
    if (conv.add_admins_only && !isAdmin(me)) throw forbidden('admin_only', 'Nur Admins dürfen Mitglieder hinzufügen.');
    const { userIds } = parse(z.object({ userIds: z.array(uuid).min(1).max(50) }), req.body);
    const ids = [...new Set(userIds)];
    await assertCanAdd(db, uid, ids);
    const added: string[] = [];
    const sysRows = await withTx(db, async (tx) => {
      const cnt = (await tx.query('select count(*)::int c from conversation_members where conversation_id = $1 and left_at is null', [id])).rows[0].c;
      if (cnt + ids.length > MAX_GROUP_MEMBERS) throw badRequest('group_full', 'Die Gruppe ist voll.');
      const out = [];
      for (const m of ids) {
        const r = await tx.query(
          `insert into conversation_members(conversation_id, user_id, history_from_seq)
           values ($1,$2,(select last_seq from conversations where id = $1))
           on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at = now(),
             history_from_seq = (select last_seq from conversations where id = $1), archived = false
           where conversation_members.left_at is not null returning user_id`,
          [id, m],
        );
        if (r.rows[0]) {
          added.push(m);
          out.push((await createMessage(ctx, tx, { conversationId: id, senderId: uid, kind: 'system', systemEvent: { type: 'member_added', userId: m, by: uid } })).row);
        }
      }
      return out;
    });
    for (const r of sysRows) { const [v] = await hydrateMessages(db, [r]); if (v) await publishNewMessage(ctx, v); }
    emitConversationUpdated(ctx, await activeMemberIds(db, id), id);
    for (const m of added) void notifyAdded(ctx, m, id, uid);
    return { added };
  });

  // ---- Mitglied entfernen / Gruppe verlassen
  app.delete('/api/conversations/:id/members/:userId', auth, async (req) => {
    const { id, userId } = parse(z.object({ id: uuid, userId: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv, me } = await requireMember(db, id, uid);
    if (conv.type !== 'group') throw badRequest('not_a_group');
    if (userId !== uid) {
      if (!isAdmin(me)) throw forbidden('admin_only', 'Nur Admins dürfen Mitglieder entfernen.');
      const t = (await db.query('select role from conversation_members where conversation_id = $1 and user_id = $2 and left_at is null', [id, userId])).rows[0];
      if (!t) throw notFound('member_not_found');
      if (t.role === 'owner' || (t.role === 'admin' && me.role !== 'owner')) throw forbidden('insufficient_role', 'Dafür fehlt dir die Berechtigung.');
    }
    const res = await withTx(db, (tx) => removeMemberTx(ctx, tx, id, userId, uid));
    if (res.system) { const [v] = await hydrateMessages(db, [res.system]); if (v) await publishNewMessage(ctx, v); }
    emitConversationUpdated(ctx, [...res.remaining, userId], id);
    return { ok: true };
  });

  app.patch('/api/conversations/:id/members/:userId', auth, async (req) => {
    const { id, userId } = parse(z.object({ id: uuid, userId: uuid }), req.params);
    const { role } = parse(z.object({ role: z.enum(['admin', 'member']) }), req.body);
    const uid = req.auth!.userId;
    const { conv, me } = await requireMember(db, id, uid);
    if (conv.type !== 'group') throw badRequest('not_a_group');
    if (!isAdmin(me)) throw forbidden('admin_only');
    const t = (await db.query('select role from conversation_members where conversation_id = $1 and user_id = $2 and left_at is null', [id, userId])).rows[0];
    if (!t) throw notFound('member_not_found');
    if (t.role === 'owner') throw forbidden('insufficient_role', 'Der Inhaber behält seine Rolle.');
    if (t.role === 'admin' && me.role !== 'owner') throw forbidden('insufficient_role', 'Nur der Inhaber kann Admins ändern.');
    await db.query('update conversation_members set role = $3 where conversation_id = $1 and user_id = $2', [id, userId, role]);
    emitConversationUpdated(ctx, await activeMemberIds(db, id), id);
    return { ok: true };
  });

  // ---- Persönliche Chat-Einstellungen (archivieren, anheften, stummschalten)
  app.patch('/api/conversations/:id/me', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    await requireMember(db, id, uid);
    const body = parse(
      z.object({ archived: z.boolean(), pinned: z.boolean(), mutedUntil: z.string().datetime().nullable() }).partial().strict(),
      req.body,
    );
    if (body.pinned) {
      const n = (await db.query('select count(*)::int c from conversation_members where user_id = $1 and pinned_at is not null and left_at is null and conversation_id <> $2', [uid, id])).rows[0].c;
      if (n >= 5) throw badRequest('too_many_pins', 'Du kannst höchstens 5 Chats anheften.');
    }
    await db.query(
      `update conversation_members set archived = coalesce($3, archived),
         pinned_at = case when $4::boolean is null then pinned_at when $4 then coalesce(pinned_at, now()) else null end,
         muted_until = case when $5::boolean then $6::timestamptz else muted_until end
       where conversation_id = $1 and user_id = $2`,
      [id, uid, body.archived ?? null, body.pinned ?? null, body.mutedUntil !== undefined, body.mutedUntil ?? null],
    );
    hub.send(uid, { type: 'conversation.updated', conversationId: id });
    return { conversation: (await loadConversationViews(ctx, uid, id))[0] };
  });

  // ---- Als gelesen markieren
  app.post('/api/conversations/:id/read', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv } = await requireMember(db, id, uid);
    const { seq } = parse(z.object({ seq: z.number().int().min(0).optional() }), req.body ?? {});
    const upTo = Math.min(seq ?? conv.last_seq, conv.last_seq);
    const { rows } = await db.query(
      `update conversation_members set last_read_seq = greatest(last_read_seq, $3), last_delivered_seq = greatest(last_delivered_seq, $3)
        where conversation_id = $1 and user_id = $2 returning last_read_seq`,
      [id, uid, upTo],
    );
    const share = (await db.query('select read_receipts from user_privacy where user_id = $1', [uid])).rows[0]?.read_receipts;
    const members = await activeMemberIds(db, id);
    if (share) hub.sendMany(members.filter((m) => m !== uid), { type: 'receipt', conversationId: id, userId: uid, kind: 'read', seq: rows[0].last_read_seq });
    hub.send(uid, { type: 'conversation.read', conversationId: id, seq: rows[0].last_read_seq });
    return { ok: true, seq: rows[0].last_read_seq };
  });

  // ---- Chat leeren (nur für mich)
  app.post('/api/conversations/:id/clear', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv } = await requireMember(db, id, uid);
    await db.query('update conversation_members set history_from_seq = $3, last_read_seq = $3 where conversation_id = $1 and user_id = $2', [id, uid, conv.last_seq]);
    hub.send(uid, { type: 'conversation.updated', conversationId: id });
    return { ok: true };
  });

  // ---- Einladungslinks
  app.post('/api/conversations/:id/invites', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const { conv, me } = await requireMember(db, id, uid);
    if (conv.type !== 'group') throw badRequest('not_a_group');
    if (!isAdmin(me)) throw forbidden('admin_only', 'Nur Admins dürfen Einladungslinks erstellen.');
    const body = parse(z.object({ expiresInHours: z.number().min(1).max(24 * 90).optional(), maxUses: z.number().int().min(1).max(1000).optional() }), req.body ?? {});
    const code = randomBytes(12).toString('base64url');
    await db.query(
      `insert into group_invites(code, conversation_id, created_by, expires_at, max_uses)
       values ($1,$2,$3, case when $4::float is null then null else now() + make_interval(hours => $4::float::int) end, $5)`,
      [code, id, uid, body.expiresInHours ?? null, body.maxUses ?? null],
    );
    await audit(db, req, uid, 'group_invite_created', { conversationId: id });
    return { code, url: `${cfg.PUBLIC_URL}/join/${code}` };
  });

  app.get('/api/conversations/:id/invites', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { me } = await requireMember(db, id, req.auth!.userId);
    if (!isAdmin(me)) throw forbidden('admin_only');
    const { rows } = await db.query(
      `select code, expires_at, max_uses, uses, created_at from group_invites
        where conversation_id = $1 and revoked_at is null and (expires_at is null or expires_at > now()) order by created_at desc`, [id]);
    return { invites: rows.map((r) => ({ code: r.code, url: `${cfg.PUBLIC_URL}/join/${r.code}`, expiresAt: r.expires_at?.toISOString() ?? null, maxUses: r.max_uses, uses: r.uses })) };
  });

  app.delete('/api/conversations/:id/invites/:code', auth, async (req) => {
    const { id, code } = parse(z.object({ id: uuid, code: z.string().max(64) }), req.params);
    const { me } = await requireMember(db, id, req.auth!.userId);
    if (!isAdmin(me)) throw forbidden('admin_only');
    await db.query('update group_invites set revoked_at = now() where conversation_id = $1 and code = $2', [id, code]);
    return { ok: true };
  });

  app.get('/api/invites/:code', auth, async (req) => {
    const { code } = parse(z.object({ code: z.string().max(64) }), req.params);
    const inv = await findInvite(db, code);
    const c = (await db.query(
      `select title, description, avatar_media_id, (select count(*)::int from conversation_members where conversation_id = $1 and left_at is null) as members from conversations where id = $1`, [inv.conversation_id])).rows[0];
    return { title: c.title, description: c.description, memberCount: c.members, avatarUrl: c.avatar_media_id ? `/api/media/${c.avatar_media_id}` : null };
  });

  app.post('/api/invites/:code/join', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const { code } = parse(z.object({ code: z.string().max(64) }), req.params);
    const uid = req.auth!.userId;
    const inv = await findInvite(db, code);
    const cid = inv.conversation_id as string;
    const banned = await db.query(
      `select 1 from conversation_members cm join blocks b on (b.blocker_id = $1 and b.blocked_id = cm.user_id) or (b.blocked_id = $1 and b.blocker_id = cm.user_id)
        where cm.conversation_id = $2 and cm.role = 'owner' and cm.left_at is null`, [uid, cid]);
    if (banned.rowCount) throw forbidden('cannot_join', 'Beitritt nicht möglich.');
    const sys = await withTx(db, async (tx) => {
      const lock = (await tx.query('select * from group_invites where code = $1 for update', [code])).rows[0];
      if (!lock || lock.revoked_at || (lock.expires_at && lock.expires_at < new Date()) || (lock.max_uses && lock.uses >= lock.max_uses)) throw notFound('invite_invalid', 'Einladung ungültig oder abgelaufen.');
      const cnt = (await tx.query('select count(*)::int c from conversation_members where conversation_id = $1 and left_at is null', [cid])).rows[0].c;
      const r = await tx.query(
        `insert into conversation_members(conversation_id, user_id, history_from_seq)
         values ($1,$2,(select last_seq from conversations where id = $1))
         on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at = now(),
           history_from_seq = (select last_seq from conversations where id = $1), archived = false
         where conversation_members.left_at is not null returning user_id`, [cid, uid]);
      if (!r.rows[0]) return null; // bereits Mitglied
      if (cnt >= MAX_GROUP_MEMBERS) throw badRequest('group_full', 'Die Gruppe ist voll.');
      await tx.query('update group_invites set uses = uses + 1 where code = $1', [code]);
      return (await createMessage(ctx, tx, { conversationId: cid, senderId: uid, kind: 'system', systemEvent: { type: 'member_joined_via_link', userId: uid } })).row;
    });
    if (sys) { const [v] = await hydrateMessages(db, [sys]); if (v) await publishNewMessage(ctx, v); }
    emitConversationUpdated(ctx, await activeMemberIds(db, cid), cid);
    return { conversation: (await loadConversationViews(ctx, uid, cid))[0] };
  });
}

async function findInvite(db: import('../db/pool.js').Db, code: string) {
  const { rows } = await db.query(
    `select * from group_invites where code = $1 and revoked_at is null and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses)`, [code]);
  if (!rows[0]) throw notFound('invite_invalid', 'Einladung ungültig oder abgelaufen.');
  return rows[0];
}

async function assertOwnMedia(db: import('../db/pool.js').Db, mediaId: string, userId: string, purpose: string) {
  const { rows } = await db.query(`select 1 from media where id = $1 and owner_id = $2 and purpose = $3 and deleted_at is null`, [mediaId, userId, purpose]);
  if (!rows[0]) throw badRequest('invalid_media', 'Ungültiges Bild.');
}

/** Prüft, ob `adder` die Benutzer in eine Gruppe aufnehmen darf (Kontakt-/Privatsphäre-/Blockregeln). */
async function assertCanAdd(db: import('../db/pool.js').Db, adder: string, ids: string[]) {
  if (!ids.length) return;
  const { rows } = await db.query(
    `select u.id, is_blocked_between($1, u.id) as blocked, are_contacts($1, u.id) as contact, p.group_add_from
       from users u join user_privacy p on p.user_id = u.id where u.id = any($2) and u.deleted_at is null`, [adder, ids]);
  if (rows.length !== ids.length) throw notFound('user_not_found', 'Mindestens ein Benutzer wurde nicht gefunden.');
  for (const r of rows) {
    if (r.blocked) throw forbidden('cannot_add', 'Mindestens ein Benutzer kann nicht hinzugefügt werden.');
    if (!r.contact && r.group_add_from !== 'everyone') throw forbidden('cannot_add', 'Du kannst nur Kontakte hinzufügen.');
  }
}

async function notifyAdded(ctx: import('../context.js').Ctx, userId: string, conversationId: string, byId: string) {
  const r = (await ctx.db.query('select c.title, u.display_name from conversations c, users u where c.id = $1 and u.id = $2', [conversationId, byId])).rows[0];
  if (!r) return;
  await ctx.push.notifyUser(userId, {
    kind: 'group', title: 'Neue Gruppe', body: `${r.display_name} hat dich zu „${r.title}“ hinzugefügt`, url: `/chats/${conversationId}`, tag: `join-${conversationId}`,
  }).catch(() => 0);
}

void conflict;
