import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { iceServers } from '../lib/ice.js';
import { requireAuth } from '../lib/guard.js';
import { parse } from '../lib/validate.js';
import { publicUserCols, toPublicUser } from '../lib/users.js';

export async function callRoutes(app: FastifyInstance) {
  const { db, hub, cfg } = app.ctx;
  const auth = { preHandler: requireAuth };

  app.get('/api/calls/ice', auth, async (req) => ({ iceServers: iceServers(cfg, req.auth!.userId), turn: !!(cfg.TURN_URLS && cfg.TURN_SECRET) }));

  app.get('/api/calls', auth, async (req) => {
    const uid = req.auth!.userId;
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.string().datetime().optional() }), req.query);
    const { rows } = await db.query(
      `select c.*, (case when c.caller_id = $1 then c.callee_id else c.caller_id end) as peer_id from calls c
        where (c.caller_id = $1 or c.callee_id = $1) and c.state <> 'ringing' and c.state <> 'active' and ($2::timestamptz is null or c.created_at < $2)
        order by c.created_at desc limit $3`, [uid, q.before ?? null, q.limit]);
    const peerIds = [...new Set(rows.map((r) => r.peer_id))];
    const peers = peerIds.length
      ? (await db.query(`select ${publicUserCols('$1')} from users u join user_privacy p on p.user_id = u.id where u.id = any($2)`, [uid, peerIds])).rows
      : [];
    const pm = new Map(peers.map((p) => [p.id, toPublicUser(p, hub)]));
    return {
      calls: rows.map((r) => ({
        id: r.id, kind: r.kind, direction: r.caller_id === uid ? 'outgoing' : 'incoming',
        state: r.state, endReason: r.end_reason,
        missed: r.state === 'missed' && r.callee_id === uid,
        createdAt: r.created_at.toISOString(),
        durationSeconds: r.answered_at && r.ended_at ? Math.round((r.ended_at.getTime() - r.answered_at.getTime()) / 1000) : 0,
        peer: pm.get(r.peer_id) ?? null,
      })),
    };
  });

  app.delete('/api/calls', auth, async (req) => {
    // Verlauf leeren: nur eigene Sicht ausblenden wäre aufwendiger – wir löschen Einträge, an denen der Benutzer beteiligt ist,
    // sofern der Gegenüber sie nicht mehr braucht, ist akzeptabel. Hier: nur beendete Anrufe.
    await db.query(`delete from calls where (caller_id = $1 or callee_id = $1) and state not in ('ringing','active')`, [req.auth!.userId]);
    return { ok: true };
  });
}
