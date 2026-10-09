import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8099);
const DB = `messenger_e2e_${PORT}`;
const UPLOADS = `/tmp/adrian-e2e-uploads-${PORT}`;
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: CHROME,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    },
    permissions: ['camera', 'microphone', 'notifications'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node e2e/prepare-db.mjs ${DB} ${UPLOADS} && npx tsx ../server/src/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      PUBLIC_URL: `http://localhost:${PORT}`,
      DATABASE_URL: `postgres://messenger:messenger@localhost:5432/${DB}`,
      WEB_DIST: new URL('./dist', import.meta.url).pathname,
      STORAGE_DIR: UPLOADS,
      SCRYPT_LOG_N: '10',
      RATE_LIMIT_ENABLED: 'false',
      JOBS_ENABLED: 'false',
      EXPOSE_DEV_OUTBOX: 'true',
      CALL_RING_SECONDS: '20',
      APP_SECRET: 'e2e-secret-e2e-secret',
    },
  },
});
