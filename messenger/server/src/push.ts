import { createSign } from 'node:crypto';
import webpush from 'web-push';
import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import type { Hub } from './hub.js';
import { getSettings } from './lib/settings.js';

export interface PushPayload {
  kind: 'message' | 'call' | 'missed_call' | 'request' | 'group' | 'status';
  title: string;
  body: string;
  /** Pfad innerhalb der App, der beim Tippen geöffnet wird. */
  url: string;
  /** Gleiche Tags ersetzen sich gegenseitig. */
  tag?: string;
  data?: Record<string, unknown>;
}

interface Sub {
  id: string;
  session_id: string | null;
  provider: 'webpush' | 'fcm' | 'apns';
  endpoint: string;
  keys: { p256dh?: string; auth?: string };
}

export type WebPushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, opts: { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }) => Promise<unknown>;

export class Push {
  /** Austauschbar für Tests. */
  webSender: WebPushSender;
  fcmSender: (token: string, payload: PushPayload) => Promise<void>;
  private fcmToken: { value: string; exp: number } | null = null;

  constructor(
    private cfg: Config,
    private db: Db,
    private hub: Hub,
    private log: { warn: (o: unknown, m?: string) => void },
  ) {
    if (cfg.VAPID_PUBLIC_KEY && cfg.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
    }
    this.webSender = (sub, body, opts) => webpush.sendNotification(sub, body, opts);
    this.fcmSender = (token, payload) => this.sendFcm(token, payload);
  }

  get webPushEnabled(): boolean {
    return !!(this.cfg.VAPID_PUBLIC_KEY && this.cfg.VAPID_PRIVATE_KEY);
  }

  /**
   * Benachrichtigt alle Geräte des Benutzers, die gerade NICHT per WebSocket verbunden sind.
   * Beachtet die persönlichen Benachrichtigungseinstellungen (Kategorie + „Inhalte ausblenden“).
   */
  async notifyUser(userId: string, payload: PushPayload, opts: { force?: boolean } = {}): Promise<number> {
    const settings = await getSettings(this.db, userId);
    const cat = {
      message: 'messages', call: 'calls', missed_call: 'calls', request: 'requests', group: 'groups', status: 'status',
    }[payload.kind] as keyof typeof settings.notify;
    if (!opts.force && !settings.notify[cat]) return 0;

    const { rows } = await this.db.query<Sub>(
      'select id, session_id, provider, endpoint, keys from push_subscriptions where user_id = $1',
      [userId],
    );
    const targets = rows.filter((s) => payload.kind === 'call' || !s.session_id || !this.hub.hasSession(s.session_id));
    const out =
      settings.notify.hidePreviews && payload.kind === 'message'
        ? { ...payload, title: 'Adrian', body: 'Neue Nachricht' }
        : payload;
    let sent = 0;
    await Promise.all(
      targets.map(async (s) => {
        try {
          if (s.provider === 'webpush') {
            if (!this.webPushEnabled || !s.keys.p256dh || !s.keys.auth) return;
            await this.webSender(
              { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
              JSON.stringify(out),
              { TTL: payload.kind === 'call' ? 30 : 3600, urgency: payload.kind === 'call' ? 'high' : 'normal' },
            );
          } else if (s.provider === 'fcm') {
            await this.fcmSender(s.endpoint, out);
          } else return; // APNs: siehe docs/PUSH.md
          sent++;
        } catch (e: unknown) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.db.query('delete from push_subscriptions where id = $1', [s.id]);
          } else this.log.warn({ err: String(e), provider: s.provider }, 'push fehlgeschlagen');
        }
      }),
    );
    return sent;
  }

  // ---- FCM HTTP v1 (benötigt FCM_SERVICE_ACCOUNT_JSON; ohne echte Zugangsdaten nicht getestet) ----
  private async fcmAccessToken(): Promise<{ token: string; project: string }> {
    const sa = JSON.parse(this.cfg.FCM_SERVICE_ACCOUNT_JSON ?? '{}');
    if (!sa.client_email || !sa.private_key) throw new Error('FCM nicht konfiguriert');
    if (this.fcmToken && this.fcmToken.exp > Date.now() + 60_000) return { token: this.fcmToken.value, project: sa.project_id };
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    });
    if (!res.ok) throw new Error(`FCM-Token: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.fcmToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return { token: j.access_token, project: sa.project_id };
  }

  private async sendFcm(deviceToken: string, p: PushPayload): Promise<void> {
    if (!this.cfg.FCM_SERVICE_ACCOUNT_JSON) throw new Error('FCM nicht konfiguriert');
    const { token, project } = await this.fcmAccessToken();
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: p.title, body: p.body },
          data: { url: p.url, kind: p.kind, tag: p.tag ?? '' },
          android: { priority: p.kind === 'call' ? 'HIGH' : 'NORMAL' },
        },
      }),
    });
    if (!res.ok) {
      const err = new Error(`FCM ${res.status}`) as Error & { statusCode?: number };
      err.statusCode = res.status === 404 ? 404 : res.status;
      throw err;
    }
  }
}
