// Erzeugt die Geometrie eines Chunks (160 m x 160 m) aus den Layout-Daten.

import * as THREE from 'three';
import { Bucket, col, mixCol, mulCol } from './geo.js';
import { CHUNK, PITCH, WALK, ROAD, GX0, GX1, GZ0, GZ1, vRoadW, hRoadW, zoneOfBlock, blockRect, coastX, highwayX, CENTER, SEA_Y } from './layout.js';
import * as P from './props.js';
import { rng, hash2, smoothstep, clamp, lerp } from '../util.js';

const BUCKETS = ['terrain', 'rStreet', 'rAvenue', 'rHighway', 'rHill', 'rPlain', 'walk', 'solid', 'palm', 'lamp', 'glass', 'office', 'apartment', 'villa', 'industrial', 'win', 'pool', 'marks',
  'tlNr', 'tlNy', 'tlNg', 'tlEr', 'tlEy', 'tlEg', 'grass'];

const C = { sidewalk: col(0xb9b5ad), curb: col(0xa09c94), median: col(0x8c8a84), grass: col(0x6d8f3f), asphalt: col(0x3c3c3f), roadDark: col(0x1d1d20) };

export function groundColor(x, z, h, nrmY) {
  const s = x - coastX(z);
  const gridX = x > -1100 && x < 1230 && z > -1230 && z < 1230;
  let c;
  if (z < -1250 || x > 1450 || z > 1500) {
    // Hügel: trockenes Gras / Macchia, Fels an steilen Hängen
    const t = clamp((nrmY - 0.72) / 0.2, 0, 1);
    c = mixCol(col(0x5a4f3d), mixCol(col(0x8a7e4e), col(0x6d7a43), clamp(h / 150, 0, 1)), t);
  } else if (s < 130 && !gridX) {
    c = h < -0.7 ? col(0x8b7a5c) : col(0xd0bc92);
    if (h > -0.7 && s > 55) c = mixCol(c, col(0xa6a26a), smoothstep(55, 110, s));
  } else if (gridX) c = col(0x4a4a4c);
  else c = col(0x8c8c58);
  return c;
}

export class ChunkBuilder {
  constructor(world) { this.world = world; this.layout = world.layout; this.mats = world.mats; }

  build(cx, cz) {
    const L = this.layout;
    const rnd = rng(hash2(cx, cz, L.seed) * 4294967296);
    const b = {};
    for (const k of BUCKETS) b[k] = new Bucket();
    const chunk = { cx, cz, group: new THREE.Group(), colliders: [], lamps: [], redLights: [], strips: [], meshes: [] };
    const grid = this.world.grid;
    const ctx = {
      b, rnd, lamps: chunk.lamps, redLights: chunk.redLights,
      circle: (x, z, r, y0 = 0, y1 = 6) => chunk.colliders.push(grid.addCircle(x, z, r, y0, y1)),
      box: (x, z, hx, hz, rot = 0, y0 = 0, y1 = 10) => chunk.colliders.push(grid.addBox(x, z, hx, hz, rot, y0, y1)),
      strip: (s) => chunk.strips.push(this.world.addStrip(s)),
      chunk, world: this.world, layout: L,
    };
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    this.terrain(ctx, x0, z0);

    // Straßen: Segmente, deren Mittelpunkt in diesem Chunk liegt
    for (const { road, seg } of L.roadsInChunk(cx, cz)) this.roadSegment(ctx, road, seg);

    // Kreuzungen
    for (const c of L.crossings) {
      if (c.x >= x0 && c.x < x0 + CHUNK && c.z >= z0 && c.z < z0 + CHUNK) this.intersection(ctx, c);
    }

    // Blöcke
    const i0 = Math.floor(x0 / PITCH) - 1, i1 = Math.floor((x0 + CHUNK) / PITCH) + 1;
    const j0 = Math.floor(z0 / PITCH) - 1, j1 = Math.floor((z0 + CHUNK) / PITCH) + 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (i < GX0 || i >= GX1 || j < GZ0 || j >= GZ1) continue;
      const bx = (i + 0.5) * PITCH, bz = (j + 0.5) * PITCH;
      if (bx < x0 || bx >= x0 + CHUNK || bz < z0 || bz >= z0 + CHUNK) continue;
      this.block(ctx, i, j);
    }

    this.world.extras?.(ctx, cx, cz); // Sonderbauwerke (Brücken, Freeway, Hügelstraßen, Garage …)

    this.finish(ctx);
    return chunk;
  }

  // ------------------------------------------------------------------------------------------
  terrain(ctx, x0, z0) {
    const L = this.layout;
    // Flachheit prüfen (Gitterauflösung wählen)
    let mn = 1e9, mx = -1e9;
    for (let a = 0; a <= 4; a++) for (let c = 0; c <= 4; c++) {
      const h = this.world.terrainHeight(x0 + (a * CHUNK) / 4, z0 + (c * CHUNK) / 4);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    const N = mx - mn < 0.6 ? 8 : mx - mn < 8 ? 20 : 32;
    const cell = CHUNK / N;
    const H = [], NR = [], CL = [];
    for (let a = 0; a <= N; a++) {
      for (let c = 0; c <= N; c++) {
        const x = x0 + a * cell, z = z0 + c * cell;
        const h = this.world.terrainHeight(x, z);
        const e = 1.5;
        const hx = this.world.terrainHeight(x + e, z) - this.world.terrainHeight(x - e, z);
        const hz = this.world.terrainHeight(x, z + e) - this.world.terrainHeight(x, z - e);
        const nl = Math.hypot(hx, 2 * e, hz);
        const n = [-hx / nl, (2 * e) / nl, -hz / nl];
        H.push(h); NR.push(n); CL.push(groundColor(x, z, h, n[1]));
      }
    }
    const idx = (a, c) => a * (N + 1) + c;
    const T = ctx.b.terrain;
    const uvs = 1 / 14;
    for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) {
      const ids = [[a, c], [a, c + 1], [a + 1, c + 1], [a + 1, c]];
      const Pp = ids.map(([aa, cc]) => [x0 + aa * cell, H[idx(aa, cc)], z0 + cc * cell]);
      const Nn = ids.map(([aa, cc]) => NR[idx(aa, cc)]);
      const Cc = ids.map(([aa, cc]) => CL[idx(aa, cc)]);
      const UV = Pp.map((p) => [p[0] * uvs, p[2] * uvs]);
      T.quadSmooth(Pp, Nn, UV, Cc);
    }
  }

  // ------------------------------------------------------------------------------------------
  roadSegment(ctx, road, k) {
    const { b } = ctx;
    const bucket = { street: b.rStreet, avenue: b.rAvenue, highway: b.rHighway, hill: b.rHill, freeway: b.rHighway, ramp: b.rHill }[road.kind];
    const w = road.w;
    const pts = road.pts;
    const n = pts.length;
    const norm = (i) => {
      // gemittelte Seitenrichtung am Punkt i (für Polylinien)
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
      let dx = c[0] - a[0], dz = c[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [-dz, dx];
    };
    const y = road.y;
    const tex = this.mats.roadLen[road.kind] || 18;
    let s0 = 0;
    for (let i = 0; i < k; i++) s0 += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const len = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    // Anfang des Segmentes in Welt-Streckenlänge (Straßen-Start für Raster-Straßen = Kreuzungsrand)
    const n0 = norm(k), n1 = norm(k + 1);
    const miter = (nn, i) => {
      // bei Polylinien Ecken weiten
      if (n === 2) return 1;
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
      void a; void c; return 1;
    };
    const m0 = miter(n0, k), m1 = miter(n1, k + 1);
    const y0 = (y[k] ?? 0) + 0.02, y1 = (y[k + 1] ?? 0) + 0.02;
    const hw = w / 2;
    const a = pts[k], c = pts[k + 1];
    const A = [a[0] + n0[0] * hw * m0, y0, a[1] + n0[1] * hw * m0];
    const B = [a[0] - n0[0] * hw * m0, y0, a[1] - n0[1] * hw * m0];
    const Cc = [c[0] - n1[0] * hw * m1, y1, c[1] - n1[1] * hw * m1];
    const D = [c[0] + n1[0] * hw * m1, y1, c[1] + n1[1] * hw * m1];
    // u: von A (links) nach B (rechts); v entlang der Fahrtrichtung
    const v0 = s0 / tex, v1 = (s0 + len) / tex;
    bucket.quad(A, B, Cc, D, [1, 1, 1], [[0, v0], [1, v0], [1, v1], [0, v1]], true);

    // Mittelstreifen bei Alleen: erhöhtes Beet mit Palmen
    if (road.kind === 'avenue') {
      const mw = 3.0;
      const mA = [a[0] + n0[0] * mw / 2, 0.18, a[1] + n0[1] * mw / 2], mB = [a[0] - n0[0] * mw / 2, 0.18, a[1] - n0[1] * mw / 2];
      const mC = [c[0] - n1[0] * mw / 2, 0.18, c[1] - n1[1] * mw / 2], mD = [c[0] + n1[0] * mw / 2, 0.18, c[1] + n1[1] * mw / 2];
      b.grass.quad(mA, mB, mC, mD, mixCol(C.grass, col(0x55702f), 0.3), [[0, 0], [1, 0], [1, 1], [0, 1]], true);
      // Bordsteinflächen an beiden Längsseiten des Beets
      for (const fl of [false, true]) {
        b.walk.quad([mA[0], 0.02, mA[2]], [mD[0], 0.02, mD[2]], [mD[0], 0.18, mD[2]], [mA[0], 0.18, mA[2]], C.curb, undefined, fl);
        b.walk.quad([mB[0], 0.02, mB[2]], [mC[0], 0.02, mC[2]], [mC[0], 0.18, mC[2]], [mB[0], 0.18, mB[2]], C.curb, undefined, fl);
      }
      // Palmen alle ~15 m
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const nn = Math.max(1, Math.floor(len / 15));
      for (let t = 0; t < nn; t++) {
        const f = (t + 0.5) / nn;
        P.palm(ctx, a[0] + dx * f, a[1] + dz * f, ctx.rnd, ctx.rnd.range(8.5, 12.5));
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  intersection(ctx, c) {
    const { b } = ctx;
    const hx = c.wv / 2, hz = c.wh / 2;
    b.rPlain.floor(c.x - hx, c.z - hz, c.x + hx, c.z + hz, 0.025, [1, 1, 1], 1 / 18);
    const interior = c.i > GX0 && c.i < GX1 && c.j > GZ0 && c.j < GZ1;
    if (!interior) return;
    const M = col(0xe6e6e2);
    // Zebrastreifen auf allen vier Seiten
    const stripes = (x, z, alongX, span) => {
      const count = Math.floor((span - 2) / 1.1);
      for (let s = 0; s < count; s++) {
        const o = -((count - 1) * 1.1) / 2 + s * 1.1;
        if (alongX) b.marks.floor(x - 1.5, z + o - 0.26, x + 1.5, z + o + 0.26, 0.04, M);
        else b.marks.floor(x + o - 0.26, z - 1.5, x + o + 0.26, z + 1.5, 0.04, M);
      }
    };
    stripes(c.x + hx + 2.6, c.z, true, c.wh);
    stripes(c.x - hx - 2.6, c.z, true, c.wh);
    stripes(c.x, c.z + hz + 2.6, false, c.wv);
    stripes(c.x, c.z - hz - 2.6, false, c.wv);
    // Haltelinien
    const line = (x0, z0, x1, z1) => b.marks.floor(x0, z0, x1, z1, 0.04, M);
    line(c.x + hx + 5.4, c.z - hz + 0.4, c.x + hx + 6.0, c.z - 0.3); // Westfahrer (von Osten)
    line(c.x - hx - 6.0, c.z + 0.3, c.x - hx - 5.4, c.z + hz - 0.4); // Ostfahrer
    line(c.x + 0.3, c.z + hz + 5.4, c.x + hx - 0.4, c.z + hz + 6.0); // Nordfahrer (von Süden)
    line(c.x - hx + 0.4, c.z - hz - 6.0, c.x - 0.3, c.z - hz - 5.4); // Südfahrer
    // Ampeln (4 Ecken)
    const o = 2.2;
    P.trafficLight(ctx, c.x + hx + o, c.z - hz - 1.4, 0, 1, 'E', { arm: c.wh / 2 + 1.5 });
    P.trafficLight(ctx, c.x - hx - o, c.z + hz + 1.4, 0, -1, 'E', { arm: c.wh / 2 + 1.5 });
    P.trafficLight(ctx, c.x + hx + 1.4, c.z + hz + o, -1, 0, 'N', { arm: c.wv / 2 + 1.5 });
    P.trafficLight(ctx, c.x - hx - 1.4, c.z - hz - o, 1, 0, 'N', { arm: c.wv / 2 + 1.5 });
  }

  // ------------------------------------------------------------------------------------------
  block(ctx, i, j) {
    const { b } = ctx;
    const L = this.layout;
    const zone = zoneOfBlock(i, j, L.seed);
    const rnd = ctx.rnd;
    const r = blockRect(i, j);
    const xa = i * PITCH + vRoadW(i) / 2, xb = (i + 1) * PITCH - vRoadW(i + 1) / 2;
    const za = j * PITCH + hRoadW(j) / 2, zb = (j + 1) * PITCH - hRoadW(j + 1) / 2;
    const hS = 0.12;
    // Gehweg-Ring
    const S = C.sidewalk;
    const wk = (x0, z0, x1, z1) => b.walk.floor(x0, z0, x1, z1, hS, S, 1 / 4);
    if (zone !== 'canal') {
      wk(xa, za, xb, r.z0); wk(xa, r.z1, xb, zb); wk(xa, r.z0, r.x0, r.z1); wk(r.x1, r.z0, xb, r.z1);
      // Bordstein (senkrechte Flächen) an den vier Außenkanten
      const hc = hS, K = C.curb;
      b.walk.quad([xa, 0, za], [xb, 0, za], [xb, hc, za], [xa, hc, za], K, undefined, true);
      b.walk.quad([xa, 0, zb], [xa, hc, zb], [xb, hc, zb], [xb, 0, zb], K, undefined, true);
      b.walk.quad([xa, 0, za], [xa, hc, za], [xa, hc, zb], [xa, 0, zb], K, undefined, true);
      b.walk.quad([xb, 0, za], [xb, 0, zb], [xb, hc, zb], [xb, hc, za], K, undefined, true);
      ctx.strip && [[xa, za, xb, r.z0], [xa, r.z1, xb, zb], [xa, r.z0, r.x0, r.z1], [r.x1, r.z0, xb, r.z1]].forEach((q) => ctx.strip({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], y: hS }));
    }

    // Straßenlaternen und Palmen an den Gehwegkanten
    this.streetFurniture(ctx, i, j, xa, xb, za, zb, zone);

    // Inhalt je Bezirk
    const h = hash2(i, j, L.seed + 3);
    if (zone === 'core') this.coreBlock(ctx, r, i, j);
    else if (zone === 'mid') this.midBlock(ctx, r, i, j);
    else if (zone === 'resi' || zone === 'hills') {
      if (h < 0.07 && zone === 'resi') P.gasStation(ctx, r.cx - 18, r.cz, 0), b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0x4b4b4e));
      else this.villaBlock(ctx, r, zone === 'hills');
    } else if (zone === 'industrial') this.industrialBlock(ctx, r);
    else if (zone === 'park') P.parkBlock(ctx, r, rnd);
    else if (zone === 'canal') this.quayBlock(ctx, r, i, j);
  }

  streetFurniture(ctx, i, j, xa, xb, za, zb, zone) {
    const rnd = ctx.rnd;
    const avenue = (a) => a;
    // Laternen: alle ~38 m, nicht in der Nähe der Ecken
    const lampLine = (x0, z0, x1, z1, dx, dz) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.floor((len - 24) / 38));
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0.5 : 0.1 + 0.8 * (k / (n - 1));
        P.streetLamp(ctx, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, dx, dz, { arm: 2.2 });
      }
    };
    const inset = 0.9;
    lampLine(xa + 14, za + inset, xb - 14, za + inset, 0, -1); // Nordseite: Arm nach Norden (Straße)
    lampLine(xa + 14, zb - inset, xb - 14, zb - inset, 0, 1);
    lampLine(xa + inset, za + 14, xa + inset, zb - 14, -1, 0);
    lampLine(xb - inset, za + 14, xb - inset, zb - 14, 1, 0);
    // Straßenbäume (Palmen) – im Zentrum weniger, in Wohngebieten mehr
    const dens = zone === 'core' ? 0.4 : zone === 'industrial' ? 0.15 : 1;
    const palmLine = (x0, z0, x1, z1, off, nx, nz) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const step = 19;
      const n = Math.floor((len - 30) / step);
      for (let k = 0; k <= n; k++) {
        if (rnd() > dens) continue;
        const t = (15 + k * step + (rnd() - 0.5) * 3) / len;
        P.palm(ctx, x0 + (x1 - x0) * t + nx * off, z0 + (z1 - z0) * t + nz * off, rnd, rnd.range(8.5, 13));
      }
    };
    palmLine(xa, za + 2.8, xb, za + 2.8, 0, 0, 0);
    palmLine(xa, zb - 2.8, xb, zb - 2.8, 0, 0, 0);
    palmLine(xa + 2.8, za, xa + 2.8, zb, 0, 0, 0);
    palmLine(xb - 2.8, za, xb - 2.8, zb, 0, 0, 0);
    void avenue;
  }

  coreBlock(ctx, r, i, j) {
    const rnd = ctx.rnd;
    ctx.b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0x6d6a65));
    const dC = Math.hypot((r.cx - CENTER[0]) / PITCH, (r.cz - CENTER[1]) / PITCH);
    const cells = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of cells) {
      if (rnd() < 0.1) continue;
      const cx = r.cx + sx * r.w * 0.25, cz = r.cz + sz * r.d * 0.25;
      const base = lerp(240, 95, clamp(dC / 3.1, 0, 1));
      const h = base * rnd.range(0.55, 1.0);
      const w = rnd.range(26, 34), d = rnd.range(26, 34);
      P.tower(ctx, { x: cx, z: cz, w, d, h, rnd, rot: 0 });
    }
    for (let k = 0; k < 6; k++) P.palm(ctx, r.x0 + 6 + rnd() * (r.w - 12), r.z0 + 6 + rnd() * (r.d - 12), rnd, rnd.range(7, 10));
  }

  midBlock(ctx, r, i, j) {
    const rnd = ctx.rnd;
    ctx.b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0x706d68));
    const style = rnd() < 0.5 ? 'office' : 'apartment';
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (rnd() < 0.12) continue;
      const cx = r.cx + sx * r.w * 0.25, cz = r.cz + sz * r.d * 0.25;
      P.midrise(ctx, { x: cx, z: cz, w: rnd.range(28, 38), d: rnd.range(28, 38), h: rnd.range(20, 56), style: rnd() < 0.7 ? style : undefined, rnd, rot: 0 });
    }
    for (let k = 0; k < 4; k++) P.palm(ctx, r.x0 + 5 + rnd() * (r.w - 10), r.z0 + 5 + rnd() * (r.d - 10), rnd, rnd.range(7, 10));
  }

  villaBlock(ctx, r, rich) {
    const rnd = ctx.rnd;
    const n = rich ? 2 : 3;
    const cw = r.w / n, cd = r.d / n;
    ctx.b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, mixCol(C.grass, col(0x7e9a4a), 0.4));
    for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
      const cx = r.x0 + (a + 0.5) * cw, cz = r.z0 + (c + 0.5) * cd;
      // Auffahrt/Einfahrt aus Beton
      ctx.b.solid.floor(cx - 2.5, cz - cd / 2, cx + 2.5, cz - cd / 2 + 11, 0.06, col(0xb0aca4));
      if (rnd() < 0.1) continue;
      const w = rich ? rnd.range(18, 26) : rnd.range(13, 19), d = rich ? rnd.range(14, 20) : rnd.range(11, 15);
      P.villa(ctx, { x: cx + (rnd() - 0.5) * 3, z: cz + 2, w, d, rot: 0, rnd });
      const np = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < np; k++) P.palm(ctx, cx + (rnd() - 0.5) * (cw - 6), cz + (rnd() - 0.5) * (cd - 6), rnd, rnd.range(7, 12));
      // Hecken / Zaun entlang der Straßenseite
      ctx.b.solid.box(cx, 0, cz - cd / 2 + 0.6, cw - 1, 1.1, 0.8, 0, col(0x3d5c2a), { top: true });
    }
  }

  industrialBlock(ctx, r) {
    const rnd = ctx.rnd;
    ctx.b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0x5c5b58));
    const kind = rnd();
    if (kind < 0.55) {
      P.warehouse(ctx, { x: r.cx - r.w * 0.2, z: r.cz - r.d * 0.2, w: r.w * 0.5, d: r.d * 0.4, h: rnd.range(9, 14), rnd });
      P.warehouse(ctx, { x: r.cx + r.w * 0.18, z: r.cz + r.d * 0.22, w: r.w * 0.55, d: r.d * 0.38, h: rnd.range(9, 14), rnd });
      P.containerStack(ctx, r.x0 + 6, r.z1 - 10, 0, rnd, 2, 1, 2);
    } else if (kind < 0.8) {
      for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) P.containerStack(ctx, r.x0 + 8 + a * 28, r.z0 + 10 + c * 44, 0, rnd, 2, 4, 3);
    } else {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) P.tank(ctx, r.x0 + 24 + a * 42, r.z0 + 24 + c * 42, 9, rnd.range(10, 16));
      P.warehouse(ctx, { x: r.cx, z: r.z1 - 14, w: r.w * 0.6, d: 20, h: 9, rnd });
    }
  }

  quayBlock(ctx, r) {
    // Uferpromenade am Kanal: Betonstreifen links und rechts des Wassers + Geländer
    const z0 = 625, z1 = 695;
    ctx.b.walk.floor(r.x0, r.z0, r.x1, z0 - 4, 0.12, col(0xaaa59c), 1 / 4);
    ctx.b.walk.floor(r.x0, z1 + 4, r.x1, r.z1, 0.12, col(0xaaa59c), 1 / 4);
    for (let k = 0; k < 8; k++) P.palm(ctx, r.x0 + 6 + ctx.rnd() * (r.w - 12), r.z0 + 3, ctx.rnd, ctx.rnd.range(8, 11));
  }

  // ------------------------------------------------------------------------------------------
  finish(ctx) {
    const { b, chunk } = ctx;
    const M = this.mats;
    const add = (bucket, mat, o = {}) => {
      if (bucket.empty) return;
      const m = new THREE.Mesh(bucket.geometry(), mat);
      m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false;
      m.matrixAutoUpdate = false;
      if (o.order) m.renderOrder = o.order;
      chunk.group.add(m); chunk.meshes.push(m);
    };
    add(b.terrain, M.terrain);
    add(b.rStreet, M.rStreet); add(b.rAvenue, M.rAvenue); add(b.rHighway, M.rHighway); add(b.rHill, M.rHill); add(b.rPlain, M.rPlain);
    add(b.walk, M.walk); add(b.grass, M.grass);
    add(b.marks, M.marks, { receive: false, order: 1 });
    add(b.solid, M.solid, { cast: true });
    add(b.palm, M.palm, { cast: false });
    add(b.lamp, M.lamp, { receive: false });
    add(b.glass, M.glass, { cast: true }); add(b.office, M.office, { cast: true }); add(b.apartment, M.apartment, { cast: true });
    add(b.villa, M.villa, { cast: true }); add(b.industrial, M.industrial, { cast: true });
    add(b.win, M.win, { receive: false }); add(b.pool, M.pool, { receive: false });
    for (const k of ['tlNr', 'tlNy', 'tlNg', 'tlEr', 'tlEy', 'tlEg']) add(b[k], M[k], { receive: false });
    chunk.dispose = () => { for (const m of chunk.meshes) m.geometry.dispose(); };
  }
}
