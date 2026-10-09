# Adrian
Angelegt über das BRAFO-Dashboard

## Dschungel Dash
Ein Endlos-Lauf-Spiel im Stil von Temple Run – läuft direkt im Browser, ohne Abhängigkeiten.
Öffne `index.html` (oder `game.html`) und klicke auf **Spielen**.

**Steuerung**
- Spur wechseln: `←` `→` oder `A` `D`
- Springen: `↑`, `W` oder Leertaste (über Hürden und Abgründe)
- Rutschen: `↓` oder `S` (unter Balken durch)
- Handy: Wischen links / rechts / hoch / runter
- Abzweigung: kurz davor `←` / `→` drücken (oder wischen), um abzubiegen – wer die Kurve verpasst, läuft gegen die Wand
- `P` Pause, `M` Ton an/aus

**Das Monster**: Es rennt dir hinterher. Stolperst du über ein Hindernis, kommt es näher und du wirst kurz langsamer.
Stolperst du zweimal kurz hintereinander, hat es dich. Ein Sturz in einen Abgrund ist sofort das Ende.

## Nova Slash
Arcade-Schneidespiel im Weltraum – `nova-slash.html` öffnen (eine Datei, keine Abhängigkeiten).

- **Steuerung:** Maus/Finger über Ziele wischen (Spur), oder klicken/tippen für einen Flächenangriff. `Esc`/`P` Pause, `M` Ton an/aus.
- **Ziele:** Kristall (1), Funkendrohne (2), Sternrelikt (5), Asteroid (mehrere Treffer), Münzkapsel (Bonusmünzen), Schrottmine (Malus: Herz, Combo und Punkte weg), Boss-Asteroid.
- **Combos:** 3 Treffer x2, 6 x3, 10 x4, 15 x5 – verfällt nach 2,4 s ohne Treffer.
- **20 Level** mit steigender Schwierigkeit, neuen Zieltypen, Flugmustern und Herausforderungen (Boss, Meteoritenschauer, Minenfeld, Turbo). Ergebnisbildschirm mit 1–3 Sternen.
- **Shop & Waffen:** 5 Waffen mit eigenen Spielmechaniken (nachleuchtende Spur, träge Hammer-Schockwelle, zwei Klingen, Kettenblitz) plus 4 Upgrades je Waffe.
- Fortschritt (Münzen, Level, Waffen, Upgrades, Highscore, Combo) wird automatisch im `localStorage` gespeichert. Sound und Musik werden per WebAudio erzeugt.

## ROUGE – Musik-Streaming-App (`musik/`)
Moderne, installierbare Musik-App (PWA) in Rot & Schwarz für Smartphones mit **JUL**, **Bobby Vandamme** und 114 weiteren deutschsprachigen Rappern (redaktionelle Auswahl, kein offizielles Ranking; Liste in `musik/tools/resolve_artists.py`, Ergebnis in `musik/data/artists.json`). Songs eines Künstlers werden erst beim Öffnen/Suchen geladen.
**Inhalte:** Die App lädt zur Laufzeit die offiziellen **30-Sekunden-Hörproben** und Cover über die öffentliche iTunes Search API von Apple (`js/data/itunes-provider.js`; Künstler in `js/config.js`). Es werden keine Audiodateien im Repo gespeichert oder weiterverteilt; vollständige Songs gibt es über den Link „In Apple Music öffnen“. Ohne Verbindung fällt die App auf eigene, lizenzfreie **Demo-Tracks** (`musik/tools/build_demo_assets.py`, CC0) zurück. Die API ist ratenbegrenzt, darum wird der Katalog 24 h lokal zwischengespeichert.

**Starten** (ES-Module brauchen einen Webserver; für Spulen im Song muss er Range-Anfragen unterstützen):
```
npx http-server musik -p 8080 -c-1      # dann http://localhost:8080
```
Auf Vercel/anderem Static-Hosting unter `/musik/` lauffähig; auf dem Handy über „Zum Startbildschirm hinzufügen“ installieren.

**Funktionen:** Splash, Start (Zuletzt gehört, Beliebt, Playlists, JUL, Neu), Künstler-/Album-/Playlist-Seiten, Suche (Songs/Alben/Künstler/Playlists), Favoriten mit Herz-Animation, eigene Playlists (erstellen, bearbeiten, Songs hinzufügen/entfernen, löschen), Bibliothek, Mini-Player + Vollbild-Player (Seek per Touch, Shuffle, Repeat, Lautstärke, Warteschlange), Autoplay, Wiedergabe läuft bei Seitenwechsel weiter, Sperrbildschirm-Steuerung (Media Session), Konten (lokal, PBKDF2) oder Gastmodus, Einstellungen, dauerhafte Speicherung in IndexedDB (inkl. Wiedergabeposition).

**Architektur** (`musik/js/`): `core/` (Speicher, Router, Overlays) · `data/` (Katalog-Fassade + austauschbarer `CatalogProvider`) · `services/` (auth, player, favorites, playlists, library, settings, mediasession) · `ui/` · `views/`.
Für echte Musik/viele Künstler: einen `RemoteCatalogProvider` mit den Methoden aus `data/provider.js` implementieren (Paginierung via `limit/offset`) und in `main.js` an `catalog.init()` übergeben – UI und Player bleiben unverändert.
Demo-Assets neu erzeugen: `python3 musik/tools/build_demo_assets.py` (numpy, Pillow, ffmpeg).

## Blitzer-Warner (`blitzer/`)
Installierbare Web-App (PWA) mit Karte: zeigt alle Blitzer im **40-km-Radius** um deinen Standort und warnt **2 km vorher** per Piepton (plus Vibration und Banner mit Restdistanz).

- **Daten:** OpenStreetMap-Blitzer (`highway=speed_camera`, `enforcement=maxspeed`) über die Overpass API, 12 h lokal zwischengespeichert. Mobile Blitzer sind darin nicht enthalten.
- **Warnstufen:** ab 2 km (einstellbar 1–3 km), dann 1 km, 500 m, 250 m – mit jeder Stufe mehr und höhere Pieptöne. Es wird nur gewarnt, wenn sich der Blitzer in Fahrtrichtung befindet (abschaltbar).
- **Bedienung:** „Warnung starten“ tippen (schaltet den Ton frei und hält den Bildschirm an). „Einstellungen → Demo-Fahrt“ simuliert eine Fahrt auf einen Blitzer zu, ohne GPS.
- **Starten:** `npx http-server blitzer -p 8080` (GPS braucht https oder localhost); auf Vercel unter `/blitzer/`; auf dem Handy „Zum Startbildschirm hinzufügen“.
- **Grenzen:** Als Web-App läuft die Warnung nur, solange die App im Vordergrund und der Bildschirm an ist. Für Betrieb im Hintergrund wäre eine native App nötig.
- **Rechtlich:** In Deutschland darf der Fahrer Blitzerwarner während der Fahrt nicht nutzen (§ 23 Abs. 1c StVO).

## JWG Shop (`shop/` + `api/`)
Onlineshop für die **JWG Kollektion** (Johann Wolfgang von Goethe Schule: Hoodie, T-Shirt, Mütze, Stoffbeutel): Produktübersicht, Produktseite mit Galerie und Größenwahl, Warenkorb (bleibt im Browser gespeichert), eigene Kasse (Name, E-Mail, Versand/Abholung, AGB-Häkchen, „Zahlungspflichtig bestellen“) und Bezahlung über **Stripe Checkout**. Erreichbar unter `/shop/`.

**Produkte** (`shop/catalog.json`): Die Bilder von T-Shirt, Mütze und Beutel sind selbst gezeichnete Mockups (Logo aus dem Hoodie-Bild), keine Fotos – bei echten Produkten bitte durch Fotos ersetzen. Die Preise sind Platzhalter.

**Einstellungen** (Preis, Größen, Versandkosten, Abholung) stehen in `shop/catalog.json`. Der Server liest die Preise nur von dort – Preise aus dem Browser werden ignoriert.

**Bezahlung scharf schalten (Vercel):**
1. Konto bei [stripe.com](https://stripe.com) anlegen, im Dashboard unter *Einstellungen → Zahlungsarten* Karte, PayPal, Klarna, SEPA usw. aktivieren.
2. In Vercel → *Settings → Environment Variables*: `STRIPE_SECRET_KEY` = dein Geheimschlüssel (`sk_test_…` zum Testen, später `sk_live_…`). Optional `SITE_URL` (z. B. `https://mein-shop.de`).
3. Neu deployen. Bestellungen (Name, Adresse, Telefon, Artikel) und Auszahlungen siehst du im Stripe-Dashboard; Stripe verschickt die Zahlungsbelege.
Ohne `STRIPE_SECRET_KEY` läuft die Kasse im **Demo-Modus** (es wird nichts bestellt oder abgebucht).

**Vor dem Livegang:** `shop/recht.html` (Impressum, AGB, Widerruf, Datenschutz) ist nur eine Vorlage – gelbe Stellen ausfüllen und prüfen lassen. Für Name und Logo der Schule am besten die Erlaubnis der Schule einholen.

**Lokal testen:** `npx http-server . -p 8080` → `http://localhost:8080/shop/` (Demo-Modus). Echte Zahlung lokal: `npx vercel dev` mit `STRIPE_SECRET_KEY`.
**Tests:** `node --test shop/tests/checkout.test.js`

## JWG.onlineshop (`onlineshop/`)
Demo-Onlineshop der Johann Wolfgang von Goethe Schule mit **8 Produkten**, alle mit Fotos: Hoodie, Pullover, T-Shirt, Chino, Ledergürtel, Cap, Stoffbeutel und Schlüsselband. Eine Datei plus Bilder: `onlineshop/index.html` über einen Webserver öffnen, z. B. `npx http-server . -p 8080` → `http://localhost:8080/onlineshop/`. Der ältere JWG Shop mit Stripe liegt weiter unter `shop/`.

- **Einstieg:** kurze Farb-Animation mit Wappen (überspringbar, entfällt bei „Bewegung reduzieren“), danach ein Hero mit wechselnden Hoodie- und Cap-Farben, Laufband, Kollektion mit Filter, **Farbwelt** (eine Farbe wählen, der Abschnitt zeigt alle Teile darin), Motive, Stoffgewichte, Etikett und FAQ.
- **Farben:** 5 bis 6 Farben je Produkt (der Gürtel hat dieselben sechs wie die Kleidung). Auf den Karten schaltet der Farbpunkt das Bild um, auf der Produktseite die Farbfelder. Gewählte Farbe und Größe landen im Warenkorb.
- **Produktseite:** Foto, Nahaufnahme des Wappens, Pflegeetikett mit gewählter Größe und Farbe, Größenwahl, Maßtabelle, Pflege. **Kasse** (Warenkorb, Gutschein `WILLKOMMEN10`, Versandfortschritt) und **Checkout** (Adresse mit Prüfung, Versandart, Zahlungsart, AGB) mit Bestellbestätigung.
- **Bilder:** `onlineshop/img/<produkt>-<farbe>.jpg` (Beutel: `tote-<farbe>.jpg`). Nur die Originalfarbe ist ein echtes Foto, **alle anderen Farben sind digital umgefärbt** (Stickerei, Haut und Hintergrund bleiben unverändert). Das steht auch auf der Produktseite. Für den Verkauf besser durch echte Fotos ersetzen. `wappen.png` ist das aus dem Foto freigestellte Wappen. Beim Ledergürtel sind **alle** Farben umgefärbt, das Original-Foto ist braun. Ausschnitt und Nahaufnahme je Produkt stehen im Skript (`PRODUCTS`: `pos`, `zoom`). Auf den Fotos stehen unterschiedliche Gründungsjahre (1928, 1956, 1958, 1968, 1923), das sollte vor dem Livegang vereinheitlicht werden.
- **KI-Assistent:** Der Chat unten rechts beantwortet Fragen zu allen Produkten (Größenberatung, Farben, Material, Pflege, Versand, Rückgabe, Gutschein). Er kennt den Katalog und die aktuelle Seite (Produkt, gewählte Farbe, Warenkorb). Die Antworten kommen von Claude über `api/chat.js`. Ohne Server (lokal, Vorschau) oder ohne Schlüssel schaltet die Seite automatisch in einen **Katalog-Modus**, der aus den Produktdaten antwortet; das zeigt die Kopfzeile des Chats an.
  - **Einrichten (Vercel):** `ANTHROPIC_API_KEY` als Environment Variable setzen und neu deployen. Der Schlüssel liegt nur auf dem Server, nie in der Seite. Optional `CHAT_MODEL` (Standard `claude-opus-5-5`, deutlich günstiger: `claude-haiku-5-5`) und `CHAT_RATE_LIMIT` (Fragen pro IP und 10 Minuten, Standard 20). Der Aufruf nutzt `effort: low`, Prompt-Caching für den Katalog und die serverseitige Weiche auf ein Ausweichmodell bei Sicherheitsablehnungen.
  - **Katalog aktualisieren:** Nach Änderungen an Produkten, Farben oder Versandwerten in `index.html` einmal `node onlineshop/tools/export-catalog.js` ausführen, das schreibt `onlineshop/chat-catalog.json` (die Wissensbasis des Bots). Der Test `node --test onlineshop/tests/chat.test.js` meldet, wenn die Datei veraltet ist.
  - **Grenzen:** Der Bot erfindet keine Lagerbestände, Zertifikate oder Kontaktdaten und antwortet nur zum Shop. Die Begrenzung pro IP gilt je Serverinstanz und bremst nur grob.
- Der Warenkorb bleibt im Browser (`localStorage`). Es ist ein **Demo-Modus**: Eingaben werden nicht gesendet, Preise und Texte sind Beispieldaten. Nach einer Bestellung vermerkt der Shop sie nur im Browser (`localStorage`, Schlüssel `jwg-shop-orders`), damit **JWG.logistik** daraus einen Auftrag mit Sendungsnummer machen kann; die Bestätigungsseite verlinkt die Sendungsverfolgung. Für echte Zahlungen den Checkout wie beim JWG Shop an Stripe anbinden (`api/checkout.js`). Für Name und Wappen der Schule am besten die Erlaubnis der Schule einholen.
- **PRD** für den Hoodie Core: Dokument „PRD Hoodie Core“ (Claude Docs).

## JWG.logistik (`logistik/`)
Logistik- und Speditions-App für den JWG.onlineshop, ähnlich wie Logiflow: Aufträge annehmen, Touren planen, Fahrer steuern, Sendungen verfolgen, abrechnen. Umgesetzt nach dem Pflichtenheft mit 23 Punkten. **Reine Browser-Demo ohne Server** mit Beispieldaten (alles fiktiv); Daten liegen im `localStorage`. Öffnen über einen Webserver, z. B. `npx http-server . -p 8080` → `http://localhost:8080/logistik/`. Shop und App müssen auf **derselben Domain** liegen, damit die Shop-Anbindung funktioniert.

- **Module:** Dashboard, Aufträge (anlegen, bearbeiten, kopieren, stornieren, Bestätigung, Preisvorschau, automatischer Entwurf), **Disposition** (Drag-and-drop, Prüfung auf Nutzlast, Fahrerlaubnis, Abwesenheit, Fahrzeugsperre, HU und Zeitfenster, Karte, Tourenoptimierung), Sendungsverfolgung (intern und öffentlich unter `#/track/<Nummer>`), Kunden (CRM), Fahrer, Fuhrpark, Frachtführer, Angebote mit Kalkulation, Abrechnung (Rechnungen, Gutschriften, Mahnstufen, Eingangsrechnungen, Erlös und Kosten, CSV-Export), Dokumente, Lager, Kommunikation, Reklamationen, Reporting, Benutzer und Rechte, Einstellungen, Schnittstellen, Sicherheit und Datenschutz.
- **Fahrer-App** (im Telefonrahmen, `#/fahrer-app`, Demo-PIN 1234): Touren, Ankunft, Abholung und Zustellung mit **Unterschrift** und Fotos, Schaden und Verspätung melden, Chat, **Offline-Warteschlange** mit Synchronisation. Aktionen erscheinen sofort in Disposition und Verfolgung.
- **Kundenportal** (`#/portal`): Transport anfragen, Angebote annehmen, Sendungen suchen, Rechnungen und Liefernachweise, Reklamationen. Die Anmeldung ist eine Demo-Auswahl.
- **Rollen:** Oben rechts lässt sich der Benutzer wechseln; Menüs und Aktionen folgen der Rolle (Matrix unter „Benutzer und Rechte“). Das wird nur im Browser erzwungen.
- **Shop-Anbindung:** Der Shop legt Bestellungen unter `jwg-shop-orders` ab, die App übernimmt sie automatisch als Aufträge (Gewicht aus den Produkten, Express erkannt). Zusätzlich gibt es Beispielbestellung, JSON-Einfügen, CSV-Import und -Export unter „Schnittstellen“.
- **Ehrlicher Stand:** Die Seite „PRD-Abdeckung“ listet alle 23 Punkte mit Status. Simuliert sind u. a. Fahrzeugpositionen (aus dem Tourverlauf berechnet, schematische Karte), E-Mail und Push (landen im Versandprotokoll), Telematik, Buchhaltung, ERP und die Anmeldung. Verschlüsselung, MFA, echte Backups und Mandantentrennung brauchen einen Server. „KI-Vorschläge“ sind eine Regel, kein Modell.
- **KI-Assistent** (Knopf „Assistent“ unten rechts, Seitenleiste): Beantwortet Fragen zu den Daten der App („Welche Sendungen sind verspätet?“, „Wo ist JWG-1DP7H?“, „Welche Fahrer sind morgen frei?“, „Was kostet ein Palettenversand von Frankfurt nach Hamburg mit 300 kg?“) und erklärt die Bedienung. Er **liest nur** und ändert nichts, kennt die aktuelle Seite („diese Sendung“) und verlinkt Aufträge, Touren und Rechnungen.
  - **Zwei Modi:** *KI (Claude)* über `api/logistik-chat.js` und *Lokalmodus* mit festen Regeln im Browser (`logistik/js/ai.js`). Der Lokalmodus läuft ohne Server und ohne Schlüssel, das zeigt der Chat im Kopf an. Fällt die KI aus, wechselt der Assistent selbst in den Lokalmodus.
  - **Einrichten (Vercel):** `ANTHROPIC_API_KEY` setzen und neu deployen, derselbe Schlüssel wie für den Shop-Chat. Optional `LOGISTIK_CHAT_MODEL` (sonst `CHAT_MODEL`, sonst `claude-opus-5-5`; deutlich günstiger: `claude-haiku-5-5`) und `LOGISTIK_CHAT_RATE_LIMIT` (Fragen pro IP und 10 Minuten, Standard 30). Rechenbeispiel: Je Frage gehen etwa 14.000 Eingabe-Tokens (Regeln und Hilfewissen werden gecacht, der Datenauszug nicht) und wenige hundert Ausgabe-Tokens an Claude.
  - **Datenschutz:** Der Browser baut einen **Datenauszug** nur aus dem, was die gewählte Rolle und der Standortfilter sehen dürfen, **ohne Straßen, Telefonnummern, E-Mail-Adressen und Unterschriften**; Privatpersonen nur mit Initialen. Vor dem ersten KI-Aufruf fragt der Assistent um Erlaubnis (zurücksetzbar über das Schild-Symbol). Ohne erreichbaren KI-Server wird nichts gefragt und nichts gesendet. Der Verlauf liegt nur in der Browser-Sitzung.
  - **Grenzen:** Antworten der KI können Fehler enthalten, bei Zahlen gilt die App. Der Datenauszug ist auf rund 70.000 Zeichen begrenzt (die Beispieldaten brauchen etwa 28.000). Im Kundenportal und auf der öffentlichen Seite gibt es den Assistenten bewusst nicht.
  - **Tests:** `node --test logistik/tests/chat.test.js` (Server: Prüfungen, Parameter, echtes SDK gegen Mock-Server) und `logistik/tests/ai.test.js` (Datenauszug, Rollen, Lokalmodus, Darstellung).
- **Tests:** `node --test logistik/tests/logic.test.js` (Beispieldaten, Preise, Zuweisungsprüfung, Optimierung, Shop-Übernahme, CSV-Schutz, Maskierung).
