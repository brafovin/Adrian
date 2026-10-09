# Oberfläche auf Vercel, Server separat (Fehler „405“ beim Registrieren)

**Ursache des 405:** Vercel liefert nur statische Dateien aus. Die App braucht aber einen laufenden Server (Konten, Datenbank, WebSocket, Anrufe).
Ein `POST /api/auth/register` an einen statischen Host wird mit „405 Method Not Allowed“ beantwortet. Vercel selbst kann den Server nicht ausführen
(Serverless-Funktionen unterstützen keine dauerhaften WebSocket-Verbindungen und keinen Zustand für Anrufe).

**Lösung:** Server + PostgreSQL irgendwo dauerhaft laufen lassen (eigener Server, Render, Railway, Fly.io … mit dem `Dockerfile`), die Oberfläche auf Vercel hosten und `/api/*` dorthin weiterleiten.

## 1. Server bereitstellen
Umgebungsvariablen des Servers (siehe `.env.example`), zusätzlich für den Vercel-Betrieb:

| Variable | Wert |
|---|---|
| `PUBLIC_URL` | **die Vercel-Adresse**, z. B. `https://adrian-chat.vercel.app` (Cookies, Links in E-Mails, Origin-Prüfung) |
| `CORS_ORIGINS` | dieselbe Vercel-Adresse (für die WebSocket-Anmeldung) |
| `TRUST_PROXY` | `true` |
| `DATABASE_URL`, `APP_SECRET`, `SMTP_URL` | wie in `DEPLOYMENT.md` |

Der Server muss über HTTPS und `wss://` erreichbar sein (z. B. `https://adrian-api.example.com`).

## 2. Vercel-Projekt
- *Root Directory:* `messenger/web`
- Die Einstellungen aus `web/vercel.json` (Build: `npm run build:vercel`) werden automatisch verwendet.
- *Environment Variable:* `BACKEND_URL=https://adrian-api.example.com` (ohne Slash am Ende). Optional `WS_URL=wss://adrian-api.example.com/api/ws`.

Das Build-Skript `web/scripts/vercel-build.mjs` baut die Oberfläche, leitet `/api/*` per Vercel-Route an `BACKEND_URL` weiter (so bleibt das httpOnly-Sitzungscookie
ein Cookie der Vercel-Domain) und setzt Sicherheits-Header. Fehlt `BACKEND_URL`, **bricht der Build mit einer klaren Meldung ab**.

## 3. WebSocket
Vercel leitet WebSockets nicht weiter. Der Client verbindet sich deshalb direkt mit `WS_URL` und meldet sich mit einem Einmal-Ticket an
(`POST /api/ws-ticket`, 30 s gültig, einmal verwendbar, Origin-Prüfung) – das Sitzungscookie wird nie an eine andere Domain gesendet.

## Was getestet ist – und was nicht
- ✅ `npx playwright test -c playwright.split.config.ts` (in `web/`): statischer Host (POST → 405) + Weiterleitung von `/api` an das Backend + direkter WebSocket auf anderem Port:
  Registrierung, E-Mail-Bestätigung, Login, Echtzeit-Chat, Gelesen-Haken; außerdem die verständliche Fehlermeldung, falls das Backend fehlt.
- ✅ `server/test/ticket.test.ts`: Ticket einmalig, Origin-Prüfung, beendete Sitzung.
- ❌ **Nicht auf echtem Vercel getestet** (kein Zugang). Das Build-Skript erzeugt das Vercel-„Build Output“-Format (`.vercel/output`); Syntax und Weiterleitung wurden lokal geprüft, nicht in der Vercel-Umgebung.
- Grenzen: Uploads laufen durch den Vercel-Proxy (Größen-/Zeitlimits des Vercel-Plans beachten, große Videos ggf. problematisch). Anrufe brauchen unabhängig davon einen TURN-Server.
