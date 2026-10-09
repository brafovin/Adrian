import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/* Oberfläche und Server auf VERSCHIEDENEN Ursprüngen (wie Vercel + separater Server):
   Proxy :8210 (statisch + /api/*)  →  Backend :8211 (WebSocket direkt, per Ticket). */
const DB = 'messenger_e2e_split';
export default defineConfig({
  ...base,
  testDir: './e2e',
  testMatch: /split-origin\.spec\.ts/,
  use: { ...base.use, baseURL: 'http://localhost:8210' },
  webServer: [
    {
      command: `node e2e/prepare-db.mjs ${DB} /tmp/adrian-e2e-split && npx tsx ../server/src/index.ts`,
      url: 'http://localhost:8211/api/health',
      timeout: 60_000,
      env: {
        NODE_ENV: 'development', PORT: '8211', HOST: '127.0.0.1', PUBLIC_URL: 'http://localhost:8210', TRUST_PROXY: 'true',
        DATABASE_URL: `postgres://messenger:messenger@localhost:5432/${DB}`, STORAGE_DIR: '/tmp/adrian-e2e-split',
        SCRYPT_LOG_N: '10', RATE_LIMIT_ENABLED: 'false', JOBS_ENABLED: 'false', EXPOSE_DEV_OUTBOX: 'true', APP_SECRET: 'split-secret-split-secret',
      },
    },
    {
      command: 'VITE_WS_URL=ws://localhost:8211/api/ws npx vite build --outDir dist-split && node e2e/split-proxy.mjs 8210 8211 dist-split',
      url: 'http://localhost:8210/',
      timeout: 90_000,
    },
  ],
});
