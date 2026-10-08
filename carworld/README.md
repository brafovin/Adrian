# SUNSET DRIVE – Luxury Open World

Spielbarer Open‑World‑Prototyp im Browser (Three.js, keine Build‑Schritte): vier getunte Luxus‑/Sportwagen,
eine große Küstenstadt bei Sonnenuntergang, Fahrphysik, Verkehr, Fußgänger, Garage, Menü und Sound.

> **Wichtig vorab – ehrlicher Stand:** Die vier Fahrzeuge sind **prozedural nachgebaut** (Karosserie aus
> Querschnitts‑Kurven, Decals, Shader), kein Foto‑/Scan‑Modell und kein Original‑Showroom‑Asset. Ich habe sie
> Schritt für Schritt per Silhouetten‑Overlay gegen deine Referenzbilder abgeglichen. Das Ergebnis ist
> **erkennbar und nah dran, aber nicht „exakt“** – siehe [Fahrzeuge](#fahrzeuge-was-stimmt-was-nicht) und
> [Was für echte 1:1‑Modelle nötig ist](#was-für-echte-11-modelle-nötig-ist).

## Starten

```sh
cd carworld
tools/serve.sh 8732          # oder: python3 -m http.server 8732   /   npx http-server -p 8732
# dann im Browser: http://localhost:8732/
```

ES‑Module brauchen `http://` (nicht `file://`). Three.js r170 liegt lokal in `vendor/` – das Spiel läuft offline.
Auf Vercel/GitHub‑Pages‑artigem Hosting reicht das statische Verzeichnis `carworld/` (Link im Repo‑Index).

Nützliche URL‑Parameter: `?car=cls63|rs7|i7|g63` · `?q=low|medium|high|ultra` ·
`?tod=afternoon|sunset|dusk|night` · `?autostart=1` (direkt ins Spiel) · `?static=1` (feste Auflösung).

Entwickler‑Seiten: `viewer.html` (einzelnes Auto, Ortho‑/Silhouetten‑Ansichten zum Referenzabgleich),
`worldtest.html` (Stadt‑Bauabschnitte).

## Steuerung

| Taste | Funktion | | Taste | Funktion |
|---|---|---|---|---|
| W / ↑ | Gas | | C | Kamera: Verfolger / weit / Motorhaube / Cockpit |
| S / ↓ | Bremse, dann Rückwärts | | V | Freie Kamera (Foto) |
| A D / ← → | Lenken (geschwindigkeitsabhängig) | | L | Licht |
| Leertaste | Handbremse | | G | Getriebe Automatik/Manuell |
| E / Q | Hoch‑/Runterschalten (manuell) | | R | Rückwärtsgang (manuell) |
| Backspace | Auf die Straße zurücksetzen | | H | Hupe |
| N | Navigationsziel wechseln | | P / Esc | Pause |
| Maus ziehen / Rad | Kamera drehen / zoomen | | | |

**Controller:** linker Stick lenken, RT/LT Gas/Bremse, B Handbremse, Y Kamera, RB/LB schalten.
Weitere Eingabegeräte (Lenkrad, Touch) lassen sich über `input.addSource({ name, poll(state, dt) })`
(`js/input.js`) einhängen, ohne das Spiel anzufassen.

## Was funktioniert (getestet)

Getestet heißt: headless Chromium (Software‑GL) + `node --test`, **nicht** auf echter GPU/Audio‑Hardware.

- **Menü & Ablauf:** Startbildschirm mit Auto vor Sonnenuntergangs‑Skyline; *Spiel starten*, *Fahrzeug auswählen*,
  *Garage*, *Einstellungen*; Pause; Einstellungen werden in `localStorage` gespeichert.
- **Fahrphysik** (`js/physics/vehicle.js`, 240 Hz): 4‑Rad‑Modell mit Reifenkraft‑Kurve und Kammscher Kreis,
  Lastwechsel, Federung/Nick/Wank, Motor‑ und Drehmomentkennlinien je Auto, Automatik + optional manuelles Getriebe,
  ABS, Traktionskontrolle, ESC‑Unterstützung (einstellbar), Sperrdifferential, Handbremse, kontrollierbares
  Übersteuern, EV‑Rekuperation beim i7. Messwerte aus `tests/`: 0–100 km/h ≈ 4,0–4,7 s, 100→0 km/h ≈ 37–42 m,
  ≈ 1 g Querbeschleunigung, stabiler Stillstand am Hang.
- **Kollisionen:** SAT‑Boxen mit Impuls und Reibung (Gebäude, Leitplanken, Props, Verkehr). Frontalcrash stoppt
  ohne Kreiseln. Kein Schadensmodell.
- **Welt (Stadtraster ≈ 2,3 × 2,4 km plus Küste, Hügel und Bergstraßen bis ≈ 2 km nördlich; gestreamt in 160‑m‑Chunks, kein Ladebildschirm im Spiel):** Innenstadt mit Hochhäusern,
  Vororte mit Villen/Palmen, Industrie, Küstenstraße mit Meerblick, Strand und Pier, Hügelstraßen mit Serpentinen
  und Aussichtspunkt, Brücken/Hochstraßen, Autobahn mit Auf‑/Abfahrten, Tunnel, Parkhaus („Skyline Deck“),
  Autotreff‑Platz („Sunset Plaza“), Tankstellen, Ampeln, Fahrbahnmarkierungen, Schilder, Bürgersteige.
- **Verkehr & Fußgänger:** KI‑Autos folgen Spuren, halten an Ampeln und biegen ab; Fußgänger laufen Blockränder
  ab. Dichte und Reichweite hängen von der Qualitätsstufe ab.
- **Licht:** Nachmittag → Sonnenuntergang → Dämmerung → Nacht (oder Übergang); goldenes Gegenlicht, lange
  Schatten, Bloom, Reflexions‑IBL; nachts schalten Straßenlaternen, Fahrzeuglicht und Fensterlicht.
- **Reifenspuren und Reifenqualm** (`js/effects.js`): schwarze Bremsspuren/Driftspuren (Ringpuffer) und weißer Qualm
  bei Durchdrehen, Handbremse und Drift – gesteuert vom Schlupf der einzelnen Räder.
- **Kameras:** Verfolger, weit, Motorhaube, Cockpit, freie Foto‑Kamera; Wandblockade, geschwindigkeitsabhängiges
  FOV und Wackeln.
- **Garage:** dunkler Showroom mit Spiegelboden und Lichtleisten; Wechsel zwischen den vier Autos; Kamera‑Presets
  (3/4, vorn, Seite, hinten, Rad, oben, Innenraum) plus freies Orbit; Lack (Referenz + Alternativen), Felgen
  (Referenz schwarz glänzend + Alternativen), Aero‑Teile einzeln ein/aus, beim G 63 Türen öffnen. **„Alle Teile (Referenz)“ stellt das
  Referenzdesign wieder her** – Tuning verändert das Referenzdesign nie dauerhaft.
- **Sound** (`js/engine-synth.js`, `js/audio-worklet.js`, `js/audio.js`): synthetisierter V8 je Wagen
  (CLS/RS7/G63 mit eigenem Charakter, Zündfolge, Turbo, Fehlzündungen beim Gaswegnehmen), elektrisches
  Fahrgeräusch für den i7, Reifenquietschen, Wind, Umgebung, räumliches Audio (Kamera‑ vs. Auto‑Position,
  Verkehrsstimmen). Das Spektrum ist per Test geprüft; **angehört habe ich es nicht** – Klang ist daher
  ungetestet und braucht deine Ohren.
- **Anzeigen:** Tacho, Gang, Drehzahl, ABS/ESC/MAN/Licht, Minimap (kopfhoch), dezenter Navigationspfeil mit
  Entfernung, Uhrzeit.
- **Tests:** `node --test tests/*.test.js` (Physik, Kollision, Audio‑Spektren, Straßennetz/Layout).

## Fahrzeuge: was stimmt, was nicht

Alle vier: schwarzer Metalliclack mit sehr dezentem roten Perleffekt (Flake‑Shader + Sheen), Klarlack, schwarz
glänzende Felgen, schwarze Auspuffblenden, Rad‑/Bremsen‑Details, Licht‑Signaturen, Innenraum mit Armaturenbrett
und Lenkrad, das mitdreht. Pro Fahrzeug eigene Masse, Radstand, Motor und Fahrwerksabstimmung.

| Fahrzeug | Status gegenüber den Referenzbildern |
|---|---|
| **Mercedes‑AMG CLS 63 S (Widebody)** | Am weitesten: Silhouette im Seitenüberlagerungstest sehr nah; Panamericana‑Grill, Frontlippe, Schweller, Radlauf‑Verbreiterungen, Spoilerlippe, Diffusor, vier Endrohre. Diffusor‑Finnen wirken von hinten noch zu spitz. |
| **Audi RS7 (neue Generation, Widebody)** | Gut erkennbar: Wabengrill, Matrix‑LED‑Signatur, Breitbau, Heck‑Lichtband, Diffusor, vier Rohre. Feinfacetten der Karosserie und Original‑Proportionen von Dach/C‑Säule sind vereinfacht. |
| **BMW i7** | Erkennbar: beleuchtete Niere, geteilte Scheinwerfer, große Felgen, Aero‑Teile. Die Facetten der Front und die Flächenübergänge sind nur angenähert. |
| **Mercedes‑AMG G 63 Mansory‑Stil** | Kastenform, Panamericana‑Grill mit türkisen Schimmerstreifen und „M“‑Emblem, runde LED‑Scheinwerfer mit Ringlicht, Carbon‑Frontschürze/Haube/Kotflügelverbreiterungen/Trittbretter, Dachträger mit LED‑Leiste, Reserverad mit Mansory‑Plakette, schwarz glänzende Felgen mit türkisen Bremssätteln, vier eckige Endrohre. **Innenraum komplett Tiffany Blue** (Leder mit Rautensteppung, Steppnähte, Carbon‑Einsätze, Türverkleidungen, Lenkrad, Kombiinstrument, Ambientelicht). **Alle vier Türen öffnen** (Garage → Innenraum). Karosserie ist ein glatter Kasten ohne die zerklüftete Carbon‑Geometrie des Bildes; die Carbon‑„Marmor“‑Optik fehlt; Innenraum ist deutlich einfacher als die Referenzfotos. Das Bild zeigt keine Seitenansicht – die Seiten sind aus Proportionen des G 63 rekonstruiert, nicht belegt. |

Grundsätzlich fehlt allen vieren, was nur echte Modelle liefern: Millimeter‑genaue Flächenübergänge,
Scheinwerfer‑Innenleben, echte Reflexionstiefe im Lack, Naht‑/Fugenverläufe, Innenraum‑Feinheiten. Die
Referenzbilder zeigen nur einzelne Ansichten; verdeckte Bereiche (Unterboden, Dachinnenseite, Motorraum) sind
plausibel rekonstruiert, **nicht** nachgewiesen.

## Was für echte 1:1‑Modelle nötig ist

Wenn „exakt wie die Bilder“ gefordert ist, geht das nicht aus 2D‑Bildern allein. Nötig wäre pro Fahrzeug:

1. **Ein 3D‑Modell** (glTF/GLB, ~150–400k Dreiecke für das Exterieur, LODs optional) aus einer Quelle mit
   passender Lizenz – Auftrag an eine 3D‑Künstlerin/einen Künstler anhand der Referenzbilder, ein lizenziertes
   Modell oder Fotogrammetrie.
2. **Getrennte Teile mit festen Namen:** `Body`, `Glass`, `Wheel_FL/FR/RL/RR` (Pivot in Radmitte, Reifen und
   Felge als eigene Meshes), `Caliper_*`, `Headlights`, `Taillights`, `Interior`, `SteeringWheel`, Bodykit‑Teile
   (`Kit_Lip`, `Kit_Skirt`, …) und für die Garage Türen als eigene Knoten mit Scharnier‑Pivot.
3. **PBR‑Materialien:** Lack (Basisfarbe, Klarlack), Glas, Leder (inkl. Tiffany‑Blue‑Variante), Carbon,
   Gummi; Texturen 2k–4k.
4. **Maße/Gewicht** stehen bereits in `js/cars/specs.js` und werden weiterverwendet.

Einhängepunkt: `js/cars/index.js` (`loadCar(id)`) liefert ein Modell‑Objekt mit `root, body, pivot, wheels[4],
update(v, dt), setLights(), setPaint(), setRim(), setKit(), dims, lights`. Ein GLB‑Lader, der diese Schnittstelle
bedient, ersetzt die prozedurale Karosserie, ohne dass Physik, Kamera, Garage oder Sound angefasst werden müssen.

## Was noch fehlt / bekannte Lücken

- **Echte Fahrzeugmodelle** (siehe oben) – der größte Hebel für „AAA‑Look“.
- **Türen öffnen** geht nur beim G 63 (Garage → Innenraum). CLS, RS7 und i7 haben feste Türen; ihr Innenraum ist über Cockpit‑/Innenraum‑Kamera zu sehen.
- **Aero‑Teile einzeln schalten** gibt es für CLS, RS7 und i7; beim G 63 ist der Carbon‑Anbau zu einem Mesh verschmolzen (nicht einzeln schaltbar).
- **Tiefgarage:** Es gibt ein mehrstöckiges Parkhaus, aber keine echte unterirdische Garage.
- **Schadensmodell** fehlt (Kollisionen verändern Karosserie nicht).
- **Echte‑Hardware‑Messung:** Bildrate habe ich nur mit Software‑Rendering gesehen. Die Qualitätsstufen und die
  automatische Auflösung (DRS) sind dafür gebaut, aber auf echten GPUs unvermessen.
- **Sound** ist synthetisch (kein Sample‑Material) und ungehört.
- Gelände/Texturen der Hügel sind noch dunkel/einfach; Baum‑ und Gebäudevielfalt ist begrenzt.
- Alles ist **Originalmaterial**: keine fremden Assets, keine Marken‑Logos außer den Emblemen auf den Referenzfahrzeugen.

## Aufbau des Codes

```
index.html, css/style.css       Spiel‑UI (Menü, Garage, Einstellungen, HUD)
js/main.js                      Game‑Klasse: Zustände, UI, Spielschleife
js/player.js, physics/          Fahrzeug‑Physik, Kollision, Bodenabtastung
js/camera.js, input.js, hud.js  Kameras, Eingabe (Tastatur/Controller/erweiterbar), HUD/Minimap
js/garage.js                    Showroom
js/renderer.js, env.js          Render‑Pipeline (Bloom, optional GTAO, DRS), Himmel/Licht/Tageszeit
js/materials.js                 Lack/Glas/Leder/Carbon‑Shader und Texturen
js/cars/                        Karosserie‑Lofting, Bauteile, Innenräume, je Auto eine Definition
js/world/                       Straßennetz, Gelände, Chunks, Gebäude/Props, Verkehr, Fußgänger
js/engine-synth.js, audio*.js   Synthese + Mischung des Sounds
tests/                          Node‑Tests (Physik, Kollision, Audio, Layout)
reference/                      Deine Referenzbilder (Abgleich mit viewer.html)
```
