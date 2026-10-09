# Betrieb / Deployment

## Entwicklung
```bash
cd messenger
npm install
createdb messenger_dev   # PostgreSQL 16 (Rolle messenger/messenger oder DATABASE_URL anpassen)
npm run dev:server       # http://localhost:8080  (migriert automatisch, E-Mails erscheinen im Server-Log)
npm run dev:web          # http://localhost:5173  (Vite, proxyt /api inkl. WebSocket)
```

## Tests
```bash
npm test                                   # 75+ Server-Tests (benötigt PostgreSQL, DB messenger_test)
cd web && npm run build && npx playwright test   # Browser-E2E (startet Server + eigene DB)
```
Umgebungsvariablen für Tests: `TEST_DATABASE_URL`, `CHROME_PATH` (Chromium), `E2E_PORT`.

## Produktion mit Docker Compose
1. Server mit öffentlicher IP, DNS `chat.example.com` → Server, Ports 80/443 (TCP/UDP), 3478/5349 + 49160–49200/UDP (TURN) offen.
2. `cp .env.example .env` und ausfüllen (`APP_SECRET`, `POSTGRES_PASSWORD`, `SMTP_URL`, `TURN_SECRET`, VAPID-Schlüssel, `DOMAIN`, `PUBLIC_URL`).
3. `docker compose -f deploy/docker-compose.yml --env-file .env up -d --build`
4. Caddy besorgt das TLS-Zertifikat automatisch. Migrationen laufen beim Start der App.
5. Gesundheit: `GET /api/health`. Logs: `docker compose logs -f app`.

> Die Docker-Konfiguration konnte in der Entwicklungsumgebung **nicht gebaut/gestartet** werden (kein Docker-Daemon). Der identische Ablauf wurde ohne Container geprüft:
> `npm run build` und Start von `server/dist/index.js` mit `NODE_ENV=production` (Auslieferung des Web-Clients, Migrationen, Sicherheits-Header).

## Backups
`deploy/docker-compose.yml` enthält einen Backup-Dienst (täglich `pg_dump` + Uploads, 14 Tage). Zusätzlich: Volumes `backups` regelmäßig **außerhalb des Servers** ablegen und
monatlich `scripts/restore-test.sh <DB-URL> <dump>` ausführen (spielt in eine Wegwerf-DB ein und vergleicht Kennzahlen).

## Konfiguration (Auszug, vollständig in `server/src/config.ts`)
| Variable | Bedeutung |
|---|---|
| `PUBLIC_URL`, `TRUST_PROXY` | Basis-URL (Cookies, Links in E-Mails, Origin-Prüfung), Proxy-Header vertrauen |
| `APP_SECRET`, `DATABASE_URL`, `SMTP_URL`, `MAIL_FROM` | Pflicht in Produktion |
| `SCRYPT_LOG_N` | Passwort-Kosten (Standard 17) |
| `STORAGE_DRIVER=local\|s3`, `S3_*`, `MAX_UPLOAD_MB` | Dateispeicher |
| `VAPID_*`, `FCM_SERVICE_ACCOUNT_JSON` | Push |
| `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `CALL_RING_SECONDS` | Anrufe |
| `MESSAGE_EDIT_WINDOW_MINUTES`, `MESSAGE_DELETE_ALL_WINDOW_MINUTES`, `STATUS_TTL_HOURS` | Regeln |
| `TURNSTILE_SECRET` | Captcha bei Registrierung |

## Mobile Apps (Android/iOS)
Der Client ist eine installierbare PWA (Android: „App installieren“, iOS: „Zum Home-Bildschirm“). Eine native Hülle (Capacitor) ist architektonisch vorgesehen
(Bearer-Token-Login `returnToken`, FCM-Provider, Auth per WebSocket-Nachricht), aber **nicht gebaut**: Store-Konten, Signierung und Gerätetests fehlen.
