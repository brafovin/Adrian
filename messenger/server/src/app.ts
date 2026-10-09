import { existsSync } from 'node:fs';
import path from 'node:path';
import fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { CallManager } from './calls.js';
import type { Config } from './config.js';
import type { Ctx } from './context.js';
import './context.js';
import { createPool, type Db } from './db/pool.js';
import { Hub } from './hub.js';
import { HttpError } from './lib/errors.js';
import { COOKIE_NAME, bearerFrom, resolveSession } from './lib/session.js';
import { createMailer, type Mailer } from './mailer.js';
import { Push } from './push.js';
import { createStorage, type Storage } from './storage.js';
import { authRoutes } from './routes/auth.js';
import { backgroundRoutes } from './routes/backgrounds.js';
import { callRoutes } from './routes/calls.js';
import { contactRoutes } from './routes/contacts.js';
import { conversationRoutes } from './routes/conversations.js';
import { mediaRoutes } from './routes/media.js';
import { meRoutes } from './routes/me.js';
import { messageRoutes } from './routes/messages.js';
import { statusRoutes } from './routes/status.js';
import { wsRoutes } from './ws.js';

export function allowedOrigins(cfg: Config): Set<string> {
  const set = new Set([new URL(cfg.PUBLIC_URL).origin]);
  for (const o of cfg.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)) set.add(o);
  return set;
}

export interface BuildOptions {
  db?: Db;
  mailer?: Mailer;
  storage?: Storage;
}

export async function buildApp(cfg: Config, opts: BuildOptions = {}): Promise<{ app: FastifyInstance; ctx: Ctx; calls: CallManager }> {
  const app = fastify({
    logger:
      cfg.NODE_ENV === 'test'
        ? false
        : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] },
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    disableRequestLogging: cfg.NODE_ENV !== 'development',
  });

  const db = opts.db ?? createPool(cfg.DATABASE_URL);
  const hub = new Hub();
  const mailer = opts.mailer ?? createMailer(cfg, app.log);
  const storage = opts.storage ?? createStorage(cfg);
  const push = new Push(cfg, db, hub, app.log);
  const ctx: Ctx = { cfg, db, hub, mailer, storage, push };
  app.decorate('ctx', ctx);
  app.decorateRequest('auth', null);
  const calls = new CallManager(ctx);

  // JSON-Parser, der leere Bodies (z. B. bei DELETE) erlaubt.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, undefined);
    try { done(null, JSON.parse(body as string)); } catch { done(new HttpError(400, 'invalid_json', 'Ungültiges JSON.'), undefined); }
  });

  const origins = allowedOrigins(cfg);
  const isHttps = cfg.PUBLIC_URL.startsWith('https://');

  await app.register(cookie);

  // --- Weiterleitung auf HTTPS (hinter Proxy) + Authentifizierung + CSRF-Schutz
  app.addHook('onRequest', async (req, reply) => {
    if (isHttps && cfg.TRUST_PROXY && req.headers['x-forwarded-proto'] === 'http' && !req.url.startsWith('/api/health')) {
      return reply.redirect(`${cfg.PUBLIC_URL}${req.url}`, 301);
    }
    if (!req.url.startsWith('/api/')) return;
    const bearer = bearerFrom(req);
    const cookieTok = (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAME];
    const token = bearer ?? cookieTok;
    if (!token) return;
    const s = await resolveSession(ctx, token);
    if (!s) return;
    const viaCookie = !bearer;
    req.auth = { ...s, viaCookie };
    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.url.startsWith('/api/ws')) {
      const origin = req.headers.origin;
      if (!origin || !origins.has(origin)) throw new HttpError(403, 'csrf', 'Anfrage von unzulässigem Ursprung.');
    }
  });

  await app.register(helmet, {
    hsts: isHttps ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", ...[...origins].map((o) => o.replace(/^http/, 'ws'))],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isHttps ? [] : null,
      },
    },
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    allowList: () => !cfg.RATE_LIMIT_ENABLED,
    errorResponseBuilder: (_req, ctxt) => new HttpError(429, 'rate_limited', `Zu viele Anfragen. Bitte in ${Math.ceil(ctxt.ttl / 1000)} s erneut versuchen.`),
  });
  await app.register(multipart, { limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ZodError) return reply.code(400).send({ error: { code: 'validation_error', message: err.issues.map((i) => i.message).join('; ') } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: { code: 'file_too_large', message: 'Datei zu groß.' } });
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: err.code ?? 'bad_request', message: err.message } });
    }
    req.log.error({ err }, 'unbehandelter Fehler');
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Interner Fehler.' } });
  });

  app.get('/api/health', async () => {
    await db.query('select 1');
    return { ok: true };
  });

  await app.register(async (a) => authRoutes(a));
  await app.register(async (a) => meRoutes(a));
  await app.register(async (a) => mediaRoutes(a));
  await app.register(async (a) => contactRoutes(a));
  await app.register(async (a) => conversationRoutes(a));
  await app.register(async (a) => messageRoutes(a));
  await app.register(async (a) => backgroundRoutes(a));
  await app.register(async (a) => statusRoutes(a));
  await app.register(async (a) => callRoutes(a));
  await app.register(async (a) => wsRoutes(a, calls));

  // --- Web-Client (SPA)
  const dist = cfg.WEB_DIST && existsSync(cfg.WEB_DIST) ? path.resolve(cfg.WEB_DIST) : null;
  if (dist) {
    await app.register(staticPlugin, {
      root: dist,
      wildcard: false,
      setHeaders(res, p) {
        const base = path.basename(p);
        res.header('Cache-Control', /\.[0-9a-f]{8,}\./.test(base) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !dist) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Nicht gefunden.' } });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  app.addHook('onClose', async () => {
    calls.shutdown();
    if (!opts.db) await db.end();
  });
  return { app, ctx, calls };
}
