// Stadt-Layout als reine Daten: Straßenraster, Küste, Gelände, Bezirke, Sonderstrecken.
// Alles ist deterministisch (Seed) und unabhängig von Three.js, damit Minimap, Verkehr und Chunk-Erzeugung
// dieselben Daten benutzen und die Logik testbar bleibt.
//
// Koordinaten: x = Ost (+), z = Süd (+), y = oben. Das Meer liegt im Westen (-x), die Sonne geht dort unter.

import { hash2, noise2, fbm, smoothstep, clamp, lerp, rng } from '../util.js';

export const PITCH = 120; // Abstand der Straßenachsen (m)
export const CHUNK = 160;
export const SEA_Y = -1.0;
export const GX0 = -9, GX1 = 10, GZ0 = -10, GZ1 = 10; // Indexbereich der Raster-Straßen
export const X0 = GX0 * PITCH, X1 = GX1 * PITCH, Z0 = GZ0 * PITCH, Z1 = GZ1 * PITCH;
export const WALK = 4.5; // Gehwegbreite
export const CENTER = [-240, 0]; // Downtown

export const ROAD = {
  street: { w: 16, lanes: 2, speed: 14, label: 'Straße' },
  avenue: { w: 28, lanes: 3, speed: 19, label: 'Allee' },
  highway: { w: 26, lanes: 3, speed: 26, label: 'Küstenstraße' },
  freeway: { w: 24, lanes: 3, speed: 33, label: 'Autobahn' },
  ramp: { w: 11, lanes: 1, speed: 20, label: 'Auffahrt' },
  hill: { w: 10, lanes: 1, speed: 14, label: 'Bergstraße' },
};

export const coastX = (z) => -1340 + 50 * Math.sin(z / 310 + 0.7) + 30 * Math.sin(z / 120 + 2);
export const highwayX = (z) => coastX(z) + 100;

const isAvenueI = (i) => ((i % 4) + 4) % 4 === 0;
export const vRoadW = (i) => (isAvenueI(i) ? ROAD.avenue.w : ROAD.street.w);
export const hRoadW = (j) => (isAvenueI(j) ? ROAD.avenue.w : ROAD.street.w);

/** Bezirkstypen. */
export function zoneOfBlock(i, j, seed = 7) {
  const cx = (i + 0.5) * PITCH, cz = (j + 0.5) * PITCH;
  const dx = (cx - CENTER[0]) / PITCH, dz = (cz - CENTER[1]) / PITCH;
  const d = Math.hypot(dx, dz * 1.05);
  const h = hash2(i, j, seed);
  if (j >= 5 && j <= 5 && i >= -9 && i <= -3) return 'canal'; // Block zwischen z=600..720 am Kanal
  if (d < 3.1) return 'core';
  if (d < 5.3) return h < 0.08 ? 'park' : 'mid';
  if (i >= 4 && j >= 4) return 'industrial';
  if (j <= -6) return 'hills';
  if (h < 0.1) return 'park';
  return 'resi';
}

// ------------------------------------------------------------------------------------------
// Gelände

/** Höhe des natürlichen Geländes (ohne Straßen-Einebnung). */
export function baseTerrain(x, z) {
  // Küste / Strand
  const s = x - coastX(z);
  let h = -6 + 6 * smoothstep(-90, 40, s);
  // Hügel im Norden (z < -1250), Anstieg bis ~170 m, mit Rauschen
  const north = smoothstep(-1230, -2250, z);
  if (north > 0) {
    const n = fbm(x / 420, z / 420, 4, 5);
    const ridge = Math.abs(noise2(x / 300 + 8, z / 300, 9) - 0.5);
    h += north * (150 + 90 * (n - 0.45) - 60 * ridge) * smoothstep(-1500, 300, x + 600);
  }
  // Osthügel hinter der Autobahn
  const east = smoothstep(1420, 1950, x);
  if (east > 0) h += east * (70 + 60 * fbm(x / 350, z / 350, 3, 11));
  // Südliche Ebene wird sanft hügelig
  const south = smoothstep(1250, 2000, z);
  if (south > 0) h += south * 25 * fbm(x / 300, z / 300, 3, 13);
  // Kanal (Marina) zwischen z = 625..695, x = -1100..-250
  const cz = 660, ch = 35;
  const inX = smoothstep(-1400, -1340, x) * (1 - smoothstep(-260, -230, x));
  const inZ = 1 - smoothstep(ch - 2, ch + 2, Math.abs(z - cz));
  if (inX * inZ > 0) h = lerp(h, -6, inX * inZ);
  return h;
}

// ------------------------------------------------------------------------------------------
// Straßen

/**
 * Baut das Straßennetz. Jede Straße ist eine Polylinie (pts: [[x,z],...], y: [...]).
 * Raster-Straßen werden an Kreuzungen in Abschnitte zerlegt.
 */
export function makeLayout(seed = 7) {
  const roads = [];
  const crossings = []; // Kreuzungen {i,j,x,z,wv,wh}
  let id = 0;
  const add = (r) => { r.id = id++; roads.push(r); return r; };

  // Raster-Kreuzungen
  for (let i = GX0; i <= GX1; i++) for (let j = GZ0; j <= GZ1; j++) {
    crossings.push({ i, j, x: i * PITCH, z: j * PITCH, wv: vRoadW(i), wh: hRoadW(j) });
  }
  const crossAt = (i, j) => crossings[(i - GX0) * (GZ1 - GZ0 + 1) + (j - GZ0)];

  // Nord-Süd-Straßen
  for (let i = GX0; i <= GX1; i++) {
    const kind = isAvenueI(i) ? 'avenue' : 'street';
    for (let j = GZ0; j < GZ1; j++) {
      const za = j * PITCH + hRoadW(j) / 2, zb = (j + 1) * PITCH - hRoadW(j + 1) / 2;
      const canal = j === 5 && i <= -2 && i >= -9; // Kanal: hier läuft die Straße als Brücke
      add({ kind, w: ROAD[kind].w, pts: [[i * PITCH, za], [i * PITCH, zb]], y: [0, 0], axis: 'v', gi: i, gj: j, bridge: canal, canalSpan: canal });
    }
  }
  // Ost-West-Straßen; im Westen bis zur Küstenstraße verlängert
  for (let j = GZ0; j <= GZ1; j++) {
    const kind = isAvenueI(j) ? 'avenue' : 'street';
    const z = j * PITCH;
    const xw = highwayX(z) + ROAD.highway.w / 2;
    const first = GX0 * PITCH - vRoadW(GX0) / 2;
    // Westlicher Abschnitt: Küstenstraße -> erste N-S-Straße
    add({ kind, w: ROAD[kind].w, pts: [[xw, z], [first, z]], y: [0, 0], axis: 'h', gi: GX0 - 1, gj: j });
    for (let i = GX0; i < GX1; i++) {
      const xa = i * PITCH + vRoadW(i) / 2, xb = (i + 1) * PITCH - vRoadW(i + 1) / 2;
      add({ kind, w: ROAD[kind].w, pts: [[xa, z], [xb, z]], y: [0, 0], axis: 'h', gi: i, gj: j });
    }
    // Unterführung der Autobahn: nur Alleen reichen weiter nach Osten
    if (isAvenueI(j) && j !== GZ0 && j !== GZ1) {
      const xa = GX1 * PITCH + vRoadW(GX1) / 2;
      add({ kind, w: ROAD[kind].w, pts: [[xa, z], [1480, z]], y: [0, 0], axis: 'h', gi: GX1, gj: j, east: true });
    }
  }

  // Küstenstraße (kurvig), N–S entlang des Meeres
  {
    const pts = [], y = [];
    for (let z = -1500; z <= 1500; z += 25) { pts.push([highwayX(z), z]); y.push(0); }
    add({ kind: 'highway', w: ROAD.highway.w, pts, y, coast: true });
  }

  const index = new Map(); // Chunk-Schlüssel -> [{road, seg}] (Besitzer-Chunk = Chunk des Segment-Mittelpunkts)
  const key = (cx, cz) => cx * 100003 + cz;
  for (const r of roads) {
    for (let k = 0; k < r.pts.length - 1; k++) {
      const mx = (r.pts[k][0] + r.pts[k + 1][0]) / 2, mz = (r.pts[k][1] + r.pts[k + 1][1]) / 2;
      const kk = key(Math.floor(mx / CHUNK), Math.floor(mz / CHUNK));
      let a = index.get(kk);
      if (!a) { a = []; index.set(kk, a); }
      a.push({ road: r, seg: k });
    }
  }

  const layout = {
    seed, roads, crossings, crossAt, index,
    roadsInChunk: (cx, cz) => index.get(key(cx, cz)) || [],
    terrain: (x, z) => baseTerrain(x, z),
    zone: (x, z) => zoneOfBlock(Math.floor(x / PITCH), Math.floor(z / PITCH), seed),
    // Orte für Navigation und Start
    pois: [],
  };
  return layout;
}

/** Rasterindex des Blocks, der (x,z) enthält, und ob (x,z) auf einer Straße liegt. */
export function gridAt(x, z) {
  const i = Math.floor(x / PITCH), j = Math.floor(z / PITCH);
  return { i, j };
}

/** Vorsortierte Ausrichtung: Rechteck eines Blocks (ohne Straßen und Gehweg). */
export function blockRect(i, j) {
  const x0 = i * PITCH + vRoadW(i) / 2 + WALK, x1 = (i + 1) * PITCH - vRoadW(i + 1) / 2 - WALK;
  const z0 = j * PITCH + hRoadW(j) / 2 + WALK, z1 = (j + 1) * PITCH - hRoadW(j + 1) / 2 - WALK;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

/** Eine Straße ist nur im Raster, wenn der Block innerhalb der Rasterfläche liegt. */
export const blockInGrid = (i, j) => i >= GX0 && i < GX1 && j >= GZ0 && j < GZ1;

export { rng };
