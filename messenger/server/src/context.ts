import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import type { Hub } from './hub.js';
import type { Mailer } from './mailer.js';
import type { Storage } from './storage.js';
import type { Push } from './push.js';

export interface Ctx {
  cfg: Config;
  db: Db;
  hub: Hub;
  mailer: Mailer;
  storage: Storage;
  push: Push;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
  interface FastifyRequest {
    auth: { userId: string; sessionId: string; viaCookie: boolean } | null;
  }
}
