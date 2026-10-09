# Sicherheit

Jede Zeile nennt Maßnahme → Umsetzung → Test. „Test“ verweist auf automatisierte Tests im Repo (`server/test`, `web/e2e`).

| Anforderung | Umsetzung | Test |
|---|---|---|
| HTTPS überall | Betrieb hinter Caddy (TLS, HSTS); App setzt HSTS + `Secure`-Cookie bei `https://`-`PUBLIC_URL`, leitet bei `X-Forwarded-Proto: http` um | Konfiguration (`deploy/`), manuell zu prüfen |
| Passwort-Hashes | scrypt (N=2¹⁷, r=8, p=1, 16-Byte-Salt), Parameter im Hash; Konstantzeit-Vergleich; Dummy-Hash gegen Timing-Enumeration | `auth.test.ts` |
| Sitzungen | Zufallstoken (256 Bit), nur SHA-256-Hash in der DB, httpOnly + SameSite=Lax Cookie, Gerätename/IP/Zeit, einzeln widerrufbar, Ablauf 60 Tage, Abmeldung trennt WebSocket sofort | `auth.test.ts`, `sync.test.ts` |
| CSRF / Cross-Site-WebSocket | Cookie-Anfragen mit ändernder Methode brauchen `Origin` aus der Allowlist; WebSocket prüft `Origin`; Bearer-Tokens (native Apps) sind nicht CSRF-anfällig | `auth.test.ts` |
| Zugriffskontrolle serverseitig | Jede Route prüft Mitgliedschaft/Eigentümer; fremde Chats antworten mit 404 (kein Existenz-Leak); Privatsphäre in SQL-Funktionen (`can_see` …) | `chat.test.ts`, `security.test.ts` (IDOR-Matrix über >20 Endpunkte), `status.test.ts` |
| Medien geschützt | Kein öffentlicher Pfad; jeder Abruf prüft Besitzer/Chat-Mitgliedschaft/Status-Sichtbarkeit/Avatar-Freigabe; `Cache-Control: private`, `nosniff`, `CSP: sandbox`, Dokumente nur als Download | `chat.test.ts`, `status.test.ts` |
| Sichere Uploads | Typ per Inhalt (Magic Bytes) erkannt, Endungs-Denylist (exe/html/svg/js …), Größenlimits je Zweck, Quota je Benutzer, Bilder werden neu kodiert (EXIF/GPS entfernt, Pixel-Limit), Dateiname wird nie als Pfad verwendet | `chat.test.ts`, `security.test.ts` |
| Rate-Limits | Global je IP; strenger für Registrierung, Login, Reset, Verifizierung, Suche, Nachrichten (je Benutzer), neue Chats mit Fremden, Kontaktanfragen, Anrufe, Uploads; Login-Sperre je Konto + IP | `security.test.ts`, `auth.test.ts` |
| Spam/Bots bei Registrierung | Honeypot-Feld, optional Cloudflare Turnstile (`TURNSTILE_SECRET`), E-Mail-Verifizierung Pflicht, generische Antworten (keine E-Mail-Enumeration) | `auth.test.ts` |
| Unerwünschte Nachrichten | Standard: nur Kontakte dürfen schreiben; Blockieren, Melden, Anfragen deaktivierbar, nicht auffindbar | `chat.test.ts` |
| Sensible Zugangsdaten | Nur über Umgebungsvariablen/Secrets; Produktion bricht ohne `APP_SECRET`/`SMTP_URL` ab; Logs redigieren Cookie/Authorization | `config.ts` |
| SQL-Injection | Ausschließlich parametrisierte Abfragen; LIKE-Platzhalter werden maskiert | `security.test.ts` |
| Sicherheits-Header | CSP (`default-src 'self'`, kein Inline-Script), `X-Content-Type-Options`, `Permissions-Policy`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` | `auth.test.ts` |
| Backups | `scripts/backup.sh` (pg_dump + Uploads, 14 Tage Aufbewahrung); `scripts/restore-test.sh` spielt in eine Wegwerf-DB ein und vergleicht Zeilenzahlen | in der Entwicklungsumgebung ausgeführt |
| Kontolöschung | Passwort-bestätigt; löscht Profil, Sitzungen, Kontakte, Status, Medien (inkl. Dateien), Audit-Einträge; Nachrichten werden unkenntlich („Gelöschter Nutzer“); Gruppen-Inhaberschaft wird übertragen | `auth.test.ts`, `lifecycle.test.ts` |
| Datenexport | `GET /api/me/export` (JSON, Art. 20 DSGVO) | `status.test.ts` |
| Nachvollziehbarkeit | `audit_log` (Login, Passwortänderung, Blockieren, Löschen …, 12 Monate), Migrationen mit Checksumme | `lifecycle.test.ts` |
| Ende-zu-Ende-Verschlüsselung | **nicht umgesetzt** – siehe `E2EE-PLAN.md` | – |

## Bekannte Grenzen / offene Punkte
- Kein unabhängiges Sicherheits-Audit oder Penetrationstest durchgeführt.
- Nachrichten und Medien liegen serverseitig im Klartext (kein E2EE); Betreiber mit Datenbankzugriff können sie lesen.
- Rate-Limits sind prozesslokal (bei mehreren App-Instanzen: gemeinsamen Store wie Redis ergänzen).
- Web-Push-Inhalte sind durch den Push-Dienst nur transportverschlüsselt (RFC 8291 verschlüsselt den Payload Ende-zu-Ende zum Gerät – ✔), enthalten aber bei Vorschau Nachrichtentext.
- Virenscan hochgeladener Dateien ist nicht integriert (Hook: nach `putFile` in `routes/media.ts`, z. B. ClamAV).
- Moderation: Meldungen werden gespeichert (`reports`), es gibt noch keine Admin-Oberfläche.
