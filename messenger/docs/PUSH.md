# Push-Benachrichtigungen

## Web-Push (PWA) – umgesetzt
1. Schlüssel erzeugen: `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:…` in `.env`.
2. App öffnen → *Profil → Benachrichtigungen → Push auf diesem Gerät aktivieren*. Der Browser fragt nach Erlaubnis, die Subscription wird per `PUT /api/push/subscription` gespeichert (verknüpft mit der Sitzung, wird beim Abmelden gelöscht).
3. Der Server sendet Push nur an Geräte, die **keine** offene WebSocket-Verbindung haben, und beachtet: Kategorie-Schalter, Stummschaltung, Blockierungen, „Inhalte ausblenden“ (dann nur „Neue Nachricht“).
4. Anrufe: Push mit `urgency: high`, `requireInteraction`; Klick öffnet die App, der Server liefert den klingelnden Anruf beim Verbinden erneut aus.

Plattformen: Chrome/Edge/Firefox (Desktop + Android) ✔. iOS/iPadOS ab 16.4 nur, wenn die Web-App über „Zum Home-Bildschirm“ installiert ist. Push auf Sperrbildschirmen: Der Inhalt wird vom Betriebssystem angezeigt – mit „Inhalte ausblenden“ enthält die Push-Nachricht keinen Nachrichtentext.
**Nicht getestet:** Zustellung auf echten Android-/iOS-Geräten und über echte Push-Dienste (im Test wird der Sender ersetzt, Inhalt/Regeln sind geprüft).

## FCM (Android-Hülle, z. B. Capacitor) – Integrationspunkt
`server/src/push.ts` enthält einen FCM-HTTP-v1-Provider (Service-Account-JWT → OAuth-Token → `messages:send`). Aktivierung: `FCM_SERVICE_ACCOUNT_JSON` setzen; die native App registriert ihren FCM-Token mit `PUT /api/push/subscription {provider:'fcm', endpoint:<token>}`.
**Nicht getestet** (keine Firebase-Zugangsdaten in der Entwicklungsumgebung).

## APNs (iOS-Hülle)
Provider-Wert `apns` wird gespeichert, ein Sender ist **nicht implementiert**. Empfehlung: Token-basierte APNs-Authentifizierung (`.p8`) oder Versand über FCM.
