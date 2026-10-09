# Definition „fertig“ – Nachweis und offene Punkte

Stand der Entwicklungsumgebung (Linux-Container, lokales PostgreSQL 16, Chromium mit Fake-Kamera/-Mikrofon). **Die App darf noch nicht als produktionsbereit bezeichnet werden.**

| Kriterium aus dem Auftrag | Status | Nachweis / Lücke |
|---|---|---|
| Registrierung & Anmeldung mit echten Konten | ✅ nachgewiesen | `server/test/auth.test.ts`, E2E `signUp` (Registrierung → E-Mail-Link → Login im Browser) |
| Zwei unabhängige Benutzer kommunizieren | ✅ | E2E `smoke`, `chat` (zwei Browser-Kontexte, echter Server/DB) |
| Nachrichten dauerhaft gespeichert, zuverlässig zugestellt | ✅ (Einzelserver) | Idempotenz/seq-Tests, Offline-Sync, Offline-Senden E2E; **kein** Test bei Serverausfall/Failover |
| Bilder und Dateien real übertragen | ✅ | `chat.test.ts`, E2E (Bild/Dokument/Sprachnachricht) |
| Individuelle Chat-Hintergründe aus der Galerie | ✅ | `chat.test.ts` (Privatsphäre/Sync), E2E `settings` (Zuschneiden, Persistenz, 2. Gerät, Zurücksetzen) |
| Status veröffentlicht und nach 24 h ausgeblendet | ✅ | `status.test.ts` (Zeit per DB verschoben, Abruf/Medien gesperrt, Cleanup), E2E `status` |
| Sprach-/Videoanrufe über **reale Geräte und Netze** | ❌ **offen** | Nur lokal mit Chromium-Fake-Geräten bewiesen (Bytes fließen, Video rendert). Kein TURN-Test, keine Mobilgeräte/NAT/WLAN↔LTE-Wechsel |
| Benachrichtigungen auf unterstützten Geräten | ⚠️ teilweise | Regeln/Inhalt serverseitig getestet (`push.test.ts`, Sender ersetzt); echte Zustellung (Android/iOS/Desktop-Push-Dienste) ungetestet; FCM ungetestet, APNs nicht implementiert |
| Berechtigungen/Datenschutz serverseitig erzwungen | ✅ | `security.test.ts` (IDOR-Matrix), `chat/status/calls`-Tests |
| Fehlerfälle und Verbindungsabbrüche | ✅ lokal | Reconnect, ICE/WS-Abbruch, Tab-Crash, Rate-Limits (E2E + Server) |
| Notwendige Produktionsdienste eingerichtet | ❌ **offen** | `deploy/` vorhanden, aber nicht gebaut/gestartet (kein Docker hier); SMTP, TURN, TLS-Domain, VAPID, Objektspeicher müssen vom Betreiber konfiguriert werden |
| Sicherheits-, Funktions- und Wiederherstellungstests | ⚠️ teilweise | Automatisierte Sicherheitstests ✅, Backup→Restore-Test lokal ✅ (`scripts/restore-test.sh`); **kein** externer Pentest/Audit, kein Lasttest über eine Stichprobe hinaus (≈140 Nachr./s, p95 < 0,5 s bei 100 Verbindungen auf einem Rechner, `server/bench/load.ts`) |
| Ende-zu-Ende-Verschlüsselung (Sicherheitsanforderung) | ❌ **nicht umgesetzt** | Plan in `E2EE-PLAN.md`; App zeigt ehrlichen Hinweis „TLS, keine E2EE“ |
| Android & iOS | ⚠️ | Installierbare PWA; keine native App, keine Store-Veröffentlichung |
| Gruppenanrufe | ❌ | Laut Auftrag als Erweiterung vorgesehen, nicht gebaut |

## Vor dem Livegang zu erledigen
1. Produktionsdienste einrichten (siehe `DEPLOYMENT.md`), Docker-Image bauen und Staging-Test fahren.
2. Anrufe auf echten Geräten testen: Android/iOS-Browser, WLAN↔Mobilfunk, strenge NAT/Firewall **mit** coturn (TURN über TCP/TLS 443/5349).
3. Web-Push auf echten Geräten prüfen (iOS nur als installierte Web-App).
4. Lasttest mit realistischem Profil, Datenbank-Tuning (Indizes sind angelegt), ggf. Redis/NOTIFY für mehrere Instanzen.
5. Externes Sicherheits-Review; Moderations-Oberfläche für `reports`; Virenscan für Uploads; Datenschutzerklärung/AV-Verträge.
6. E2EE gemäß `E2EE-PLAN.md` umsetzen und unabhängig prüfen lassen – erst danach so bewerben.
7. Native Hüllen (Capacitor) mit FCM/APNs, falls Store-Apps gewünscht sind.
