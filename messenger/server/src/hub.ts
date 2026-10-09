import type { WebSocket } from 'ws';

export interface Conn {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  id: string;
}

export type Event = { type: string; [k: string]: unknown };

/**
 * Verwaltet die offenen WebSocket-Verbindungen (mehrere Geräte pro Konto).
 * Für mehrere Server-Instanzen muss `publish` über einen Bus (Redis / Postgres NOTIFY)
 * erweitert werden – siehe docs/ARCHITECTURE.md.
 */
export class Hub {
  private conns = new Map<string, Set<Conn>>();
  private sessions = new Map<string, number>();
  private tickets = new Map<string, { sessionId: string; exp: number }>();

  /** Einmal-Ticket für den WebSocket-Aufbau, wenn der Browser das Sitzungs-Cookie nicht mitsenden kann (Client auf anderer Domain). */
  issueTicket(ticket: string, sessionId: string, ttlMs = 30_000): void {
    const now = Date.now();
    for (const [k, v] of this.tickets) if (v.exp < now) this.tickets.delete(k);
    this.tickets.set(ticket, { sessionId, exp: now + ttlMs });
  }
  redeemTicket(ticket: string): string | null {
    const t = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return t && t.exp >= Date.now() ? t.sessionId : null;
  }

  add(c: Conn): boolean {
    let set = this.conns.get(c.userId);
    const first = !set || set.size === 0;
    if (!set) this.conns.set(c.userId, (set = new Set()));
    set.add(c);
    this.sessions.set(c.sessionId, (this.sessions.get(c.sessionId) ?? 0) + 1);
    return first;
  }
  /** @returns true, wenn dies die letzte Verbindung des Benutzers war */
  remove(c: Conn): boolean {
    const set = this.conns.get(c.userId);
    if (!set) return false;
    if (set.delete(c)) {
      const n = (this.sessions.get(c.sessionId) ?? 1) - 1;
      if (n <= 0) this.sessions.delete(c.sessionId); else this.sessions.set(c.sessionId, n);
    }
    if (set.size === 0) {
      this.conns.delete(c.userId);
      return true;
    }
    return false;
  }
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
  isOnline(userId: string): boolean {
    return (this.conns.get(userId)?.size ?? 0) > 0;
  }
  onlineUserIds(): string[] {
    return [...this.conns.keys()];
  }
  /** Sendet an alle Geräte des Benutzers. Gibt die Anzahl erreichter Verbindungen zurück. */
  send(userId: string, event: Event, exceptConnId?: string): number {
    const set = this.conns.get(userId);
    if (!set) return 0;
    const data = JSON.stringify(event);
    let n = 0;
    for (const c of set) {
      if (c.id === exceptConnId || c.ws.readyState !== 1) continue;
      c.ws.send(data);
      n++;
    }
    return n;
  }
  sendConn(c: Conn, event: Event): void {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(event));
  }
  sendToConn(userId: string, connId: string, event: Event): void {
    for (const c of this.conns.get(userId) ?? []) if (c.id === connId) this.sendConn(c, event);
  }
  sendMany(userIds: Iterable<string>, event: Event, exceptConnId?: string): number {
    let n = 0;
    for (const id of userIds) n += this.send(id, event, exceptConnId);
    return n;
  }
  /** Trennt alle Verbindungen einer Sitzung (z. B. nach Abmeldung). */
  dropSession(sessionId: string, reason = 'session.revoked'): void {
    for (const set of this.conns.values())
      for (const c of set)
        if (c.sessionId === sessionId) {
          c.ws.send(JSON.stringify({ type: reason }));
          c.ws.close(4001, reason);
        }
  }
  dropUser(userId: string, reason = 'session.revoked'): void {
    for (const c of [...(this.conns.get(userId) ?? [])]) {
      c.ws.send(JSON.stringify({ type: reason }));
      c.ws.close(4001, reason);
    }
  }
}
