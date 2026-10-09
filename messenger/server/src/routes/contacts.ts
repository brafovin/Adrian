import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTx } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../lib/errors.js';
import { requireAuth } from '../lib/guard.js';
import { parse, uuid } from '../lib/validate.js';
import { publicUserCols, toPublicUser } from '../lib/users.js';

export async function contactRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, hub } = ctx;
  const auth = { preHandler: requireAuth };

  const userSelect = `select ${publicUserCols('$1')},
      case when u.id = $1 then 'self'
           when are_contacts($1, u.id) then 'contact'
           when exists (select 1 from contact_requests r where r.from_user_id = $1 and r.to_user_id = u.id and r.status = 'pending') then 'pending_out'
           when exists (select 1 from contact_requests r where r.to_user_id = $1 and r.from_user_id = u.id and r.status = 'pending') then 'pending_in'
           else 'none' end as relation,
      p.contact_requests as accepts_requests, p.calls_from, p.dm_from, p.discoverable
    from users u join user_privacy p on p.user_id = u.id`;

  const view = (r: Record<string, any>) => ({
    ...toPublicUser(r as never, hub), relation: r.relation as string,
    canRequest: r.relation === 'none' && r.accepts_requests === 'everyone',
  });

  app.get('/api/users/search', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(50) }), req.query);
    const uid = req.auth!.userId;
    const term = q.replace(/^@/, '');
    const esc = term.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { rows } = await db.query(
      `${userSelect}
        where u.id <> $1 and u.deleted_at is null and u.email_verified_at is not null
          and not is_blocked_between($1, u.id)
          and (p.discoverable or are_contacts($1, u.id))
          and (u.username::text ilike $2 or u.display_name ilike $3)
        order by (lower(u.username::text) = lower($4)) desc, are_contacts($1, u.id) desc, u.username limit 20`,
      [uid, `${esc}%`, `%${esc}%`, term],
    );
    return { users: rows.map(view) };
  });

  app.get('/api/users/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const uid = req.auth!.userId;
    const byName = !/^[0-9a-f-]{36}$/i.test(id);
    const { rows } = await db.query(
      `${userSelect} where ${byName ? 'u.username = $2' : 'u.id = $2::uuid'} and u.deleted_at is null and not is_blocked_between($1, u.id)`,
      [uid, byName ? id.replace(/^@/, '') : id],
    );
    const r = rows[0];
    if (!r) throw notFound('user_not_found', 'Benutzer nicht gefunden.');
    if (!r.discoverable && r.relation === 'none') {
      const shared = await db.query(
        `select 1 from conversation_members a join conversation_members b on b.conversation_id = a.conversation_id and b.user_id = $2 and b.left_at is null
          where a.user_id = $1 and a.left_at is null limit 1`, [uid, r.id]);
      if (!shared.rowCount) throw notFound('user_not_found', 'Benutzer nicht gefunden.');
    }
    let sharedGroups: { id: string; title: string }[] = [];
    const showGroups = (await db.query('select can_see($1, $2, groups_vis) ok from user_privacy where user_id = $2', [uid, r.id])).rows[0]?.ok;
    if (showGroups && r.id !== uid) {
      sharedGroups = (await db.query(
        `select c.id, c.title from conversations c
           join conversation_members a on a.conversation_id = c.id and a.user_id = $1 and a.left_at is null
           join conversation_members b on b.conversation_id = c.id and b.user_id = $2 and b.left_at is null
          where c.type = 'group' order by c.title`, [uid, r.id])).rows;
    }
    const canCall = r.id !== uid && (await db.query(
      `select (calls_from = 'everyone' or (calls_from = 'contacts' and are_contacts($2, $1))) as ok from user_privacy where user_id = $1`, [r.id, uid])).rows[0]?.ok;
    return { user: { ...view(r), sharedGroups: showGroups ? sharedGroups : null, canCall: !!canCall } };
  });

  app.get('/api/contacts', auth, async (req) => {
    const uid = req.auth!.userId;
    const { rows } = await db.query(
      `${userSelect} where u.id in (select contact_id from contacts where user_id = $1) and u.deleted_at is null order by lower(u.display_name)`, [uid]);
    return { contacts: rows.map(view) };
  });

  app.get('/api/contact-requests', auth, async (req) => {
    const uid = req.auth!.userId;
    const { rows } = await db.query(
      `select r.id, r.from_user_id, r.to_user_id, r.created_at from contact_requests r
        where r.status = 'pending' and (r.from_user_id = $1 or r.to_user_id = $1)
          and not is_blocked_between(r.from_user_id, r.to_user_id) order by r.created_at desc`, [uid]);
    const otherIds = rows.map((r) => (r.from_user_id === uid ? r.to_user_id : r.from_user_id));
    const users = otherIds.length ? (await db.query(`${userSelect} where u.id = any($2)`, [uid, otherIds])).rows : [];
    const map = new Map(users.map((u) => [u.id, view(u)]));
    const shape = (r: (typeof rows)[number]) => ({
      id: r.id, createdAt: r.created_at.toISOString(),
      user: map.get(r.from_user_id === uid ? r.to_user_id : r.from_user_id) ?? null,
    });
    return {
      incoming: rows.filter((r) => r.to_user_id === uid).map(shape).filter((r) => r.user),
      outgoing: rows.filter((r) => r.from_user_id === uid).map(shape).filter((r) => r.user),
    };
  });

  async function makeContacts(a: string, b: string) {
    await db.query(`insert into contacts(user_id, contact_id) values ($1,$2),($2,$1) on conflict do nothing`, [a, b]);
  }

  app.post('/api/contact-requests', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const uid = req.auth!.userId;
    const { userId } = parse(z.object({ userId: uuid }), req.body);
    if (userId === uid) throw badRequest('invalid_user', 'Das bist du selbst.');
    const t = (await db.query(
      `select p.contact_requests, is_blocked_between($1, u.id) as blocked, are_contacts($1, u.id) as contact, me.display_name
         from users u join user_privacy p on p.user_id = u.id, users me where u.id = $2 and u.deleted_at is null and me.id = $1`, [uid, userId])).rows[0];
    if (!t) throw notFound('user_not_found', 'Benutzer nicht gefunden.');
    if (t.blocked) throw forbidden('cannot_request', 'Anfrage nicht möglich.');
    if (t.contact) throw conflict('already_contact', 'Ihr seid bereits Kontakte.');
    const incoming = (await db.query(`select id from contact_requests where from_user_id = $1 and to_user_id = $2 and status = 'pending'`, [userId, uid])).rows[0];
    if (incoming) {
      await db.query(`update contact_requests set status = 'accepted', responded_at = now() where id = $1`, [incoming.id]);
      await makeContacts(uid, userId);
      hub.sendMany([uid, userId], { type: 'contacts.changed' });
      return reply.code(200).send({ status: 'accepted' });
    }
    if (t.contact_requests === 'nobody') throw forbidden('requests_disabled', 'Dieser Nutzer nimmt keine Kontaktanfragen an.');
    const day = (await db.query(`select count(*)::int c from contact_requests where from_user_id = $1 and created_at > now() - interval '24 hours'`, [uid])).rows[0].c;
    if (day >= 50) throw tooMany('request_limit', 'Tageslimit für Kontaktanfragen erreicht.');
    try {
      const { rows } = await db.query(`insert into contact_requests(from_user_id, to_user_id) values ($1,$2) returning id`, [uid, userId]);
      hub.send(userId, { type: 'contact.request', requestId: rows[0].id });
      hub.send(uid, { type: 'contacts.changed' });
      void ctx.push.notifyUser(userId, { kind: 'request', title: 'Neue Kontaktanfrage', body: `${t.display_name} möchte dich als Kontakt hinzufügen`, url: '/contacts', tag: `req-${uid}` }).catch(() => 0);
      return reply.code(201).send({ status: 'pending', id: rows[0].id });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('request_exists', 'Anfrage wurde bereits gesendet.');
      throw e;
    }
  });

  app.post('/api/contact-requests/:id/:action', auth, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(['accept', 'decline']) }), req.params);
    const uid = req.auth!.userId;
    const r = (await db.query(`select * from contact_requests where id = $1 and to_user_id = $2 and status = 'pending'`, [id, uid])).rows[0];
    if (!r) throw notFound('request_not_found', 'Anfrage nicht gefunden.');
    if (action === 'accept') {
      if ((await db.query('select is_blocked_between($1,$2) b', [uid, r.from_user_id])).rows[0].b) throw forbidden('cannot_request');
      await db.query(`update contact_requests set status = 'accepted', responded_at = now() where id = $1`, [id]);
      await makeContacts(uid, r.from_user_id);
      const me = (await db.query('select display_name from users where id = $1', [uid])).rows[0];
      void ctx.push.notifyUser(r.from_user_id, { kind: 'request', title: 'Kontaktanfrage angenommen', body: `${me.display_name} ist jetzt dein Kontakt`, url: '/contacts', tag: `req-${uid}` }).catch(() => 0);
    } else {
      await db.query(`update contact_requests set status = 'declined', responded_at = now() where id = $1`, [id]);
    }
    hub.sendMany([uid, r.from_user_id], { type: 'contacts.changed' });
    return { ok: true };
  });

  app.delete('/api/contact-requests/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const uid = req.auth!.userId;
    const r = (await db.query(`update contact_requests set status = 'cancelled', responded_at = now() where id = $1 and from_user_id = $2 and status = 'pending' returning to_user_id`, [id, uid])).rows[0];
    if (!r) throw notFound('request_not_found');
    hub.sendMany([uid, r.to_user_id], { type: 'contacts.changed' });
    return { ok: true };
  });

  app.delete('/api/contacts/:userId', auth, async (req) => {
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    const uid = req.auth!.userId;
    await db.query('delete from contacts where (user_id = $1 and contact_id = $2) or (user_id = $2 and contact_id = $1)', [uid, userId]);
    hub.sendMany([uid, userId], { type: 'contacts.changed' });
    return { ok: true };
  });

  app.get('/api/blocks', auth, async (req) => {
    const { rows } = await db.query(
      `select u.id, u.username::text as username, u.display_name, u.avatar_media_id from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`, [req.auth!.userId]);
    return { blocked: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_media_id ? `/api/media/${r.avatar_media_id}` : null })) };
  });

  app.post('/api/blocks', auth, async (req) => {
    const uid = req.auth!.userId;
    const { userId } = parse(z.object({ userId: uuid }), req.body);
    if (userId === uid) throw badRequest('invalid_user');
    const exists = await db.query('select 1 from users where id = $1 and deleted_at is null', [userId]);
    if (!exists.rowCount) throw notFound('user_not_found');
    await withTx(db, async (tx) => {
      await tx.query('insert into blocks(blocker_id, blocked_id) values ($1,$2) on conflict do nothing', [uid, userId]);
      await tx.query('delete from contacts where (user_id = $1 and contact_id = $2) or (user_id = $2 and contact_id = $1)', [uid, userId]);
      await tx.query(`update contact_requests set status = 'cancelled', responded_at = now()
                       where status = 'pending' and ((from_user_id = $1 and to_user_id = $2) or (from_user_id = $2 and to_user_id = $1))`, [uid, userId]);
    });
    await audit(db, req, uid, 'user_blocked', { userId });
    hub.sendMany([uid, userId], { type: 'contacts.changed' });
    hub.send(userId, { type: 'profile.updated', userId: uid });
    return { ok: true };
  });

  app.delete('/api/blocks/:userId', auth, async (req) => {
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    await db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [req.auth!.userId, userId]);
    hub.sendMany([req.auth!.userId, userId], { type: 'contacts.changed' });
    return { ok: true };
  });

  app.post('/api/reports', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const uid = req.auth!.userId;
    const b = parse(
      z.object({
        userId: uuid, conversationId: uuid.optional(), messageId: uuid.optional(),
        reason: z.enum(['spam', 'harassment', 'illegal', 'impersonation', 'other']), details: z.string().max(1000).default(''),
      }),
      req.body,
    );
    if (b.userId === uid) throw badRequest('invalid_user');
    if (!(await db.query('select 1 from users where id = $1', [b.userId])).rowCount) throw notFound('user_not_found');
    await db.query('insert into reports(reporter_id, reported_user_id, conversation_id, message_id, reason, details) values ($1,$2,$3,$4,$5,$6)',
      [uid, b.userId, b.conversationId ?? null, b.messageId ?? null, b.reason, b.details]);
    await audit(db, req, uid, 'user_reported', { userId: b.userId, reason: b.reason });
    return { ok: true };
  });
}
