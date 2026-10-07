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
