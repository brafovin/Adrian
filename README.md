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
Demo-Onlineshop der Johann Wolfgang von Goethe Schule für **Pullover, Hoodie, T-Shirt, Cap und Stoffbeutel** (eine Datei plus Fotos, keine Abhängigkeiten): `onlineshop/index.html` über einen Webserver öffnen, z. B. `npx http-server . -p 8080` → `http://localhost:8080/onlineshop/`. Der ältere JWG Shop mit Stripe liegt weiter unter `shop/`.

- **Seiten:** Startseite (Hero, Kollektion, Stoffgewichte, Farbkarte, Etikett, FAQ), Produktseite (Foto, Detail des Wappens, Pflegeetikett, Größenwahl, Maßtabelle, Pflege), **Kasse** (Warenkorb mit Mengen, Gutschein `WILLKOMMEN10`, Versandfortschritt), **Checkout** (Adresse mit Prüfung, Versandart, Zahlungsart, AGB) und Bestellbestätigung.
- **Fotos:** `onlineshop/img/` (`hoodie`, `pullover`, `tshirt`, `cap`, `tote`). Pro Produkt gibt es ein Foto, daher hat jedes Teil nur eine Farbe. Ausschnitt und Detail stehen je Produkt im Skript (`PRODUCTS`: `pos`, `zoom`). Auf den Bildern stehen unterschiedliche Gründungsjahre (1956, 1923, 1958), das sollte vor dem Livegang vereinheitlicht werden.
- Der Warenkorb bleibt im Browser (`localStorage`). Es ist ein **Demo-Modus**: Eingaben werden nicht gesendet, Preise und Texte sind Beispieldaten. Für echte Zahlungen den Checkout wie beim JWG Shop an Stripe anbinden (`api/checkout.js`). Für Name und Wappen der Schule am besten die Erlaubnis der Schule einholen.
- **PRD** für den Hoodie Core: Dokument „PRD Hoodie Core“ (Claude Docs).
