// Feste Gestaltung der Insel: Orte, Bauplätze, Wege, Figuren. Reines JS.
import { baseHeight, coastPoint, LAKE, CLIFF, MOUNTAIN, WATER } from './terrain.js';

const H = (x, z) => baseHeight(x, z);

// Höchster Punkt des Bergs (für den Schrein).
function findPeak() {
  let best = -Infinity, bx = 0, bz = 0;
  for (let z = MOUNTAIN.z - 80; z < MOUNTAIN.z + 80; z += 2)
    for (let x = MOUNTAIN.x - 80; x < MOUNTAIN.x + 80; x += 2) {
      const h = H(x, z);
      if (h > best) { best = h; bx = x; bz = z; }
    }
  return { x: bx, z: bz, y: best };
}

export const VILLAGE = { x: 20, z: 130 };
VILLAGE.y = H(VILLAGE.x, VILLAGE.z);
export const PEAK = findPeak();
const southCoast = coastPoint(Math.PI / 2, baseHeight);
export const PIER = { x: 2, z: southCoast.z - 6, len: 34 };
PIER.y = WATER + 1.3;
export const LIGHTHOUSE = { x: CLIFF.x - 14, z: CLIFF.z + 2, y: CLIFF.h };
export const WINDMILL = { x: 110, z: 80, y: H(110, 80) };
export const FIELD = { x: 150, z: 118, y: H(150, 118) };
export const RUINS = { x: 270, z: 60, y: H(270, 60) };
export const TOWER = { x: -160, z: 110, y: H(-160, 110) };
export const CAMP = { x: -40, z: -240, y: H(-40, -240) };
export const WRECK = { x: -246, z: -228 };
export const STONES = { x: -200, z: 230, y: H(-200, 230) };
export const ROCKISLE = { x: 372, z: 46, y: 2.4 };
export const JUNCTION = { x: -20, z: 30 };
export const PASTURE = { x: -82, z: 52 };

export const SPAWN = { x: VILLAGE.x - 3, z: VILLAGE.z + 9, yaw: Math.PI };

const flat = (o, r, fall, ground = null, y = o.y) => ({ x: o.x, z: o.z, r, fall, y, ground });

export const LAYOUT = {
  flatten: [
    flat(VILLAGE, 14, 2, 'plaza'),
    flat(VILLAGE, 44, 22),
    flat(WINDMILL, 9, 12, 'dirt'),
    flat(FIELD, 24, 14, 'field'),
    flat(RUINS, 13, 2, 'plaza'),
    flat(RUINS, 28, 16),
    flat(TOWER, 12, 10, 'dirt'),
    flat(CAMP, 9, 10, 'dirt'),
    flat(LIGHTHOUSE, 22, 14, null, CLIFF.h),
    flat(PEAK, 7, 10, 'plaza', PEAK.y - 9.5),
    flat(STONES, 11, 12, 'dirt'),
    flat(ROCKISLE, 7, 10, null),
    { x: PIER.x + 7, z: PIER.z - 10, r: 5, fall: 6, y: H(PIER.x + 7, PIER.z - 10), ground: 'dirt' },
  ],
  paths: [
    { name: 'Steg', w: 3, pts: [[VILLAGE.x, VILLAGE.z], [12, 175], [6, 230], [4, 290], [PIER.x, PIER.z - 2]] },
    { name: 'Mühle', w: 3, pts: [[VILLAGE.x, VILLAGE.z], [62, 112], [WINDMILL.x - 4, WINDMILL.z + 4]] },
    { name: 'Ruinen', w: 2.6, pts: [[WINDMILL.x, WINDMILL.z], [160, 78], [215, 70], [RUINS.x, RUINS.z]] },
    { name: 'Westweg', w: 3, grade: 0.4, pts: [[VILLAGE.x, VILLAGE.z], [-50, 124], [TOWER.x, TOWER.z], [-222, 70], [-262, 40], [LIGHTHOUSE.x + 12, LIGHTHOUSE.z]] },
    { name: 'Nordweg', w: 3, pts: [[VILLAGE.x, VILLAGE.z], [5, 80], [JUNCTION.x, JUNCTION.z], [-70, -30], [-100, -62]] },
    { name: 'Seeufer', w: 2.4, pts: [[-100, -62], [-84, -110], [-96, -160], [-72, -200], [CAMP.x, CAMP.z]] },
    { name: 'Wrack', w: 2.4, pts: [[CAMP.x, CAMP.z], [-120, -258], [-190, -250], [WRECK.x + 20, WRECK.z + 6]] },
    { name: 'Bergpfad', w: 2.6, grade: 0.65, pts: [[JUNCTION.x, JUNCTION.z], [50, -30], [96, -78], [126, -102], [104, -128], [100, -152], [122, -166], [146, -166], [162, -162], [PEAK.x, PEAK.z]] },
    { name: 'Steinkreis', w: 2.4, pts: [[-50, 124], [-110, 170], [STONES.x, STONES.z]] },
  ],
};

/** Orte für Ortsschilder, Karte und Entdeckungen. */
export const POIS = [
  { id: 'dorf', name: 'Lindenhain', x: VILLAGE.x, z: VILLAGE.z, r: 50 },
  { id: 'steg', name: 'Fischersteg', x: PIER.x, z: PIER.z + 6, r: 34 },
  { id: 'muehle', name: 'Alte Mühle', x: WINDMILL.x + 20, z: WINDMILL.z + 18, r: 42 },
  { id: 'ruinen', name: 'Sonnenruinen', x: RUINS.x, z: RUINS.z, r: 42 },
  { id: 'turm', name: 'Waldwacht', x: TOWER.x, z: TOWER.z, r: 28 },
  { id: 'leuchtturm', name: 'Leuchtturm Westkap', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 46 },
  { id: 'see', name: 'Spiegelsee', x: LAKE.x, z: LAKE.z, r: 75 },
  { id: 'gipfel', name: 'Wolkenspitze', x: PEAK.x, z: PEAK.z, r: 30 },
  { id: 'lager', name: 'Rastlager', x: CAMP.x, z: CAMP.z, r: 26 },
  { id: 'wrack', name: 'Schiffswrack', x: WRECK.x, z: WRECK.z, r: 34 },
  { id: 'steinkreis', name: 'Steinkreis', x: STONES.x, z: STONES.z, r: 28 },
  { id: 'felsen', name: 'Möwenfels', x: ROCKISLE.x, z: ROCKISLE.z, r: 22 },
];

/** Bewohner. look = Aussehen, at = Blickrichtung (Bogenmaß), lines je nach Spielstand in story.js. */
export const NPCS = [
  { id: 'mira', name: 'Mira', title: 'Dorfälteste', x: VILLAGE.x + 4, z: VILLAGE.z + 4, yaw: Math.PI * 0.8,
    look: { skin: 2, hair: 6, hairStyle: 'dutt', top: 7, bottom: 3 } },
  { id: 'jonas', name: 'Jonas', title: 'Fischer', x: PIER.x + 0.5, z: PIER.z + PIER.len - 3, yaw: 0,
    look: { skin: 1, hair: 4, hairStyle: 'muetze', top: 3, bottom: 1 } },
  { id: 'lotta', name: 'Lotta', title: 'Müllerstochter', x: WINDMILL.x - 7, z: WINDMILL.z + 7, yaw: -2.3,
    look: { skin: 0, hair: 2, hairStyle: 'zopf', top: 5, bottom: 4 }, small: true },
  { id: 'bruno', name: 'Bruno', title: 'Schäfer', x: PASTURE.x + 6, z: PASTURE.z - 4, yaw: 1.2,
    look: { skin: 3, hair: 1, hairStyle: 'kurz', top: 2, bottom: 2 } },
  { id: 'ronja', name: 'Ronja', title: 'Wanderin', x: CAMP.x + 3, z: CAMP.z + 3.5, yaw: -2.6,
    look: { skin: 4, hair: 0, hairStyle: 'lang', top: 6, bottom: 0 } },
];

/** Wegweiser: Position + Text. */
export const SIGNS = [
  { x: VILLAGE.x + 10, z: VILLAGE.z - 14, text: '↑ Kreuzung · Spiegelsee · Rastlager\n→ Alte Mühle · Sonnenruinen\n← Waldwacht · Leuchtturm\n↓ Fischersteg' },
  { x: JUNCTION.x + 4, z: JUNCTION.z + 3, text: '↗ Bergpfad zur Wolkenspitze\n↖ Spiegelsee · Rastlager\n↓ Lindenhain' },
  { x: TOWER.x + 10, z: TOWER.z + 6, text: '← Leuchtturm Westkap\n→ Lindenhain\nAuf dem Turm hat man den besten Blick über den Wald.' },
  { x: CAMP.x - 7, z: CAMP.z + 5, text: '← Schiffswrack\n↓ Spiegelsee · Lindenhain\nAm Feuer kann man sich ausruhen.' },
];
