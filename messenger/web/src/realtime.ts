import { create } from 'zustand';

type Handler = (ev: any) => void;
export type ConnState = 'connecting' | 'online' | 'offline';

export const useConnection = create<{ state: ConnState; connId: string | null }>(() => ({ state: 'connecting', connId: null }));

/**
 * WebSocket-Verbindung zum Server mit automatischem Wiederverbinden (exponentielles Backoff).
 * Nach jedem erneuten Verbinden wird das lokale Ereignis `resync` ausgelöst – Stores laden dann ihren Zustand nach.
 */
class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  private hadConnection = false;

  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.hadConnection = false;
    window.addEventListener('online', this.kick);
    document.addEventListener('visibilitychange', this.kick);
    this.open();
  }

  stop() {
    this.wanted = false;
    window.removeEventListener('online', this.kick);
    document.removeEventListener('visibilitychange', this.kick);
    if (this.timer) clearTimeout(this.timer);
    this.cleanup();
    this.ws?.close(1000);
    this.ws = null;
    useConnection.setState({ state: 'connecting', connId: null });
  }

  private kick = () => {
    if (!this.wanted || document.visibilityState === 'hidden') return;
    if (!this.ws || this.ws.readyState > 1) {
      if (this.timer) clearTimeout(this.timer);
      this.open();
    }
  };

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
    this.ws = ws;
    useConnection.setState({ state: this.hadConnection ? 'offline' : 'connecting' });
    ws.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'pong') { if (this.pongTimer) clearTimeout(this.pongTimer); return; }
      if (msg.type === 'ready') {
        const re = this.hadConnection;
        this.hadConnection = true;
        this.retry = 0;
        useConnection.setState({ state: 'online', connId: msg.connId });
        this.startPing();
        if (re) this.emit({ type: 'resync' });
        else this.emit({ type: 'connected' });
      }
      this.emit(msg);
    };
    ws.onclose = (e) => {
      this.cleanup();
      if (this.ws === ws) this.ws = null;
      if (!this.wanted) return;
      useConnection.setState({ state: 'offline', connId: null });
      if (e.code === 4001 || e.code === 4401) { this.emit({ type: e.code === 4001 ? 'session.revoked' : 'auth.failed' }); return; }
      const delay = Math.min(15000, 1000 * 2 ** this.retry++) + Math.random() * 500;
      this.timer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private startPing() {
    this.cleanup();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== 1) return;
      this.ws.send('{"type":"ping"}');
      this.pongTimer = setTimeout(() => this.ws?.close(), 10000);
    }, 25000);
  }
  private cleanup() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = this.pongTimer = null;
  }

  private emit(ev: any) {
    this.handlers.get(ev.type)?.forEach((h) => { try { h(ev); } catch (e) { console.error('Handler-Fehler', ev.type, e); } });
    this.handlers.get('*')?.forEach((h) => { try { h(ev); } catch (e) { console.error(e); } });
  }

  /** Registriert einen Handler für einen Ereignistyp (`'*'` für alle). Gibt eine Abmelde-Funktion zurück. */
  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  send(obj: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }
  get connected() {
    return this.ws?.readyState === 1;
  }
}

export const realtime = new Realtime();
