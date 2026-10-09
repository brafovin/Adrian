import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.js';
import { randomToken, sha256 } from './crypto.js';

export const COOKIE_NAME = 'sid';

export async function createSession(
  ctx: Ctx,
  userId: string,
  req: FastifyRequest,
  deviceName: string,
): Promise<{ token: string; sessionId: string }> {
  const token = randomToken(32);
  const { rows } = await ctx.db.query(
    `insert into sessions(user_id, token_hash, device_name, user_agent, ip, expires_at)
     values ($1,$2,$3,$4,$5, now() + make_interval(days => $6)) returning id`,
    [userId, sha256(token), deviceName.slice(0, 80), (req.headers['user-agent'] ?? '').slice(0, 300), req.ip, ctx.cfg.SESSION_TTL_DAYS],
  );
  return { token, sessionId: rows[0].id };
}

export function setSessionCookie(ctx: Ctx, reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.cfg.cookieSecure,
    path: '/',
    maxAge: ctx.cfg.SESSION_TTL_DAYS * 86400,
  });
}
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Löst Bearer-Token oder Cookie zu einer gültigen Sitzung auf. */
export async function resolveSession(
  ctx: Ctx,
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  const { rows } = await ctx.db.query(
    `select s.id, s.user_id, s.last_used_at from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.deleted_at is null`,
    [sha256(token)],
  );
  const r = rows[0];
  if (!r) return null;
  if (Date.now() - new Date(r.last_used_at).getTime() > 60_000) {
    await ctx.db.query('update sessions set last_used_at = now() where id = $1', [r.id]);
  }
  return { userId: r.user_id, sessionId: r.id };
}

export function bearerFrom(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
