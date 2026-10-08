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
// Hilfsfunktionen für kurvige Straßen

/** Catmull-Rom-Kurve durch Stützpunkte, auf ca. `spacing` Meter abgetastet. */
export function catmull(P, spacing = 12) {
  const out = [];
  const g = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

/** Höhenprofil entlang einer Straße: folgt dem Gelände, Steigung begrenzt, geglättet. */
export function gradeProfile(pts, y0, maxGrade = 0.08, base = baseTerrain, yEnd = null) {
  const n = pts.length;
  const d = [0];
  for (let i = 1; i < n; i++) d.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const y = pts.map((p) => base(p[0], p[1]));
  y[0] = y0;
  const limit = () => {
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - maxGrade * d[i], y[i - 1] + maxGrade * d[i]);
      for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - maxGrade * d[i + 1], y[i + 1] + maxGrade * d[i + 1]);
      y[0] = y0;
    }
  };
  limit();
  for (let round = 0; round < 5; round++) {
    for (let it = 0; it < 8; it++) for (let i = 1; i < n - 1; i++) y[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
    y[0] = y0;
    limit();
  }
  if (yEnd !== null) { y[n - 1] = yEnd; limit(); }
  return y;
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



  // ---------------------------------------------------------------- Autobahn (erhöht) mit Auffahrten
  const FW_X = 1290, FW_Y = 9.0;
  {
    const pts = [], y = [];
    for (let z = -1500; z <= 1500; z += 40) { pts.push([FW_X, z]); y.push(FW_Y); }
    add({ kind: 'freeway', w: ROAD.freeway.w, pts, y, elevated: true });
    // Auffahrten/Abfahrten an den Alleen j = -4 (z = -480) und j = 4 (z = 480)
    const ramp = (poly, up) => {
      const P = catmull(poly, 24);
      const n = P.length;
      const yy = P.map((_, i) => {
        const t = i / (n - 1);
        const s = up ? t : 1 - t;
        return FW_Y * (s * s * (3 - 2 * s) * 0.6 + s * 0.4);
      });
      add({ kind: 'ramp', w: ROAD.ramp.w, pts: P, y: yy, elevated: true, ramp: true });
    };
    for (const sg of [-1, 1]) {
      const z0 = sg * 480;
      // Auffahrt: von der Allee nach außen und auf die Autobahn (fährt Richtung Außenende)
      ramp([[1226, z0 + sg * 16], [1238, z0 + sg * 70], [1258, z0 + sg * 140], [1276, z0 + sg * 220], [1282, z0 + sg * 300]], true);
      // Abfahrt: von der Autobahn herunter zur Allee
      ramp([[1282, z0 - sg * 300 + sg * 0], [1264, z0 - sg * 230 + 0], [1244, z0 - sg * 150], [1230, z0 - sg * 70], [1226, z0 - sg * 16]], false);
    }
  }

  // ---------------------------------------------------------------- Hügelstraßen
  const tunnels = [];
  let viewpoint = null, summit = null;
  {
    // Hillcrest Drive: Serpentinen zum Gipfel
    const W1 = [[240, -1208], [240, -1380], [330, -1480], [500, -1520], [590, -1610], [520, -1700], [300, -1730], [80, -1750], [-60, -1820], [-40, -1910], [130, -1960], [330, -1990], [440, -2070], [380, -2160], [200, -2200], [20, -2230]];
    const P1 = catmull(W1, 12);
    const y1 = gradeProfile(P1, 0.0, 0.075);
    add({ kind: 'hill', w: ROAD.hill.w, pts: P1, y: y1, hillRoad: true, name: 'Hillcrest Drive' });
    summit = { x: P1[P1.length - 1][0], z: P1[P1.length - 1][1], y: y1[y1.length - 1] };
    // Cliff Road: Küstenpass mit Tunnel zum Aussichtspunkt
    const sx = highwayX(-1500);
    const W2 = [[sx, -1500], [sx + 90, -1600], [sx + 210, -1690], [sx + 360, -1760], [sx + 470, -1840]];
    const T0 = [sx + 520, -1895], T1 = [sx + 640, -1970];
    const W3 = [[sx + 700, -2020], [sx + 820, -2090], [sx + 940, -2130], [sx + 1040, -2165]];
    const Pa = catmull(W2, 12), Pb = [T0, [(T0[0] + T1[0]) / 2, (T0[1] + T1[1]) / 2], T1], Pc = catmull([T1, ...W3], 12);
    const pts2 = [...Pa, ...Pb.slice(0, -1).map((p) => p), ...Pc];
    // Tunnelabschnitt als eigene dichte Punktfolge (12 m), damit Profil/Gelände stimmen
    const tl = Math.hypot(T1[0] - T0[0], T1[1] - T0[1]);
    const tn = Math.round(tl / 12);
    const tp = []; for (let i = 0; i <= tn; i++) tp.push([lerp(T0[0], T1[0], i / tn), lerp(T0[1], T1[1], i / tn)]);
    const full = [...Pa.slice(0, -1), ...tp.slice(0, -1), ...Pc];
    void pts2;
    const y2 = gradeProfile(full, 0.0, 0.08);
    const tStart = Pa.length - 1, tEnd = tStart + tn;
    const r = add({ kind: 'hill', w: ROAD.hill.w, pts: full, y: y2, hillRoad: true, name: 'Cliff Road', tunnel: [tStart, tEnd] });
    tunnels.push({ road: r, a: full[tStart], b: full[tEnd], ya: y2[tStart], yb: y2[tEnd], len: Math.hypot(full[tEnd][0] - full[tStart][0], full[tEnd][1] - full[tStart][1]) });
    viewpoint = { x: full[full.length - 1][0], z: full[full.length - 1][1], y: y2[y2.length - 1] };
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

  // ---------------------------------------------------------------- Gelände: an Hügelstraßen einebnen, Tunnel-Rücken
  const GC = 40;
  const gradeMap = new Map();
  const gkey = (a, b) => a * 100003 + b;
  const gsegs = [];
  for (const r of roads) {
    if (!r.hillRoad) continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const seg = { ax: r.pts[k][0], az: r.pts[k][1], bx: r.pts[k + 1][0], bz: r.pts[k + 1][1], ya: r.y[k], yb: r.y[k + 1], w: r.w };
      seg.dx = seg.bx - seg.ax; seg.dz = seg.bz - seg.az; seg.l2 = seg.dx * seg.dx + seg.dz * seg.dz || 1;
      gsegs.push(seg);
      const m = r.w / 2 + 30;
      for (let cx = Math.floor((Math.min(seg.ax, seg.bx) - m) / GC); cx <= Math.floor((Math.max(seg.ax, seg.bx) + m) / GC); cx++)
        for (let cz = Math.floor((Math.min(seg.az, seg.bz) - m) / GC); cz <= Math.floor((Math.max(seg.az, seg.bz) + m) / GC); cz++) {
          const kk = gkey(cx, cz); let arr = gradeMap.get(kk); if (!arr) gradeMap.set(kk, (arr = [])); arr.push(seg);
        }
    }
  }
  const terrain = (x, z) => {
    let h = baseTerrain(x, z);
    const arr = gradeMap.get(gkey(Math.floor(x / GC), Math.floor(z / GC)));
    if (arr) {
      let bd = 1e9, by = 0, bw = 10;
      for (let i = 0; i < arr.length; i++) {
        const sg = arr[i];
        const t = clamp(((x - sg.ax) * sg.dx + (z - sg.az) * sg.dz) / sg.l2, 0, 1);
        const px = sg.ax + sg.dx * t - x, pz = sg.az + sg.dz * t - z;
        const d = Math.hypot(px, pz);
        if (d < bd) { bd = d; by = lerp(sg.ya, sg.yb, t); bw = sg.w; }
      }
      const wgt = 1 - smoothstep(bw / 2 + 1.5, bw / 2 + 28, bd);
      if (wgt > 0) h = lerp(h, by, wgt);
    }
    for (const T of tunnels) {
      const dx = T.b[0] - T.a[0], dz = T.b[1] - T.a[1], L = T.len;
      const rx = x - T.a[0], rz = z - T.a[1];
      const al = (rx * dx + rz * dz) / L, la = (-rx * dz + rz * dx) / L;
      if (al < -14 || al > L + 14 || Math.abs(la) > 62) continue;
      const wlat = 1 - smoothstep(14, 58, Math.abs(la));
      const wa = smoothstep(-3, 11, al) * (1 - smoothstep(L - 11, L + 3, al));
      const wgt = wlat * wa;
      if (wgt <= 0) continue;
      const yr = lerp(T.ya, T.yb, clamp(al / L, 0, 1));
      const ridge = yr + 12.5 + 3.5 * fbm(x / 45, z / 45, 3, 21);
      h = Math.max(h, lerp(h, ridge, wgt));
    }
    return h;
  };

  const layout = {
    seed, roads, crossings, crossAt, index, tunnels, summit, viewpoint,
    /** Liegt (x,z) im Korridor eines Tunnels (inkl. Portalbereich)? Dort zählt nur die Fahrbahn, nicht der Berg darüber. */
    inTunnel: (x, z) => {
      for (const T of tunnels) {
        const dx = T.b[0] - T.a[0], dz = T.b[1] - T.a[1], rx = x - T.a[0], rz = z - T.a[1];
        const al = (rx * dx + rz * dz) / T.len, la = (-rx * dz + rz * dx) / T.len;
        if (al > -14 && al < T.len + 14 && Math.abs(la) < 9) return true;
      }
      return false;
    },
    roadsInChunk: (cx, cz) => index.get(key(cx, cz)) || [],
    terrain,
    zone: (x, z) => zoneOfBlock(Math.floor(x / PITCH), Math.floor(z / PITCH), seed),
    // Orte für Navigation und Start
    pois: [
      { name: 'Pazifik-Strand', x: -1262, z: 160 },
      { name: 'Downtown', x: -240, z: 0 },
      { name: 'Sunset Plaza', x: 180, z: -180 },
      { name: 'Skyline Deck (Parkhaus)', x: -180, z: 180 },
      { name: 'Marina-Brücken', x: -600, z: 660 },
      { name: 'Autobahn-Auffahrt', x: 1226, z: -470 },
      { name: 'Industriehafen', x: 780, z: 780 },
      { name: 'Küsten-Aussicht', x: viewpoint.x, z: viewpoint.z },
      { name: 'Hillcrest-Gipfel', x: summit.x, z: summit.z },
    ],
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
