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
