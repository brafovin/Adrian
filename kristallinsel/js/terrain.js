// Gelände der Insel: Form, Höhenraster, Höhenabfrage (passend zum Dreiecksnetz), Neigung und Untergrund.
// Reines JS ohne three.js, damit Physik, Platzierung und Tests in Node laufen.
import { createNoise2D, fbm, ridged, smoothstep, lerp, clamp } from './noise.js';

export const SEED = 20261013;
export const SIZE = 1024;            // Kantenlänge des Geländes in m (Insel + Meer drumherum)
export const SEG = 256;              // Rasterzellen pro Kante
export const CELL = SIZE / SEG;      // 4 m
export const HALF = SIZE / 2;
export const WATER = 0;              // Meeresspiegel (auch der See liegt auf dieser Höhe)
export const ISLAND_R = 380;

export const MOUNTAIN = { x: 170, z: -185, r: 150, h: 80 };
export const LAKE = { x: -150, z: -105, r: 55, islet: 9 };

const nA = createNoise2D(SEED);
const nB = createNoise2D(SEED + 1);
const nC = createNoise2D(SEED + 2);

// Inselform ohne Klippe: Hügelland, Strände, Berg und See.
function shapeHeight(x, z) {
  const r = Math.hypot(x, z);
  const warp = fbm(nA, x * 0.0032 + 5.3, z * 0.0032 - 3.1, 3);
  const t = r / (ISLAND_R * (1 + 0.2 * warp));
  const land = 1 - smoothstep(0.8, 1.05, t);
  const hills = 3 + 13 * (fbm(nA, x * 0.0045, z * 0.0045, 4) * 0.5 + 0.5);
  let h = lerp(-15, hills * smoothstep(1.0, 0.74, t) + 1.2, land);

  // Bergmassiv: schräg gestreckter Grat mit Hauptgipfel und Nebengipfel.
  const ca = Math.cos(0.6), sa = Math.sin(0.6);
  const mx = x - MOUNTAIN.x, mz = z - MOUNTAIN.z;
  const u = (mx * ca + mz * sa) / MOUNTAIN.r, v = (-mx * sa + mz * ca) / (MOUNTAIN.r * 0.62);
  const dm2 = u * u + v * v;
  const sx = x - (MOUNTAIN.x - 95), sz = z - (MOUNTAIN.z + 40);
  const d2 = (sx * sx + sz * sz) / (70 * 70);
  const rough = 0.7 + 0.45 * ridged(nC, x * 0.012, z * 0.012, 3);
  const peak = (Math.exp(-dm2 * 2.2) + 0.42 * Math.exp(-d2 * 2.5)) * rough;
  h += MOUNTAIN.h * peak * smoothstep(0.3, 0.95, land);

  const dl = Math.hypot(x - LAKE.x, z - LAKE.z) * (1 + 0.22 * nB(x * 0.018 + 2, z * 0.018));
  const bowl = smoothstep(LAKE.r * 1.35, LAKE.r * 0.72, dl);
  h = lerp(h, -5 + 1.2 * nB(x * 0.05, z * 0.05), bowl);
  const di = Math.hypot(x - LAKE.x, z - LAKE.z);
  const islet = smoothstep(LAKE.islet, LAKE.islet * 0.35, di);
  h = lerp(h, 1.7, islet);
  return h;
}

/** Sucht entlang eines Strahls vom Zentrum den letzten Punkt über Wasser. */
export function coastPoint(angle, fn = shapeHeight, from = 150) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let last = from;
  for (let d = from; d < HALF - 8; d += 1) {
    if (fn(c * d, s * d) > WATER + 0.3) last = d;
  }
  return { x: c * last, z: s * last, d: last };
}

// Klippe mit Leuchtturm im Westen.
const cliffCoast = coastPoint(Math.PI * 0.97);
export const CLIFF = {
  x: cliffCoast.x + 26 * Math.cos(Math.PI * 0.97 + Math.PI),
  z: cliffCoast.z + 26 * Math.sin(Math.PI * 0.97 + Math.PI),
  r: 48, h: 19,
};

/** Grundhöhe ohne geebnete Bauplätze. */
export function baseHeight(x, z) {
  let h = shapeHeight(x, z);
  const dc = Math.hypot(x - CLIFF.x, z - CLIFF.z);
  const m = smoothstep(CLIFF.r, CLIFF.r - 14, dc);
  if (m > 0) h = Math.max(h, lerp(h, CLIFF.h + 1.2 * nB(x * 0.06, z * 0.06), m));
  return h + 0.5 * nC(x * 0.06, z * 0.06);
}

/**
 * Baut das Höhenraster. layout liefert flatten: [{x,z,r,fall,y}] (Bauplätze) und paths: [{pts:[[x,z],..], w}].
 */
export function buildTerrain(layout = { flatten: [], paths: [] }) {
  const N = SEG + 1;
  const heights = new Float32Array(N * N);

  // Wege bekommen ein geglättetes Höhenprofil mit begrenzter Steigung (wie ein in den Hang geschnittener Pfad).
  // Segmente werden in ein 32-m-Raster einsortiert, damit die Abstandsabfrage schnell bleibt.
  const BIN = 32, BN = Math.ceil(SIZE / BIN), STEP = 2;
  const bins = Array.from({ length: BN * BN }, () => []);
  for (const p of layout.paths) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      segs.push({ ax, az, bx, bz, len, s0: total, w: p.w });
      total += len;
    }
    const n = Math.max(2, Math.ceil(total / STEP) + 1);
    const raw = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const sk = Math.min(total, k * STEP);
      const sg = segs.find((g) => sk <= g.s0 + g.len + 1e-6) || segs.at(-1);
      const t = sg.len > 0 ? (sk - sg.s0) / sg.len : 0;
      raw[k] = baseHeight(sg.ax + (sg.bx - sg.ax) * t, sg.az + (sg.bz - sg.az) * t);
    }
    const prof = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let sum = 0, cnt = 0;
      for (let o = -3; o <= 3; o++) { const q = k + o; if (q >= 0 && q < n) { sum += raw[q]; cnt++; } }
      prof[k] = sum / cnt;
    }
    const g = (p.grade ?? 0.55) * STEP;
    for (let k = 1; k < n; k++) prof[k] = Math.min(prof[k], prof[k - 1] + g);
    for (let k = n - 2; k >= 0; k--) prof[k] = Math.min(prof[k], prof[k + 1] + g);
    for (const sg of segs) {
      sg.prof = prof;
      const pad = sg.w + 8;
      const x0 = Math.floor((Math.min(sg.ax, sg.bx) - pad + HALF) / BIN), x1 = Math.floor((Math.max(sg.ax, sg.bx) + pad + HALF) / BIN);
      const z0 = Math.floor((Math.min(sg.az, sg.bz) - pad + HALF) / BIN), z1 = Math.floor((Math.max(sg.az, sg.bz) + pad + HALF) / BIN);
      for (let iz = Math.max(0, z0); iz <= Math.min(BN - 1, z1); iz++)
        for (let ix = Math.max(0, x0); ix <= Math.min(BN - 1, x1); ix++) bins[iz * BN + ix].push(sg);
    }
  }
  /** Nächster Weg: d = Abstand minus halbe Wegbreite (<0 = auf dem Weg), h = Profilhöhe dort. */
  const near = { d: Infinity, h: 0 };
  function pathInfo(x, z) {
    near.d = Infinity;
    const bx = Math.floor((x + HALF) / BIN), bz = Math.floor((z + HALF) / BIN);
    if (bx < 0 || bz < 0 || bx >= BN || bz >= BN) return near;
    for (const s of bins[bz * BN + bx]) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = s.len > 0 ? clamp(((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len), 0, 1) : 0;
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.w * 0.5;
      if (d < near.d) {
        near.d = d;
        const f = (s.s0 + t * s.len) / STEP, k = Math.min(s.prof.length - 2, Math.floor(f));
        near.h = lerp(s.prof[k], s.prof[k + 1], clamp(f - k, 0, 1));
      }
    }
    return near;
  }
  const pathDist = (x, z) => pathInfo(x, z).d;

  function finalHeight(x, z) {
    let h = baseHeight(x, z);
    const pi = pathInfo(x, z);
    if (pi.d < 6) h = lerp(h, pi.h, smoothstep(6, 0.4, pi.d));
    for (const f of layout.flatten) {
      const d = Math.hypot(x - f.x, z - f.z);
      const w = smoothstep(f.r + f.fall, f.r, d);
      if (w > 0) h = lerp(h, f.y, w);
    }
    return h;
  }

  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < N; i++) heights[j * N + i] = finalHeight(-HALF + i * CELL, z);
  }

  /** Höhe exakt auf dem Dreiecksnetz (gleiche Diagonale wie das Mesh). */
  function heightAt(x, z) {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = clamp(fx, 0, SEG - 1e-6); fz = clamp(fz, 0, SEG - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = heights[j * N + i], h10 = heights[j * N + i + 1];
    const h01 = heights[(j + 1) * N + i], h11 = heights[(j + 1) * N + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  /** Flächennormale des Dreiecks unter (x, z). */
  function normalAt(x, z) {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = clamp(fx, 0, SEG - 1e-6); fz = clamp(fz, 0, SEG - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = heights[j * N + i], h10 = heights[j * N + i + 1];
    const h01 = heights[(j + 1) * N + i], h11 = heights[(j + 1) * N + i + 1];
    let dx, dz;
    if (u + v <= 1) { dx = (h10 - h00) / CELL; dz = (h01 - h00) / CELL; }
    else { dx = (h11 - h01) / CELL; dz = (h11 - h10) / CELL; }
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }

  /** Glatte Normale aus Nachbarhöhen (für Farben und Platzierung). */
  function smoothNormal(x, z, e = CELL) {
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }

  const flat = layout.flatten;
  function zoneAt(x, z) {
    for (const f of flat) if (f.ground && Math.hypot(x - f.x, z - f.z) < f.r) return f;
    return null;
  }

  /** Untergrund für Farben, Schritte und Pflanzen. */
  function surfaceAt(x, z, h = heightAt(x, z), ny = smoothNormal(x, z)[1]) {
    if (h < WATER - 0.15) return 'water';
    if (pathDist(x, z) < 0) return 'path';
    const zone = zoneAt(x, z);
    if (zone) return zone.ground;
    if (h > 74 + 4 * nB(x * 0.03, z * 0.03) && ny > 0.62) return 'snow';
    if (ny < 0.72 || h > 60 + 6 * nA(x * 0.02, z * 0.02)) return 'rock';
    if (h < 2.2 + 0.8 * nC(x * 0.04, z * 0.04)) return 'sand';
    return 'grass';
  }

  return { heights, heightAt, normalAt, smoothNormal, pathDist, surfaceAt, zoneAt, baseHeight, finalHeight };
}

/** Bodenfarbe (linear 0..1) – für Gelände-Mesh und Karte. */
export function groundColor(terrain, x, z) {
  const h = terrain.heightAt(x, z);
  const ny = terrain.smoothNormal(x, z)[1];
  const s = terrain.surfaceAt(x, z, h, ny);
  const n = nA(x * 0.03, z * 0.03) * 0.5 + nB(x * 0.11, z * 0.11) * 0.25;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  let c;
  switch (s) {
    case 'water': c = mix([0.78, 0.7, 0.48], [0.45, 0.42, 0.3], smoothstep(-0.2, -6, h)); break;
    case 'sand': c = mix([0.93, 0.83, 0.58], [0.86, 0.75, 0.5], n * 0.5 + 0.5); break;
    case 'path': c = mix([0.63, 0.5, 0.33], [0.55, 0.43, 0.28], n * 0.5 + 0.5); break;
    case 'plaza': c = mix([0.66, 0.62, 0.55], [0.58, 0.55, 0.5], n * 0.5 + 0.5); break;
    case 'dirt': c = mix([0.5, 0.42, 0.28], [0.42, 0.36, 0.24], n * 0.5 + 0.5); break;
    case 'field': c = mix([0.86, 0.72, 0.3], [0.78, 0.6, 0.22], (Math.sin(x * 0.9) * 0.5 + 0.5) * 0.6 + n * 0.2); break;
    case 'snow': c = mix([0.95, 0.96, 0.98], [0.86, 0.89, 0.94], n * 0.5 + 0.5); break;
    case 'rock': c = mix([0.47, 0.45, 0.42], [0.36, 0.35, 0.34], n * 0.5 + 0.5); break;
    default: {
      // Gras: saftig unten, trockener und dunkler weiter oben, Waldboden dunkler.
      const forest = smoothstep(0.1, 0.45, fbm(nC, x * 0.006, z * 0.006, 3));
      c = mix([0.42, 0.66, 0.24], [0.3, 0.52, 0.2], n * 0.5 + 0.5);
      c = mix(c, [0.24, 0.42, 0.18], forest * 0.7);
      c = mix(c, [0.5, 0.56, 0.3], smoothstep(30, 58, h));
    }
  }
  return c;
}

/** Waldanteil 0..1 an einer Stelle (für Baumdichte). */
export function forestAt(x, z) {
  return smoothstep(0.05, 0.4, fbm(nC, x * 0.006, z * 0.006, 3));
}

export { nA as noiseA, nB as noiseB, nC as noiseC };
