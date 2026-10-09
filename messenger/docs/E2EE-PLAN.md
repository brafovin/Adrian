# Plan: Ende-zu-Ende-Verschlüsselung (noch NICHT umgesetzt)

> **Aktueller Stand:** Alle Verbindungen sind per TLS geschützt, Passwörter werden mit scrypt gehasht, Medien liegen serverseitig unverschlüsselt im Speicher.
> Nachrichten sind **nicht** Ende-zu-Ende-verschlüsselt. Die App und die Dokumentation behaupten das nirgends – und dürfen es erst nach Umsetzung und Tests.
> Für Anrufe gilt: WebRTC verschlüsselt Medien per DTLS-SRTP zwischen den Endpunkten (auch über TURN); die Signalisierung läuft über den Server, ohne dass Schlüssel-Fingerprints
> von den Nutzern verifiziert werden. Ohne Verifikation (Sicherheitsnummer) ist ein manipulierender Server theoretisch möglich → **Anrufe nicht als E2E bewerben**, bis Verifikation existiert.

## Grundsatz
Keine eigene Kryptografie. Verwendet werden geprüfte Protokolle/Bibliotheken:

| Bereich | Protokoll | Bibliothek |
|---|---|---|
| 1:1-Chats | Signal-Protokoll (PQXDH/X3DH + Double Ratchet) | `libsignal` (offizielle Rust-Bibliothek, TS/Swift/Java-Bindings) |
| Gruppen | MLS (RFC 9420) | `openmls` (WASM) oder Signal „Sender Keys“ via libsignal |
| Medien/Dateien | zufälliger AES-256-GCM-Schlüssel pro Datei, Schlüssel in der verschlüsselten Nachricht | Web Crypto API |
| Schlüsselablage | Geräteschlüssel nicht-exportierbar (IndexedDB/WebCrypto, auf Mobilgeräten Keychain/Keystore) | – |
| Backup/Wiederherstellung | Recovery-Schlüssel (32 Byte, einmal anzeigen) oder Passphrase → Argon2id → Schlüssel für verschlüsseltes Backup | libsodium |

## Server-Änderungen
1. **Schlüsselverzeichnis:** `POST /api/keys` (Identity-Key, signierter Prekey, One-Time-Prekeys pro Gerät), `GET /api/keys/:userId/:deviceId` (Prekey-Bundle abholen, One-Time-Prekey verbrauchen).
2. **Geräte:** Sitzung ↔ `device_id`; neue Tabelle `devices`. Nachrichten werden pro Empfängergerät verschlüsselt (Fan-out); Absender verschlüsselt auch für die eigenen anderen Geräte.
3. **Nachrichtenformat:** `messages.body` wird zu `ciphertext bytea` + `envelope jsonb` (Protokollversion, Gerät, Zähler). Metadaten (Absender, Zeit, Chat) bleiben für den Server sichtbar (Zustellung!). Optional später „Sealed Sender“.
4. **Funktionen, die Klartext brauchen, wandern in den Client:** Suche im Chat (lokaler Index), Link-Vorschauen, Push-Inhalte (Push enthält nur „Neue Nachricht“, Entschlüsselung im Service Worker/der App), „Bearbeiten“/„Löschen“ als verschlüsselte Steuernachrichten.
5. **Medien:** Upload verschlüsselter Blobs; der Server kann Typ/Größe nicht mehr prüfen → Prüfung (Magic Bytes, Größenlimit, Bildverkleinerung, EXIF-Entfernung) muss **vor** dem Verschlüsseln im Client erfolgen; Server erzwingt nur Größe und Besitzer.
6. **Chat-Hintergründe & Status:** Hintergründe sind persönlich → clientseitig verschlüsselt ablegen (Schlüssel aus dem Konto-Backup). Status: Verschlüsselung pro Zielgruppe wie Gruppennachrichten.

## Client-Änderungen
- Schlüsselerzeugung beim ersten Start, Prekey-Nachschub, Sitzungsaufbau, Ratchet-Zustand in IndexedDB.
- UI: Sicherheitsnummer/QR zur Verifikation, Warnung bei Schlüsseländerung, Anzeige „verschlüsselt“ erst, wenn der Chat nachweislich E2E nutzt.
- Neues Gerät: Kopplung per QR vom bereits angemeldeten Gerät (Geräte-zu-Geräte-Transfer) oder per Recovery-Schlüssel; Verlauf-Übertrag optional und verschlüsselt.

## Anrufe
DTLS-Fingerprint der Gegenstelle wird in der (E2E-verschlüsselten) Signalisierung ausgetauscht und mit der Sicherheitsnummer verknüpft; erst dann „Anruf ist Ende-zu-Ende-verschlüsselt“.
Für spätere Gruppenanrufe über eine SFU: Insertable Streams / SFrame mit MLS-Schlüsseln.

## Tests vor Freigabe (Voraussetzung für die Aussage „E2E“)
- Server-Datenbank-Dump enthält nachweislich keine Klartext-Nachrichten und keine Medienschlüssel.
- Interop-/Testvektoren der Bibliotheken, Ratchet-Verlust-/Reihenfolge-Tests, Mehrgeräte-Tests (Gerät hinzufügen/entfernen), Gruppen-Mitgliederwechsel (Forward/Post-Compromise-Secrecy).
- Unabhängiges Sicherheits-Review, bevor die Aussage in der App erscheint.

## Aufwand (grobe Schätzung)
1:1 + Medien + Mehrgeräte: 6–10 Wochen; Gruppen (MLS): +4–6 Wochen; Backup/Recovery + Verifikations-UI: +3 Wochen; Review/Tests: +3 Wochen.
