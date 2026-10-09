# Architektur

```
Browser / PWA (React)  ──HTTPS──►  Caddy (TLS, HSTS)  ──►  App (Fastify, Node 22)  ──►  PostgreSQL 16
        │                                                    │  ├─ REST  /api/*
        └────────── WSS /api/ws ─────────────────────────────┘  ├─ WebSocket-Hub (Echtzeit, Signaling)
        └── WebRTC (SRTP) ◄── STUN/TURN (coturn) ──► Gegenstelle  ├─ Medien-Speicher (Dateisystem | S3)
                                                                 └─ Jobs (Bereinigung), Push (Web-Push/FCM)
```

| Baustein | Technik |
|---|---|
| Server | Node.js 22, Fastify 5, TypeScript, `pg`, `ws`, `sharp`, `zod` |
| Datenbank | PostgreSQL 16 (Migrationen: `server/src/db/migrations/*.sql`, mit Checksummen) |
| Echtzeit | WebSocket (`/api/ws`), Zustellung an alle Geräte eines Kontos |
| Anrufe | WebRTC (1:1), Signaling über denselben WebSocket, STUN/TURN (coturn, kurzlebige HMAC-Zugangsdaten) |
| Dateien | `Storage`-Schnittstelle: lokales Volume oder S3-kompatibel |
| Push | Web-Push (VAPID) für PWA, FCM-Provider für eine spätere Android-Hülle |
| Client | React 19 + Vite + zustand, installierbare PWA (Service Worker) |

## Datenmodell (Auszug)
`users`, `user_privacy`, `user_settings`, `sessions`, `email_tokens`, `login_attempts`, `contacts` (beide Richtungen), `contact_requests`, `blocks`, `reports`,
`conversations` (`direct`/`group`), `conversation_members` (Rolle, Lese-/Zustellstand, archiviert/angeheftet/stumm, `history_from_seq`), `messages` (`seq` pro Chat, `client_msg_id` für Idempotenz),
`message_reactions`, `message_hidden` („für mich löschen“), `group_invites`, `media`, `chat_backgrounds` (pro Benutzer, optional pro Chat),
`statuses`, `status_audience`, `status_views`, `status_reactions`, `calls`, `push_subscriptions`, `audit_log`.

SQL-Funktionen erzwingen Privatsphäre zentral: `can_see(viewer, owner, vis)`, `are_contacts`, `is_blocked_between`, `status_visible_to(viewer, status)`.
Alle Abfragen, die fremde Profile/Status/Medien liefern, laufen durch diese Funktionen – nicht durch UI-Logik.

## Nachrichtenfluss und Synchronisierung
1. Client erzeugt `clientMsgId` (UUID) und zeigt die Nachricht sofort als „sendet“ an.
2. `POST /api/conversations/:id/messages` → Transaktion: Konversationszeile sperren, Duplikat per `(conversation, sender, clientMsgId)` prüfen, `seq` lückenlos vergeben, speichern.
3. Nach dem Commit: Ereignis `message.new` an alle Geräte aller Mitglieder; Zustellstatus (`receipt`, `delivered`) für online verbundene Mitglieder; Push für Geräte ohne WebSocket (außer stummgeschaltet/blockiert/Einstellungen aus).
4. Wiederholte Sendeversuche (Netzabbruch) liefern dieselbe Nachricht zurück – kein Duplikat.
5. Nach Verbindungsverlust lädt der Client beim Wiederverbinden (`resync`) Chatliste + `GET …/messages?after=<letzte seq>` nach. Der Server hält keine Ereigniswarteschlange: **die Datenbank ist die Quelle der Wahrheit**, Ereignisse sind nur Hinweise.
6. Lesen: `POST …/read` setzt `last_read_seq`; andere Geräte des Kontos erhalten `conversation.read`; Absender erhalten `receipt/read` – nur wenn der Leser Lesebestätigungen aktiviert hat.

### WebSocket-Ereignisse (Server → Client)
`ready`, `message.new`, `message.updated`, `message.hidden`, `receipt`, `typing`, `presence`, `conversation.updated`, `conversation.read`, `contacts.changed`, `contact.request`,
`profile.updated`, `background.updated`, `settings.updated`, `status.new|removed|viewed|reaction|mine.updated`, `call.*`, `session.revoked`.
Client → Server: `auth` (nur native Clients), `ping`, `typing`, `call.invite|accept|decline|cancel|end|signal|rejoin`.

## Anrufe (WebRTC)
```
Anrufer                    Server                     Angerufener
 call.invite ───────────────►│── call.incoming ─────────────►│ (alle Geräte + Push)
 ◄── call.invited (ICE)      │                               │
                             │◄──────────── call.accept ─────│
 ◄── call.accepted ──────────│── call.handled (andere Geräte)│
 Offer  ── call.signal ─────►│── call.signal ───────────────►│
 ◄── call.signal (Answer) ───│◄──── call.signal ─────────────│
 ICE-Kandidaten in beide Richtungen über call.signal  →  Medien laufen P2P / über TURN (SRTP, nie über den App-Server)
```
Der Server prüft Berechtigungen (Kontakt/Blockierung/„Anrufe von“), Besetzt-Zustand, Rate-Limit, Klingel-Timeout (`CALL_RING_SECONDS`) und
beendet aktive Anrufe, wenn eine Seite die Verbindung nach `CALL_DROP_GRACE_SECONDS` nicht wiederherstellt. Signale werden nur an das Gerät weitergeleitet, das den Anruf führt.

## Status (24 h)
`published_at`/`expires_at` werden serverseitig gesetzt. **Jede** Abfrage (Feed, Ansehen, Reagieren, Medien-Download) prüft `expires_at > now()` über `status_visible_to`.
Der Bereinigungsjob (`server/src/jobs.ts`, alle 10 min) löscht abgelaufene Status samt Medien – die Sichtbarkeit hängt nicht von diesem Job ab.

## Chat-Hintergründe
Pro Benutzer (`chat_backgrounds`): Standard + optional pro Chat. Das zugeschnittene Bild liegt als `purpose=background`-Medium nur beim Besitzer (Zugriff nur für `owner_id`),
Parameter (Zoom/Versatz/Helligkeit/Overlay/Blur) in `params`. Änderungen gehen als `background.updated` nur an die eigenen Geräte. Andere Teilnehmer erfahren nichts davon.

## Skalierung
Der `Hub` hält Verbindungen im Prozess. Für mehrere App-Instanzen muss `Hub.send` über einen Bus (Redis Pub/Sub oder PostgreSQL `LISTEN/NOTIFY`) verteilt werden,
und `CallManager` benötigt gemeinsamen Zustand oder Sticky-Sessions pro Anruf. Das ist **nicht implementiert**; ein einzelner Server trägt typischerweise Tausende gleichzeitige Verbindungen.
Dateien: `STORAGE_DRIVER=s3` erlaubt zustandslose App-Server (S3-Treiber bisher nicht gegen einen echten Bucket getestet).
