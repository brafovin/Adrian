# Adrian Messenger – Chat & Anrufe ohne Telefonnummer

Eigenständige Kommunikationsplattform (Chats, Gruppen, Sprach-/Videoanrufe, 24-Stunden-Status, persönliche Chat-Hintergründe).
Anmeldung mit **E-Mail + eindeutigem @Benutzernamen** – keine Telefonnummer. Echtes Backend (PostgreSQL, WebSocket, WebRTC), keine Demo-Daten.

> **Stand ehrlich gesagt:** funktionsfähige Anwendung mit automatisierten Server- und Browser-Tests. **Noch nicht produktionsbereit** im Sinne der
> Definition aus dem Auftrag – siehe [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) (u. a. keine Ende-zu-Ende-Verschlüsselung, keine Tests auf echten Geräten/Netzen, keine native App).

## Funktionen
- **Konto:** Registrierung (E-Mail-Verifizierung), Login, Passwort zurücksetzen, Profil (Anzeigename, @Handle, Bild, Beschreibung), Online/zuletzt online nach Privatsphäre, Geräteverwaltung, Datenexport, Kontolöschung.
- **Chats:** Einzel- und Gruppenchats in Echtzeit, Text, Bilder, Videos, Sprachnachrichten, Dokumente, Emojis/Reaktionen, Antworten, Weiterleiten, Bearbeiten, Löschen (für mich / für alle), Zustell- und Gelesen-Status, Tippanzeige, ungelesen-Zähler, Archiv/Stumm/Anheften, Suche im Chat, mehrere Geräte synchron, Offline-Senden mit automatischer Wiederholung ohne Duplikate.
- **Gruppen:** Name/Bild/Beschreibung, Mitglieder hinzufügen/entfernen, Admin-Rollen, „nur Admins schreiben“, Einladungslinks (Ablauf, Nutzungslimit, widerrufbar).
- **Chat-Hintergründe:** eigenes Bild aus der Galerie, Zuschneiden/Positionieren, Vorschau, Helligkeit/Abdunklung/Weichzeichner, pro Chat oder Standard, zurücksetzbar, **nur für den Besitzer sichtbar**, geräteübergreifend synchron.
- **Anrufe:** 1:1-Sprach- und Videoanrufe über WebRTC (Signaling per WebSocket, STUN/TURN), Annehmen/Ablehnen, Stumm, Kamera an/aus/wechseln, Verlauf, verpasste Anrufe, Reconnect-Behandlung.
- **Status:** Text/Bild/Video, 24 h (serverseitig erzwungen), Zielgruppe (alle Kontakte / ausgewählte / alle außer), Aufrufe, Reaktionen, Entwürfe.
- **Kontakte & Privatsphäre:** Suche per Benutzername/Anzeigename, Anfragen (annehmen/ablehnen), Blockieren, Melden, Auffindbarkeit, wer Bild/Status/Online/Anrufe/Nachrichten sehen darf, Lesebestätigungen an/aus.
- **Benachrichtigungen:** Web-Push (VAPID) + In-App; Kategorien, Stummschaltung, „Inhalte ausblenden“.
- **Design:** Hell/Dunkel/System, Akzentfarbe, responsiv (untere Navigation am Handy, Mehrspaltenlayout am Desktop), installierbare PWA, Tastatur-/Screenreader-Beschriftungen.

## Schnellstart (Entwicklung)
```bash
cd messenger && npm install
# PostgreSQL 16 mit Datenbank messenger_dev (Rolle messenger/messenger) – oder DATABASE_URL setzen
npm run dev:server     # API + WebSocket auf :8080 (E-Mail-Links erscheinen im Log)
npm run dev:web        # Client auf :5173
```
Tests: `npm test` (75 Server-Tests) · `cd web && npm run build && npx playwright test` (48 Browser-E2E-Tests mit echten Benutzern, inkl. WebRTC mit Fake-Geräten).
Produktion: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Dokumentation
| Datei | Inhalt |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Komponenten, Datenmodell, Nachrichtenfluss, Anruf-Signaling, Skalierung |
| [`docs/API.md`](docs/API.md) | Endpunktübersicht |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Maßnahmen ↔ Umsetzung ↔ Tests, bekannte Grenzen |
| [`docs/E2EE-PLAN.md`](docs/E2EE-PLAN.md) | Plan für Ende-zu-Ende-Verschlüsselung (nicht umgesetzt) |
| [`docs/PUSH.md`](docs/PUSH.md) | Push einrichten (Web-Push, FCM) |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker/Compose, TLS, TURN, Backups, Konfiguration |
| [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) | Definition „fertig“ – was nachgewiesen ist und was fehlt |

## Projektstruktur
```
server/   Fastify-API, WebSocket, Anruf-Signaling, Migrationen (src/db/migrations), Tests (test/)
web/      React-PWA (src/), Service Worker (public/sw.js), Playwright-E2E (e2e/)
deploy/   docker-compose, Caddy, coturn          scripts/  Backup & Restore-Test
```
