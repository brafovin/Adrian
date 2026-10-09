import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  /** Öffentliche Basis-URL der App (für Links in E-Mails, Cookies, CORS). */
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  DATABASE_URL: z.string().default('postgres://messenger:messenger@localhost:5432/messenger_dev'),
  /** Wird für HMAC-Signaturen (TURN-Zugangsdaten, signierte Medien-URLs) genutzt. Pflicht in Produktion. */
  APP_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  TRUST_PROXY: bool.default(false),
  /** Zusätzlich erlaubte Origins (kommagetrennt), z. B. Vite-Dev-Server oder native Apps. */
  CORS_ORIGINS: z.string().default(''),

  // Passwort-Hashing (scrypt). Standard = OWASP-Empfehlung.
  SCRYPT_LOG_N: z.coerce.number().min(10).max(20).default(17),

  // Sitzungen
  SESSION_TTL_DAYS: z.coerce.number().default(60),
  COOKIE_SECURE: bool.optional(),

  // Registrierung / Missbrauchsschutz
  REQUIRE_EMAIL_VERIFICATION: bool.default(true),
  RATE_LIMIT_ENABLED: bool.default(true),
  /** Optional: Cloudflare Turnstile Secret. Wenn gesetzt, muss bei Registrierung ein Token mitgeschickt werden. */
  TURNSTILE_SECRET: z.string().optional(),
  LOGIN_MAX_FAILURES: z.coerce.number().default(8),
  LOGIN_LOCK_MINUTES: z.coerce.number().default(15),
  /** Max. neue Unterhaltungen, die ein Konto pro Stunde mit Fremden beginnen darf. */
  NEW_CHAT_LIMIT_PER_HOUR: z.coerce.number().default(20),
  MESSAGE_RATE_PER_MINUTE: z.coerce.number().default(120),

  // E-Mail
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Adrian Messenger <no-reply@localhost>'),

  // Speicher
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./data/uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  MAX_UPLOAD_MB: z.coerce.number().default(64),

  // Push (Web Push / VAPID). FCM/APNs siehe docs/PUSH.md
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@localhost'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // WebRTC
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URLS: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  TURN_TTL_SECONDS: z.coerce.number().default(3600),
  CALL_RING_SECONDS: z.coerce.number().default(45),
  /** So lange wartet der Server nach einem WebSocket-Abbruch, bevor ein aktiver Anruf beendet wird. */
  CALL_DROP_GRACE_SECONDS: z.coerce.number().default(30),

  // Regeln
  MESSAGE_EDIT_WINDOW_MINUTES: z.coerce.number().default(24 * 60),
  MESSAGE_DELETE_ALL_WINDOW_MINUTES: z.coerce.number().default(48 * 60),
  STATUS_TTL_HOURS: z.coerce.number().default(24),
  STATUS_MEDIA_GRACE_HOURS: z.coerce.number().default(1),
  JOBS_ENABLED: bool.default(true),
  /** Nur für E2E-Tests: macht gesendete E-Mails über /api/dev/outbox lesbar. Wird in Produktion abgelehnt. */
  EXPOSE_DEV_OUTBOX: bool.default(false),

  /** Verzeichnis des gebauten Web-Clients (wird vom Server mit ausgeliefert). */
  WEB_DIST: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { cookieSecure: boolean };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.parse(env);
  if (parsed.NODE_ENV === 'production' && parsed.APP_SECRET === 'dev-only-secret-change-me-please') {
    throw new Error('APP_SECRET muss in Produktion gesetzt werden.');
  }
  if (parsed.NODE_ENV === 'production' && parsed.EXPOSE_DEV_OUTBOX) throw new Error('EXPOSE_DEV_OUTBOX ist in Produktion nicht erlaubt.');
  return {
    ...parsed,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.PUBLIC_URL.startsWith('https://'),
  };
}
