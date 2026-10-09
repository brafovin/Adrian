import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import type { Ctx } from '../src/context.js';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import type { CallManager } from '../src/calls.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://messenger:messenger@localhost:5432/messenger_test';

export interface Env {
  app: FastifyInstance;
  ctx: Ctx;
  cfg: Config;
  calls: CallManager;
  base: string;
  close(): Promise<void>;
}

export async function makeEnv(overrides: Record<string, string> = {}): Promise<Env> {
  const storage = await mkdtemp(path.join(os.tmpdir(), 'adrian-test-'));
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    SCRYPT_LOG_N: '10',
    RATE_LIMIT_ENABLED: 'false',
    STORAGE_DIR: storage,
    PUBLIC_URL: 'http://localhost:8080',
    JOBS_ENABLED: 'false',
    APP_SECRET: 'test-secret-test-secret',
    ...overrides,
  });
  const db = createPool(TEST_DB);
  await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  const { app, ctx, calls } = await buildApp(cfg, { db });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  return {
    app, ctx, cfg, calls, base: `http://127.0.0.1:${port}`,
    async close() {
      await app.close();
      await db.end();
      await rm(storage, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> {
  status: number;
  json: T;
  headers: Headers;
}

export class Client {
  cookie = '';
  token = '';
  user: any;
  constructor(public env: Env, public name = 'client') {}

  async call<T = any>(method: string, url: string, body?: unknown, opts: { headers?: Record<string, string>; bearer?: boolean; noOrigin?: boolean } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (!opts.noOrigin && !headers.origin) headers.origin = 'http://localhost:8080';
    if (opts.bearer && this.token) headers.authorization = `Bearer ${this.token}`;
    else if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.env.base + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [kv] = c.split(';');
      if (kv!.startsWith('sid=')) this.cookie = kv!.endsWith('=') ? '' : kv!;
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  get = <T = any>(url: string, o?: Parameters<Client['call']>[3]) => this.call<T>('GET', url, undefined, o);
  post = <T = any>(url: string, b?: unknown, o?: Parameters<Client['call']>[3]) => this.call<T>('POST', url, b ?? {}, o);
  put = <T = any>(url: string, b?: unknown) => this.call<T>('PUT', url, b ?? {});
  patch = <T = any>(url: string, b?: unknown) => this.call<T>('PATCH', url, b ?? {});
  del = <T = any>(url: string, b?: unknown) => this.call<T>('DELETE', url, b);

  async upload(file: Buffer | Uint8Array, filename: string, mime: string, fields: Record<string, string> = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('file', new Blob([file as BlobPart], { type: mime }), filename);
    return this.call('POST', '/api/media', fd);
  }

  async ws(): Promise<WsClient> {
    const w = new WsClient(this.env.base.replace('http', 'ws') + '/api/ws', { cookie: this.cookie, origin: 'http://localhost:8080' });
    await w.opened;
    await w.waitFor((m) => m.type === 'ready');
    return w;
  }
}

export class WsClient {
  ws: WebSocket;
  messages: any[] = [];
  private waiters: { pred: (m: any) => boolean; res: (m: any) => void }[] = [];
  opened: Promise<void>;
  closed: Promise<number>;
  constructor(url: string, headers: Record<string, string>) {
    this.ws = new WebSocket(url, { headers });
    this.opened = new Promise((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.closed = new Promise((res) => this.ws.once('close', (code) => res(code)));
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.res(m), false) : true));
    });
  }
  send(o: unknown) { this.ws.send(JSON.stringify(o)); }
  waitFor(pred: (m: any) => boolean, timeout = 4000): Promise<any> {
    const found = this.messages.find(pred);
    if (found) { this.messages.splice(this.messages.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`WS-Timeout; empfangen: ${JSON.stringify(this.messages)}`)), timeout);
      this.waiters.push({ pred, res: (m) => { clearTimeout(t); this.messages.splice(this.messages.indexOf(m), 1); res(m); } });
    });
  }
  /** Prüft, dass innerhalb von `ms` KEINE passende Nachricht eintrifft. */
  async expectNone(pred: (m: any) => boolean, ms = 300) {
    await new Promise((r) => setTimeout(r, ms));
    const bad = this.messages.find(pred);
    if (bad) throw new Error(`Unerwartete WS-Nachricht: ${JSON.stringify(bad)}`);
  }
  close() { this.ws.close(); }
}

let counter = 0;
/** Registriert, verifiziert und meldet einen Benutzer an. */
export async function makeUser(env: Env, username?: string): Promise<Client> {
  const n = ++counter;
  const name = username ?? `user${n}`;
  const c = new Client(env, name);
  const email = `${name.toLowerCase()}@example.test`;
  const r = await c.post('/api/auth/register', { email, username: name, displayName: name.toUpperCase(), password: 'correct-horse-battery' });
  if (r.status !== 201) throw new Error(`Registrierung fehlgeschlagen: ${JSON.stringify(r.json)}`);
  const mail = [...(env.ctx.mailer as { outbox: { to: string; text: string }[] }).outbox].reverse().find((m) => m.to === email)!;
  const token = /token=([\w-]+)/.exec(mail.text)![1];
  const v = await c.post('/api/auth/verify-email', { token });
  if (v.status !== 200) throw new Error('Verifizierung fehlgeschlagen');
  const l = await c.post('/api/auth/login', { identifier: email, password: 'correct-horse-battery', returnToken: true });
  if (l.status !== 200) throw new Error(`Login fehlgeschlagen ${JSON.stringify(l.json)}`);
  c.user = l.json.user;
  c.token = l.json.token;
  return c;
}

export async function befriend(a: Client, b: Client) {
  const r = await a.post('/api/contact-requests', { userId: b.user.id });
  if (r.status !== 201) throw new Error(`Anfrage fehlgeschlagen ${JSON.stringify(r.json)}`);
  const inc = await b.get('/api/contact-requests');
  await b.post(`/api/contact-requests/${inc.json.incoming[0].id}/accept`);
}

/** 1x1 PNG */
export const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

/** Legt einen verifizierten Benutzer samt Sitzung direkt in der Datenbank an (umgeht Registrierungs-Rate-Limits). */
export async function makeUserDb(env: Env, name: string): Promise<Client> {
  const { hashPassword, randomToken, sha256 } = await import('../src/lib/crypto.js');
  const c = new Client(env, name);
  const hash = await hashPassword('correct-horse-battery', 10);
  const { rows } = await env.ctx.db.query(
    `insert into users(email, username, display_name, password_hash, email_verified_at) values ($1,$2,$3,$4, now()) returning id`,
    [`${name}@example.test`, name, name.toUpperCase(), hash]);
  await env.ctx.db.query('insert into user_privacy(user_id) values ($1)', [rows[0].id]);
  await env.ctx.db.query('insert into user_settings(user_id) values ($1)', [rows[0].id]);
  const token = randomToken();
  await env.ctx.db.query(`insert into sessions(user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 day')`, [rows[0].id, sha256(token)]);
  c.cookie = `sid=${token}`;
  c.token = token;
  c.user = { id: rows[0].id, username: name };
  return c;
}
