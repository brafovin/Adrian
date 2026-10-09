import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { startJobs } from './jobs.js';

const cfg = loadConfig();
const db = createPool(cfg.DATABASE_URL);
const { app, ctx } = await buildApp(cfg, { db });
await migrate(db, (m) => app.log.info(m));
const stopJobs = cfg.JOBS_ENABLED ? startJobs(ctx, app.log) : () => {};
await app.listen({ port: cfg.PORT, host: cfg.HOST });

if (!ctx.push.webPushEnabled) app.log.warn('VAPID-Schlüssel fehlen – Web-Push ist deaktiviert (siehe docs/PUSH.md).');
if (!cfg.TURN_URLS) app.log.warn('Kein TURN-Server konfiguriert – Anrufe hinter strengen NATs/Firewalls können fehlschlagen.');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopJobs();
    await app.close();
    await db.end().catch(() => {});
    process.exit(0);
  });
}
