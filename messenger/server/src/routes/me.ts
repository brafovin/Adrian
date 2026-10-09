import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { withTx } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { clearSessionCookie } from '../lib/session.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../lib/guard.js';
import { getSettings, settingsSchema } from '../lib/settings.js';
import {
  RESERVED_USERNAMES, displayNameSchema, parse, passwordSchema, usernameSchema, uuid,
} from '../lib/validate.js';
import { removeMemberTx } from '../lib/groups.js';
import { hydrateMessages, publishNewMessage } from '../lib/messages.js';
import { emitConversationUpdated } from '../lib/conversations.js';
import { purgeMedia } from './media.js';

const PRIVACY_MAP = {
  avatarVis: 'avatar_vis', bioVis: 'bio_vis', onlineVis: 'online_vis', lastSeenVis: 'last_seen_vis', statusVis: 'status_vis',
  groupsVis: 'groups_vis', contactRequests: 'contact_requests', dmFrom: 'dm_from', callsFrom: 'calls_from',
  groupAddFrom: 'group_add_from', discoverable: 'discoverable', readReceipts: 'read_receipts',
} as const;

const privacyPatch = z
  .object({
    avatarVis: z.enum(['everyone', 'contacts', 'nobody']),
    bioVis: z.enum(['everyone', 'contacts', 'nobody']),
    onlineVis: z.enum(['everyone', 'contacts', 'nobody']),
    lastSeenVis: z.enum(['everyone', 'contacts', 'nobody']),
    statusVis: z.enum(['contacts', 'nobody']),
    groupsVis: z.enum(['everyone', 'contacts', 'nobody']),
    contactRequests: z.enum(['everyone', 'nobody']),
    dmFrom: z.enum(['everyone', 'contacts']),
    callsFrom: z.enum(['everyone', 'contacts', 'nobody']),
    groupAddFrom: z.enum(['everyone', 'contacts']),
    discoverable: z.boolean(),
    readReceipts: z.boolean(),
  })
  .partial()
  .strict();

async function privacyView(ctx: Ctx, userId: string) {
  const { rows } = await ctx.db.query('select * from user_privacy where user_id = $1', [userId]);
  return Object.fromEntries(Object.entries(PRIVACY_MAP).map(([k, col]) => [k, rows[0][col]]));
}

export async function meView(ctx: Ctx, userId: string) {
  const { rows } = await ctx.db.query(
    'select id, email::text as email, email_verified_at, username::text as username, display_name, bio, avatar_media_id, created_at from users where id = $1',
    [userId],
  );
  const u = rows[0];
  if (!u) throw notFound('user_not_found');
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.email_verified_at,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio,
    avatarUrl: u.avatar_media_id ? `/api/media/${u.avatar_media_id}` : null,
    createdAt: u.created_at.toISOString(),
    privacy: await privacyView(ctx, userId),
    settings: await getSettings(ctx.db, userId),
  };
}

const settingsPatch = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    language: z.enum(['de', 'en']),
    enterToSend: z.boolean(),
    notify: z
      .object({
        messages: z.boolean(), requests: z.boolean(), calls: z.boolean(), groups: z.boolean(), status: z.boolean(), hidePreviews: z.boolean(),
      })
      .partial(),
  })
  .partial()
  .strict();

export async function meRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, cfg, hub } = ctx;
  const auth = { preHandler: requireAuth };

  app.get('/api/me', auth, async (req) => ({ user: await meView(ctx, req.auth!.userId) }));

  app.patch('/api/me', auth, async (req) => {
    const uid = req.auth!.userId;
    const body = parse(
      z.object({ displayName: displayNameSchema, bio: z.string().max(300), username: usernameSchema }).partial().strict(),
      req.body,
    );
    if (body.username) {
      if (RESERVED_USERNAMES.has(body.username.toLowerCase())) throw conflict('username_taken', 'Benutzername ist vergeben.');
    }
    try {
      await db.query(
        `update users set display_name = coalesce($2, display_name), bio = coalesce($3, bio), username = coalesce($4, username), updated_at = now() where id = $1`,
        [uid, body.displayName ?? null, body.bio ?? null, body.username ?? null],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('username_taken', 'Benutzername ist vergeben.');
      throw e;
    }
    if (body.username) await audit(db, req, uid, 'username_changed');
    notifyContactsOfProfile(ctx, uid);
    return { user: await meView(ctx, uid) };
  });

  app.put('/api/me/avatar', auth, async (req) => {
    const uid = req.auth!.userId;
    const { mediaId } = parse(z.object({ mediaId: uuid }), req.body);
    const { rows } = await db.query(`select id from media where id = $1 and owner_id = $2 and purpose = 'avatar' and kind = 'image' and deleted_at is null`, [mediaId, uid]);
    if (!rows[0]) throw badRequest('invalid_media', 'Ungültiges Bild.');
    const old = (await db.query('select avatar_media_id from users where id = $1', [uid])).rows[0]?.avatar_media_id;
    await db.query('update users set avatar_media_id = $2, updated_at = now() where id = $1', [uid, mediaId]);
    if (old && old !== mediaId) await removeIfUnused(ctx, old);
    notifyContactsOfProfile(ctx, uid);
    return { user: await meView(ctx, uid) };
  });

  app.delete('/api/me/avatar', auth, async (req) => {
    const uid = req.auth!.userId;
    const old = (await db.query('select avatar_media_id from users where id = $1', [uid])).rows[0]?.avatar_media_id;
    await db.query('update users set avatar_media_id = null, updated_at = now() where id = $1', [uid]);
    if (old) await removeIfUnused(ctx, old);
    notifyContactsOfProfile(ctx, uid);
    return { user: await meView(ctx, uid) };
  });

  app.patch('/api/me/privacy', auth, async (req) => {
    const uid = req.auth!.userId;
    const body = parse(privacyPatch, req.body);
    const entries = Object.entries(body);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${PRIVACY_MAP[k as keyof typeof PRIVACY_MAP]} = $${i + 2}`).join(', ');
      await db.query(`update user_privacy set ${sets} where user_id = $1`, [uid, ...entries.map(([, v]) => v)]);
      await audit(db, req, uid, 'privacy_changed', body);
      notifyContactsOfProfile(ctx, uid);
    }
    return { privacy: await privacyView(ctx, uid) };
  });

  app.patch('/api/me/settings', auth, async (req) => {
    const uid = req.auth!.userId;
    const patch = parse(settingsPatch, req.body);
    const cur = await getSettings(db, uid);
    const merged = settingsSchema.parse({ ...cur, ...patch, notify: { ...cur.notify, ...(patch.notify ?? {}) } });
    await db.query(
      `insert into user_settings(user_id, data) values ($1,$2) on conflict (user_id) do update set data = $2, updated_at = now()`,
      [uid, JSON.stringify(merged)],
    );
    hub.send(uid, { type: 'settings.updated', settings: merged });
    return { settings: merged };
  });

  app.put('/api/me/password', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const uid = req.auth!.userId;
    const body = parse(z.object({ currentPassword: z.string().max(200), newPassword: passwordSchema }), req.body);
    const { rows } = await db.query('select password_hash, email::text as email from users where id = $1', [uid]);
    if (!(await verifyPassword(body.currentPassword, rows[0].password_hash))) throw forbidden('invalid_credentials', 'Aktuelles Passwort ist falsch.');
    await db.query('update users set password_hash = $2, updated_at = now() where id = $1', [uid, await hashPassword(body.newPassword, cfg.SCRYPT_LOG_N)]);
    const others = await db.query('update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null returning id', [uid, req.auth!.sessionId]);
    for (const s of others.rows) hub.dropSession(s.id);
    await audit(db, req, uid, 'password_changed');
    await ctx.mailer.send({ to: rows[0].email, subject: 'Dein Passwort wurde geändert', text: 'Dein Passwort wurde soeben geändert. Warst du das nicht, setze es sofort über „Passwort vergessen“ zurück.' });
    return { ok: true };
  });

  app.get('/api/me/sessions', auth, async (req) => {
    const { rows } = await db.query(
      `select id, device_name, user_agent, ip, created_at, last_used_at from sessions
        where user_id = $1 and revoked_at is null and expires_at > now() order by last_used_at desc`,
      [req.auth!.userId],
    );
    return {
      sessions: rows.map((s) => ({
        id: s.id, deviceName: s.device_name, userAgent: s.user_agent, ip: s.ip,
        createdAt: s.created_at.toISOString(), lastUsedAt: s.last_used_at.toISOString(), current: s.id === req.auth!.sessionId,
      })),
    };
  });

  app.delete('/api/me/sessions/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { rowCount } = await db.query('update sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null', [id, req.auth!.userId]);
    if (!rowCount) throw notFound('session_not_found');
    await db.query('delete from push_subscriptions where session_id = $1', [id]);
    hub.dropSession(id);
    await audit(db, req, req.auth!.userId, 'session_revoked');
    return { ok: true };
  });

  // ------------------------------------------------------------- Push-Registrierung
  app.get('/api/push/config', async () => ({ webPushPublicKey: cfg.VAPID_PUBLIC_KEY ?? null }));

  app.put('/api/push/subscription', auth, async (req) => {
    const body = parse(
      z.discriminatedUnion('provider', [
        z.object({ provider: z.literal('webpush'), endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }),
        z.object({ provider: z.enum(['fcm', 'apns']), endpoint: z.string().min(10).max(1000), keys: z.object({}).optional() }),
      ]),
      req.body,
    );
    await db.query(
      `insert into push_subscriptions(user_id, session_id, provider, endpoint, keys) values ($1,$2,$3,$4,$5)
       on conflict (provider, endpoint) do update set user_id = $1, session_id = $2, keys = $5`,
      [req.auth!.userId, req.auth!.sessionId, body.provider, body.endpoint, JSON.stringify(body.keys ?? {})],
    );
    return { ok: true };
  });

  app.delete('/api/push/subscription', auth, async (req) => {
    const { endpoint } = parse(z.object({ endpoint: z.string().min(10).max(1000) }), req.body);
    await db.query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [req.auth!.userId, endpoint]);
    return { ok: true };
  });

  // ------------------------------------------------------------- Datenexport (DSGVO Art. 20)
  app.get('/api/me/export', { ...auth, config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req, reply) => {
    const uid = req.auth!.userId;
    const q = async (sql: string) => (await db.query(sql, [uid])).rows;
    const msgRows = (await db.query(
      `select m.* from messages m join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = $1
        where m.seq > cm.history_from_seq and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = $1)
        order by m.conversation_id, m.seq`, [uid])).rows;
    const data = {
      exportedAt: new Date().toISOString(),
      account: await meView(ctx, uid),
      contacts: await q(`select u.username::text as username, u.display_name, c.created_at from contacts c join users u on u.id = c.contact_id where c.user_id = $1`),
      blocked: await q(`select u.username::text as username, b.created_at from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1`),
      conversations: await q(`select c.id, c.type, c.title, cm.role, cm.joined_at from conversations c join conversation_members cm on cm.conversation_id = c.id where cm.user_id = $1`),
      messages: (await hydrateMessages(db, msgRows)).map((m) => ({ ...m, mine: m.senderId === uid })),
      statuses: await q(`select id, kind, body, visibility, published_at, expires_at from statuses where user_id = $1 and deleted_at is null`),
      calls: await q(`select id, caller_id, callee_id, kind, state, created_at, answered_at, ended_at from calls where caller_id = $1 or callee_id = $1`),
      media: await q(`select id, purpose, kind, mime, size, original_name, created_at from media where owner_id = $1 and deleted_at is null`),
      sessions: await q(`select device_name, created_at, last_used_at from sessions where user_id = $1`),
      auditLog: await q(`select action, ip, created_at from audit_log where user_id = $1 order by created_at`),
    };
    await audit(db, req, uid, 'data_export');
    reply.header('Content-Disposition', 'attachment; filename="adrian-datenexport.json"');
    return data;
  });

  // ------------------------------------------------------------- Konto löschen
  app.delete('/api/me', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const uid = req.auth!.userId;
    const { password } = parse(z.object({ password: z.string().max(200) }), req.body);
    const u = (await db.query('select password_hash, email::text as email, username::text as username from users where id = $1', [uid])).rows[0];
    if (!u || !(await verifyPassword(password, u.password_hash))) throw forbidden('invalid_credentials', 'Passwort ist falsch.');

    const media = (await db.query('select id, storage_key, thumb_key from media where owner_id = $1', [uid])).rows;
    const peers = new Set<string>();
    const events: { memberIds: string[]; conversationId: string; msg?: import('../lib/messages.js').MsgRow }[] = [];

    await withTx(db, async (tx) => {
      const convs = (await tx.query(
        `select c.id, c.type from conversations c join conversation_members cm on cm.conversation_id = c.id where cm.user_id = $1 and cm.left_at is null`, [uid])).rows;
      for (const c of convs) {
        if (c.type === 'group') {
          const r = await removeMemberTx(ctx, tx, c.id, uid, null);
          events.push({ memberIds: r.remaining, conversationId: c.id, msg: r.system ?? undefined });
        } else {
          const others = (await tx.query('select user_id from conversation_members where conversation_id = $1 and user_id <> $2', [c.id, uid])).rows.map((r) => r.user_id);
          others.forEach((o) => peers.add(o));
          events.push({ memberIds: others, conversationId: c.id });
        }
      }
      // Inhalte des Kontos unkenntlich machen (Absender wird zu „Gelöschter Nutzer“).
      await tx.query(`update messages set body = '', media_id = null, deleted_at = coalesce(deleted_at, now()) where sender_id = $1 and kind <> 'system'`, [uid]);
      await tx.query('delete from audit_log where user_id = $1', [uid]);
      await tx.query('delete from login_attempts where identifier in ($1, $2)', [u.email.toLowerCase(), u.username.toLowerCase()]);
      await tx.query('delete from users where id = $1', [uid]);
      await tx.query(`insert into audit_log(user_id, action, meta) values (null, 'account_deleted', '{}')`);
    });
    for (const m of media) {
      await ctx.storage.delete(m.storage_key).catch(() => {});
      if (m.thumb_key) await ctx.storage.delete(m.thumb_key).catch(() => {});
    }
    hub.dropUser(uid);
    for (const e of events) {
      if (e.msg) {
        const [view] = await hydrateMessages(db, [e.msg]);
        if (view) await publishNewMessage(ctx, view);
      }
      emitConversationUpdated(ctx, e.memberIds, e.conversationId);
    }
    peers.forEach((p) => hub.send(p, { type: 'contacts.changed' }));
    clearSessionCookie(reply);
    return { ok: true };
  });
}

/** Benachrichtigt Kontakte (und Chatpartner), dass sich Profil/Privatsphäre geändert hat → Clients laden neu. */
export function notifyContactsOfProfile(ctx: Ctx, userId: string): void {
  void ctx.db
    .query('select contact_id from contacts where user_id = $1 union select user_id from conversation_members where conversation_id in (select conversation_id from conversation_members where user_id = $1) and user_id <> $1', [userId])
    .then(({ rows }) => ctx.hub.sendMany(rows.map((r) => r.contact_id), { type: 'profile.updated', userId }));
}

async function removeIfUnused(ctx: Ctx, mediaId: string) {
  const used = await ctx.db.query(
    `select 1 from users where avatar_media_id = $1 union all select 1 from messages where media_id = $1 union all select 1 from conversations where avatar_media_id = $1 limit 1`,
    [mediaId],
  );
  if (used.rowCount) return;
  const { rows } = await ctx.db.query('select id, storage_key, thumb_key from media where id = $1', [mediaId]);
  await purgeMedia(ctx, rows);
}

void unauthorized;
