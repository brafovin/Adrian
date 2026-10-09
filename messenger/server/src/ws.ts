import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { CallManager } from './calls.js';
import type { Conn } from './hub.js';
import { COOKIE_NAME, resolveSession } from './lib/session.js';
import { markAllDelivered } from './lib/messages.js';
import { allowedOrigins } from './app.js';

const typingSchema = z.object({ conversationId: z.string().uuid(), typing: z.boolean() });

export async function wsRoutes(app: FastifyInstance, calls: CallManager) {
  const ctx = app.ctx;
  const { hub, db } = ctx;

  async function presenceAudience(userId: string) {
    const { rows } = await db.query(
      `select v.id, can_see(v.id, $1, p.online_vis) as online_ok, can_see(v.id, $1, p.last_seen_vis) as seen_ok
         from (select contact_id as id from contacts where user_id = $1
               union select user_id from conversation_members where conversation_id in
                 (select conversation_id from conversation_members where user_id = $1 and left_at is null) and user_id <> $1 and left_at is null) v,
              user_privacy p where p.user_id = $1`, [userId]);
    return rows as { id: string; online_ok: boolean; seen_ok: boolean }[];
  }

  async function broadcastPresence(userId: string, online: boolean) {
    const lastSeen = new Date();
    if (!online) await db.query('update users set last_seen_at = $2 where id = $1', [userId, lastSeen]);
    for (const a of await presenceAudience(userId)) {
      if (!a.online_ok && !a.seen_ok) continue;
      hub.send(a.id, {
        type: 'presence', userId, online: a.online_ok ? online : null, lastSeenAt: !online && a.seen_ok ? lastSeen.toISOString() : undefined,
      });
    }
  }

  app.get('/api/ws', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    let conn: Conn | null = null;
    let alive = true;
    let tokens = 100;
    const refill = setInterval(() => { tokens = Math.min(100, tokens + 40); }, 1000);
    const authTimer = setTimeout(() => { if (!conn) socket.close(4401, 'auth timeout'); }, 8000);
    const origin = req.headers.origin;
    const cookieToken = (req.cookies as Record<string, string | undefined>)?.[COOKIE_NAME];

    const send = (o: unknown) => socket.readyState === 1 && socket.send(JSON.stringify(o));

    async function attach(token: string) {
      const s = await resolveSession(ctx, token);
      if (!s) { send({ type: 'auth.failed' }); socket.close(4401, 'unauthorized'); return; }
      conn = { ws: socket, userId: s.userId, sessionId: s.sessionId, id: randomUUID() };
      clearTimeout(authTimer);
      const first = hub.add(conn);
      send({ type: 'ready', userId: s.userId, connId: conn.id });
      await markAllDelivered(ctx, s.userId);
      await calls.deliverPending(conn);
      if (first) void broadcastPresence(s.userId, true);
    }

    // Browser: Cookie + Origin-Prüfung (Schutz vor Cross-Site-WebSocket-Hijacking). Native Clients: Token per Nachricht.
    if (cookieToken) {
      if (origin && !allowedOrigins(ctx.cfg).has(origin)) { socket.close(4403, 'origin'); return; }
      void attach(cookieToken).catch(() => socket.close(1011));
    }

    socket.on('pong', () => { alive = true; });
    const ping = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      socket.ping();
    }, 25_000);

    socket.on('message', async (raw) => {
      if (--tokens < 0) { socket.close(4429, 'rate limited'); return; }
      let msg: { type?: string; [k: string]: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      try {
        if (!conn) {
          if (msg.type === 'auth' && typeof msg.token === 'string') await attach(msg.token);
          return;
        }
        if (msg.type === 'ping') { send({ type: 'pong' }); return; }
        if (msg.type === 'typing') {
          const t = typingSchema.safeParse(msg);
          if (!t.success) return;
          const { rows } = await db.query(
            `select cm2.user_id from conversation_members me join conversation_members cm2 on cm2.conversation_id = me.conversation_id and cm2.left_at is null and cm2.user_id <> me.user_id
              where me.conversation_id = $1 and me.user_id = $2 and me.left_at is null and not is_blocked_between($2, cm2.user_id)`,
            [t.data.conversationId, conn.userId]);
          hub.sendMany(rows.map((r) => r.user_id), { type: 'typing', conversationId: t.data.conversationId, userId: conn.userId, typing: t.data.typing });
          return;
        }
        if (msg.type.startsWith('call.')) await calls.handle(conn, msg as never);
      } catch (e) {
        app.log.warn({ err: String(e), type: msg.type }, 'ws handler error');
      }
    });

    socket.on('close', () => {
      clearInterval(ping); clearInterval(refill); clearTimeout(authTimer);
      if (!conn) return;
      calls.onDisconnect(conn);
      const last = hub.remove(conn);
      if (last) void broadcastPresence(conn.userId, false).catch(() => {});
    });
    socket.on('error', () => socket.close());
  });
}
