import { randomUUID } from 'node:crypto';
import type { Ctx } from './context.js';
import type { Conn } from './hub.js';
import { iceServers } from './lib/ice.js';
import { publicUserCols, toPublicUser } from './lib/users.js';

interface Live {
  id: string;
  callerId: string;
  calleeId: string;
  kind: 'audio' | 'video';
  state: 'ringing' | 'active';
  callerConn: string;
  calleeConn?: string;
  ringTimer?: NodeJS.Timeout;
  dropTimers: Map<string, NodeJS.Timeout>;
}

/** Signaling für 1:1-Anrufe (WebRTC). Medien laufen Peer-to-Peer bzw. über TURN – nie über diesen Server. */
export class CallManager {
  private live = new Map<string, Live>();
  private byUser = new Map<string, string>();

  constructor(private ctx: Ctx) {}

  private err(conn: Conn, code: string, message: string, callId?: string) {
    this.ctx.hub.send(conn.userId, { type: 'call.error', code, message, callId }, undefined);
  }

  private async peerView(viewerId: string, userId: string) {
    const { rows } = await this.ctx.db.query(
      `select ${publicUserCols('$1')} from users u join user_privacy p on p.user_id = u.id where u.id = $2`, [viewerId, userId]);
    return rows[0] ? toPublicUser(rows[0], this.ctx.hub) : null;
  }

  async handle(conn: Conn, msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'call.invite': return this.invite(conn, msg as never);
      case 'call.accept': return this.accept(conn, String(msg.callId));
      case 'call.decline': return this.finish(conn, String(msg.callId), 'declined', 'declined');
      case 'call.cancel': return this.finish(conn, String(msg.callId), 'missed', 'cancelled');
      case 'call.end': return this.finish(conn, String(msg.callId), 'ended', 'hangup');
      case 'call.signal': return this.signal(conn, String(msg.callId), msg.data);
      case 'call.rejoin': return this.rejoin(conn, String(msg.callId));
    }
  }

  private async invite(conn: Conn, msg: { toUserId: string; kind: 'audio' | 'video' }) {
    const { db, hub, cfg } = this.ctx;
    const to = String(msg.toUserId);
    const kind = msg.kind === 'video' ? 'video' : 'audio';
    if (to === conn.userId) return this.err(conn, 'invalid_user', 'Du kannst dich nicht selbst anrufen.');
    if (this.byUser.has(conn.userId)) return this.err(conn, 'already_in_call', 'Du bist bereits in einem Anruf.');
    const { rows } = await db.query(
      `select u.id, is_blocked_between($1, u.id) as blocked, p.calls_from, are_contacts(u.id, $1) as contact, me.display_name, me.email_verified_at
         from users u join user_privacy p on p.user_id = u.id, users me where u.id = $2 and u.deleted_at is null and me.id = $1`, [conn.userId, to]);
    const t = rows[0];
    if (!t || t.blocked || t.calls_from === 'nobody' || (t.calls_from === 'contacts' && !t.contact)) {
      return this.err(conn, 'not_allowed', 'Dieser Nutzer ist für Anrufe nicht erreichbar.');
    }
    const rate = await db.query(`select count(*)::int c from calls where caller_id = $1 and created_at > now() - interval '1 minute'`, [conn.userId]);
    if (rate.rows[0].c >= 10) return this.err(conn, 'rate_limited', 'Zu viele Anrufversuche.');

    const id = randomUUID();
    if (this.byUser.has(to)) {
      await db.query(`insert into calls(id, caller_id, callee_id, kind, state, end_reason, ended_at) values ($1,$2,$3,$4,'missed','busy', now())`, [id, conn.userId, to, kind]);
      hub.send(conn.userId, { type: 'call.ended', callId: id, reason: 'busy' });
      return;
    }
    await db.query('insert into calls(id, caller_id, callee_id, kind) values ($1,$2,$3,$4)', [id, conn.userId, to, kind]);
    const call: Live = { id, callerId: conn.userId, calleeId: to, kind, state: 'ringing', callerConn: conn.id, dropTimers: new Map() };
    this.live.set(id, call);
    this.byUser.set(conn.userId, id);
    this.byUser.set(to, id);
    call.ringTimer = setTimeout(() => void this.timeout(id), cfg.CALL_RING_SECONDS * 1000);

    hub.send(conn.userId, { type: 'call.invited', callId: id, kind, peer: await this.peerView(conn.userId, to), iceServers: iceServers(cfg, conn.userId) });
    await this.ring(call, t.display_name);
  }

  private async ring(call: Live, callerName: string) {
    const { hub, cfg } = this.ctx;
    hub.send(call.calleeId, {
      type: 'call.incoming', callId: call.id, kind: call.kind, peer: await this.peerView(call.calleeId, call.callerId),
      iceServers: iceServers(cfg, call.calleeId), ringSeconds: cfg.CALL_RING_SECONDS,
    });
    void this.ctx.push.notifyUser(call.calleeId, {
      kind: 'call', title: callerName, body: call.kind === 'video' ? 'Eingehender Videoanruf' : 'Eingehender Sprachanruf',
      url: `/calls?incoming=${call.id}`, tag: `call-${call.id}`, data: { callId: call.id },
    }).catch(() => 0);
  }

  /** Neu verbundene Geräte erhalten klingelnde Anrufe nach (z. B. nach dem Öffnen per Push). */
  async deliverPending(conn: Conn) {
    const id = this.byUser.get(conn.userId);
    const call = id ? this.live.get(id) : undefined;
    if (call && call.state === 'ringing' && call.calleeId === conn.userId) {
      this.ctx.hub.sendConn(conn, {
        type: 'call.incoming', callId: call.id, kind: call.kind, peer: await this.peerView(conn.userId, call.callerId),
        iceServers: iceServers(this.ctx.cfg, conn.userId), ringSeconds: this.ctx.cfg.CALL_RING_SECONDS,
      });
    }
  }

  private async accept(conn: Conn, callId: string) {
    const { db, hub } = this.ctx;
    const call = this.live.get(callId);
    if (!call || call.calleeId !== conn.userId || call.state !== 'ringing') return this.err(conn, 'call_gone', 'Der Anruf ist nicht mehr verfügbar.', callId);
    clearTimeout(call.ringTimer);
    call.state = 'active';
    call.calleeConn = conn.id;
    await db.query(`update calls set state = 'active', answered_at = now() where id = $1`, [callId]);
    hub.send(call.callerId, { type: 'call.accepted', callId });
    hub.send(call.calleeId, { type: 'call.handled', callId, by: 'accepted_elsewhere' }, conn.id);
    hub.sendConn(conn, { type: 'call.accepted', callId });
  }

  private async signal(conn: Conn, callId: string, data: unknown) {
    const call = this.live.get(callId);
    if (!call || call.state !== 'active') return;
    const isCaller = conn.userId === call.callerId && conn.id === call.callerConn;
    const isCallee = conn.userId === call.calleeId && conn.id === call.calleeConn;
    if (!isCaller && !isCallee) return;
    const target = isCaller ? { userId: call.calleeId, connId: call.calleeConn! } : { userId: call.callerId, connId: call.callerConn };
    this.ctx.hub.sendToConn(target.userId, target.connId, { type: 'call.signal', callId, data });
  }

  private async rejoin(conn: Conn, callId: string) {
    const call = this.live.get(callId);
    if (!call) { this.ctx.hub.sendConn(conn, { type: 'call.ended', callId, reason: 'gone' }); return; }
    if (conn.userId === call.callerId) call.callerConn = conn.id;
    else if (conn.userId === call.calleeId && call.state === 'active') call.calleeConn = conn.id;
    else return;
    const t = call.dropTimers.get(conn.userId);
    if (t) { clearTimeout(t); call.dropTimers.delete(conn.userId); }
    this.ctx.hub.sendConn(conn, { type: 'call.rejoined', callId, state: call.state });
    const peer = conn.userId === call.callerId ? call.calleeId : call.callerId;
    this.ctx.hub.send(peer, { type: 'call.peer_reconnected', callId });
  }

  /** Verbindung geschlossen: Anruf nach Karenzzeit beenden, falls das Gerät nicht zurückkehrt. */
  onDisconnect(conn: Conn) {
    const id = this.byUser.get(conn.userId);
    const call = id ? this.live.get(id) : undefined;
    if (!call) return;
    const bound = call.callerConn === conn.id || call.calleeConn === conn.id;
    if (!bound) return;
    if (call.state === 'ringing' && conn.userId === call.callerId) {
      // Anrufer ist weg, bevor jemand abgenommen hat
      void this.close(call, 'missed', 'caller_left');
      return;
    }
    if (call.state === 'active') {
      call.dropTimers.set(conn.userId, setTimeout(() => void this.close(call, 'ended', 'connection_lost'), this.ctx.cfg.CALL_DROP_GRACE_SECONDS * 1000));
    }
  }

  private async finish(conn: Conn, callId: string, state: 'ended' | 'declined' | 'missed', reason: string) {
    const call = this.live.get(callId);
    if (!call) return;
    const callerOk = conn.userId === call.callerId;
    const calleeOk = conn.userId === call.calleeId;
    if (!callerOk && !calleeOk) return;
    if (state === 'declined' && !calleeOk) return;
    if (reason === 'cancelled' && !callerOk) return;
    if (call.state === 'ringing' && state === 'ended') { // Auflegen vor Annahme == Abbruch durch Anrufer / Ablehnung durch Angerufenen
      return this.close(call, callerOk ? 'missed' : 'declined', callerOk ? 'cancelled' : 'declined', conn.userId);
    }
    await this.close(call, state, reason, conn.userId);
  }

  private async timeout(callId: string) {
    const call = this.live.get(callId);
    if (call && call.state === 'ringing') await this.close(call, 'missed', 'timeout');
  }

  private async close(call: Live, state: 'ended' | 'declined' | 'missed' | 'failed', reason: string, by?: string) {
    if (!this.live.delete(call.id)) return;
    const { db, hub } = this.ctx;
    clearTimeout(call.ringTimer);
    call.dropTimers.forEach(clearTimeout);
    if (this.byUser.get(call.callerId) === call.id) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.id) this.byUser.delete(call.calleeId);
    await db.query(`update calls set state = $2, end_reason = $3, ended_at = now() where id = $1`, [call.id, state, reason]);
    const ev = { type: 'call.ended', callId: call.id, reason, state, by: by ?? null };
    hub.sendMany([call.callerId, call.calleeId], ev);
    if (state === 'missed' && reason !== 'caller_left_after_accept') {
      const caller = (await db.query('select display_name from users where id = $1', [call.callerId])).rows[0];
      hub.send(call.calleeId, { type: 'call.missed', callId: call.id });
      await this.ctx.push.notifyUser(call.calleeId, {
        kind: 'missed_call', title: 'Verpasster Anruf', body: `${caller?.display_name ?? 'Jemand'} hat dich angerufen`, url: '/calls', tag: `call-${call.id}`,
      }).catch(() => 0);
    }
  }

  /** Beim Herunterfahren / in Tests. */
  shutdown() {
    for (const c of this.live.values()) { clearTimeout(c.ringTimer); c.dropTimers.forEach(clearTimeout); }
    this.live.clear();
    this.byUser.clear();
  }
  isInCall(userId: string) { return this.byUser.has(userId); }
}
