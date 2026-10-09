import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../lib/errors.js';
import { COOKIE_NAME, bearerFrom, clearSessionCookie, createSession, setSessionCookie } from '../lib/session.js';
import {
  RESERVED_USERNAMES, displayNameSchema, emailSchema, parse, passwordSchema, usernameSchema,
} from '../lib/validate.js';
import { meView } from './me.js';

let dummyHash: Promise<string> | null = null;

export async function authRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db, cfg, mailer } = ctx;

  async function sendVerification(userId: string, email: string, displayName: string) {
    const token = randomToken(32);
    await db.query(
      `insert into email_tokens(user_id, kind, token_hash, expires_at) values ($1,'verify',$2, now() + interval '24 hours')`,
      [userId, sha256(token)],
    );
    await mailer.send({
      to: email,
      subject: 'Bestätige deine E-Mail-Adresse',
      text: `Hallo ${displayName},\n\nbitte bestätige deine E-Mail-Adresse:\n${cfg.PUBLIC_URL}/verify-email?token=${token}\n\nDer Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, ignoriere diese Nachricht.`,
    });
  }

  async function verifyTurnstile(token: string | undefined, ip: string) {
    if (!cfg.TURNSTILE_SECRET) return;
    if (!token) throw badRequest('captcha_required', 'Bitte Captcha lösen.');
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: cfg.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const j = (await res.json()) as { success?: boolean };
    if (!j.success) throw badRequest('captcha_failed', 'Captcha ungültig.');
  }

  app.get('/api/auth/username-available', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { username } = parse(z.object({ username: usernameSchema }), req.query);
    if (RESERVED_USERNAMES.has(username.toLowerCase())) return { available: false };
    const { rowCount } = await db.query('select 1 from users where username = $1', [username]);
    return { available: rowCount === 0 };
  });

  const registerSchema = z.object({
    email: emailSchema,
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    turnstileToken: z.string().optional(),
    /** Honeypot: echte Benutzer lassen das Feld leer. */
    website: z.string().optional(),
    deviceName: z.string().max(80).optional(),
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    if (body.website) return { ok: true, verificationRequired: true }; // Bot: stillschweigend verwerfen
    await verifyTurnstile(body.turnstileToken, req.ip);
    if (RESERVED_USERNAMES.has(body.username.toLowerCase())) throw conflict('username_taken', 'Benutzername ist vergeben.');
    if (body.password.toLowerCase().includes(body.username.toLowerCase()) || body.password.toLowerCase() === body.email) {
      throw badRequest('weak_password', 'Das Passwort darf nicht dem Benutzernamen oder der E-Mail entsprechen.');
    }

    const existing = await db.query('select id, username from users where email = $1 or username = $2', [body.email, body.username]);
    const byEmail = (await db.query('select id from users where email = $1', [body.email])).rows[0];
    if (existing.rows.some((r) => r.username.toLowerCase() === body.username.toLowerCase() && r.id !== byEmail?.id)) {
      throw conflict('username_taken', 'Benutzername ist vergeben.');
    }
    if (byEmail) {
      // Keine Auskunft, ob die Adresse registriert ist (Enumeration vermeiden) – der Besitzer wird per Mail informiert.
      await mailer.send({
        to: body.email,
        subject: 'Registrierungsversuch mit deiner E-Mail-Adresse',
        text: `Jemand hat versucht, mit dieser E-Mail-Adresse ein Konto zu erstellen. Du hast bereits eins – melde dich an oder nutze „Passwort vergessen“.\n${cfg.PUBLIC_URL}/login`,
      });
      return reply.code(201).send({ ok: true, verificationRequired: true });
    }

    const hash = await hashPassword(body.password, cfg.SCRYPT_LOG_N);
    let userId: string;
    try {
      const client = await db.connect();
      try {
        await client.query('begin');
        const r = await client.query(
          `insert into users(email, username, display_name, password_hash, email_verified_at)
           values ($1,$2,$3,$4, $5) returning id`,
          [body.email, body.username, body.displayName, hash, cfg.REQUIRE_EMAIL_VERIFICATION ? null : new Date()],
        );
        userId = r.rows[0].id;
        await client.query('insert into user_privacy(user_id) values ($1)', [userId]);
        await client.query('insert into user_settings(user_id) values ($1)', [userId]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') throw conflict('username_taken', 'Benutzername ist vergeben.');
      throw e;
    }
    await audit(db, req, userId, 'register');

    if (cfg.REQUIRE_EMAIL_VERIFICATION) {
      await sendVerification(userId, body.email, body.displayName);
      return reply.code(201).send({ ok: true, verificationRequired: true });
    }
    const { token } = await createSession(ctx, userId, req, body.deviceName ?? 'Gerät');
    setSessionCookie(ctx, reply, token);
    return reply.code(201).send({ ok: true, verificationRequired: false, user: await meView(ctx, userId) });
  });

  app.post('/api/auth/verify-email', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const { rows } = await db.query(
      `update email_tokens set used_at = now()
        where token_hash = $1 and kind = 'verify' and used_at is null and expires_at > now() returning user_id`,
      [sha256(token)],
    );
    if (!rows[0]) throw badRequest('invalid_token', 'Link ungültig oder abgelaufen.');
    await db.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [rows[0].user_id]);
    await audit(db, req, rows[0].user_id, 'email_verified');
    return { ok: true };
  });

  app.post('/api/auth/resend-verification', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const { rows } = await db.query('select id, display_name from users where email = $1 and email_verified_at is null', [email]);
    if (rows[0]) {
      await db.query(`update email_tokens set used_at = now() where user_id = $1 and kind = 'verify' and used_at is null`, [rows[0].id]);
      await sendVerification(rows[0].id, email, rows[0].display_name);
    }
    return { ok: true };
  });

  const loginSchema = z.object({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(200),
    deviceName: z.string().max(80).optional(),
    /** true: Token im Body zurückgeben (native Apps). Browser nutzen das httpOnly-Cookie. */
    returnToken: z.boolean().optional(),
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const ident = body.identifier.replace(/^@/, '').toLowerCase();

    const since = `now() - make_interval(mins => ${Number(cfg.LOGIN_LOCK_MINUTES)})`;
    const [byIdent, byIp] = await Promise.all([
      db.query(`select count(*)::int c from login_attempts where identifier = $1 and not success and created_at > ${since}`, [ident]),
      db.query(`select count(*)::int c from login_attempts where ip = $1 and not success and created_at > ${since}`, [req.ip]),
    ]);
    if (byIdent.rows[0].c >= cfg.LOGIN_MAX_FAILURES || byIp.rows[0].c >= cfg.LOGIN_MAX_FAILURES * 4) {
      throw tooMany('too_many_attempts', 'Zu viele Fehlversuche. Bitte später erneut versuchen.');
    }

    const { rows } = await db.query(
      `select id, password_hash, email_verified_at from users
        where deleted_at is null and (case when position('@' in $1) > 0 then email = $1 else username = $1 end)`,
      [ident],
    );
    const u = rows[0];
    dummyHash ??= hashPassword('dummy-password-for-timing', cfg.SCRYPT_LOG_N);
    const ok = u ? await verifyPassword(body.password, u.password_hash) : (await verifyPassword(body.password, await dummyHash), false);

    await db.query('insert into login_attempts(identifier, ip, success) values ($1,$2,$3)', [ident, req.ip, ok]);
    if (!ok) {
      if (u) await audit(db, req, u.id, 'login_failed');
      throw unauthorized('invalid_credentials', 'E-Mail/Benutzername oder Passwort ist falsch.');
    }
    if (cfg.REQUIRE_EMAIL_VERIFICATION && !u.email_verified_at) {
      throw forbidden('email_not_verified', 'Bitte bestätige zuerst deine E-Mail-Adresse.');
    }
    await db.query('delete from login_attempts where identifier = $1 and not success', [ident]);
    const { token } = await createSession(ctx, u.id, req, body.deviceName ?? 'Gerät');
    setSessionCookie(ctx, reply, token);
    await audit(db, req, u.id, 'login');
    return { user: await meView(ctx, u.id), ...(body.returnToken ? { token } : {}) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) {
      await db.query('update sessions set revoked_at = now() where id = $1', [req.auth.sessionId]);
      await db.query('delete from push_subscriptions where session_id = $1', [req.auth.sessionId]);
      ctx.hub.dropSession(req.auth.sessionId);
      await audit(db, req, req.auth.userId, 'logout');
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/api/auth/logout-all', async (req, reply) => {
    if (!req.auth) throw unauthorized();
    await db.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [req.auth.userId]);
    await db.query('delete from push_subscriptions where user_id = $1', [req.auth.userId]);
    ctx.hub.dropUser(req.auth.userId);
    clearSessionCookie(reply);
    await audit(db, req, req.auth.userId, 'logout_all');
    return { ok: true };
  });

  app.post('/api/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const { rows } = await db.query('select id, display_name from users where email = $1 and deleted_at is null', [email]);
    if (rows[0]) {
      const token = randomToken(32);
      await db.query(`update email_tokens set used_at = now() where user_id = $1 and kind = 'reset' and used_at is null`, [rows[0].id]);
      await db.query(
        `insert into email_tokens(user_id, kind, token_hash, expires_at) values ($1,'reset',$2, now() + interval '1 hour')`,
        [rows[0].id, sha256(token)],
      );
      await mailer.send({
        to: email,
        subject: 'Passwort zurücksetzen',
        text: `Hallo ${rows[0].display_name},\n\nüber diesen Link kannst du ein neues Passwort festlegen (1 Stunde gültig):\n${cfg.PUBLIC_URL}/reset-password?token=${token}\n\nWenn du das nicht angefordert hast, ignoriere diese Nachricht.`,
      });
      await audit(db, req, rows[0].id, 'password_reset_requested');
    }
    return { ok: true };
  });

  app.post('/api/auth/reset', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const body = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), req.body);
    const hash = await hashPassword(body.password, cfg.SCRYPT_LOG_N);
    const { rows } = await db.query(
      `update email_tokens set used_at = now()
        where token_hash = $1 and kind = 'reset' and used_at is null and expires_at > now() returning user_id`,
      [sha256(body.token)],
    );
    if (!rows[0]) throw badRequest('invalid_token', 'Link ungültig oder abgelaufen.');
    const uid = rows[0].user_id as string;
    await db.query('update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1', [uid, hash]);
    await db.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [uid]);
    await db.query('delete from login_attempts where identifier in (select lower(email::text) from users where id = $1)', [uid]);
    ctx.hub.dropUser(uid);
    await audit(db, req, uid, 'password_reset');
    return { ok: true };
  });
}

export { COOKIE_NAME, bearerFrom };
