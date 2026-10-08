// Wahrzeichen und Sonderbauten: Parkhaus mit Rampen und Dachdeck, Autotreff-Platz, Aussichtspunkte, Strandpromenade und Pier.

import * as THREE from 'three';
import { col, mixCol, mulCol } from './geo.js';
import * as P from './props.js';
import { prism } from './roadwork.js';
import { rng, hash2, lerp, clamp } from '../util.js';
import { coastX, highwayX, CHUNK, blockRect, PITCH } from './layout.js';

const C = { concrete: col(0xa4a199), concreteDark: col(0x6d6b66), asphalt: col(0x3b3c3f), white: col(0xe9e6df), wood: col(0x8a6a48), woodDark: col(0x5e4630), stone: col(0xb8ae9c) };
const CAR_COLORS = [0x111114, 0x1a1c20, 0xd8d8d6, 0x8c1a22, 0x1f3a6a, 0x9fa3a8, 0xe0b23a, 0x2b6b4c];

/** Geparktes Fahrzeug (einfache Quader) mit Kollisionsbox. */
export function parkedCar(ctx, x, y, z, rot, color, big = false) {
  const L = big ? 5.0 : 4.5, W = big ? 2.0 : 1.85, H = big ? 0.95 : 0.65;
  ctx.b.solid.box(x, y + 0.25, z, L, H, W, rot, col(color), { top: true });
  ctx.b.solid.box(x - Math.cos(rot) * 0.2, y + 0.25 + H, z + Math.sin(rot) * 0.2, L * 0.55, 0.5, W * 0.88, rot, mulCol(col(color), 0.5), { top: true });
  ctx.b.solid.box(x, y + 0.02, z, L * 0.96, 0.3, W * 0.96, rot, col(0x0a0a0c), { top: false });
  ctx.box(x, z, L / 2, W / 2, rot, y, y + 1.5);
}

// ------------------------------------------------------------------------------------------
// Parkhaus (3 Ebenen + Dach, Rampen außen entlang der Längsseiten)

export function garageBlock(ctx, r) {
  const { b, rnd } = ctx;
  const cx = r.cx, cz = r.cz;
  const FX = 42, FZ = 28, LH = 3.4, T = 0.5;
  const levels = [0, LH, 2 * LH, 3 * LH]; // Dach = 10,2 m
  b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0x56565a));
  // Decks (Platten): Deckfläche dunkel, Unterseite Beton
  for (let k = 1; k < levels.length; k++) {
    const y = levels[k];
    b.solid.box(cx, y - T, cz, FX * 2, T, FZ * 2, 0, C.concrete, { top: false, bottom: true });
    b.solid.floor(cx - FX, cz - FZ, cx + FX, cz + FZ, y + 0.02, C.asphalt);
    ctx.strip({ cx, cz, hx: FX, hz: FZ, yaw: 0, y0: y, y1: y });
    // Fahrbahnmarkierung: Parkbuchten entlang Nord/Süd
    for (let q = -FX + 6; q <= FX - 6; q += 3.0) for (const sz of [-1, 1]) b.marks.floor(cx + q - 0.06, cz + sz * (FZ - 5.6), cx + q + 0.06, cz + sz * (FZ - 0.4), y + 0.04, col(0xe0e0dc));
    // Deckenleuchten
    if (k < 3) for (let q = -FX + 8; q <= FX - 8; q += 14) for (const sz of [-12, 0, 12]) b.tunLamp.box(cx + q, y - T - 0.06, cz + sz, 3.2, 0.1, 0.5, 0, [1, 0.96, 0.82], { top: false });
  }
  // Rampen
  const ramp = (xa, xb, y0, y1, side) => {
    const zc = cz + side * (FZ + 4.2), hz = 3.75;
    const mx = (xa + xb) / 2, hx = Math.abs(xb - xa) / 2;
    const dir = xb > xa ? 1 : -1;
    // Boden-Fläche als Prisma entlang x
    prism(b.solid, [xa, zc], [xb, zc], y0, y1, 0, 1, -hz, hz, -0.5, 0, C.concrete, { top: C.asphalt });
    ctx.strip({ cx: mx, cz: zc, hx, hz, yaw: dir > 0 ? 0 : Math.PI, y0, y1 });
    // Brüstung außen
    const so = side;
    prism(b.solid, [xa, zc], [xb, zc], y0, y1, 0, 1, so > 0 ? hz - 0.3 : -hz, so > 0 ? hz : -hz + 0.3, 0, 1.0, C.concrete, { bottom: false });
    ctx.box(mx, zc + so * (hz - 0.15), hx, 0.2, 0, Math.min(y0, y1) - 0.3, Math.max(y0, y1) + 1.2);
    // Stützen
    for (let q = 0; q <= 2; q++) { const f = q / 2; const px = lerp(xa, xb, f), py = lerp(y0, y1, f); if (py > 1.3) { b.solid.box(px, 0, zc + so * (hz - 0.5), 0.7, py - 0.5, 0.7, 0, C.concreteDark, { top: true }); ctx.circle(px, zc + so * (hz - 0.5), 0.5, 0, py); } }
  };
  const landing = (xa, xb, y, side) => {
    const zc = cz + side * (FZ + 4.2), hz = 3.75;
    b.solid.box((xa + xb) / 2, y - T, zc, Math.abs(xb - xa), T, hz * 2, 0, C.concrete, { top: false });
    b.solid.floor(Math.min(xa, xb), zc - hz, Math.max(xa, xb), zc + hz, y + 0.02, C.asphalt);
    ctx.strip({ cx: (xa + xb) / 2, cz: zc, hx: Math.abs(xb - xa) / 2, hz, yaw: 0, y0: y, y1: y });
    prism(b.solid, [Math.min(xa, xb), zc], [Math.max(xa, xb), zc], y, y, 0, 1, side > 0 ? hz - 0.3 : -hz, side > 0 ? hz : -hz + 0.3, 0, 1.0, C.concrete, { bottom: false });
    ctx.box((xa + xb) / 2, zc + side * (hz - 0.15), Math.abs(xb - xa) / 2, 0.2, 0, y - 0.3, y + 1.2);
    // seitliche Abschlüsse
  };
  // R1 Nordseite: Ebene 0 -> 1 (fährt nach Osten), Landung vor der Platte
  ramp(cx - 40, cx - 12, 0, LH, -1); landing(cx - 12, cx, LH, -1);
  // R2 Südseite: Ebene 1 -> 2 (fährt nach Westen), unten bei +14
  landing(cx + 14, cx + 4, LH, 1); ramp(cx + 4, cx - 24, LH, 2 * LH, 1); landing(cx - 24, cx - 34, 2 * LH, 1);
  // R3 Nordseite: Ebene 2 -> 3 (nach Osten)
  landing(cx - 10, cx, 2 * LH, -1); ramp(cx, cx + 28, 2 * LH, 3 * LH, -1); landing(cx + 28, cx + 40, 3 * LH, -1);
  // Brüstungen rund um die Platten (mit Lücken für Rampen-Anschlüsse)
  const gaps = {
    1: { n: [[cx - 12, cx]], s: [[cx + 4, cx + 14]] },
    2: { n: [[cx - 10, cx]], s: [[cx - 34, cx - 24]] },
    3: { n: [[cx + 28, cx + 40]], s: [] },
  };
  const parapet = (xa, za, xb, zb, y, from, to, axis) => {
    // Teilstück zwischen from..to entlang der Achse
    if (axis === 'x') { prism(b.solid, [from, za], [to, za], y, y, 0, 1, -0.2, 0.2, 0, 1.0, C.concrete, { bottom: false }); ctx.box((from + to) / 2, za, Math.abs(to - from) / 2, 0.22, 0, y - 0.3, y + 1.2); }
    else { prism(b.solid, [xa, from], [xa, to], y, y, 1, 0, -0.2, 0.2, 0, 1.0, C.concrete, { bottom: false }); ctx.box(xa, (from + to) / 2, 0.22, Math.abs(to - from) / 2, 0, y - 0.3, y + 1.2); }
  };
  const segs = (a, b2, holes) => {
    const out = []; let cur = a;
    for (const [h0, h1] of holes.sort((p, q) => p[0] - q[0])) { if (h0 > cur) out.push([cur, h0]); cur = Math.max(cur, h1); }
    if (cur < b2) out.push([cur, b2]); return out;
  };
  for (let k = 1; k <= 3; k++) {
    const y = levels[k];
    for (const [f, t] of segs(cx - FX, cx + FX, gaps[k].n)) parapet(0, cz - FZ, 0, 0, y, f, t, 'x');
    for (const [f, t] of segs(cx - FX, cx + FX, gaps[k].s)) parapet(0, cz + FZ, 0, 0, y, f, t, 'x');
    parapet(cx - FX, 0, 0, 0, y, cz - FZ, cz + FZ, 'z'); parapet(cx + FX, 0, 0, 0, y, cz - FZ, cz + FZ, 'z');
  }
  // Stützen (Raster) und Kollision
  for (let q = -FX + 7; q <= FX - 7; q += 14) for (const sz of [-FZ + 7, 0, FZ - 7]) {
    b.solid.box(cx + q, 0, cz + sz, 0.9, 3 * LH, 0.9, 0, C.concreteDark, { top: true });
    ctx.circle(cx + q, cz + sz, 0.62, 0, 3 * LH + 0.5);
  }
  // Geparkte Autos auf den Ebenen (Reihen entlang der Nord-/Südwand)
  for (let k = 0; k <= 3; k++) {
    const y = levels[k] + (k === 0 ? 0.03 : 0.02);
    for (let q = -FX + 8; q <= FX - 8; q += 6) {
      for (const sz of [-1, 1]) {
        if (rnd() < 0.5) continue;
        const px = cx + q + (rnd() - 0.5) * 0.4, pz = cz + sz * (FZ - 3.4);
        // Rampen-Zufahrtsbereich freihalten
        if (k > 0 && Math.abs(px - cx) > 0 && (k === 1 && sz < 0 && px > cx - 12 && px < cx) ) continue;
        parkedCar(ctx, px, y, pz, Math.PI / 2, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)], rnd() < 0.2);
      }
    }
  }
  // Beschilderung: leuchtendes "P" über der Einfahrt
  b.lamp.box(cx - 36, 6.0, cz - FZ - 9.6, 3.4, 3.4, 0.4, 0, [0.2, 0.55, 1.0], { top: true });
  ctx.lamps.push([cx - 36, 6.0, cz - FZ - 9.6]);
  // Dachdeck: Laternen und Aussichtsmarkierung
  for (const q of [-30, -10, 10, 30]) {
    b.solid.cyl(cx + q, levels[3], cz + FZ - 1.2, 0.1, 0.07, 6, 6, col(0x2a2c30), { cap: true });
    b.lamp.box(cx + q, levels[3] + 6.0, cz + FZ - 1.2, 0.9, 0.12, 0.4, 0, [1, 0.85, 0.6], { top: false });
    ctx.lamps.push([cx + q, levels[3] + 5.8, cz + FZ - 1.2]);
  }
}

// ------------------------------------------------------------------------------------------
// Autotreff "Sunset Plaza": Platz mit Brunnen, Showroom, parkenden Sportwagen

export function plazaBlock(ctx, r) {
  const { b, rnd } = ctx;
  const cx = r.cx, cz = r.cz;
  b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.05, col(0xc9c3b6));
  // Fliesenmuster
  for (let q = r.x0; q < r.x1; q += 12) b.marks.floor(q - 0.05, r.z0, q + 0.05, r.z1, 0.07, col(0x8d887c));
  for (let q = r.z0; q < r.z1; q += 12) b.marks.floor(r.x0, q - 0.05, r.x1, q + 0.05, 0.07, col(0x8d887c));
  // Brunnen
  b.solid.cyl(cx, 0.06, cz, 9.0, 9.0, 0.7, 24, C.stone, { cap: true });
  b.pool.floor(cx - 7.6, cz - 7.6, cx + 7.6, cz + 7.6, 0.72, [1, 1, 1], 0.1);
  b.solid.cyl(cx, 0.06, cz, 1.2, 0.6, 3.2, 12, C.stone, { cap: true });
  b.lamp.box(cx, 3.2, cz, 1.6, 0.25, 1.6, 0, [0.5, 0.9, 1.0], { top: true });
  ctx.circle(cx, cz, 9.0, 0, 1);
  // Showroom (Glas) im Norden
  const sw = 64, sd = 18, sx = cx, sz = r.z0 + sd / 2 + 2;
  b.win.box(sx, 0.05, sz, sw, 6.5, sd, 0, [1, 1, 1], { top: false });
  b.solid.box(sx, 6.5, sz, sw + 3, 0.6, sd + 3, 0, col(0x24262a));
  ctx.box(sx, sz, sw / 2, sd / 2, 0, 0, 7);
  // Leuchtschrift (Neon-Pylon)
  b.lamp.box(sx, 9.2, sz + sd / 2 + 1, 28, 2.6, 0.4, 0, [1.0, 0.25, 0.55], { top: true });
  b.lamp.box(sx, 7.6, sz + sd / 2 + 1, 18, 0.5, 0.4, 0, [0.25, 0.85, 1.0], { top: true });
  // geparkte Sportwagen in Reihen (Schaufahren / Treffpunkt)
  const cols = [0x111114, 0xd8d8d6, 0x8c1a22, 0x1f3a6a, 0xe0b23a, 0x0c0c0e, 0x2b6b4c, 0xa8a8ac, 0x111114, 0x6a1c5a];
  for (let q = 0; q < 10; q++) {
    const side = q < 5 ? -1 : 1, idx = q % 5;
    const px = cx + side * 36, pz = r.z0 + 30 + idx * 11;
    parkedCar(ctx, px, 0.06, pz, Math.PI / 2 * (side < 0 ? 1 : -1) + (rnd() - 0.5) * 0.2, cols[q], true);
  }
  for (let q = 0; q < 6; q++) parkedCar(ctx, cx - 30 + q * 12, 0.06, r.z1 - 8, 0.0 + (rnd() - 0.5) * 0.15, cols[(q + 3) % cols.length], rnd() < 0.5);
  for (let k = 0; k < 14; k++) { const a = rnd() * Math.PI * 2, d = 12 + rnd() * 16; P.palm(ctx, cx + Math.cos(a) * d, cz + Math.sin(a) * d, rnd, rnd.range(7, 10)); }
  // Laternen am Platz
  for (const [lx, lz] of [[-20, -8], [20, -8], [-20, 18], [20, 18]]) P.streetLamp(ctx, cx + lx, cz + lz, 0, 0.0001, { h: 7, arm: 0.5 });
}

// ------------------------------------------------------------------------------------------
// Aussichtsplätze am Ende der Bergstraßen

function overlook(ctx, x, z, y, dirx, dirz, size = 36) {
  const { b } = ctx;
  const ux = dirx, uz = dirz, nx = -uz, nz = ux;
  const hs = size / 2;
  // Plattform folgt der Straßenrichtung: Boden als Prisma
  prism(b.solid, [x, z], [x + ux * size, z + uz * size], y, y, nx, nz, -hs, hs, -0.6, 0, C.concrete, { top: col(0x8d8b86) });
  ctx.strip({ cx: x + (ux * size) / 2, cz: z + (uz * size) / 2, hx: hs, hz: hs, yaw: Math.atan2(-uz, ux), y0: y, y1: y });
  // Mauer (Aussichtsseite) mit Kollision
  prism(b.solid, [x + ux * (size + 0.4), z + uz * (size + 0.4)], [x + ux * (size + 1.2), z + uz * (size + 1.2)], y, y, nx, nz, -hs, hs, 0, 1.1, C.stone, {});
  ctx.box(x + ux * (size + 0.8), z + uz * (size + 0.8), 0.5, hs, Math.atan2(-uz, ux), y - 1, y + 1.4);
  for (const s of [-1, 1]) { prism(b.solid, [x + ux * 2, z + uz * 2], [x + ux * (size + 0.4), z + uz * (size + 0.4)], y, y, nx, nz, s * hs - 0.4, s * hs + 0.4, 0, 1.1, C.stone, {}); ctx.box(x + ux * (size / 2 + 1), z + uz * (size / 2 + 1), size / 2 - 1, 0.45, Math.atan2(-uz, ux), y - 1, y + 1.4); void s; }
}

// ------------------------------------------------------------------------------------------
// Strand: Promenade, Palmen, Rettungstürme, Sonnenschirme und Pier

function beachChunk(ctx, cx, cz) {
  const { b, rnd } = ctx;
  const z0 = cz * CHUNK, z1 = z0 + CHUNK;
  const own = (z) => { const hx = highwayX(z); return hx >= cx * CHUNK && hx < (cx + 1) * CHUNK; };
  for (let z = Math.ceil(z0 / 16) * 16; z < z1; z += 16) {
    const hx = highwayX(z);
    if (z < -1480 || z > 1480 || !own(z)) continue;
    // Palmen an der Promenade und am Gehweg zur Straße
    const key = hash2(z, 3, 77);
    P.palm(ctx, hx + 22 + (key - 0.5) * 3, z + (key - 0.5) * 5, rnd, rnd.range(9, 13));
    if (key < 0.5) P.palm(ctx, hx - 20, z + 3, rnd, rnd.range(8, 12));
    // Promenade (Gehweg) neben der Straße
    b.walk.floor(hx + 14, z - 8, hx + 28, z + 8, 0.12, col(0xcdc8bd), 1 / 4);
    if (Math.abs(z % 96) < 1) { P.streetLamp(ctx, hx + 15, z, 1, 0, { h: 7.5, arm: 1.8 }); }
    // Sonnenschirme
    if (hash2(z, 5, 78) < 0.45) {
      const ux = coastX(z) + 28 + hash2(z, 9, 79) * 20;
      const colr = [col(0xe84a3a), col(0xf2c230), col(0x2f9bd1), col(0xf2f2ee)][Math.floor(hash2(z, 1, 80) * 4)];
      b.solid.cyl(ux, 0.0, z, 0.04, 0.04, 2.3, 5, C.concrete);
      b.solid.cyl(ux, 2.0, z, 1.7, 0.1, 0.45, 8, colr, { cap: true });
    }
  }
  // Rettungsschwimmer-Türme
  for (let z = Math.ceil(z0 / 220) * 220; z < z1; z += 220) {
    if (Math.abs(z) > 1300 || !own(z)) continue;
    const x = coastX(z) + 32;
    b.solid.box(x, 1.6, z, 2.6, 0.2, 2.6, 0, C.white);
    b.solid.box(x, 1.8, z, 2.0, 2.0, 2.0, 0, col(0xe84a3a), { top: true });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.solid.cyl(x + dx, 0, z + dz, 0.1, 0.1, 1.7, 5, C.woodDark);
    ctx.circle(x, z, 1.8, 0, 3.8);
  }
  // Pier bei z = -300
  const pz = -300;
  if (pz >= z0 && pz < z1 && own(pz)) {
    const x0 = coastX(pz) + 40, x1 = x0 - 220;
    const y = 1.2, hw = 4.5;
    prism(b.solid, [x0, pz], [x1, pz], y, y, 0, 1, -hw, hw, -0.35, 0, C.wood, { top: mixCol(C.wood, C.woodDark, 0.2) });
    ctx.strip({ cx: (x0 + x1) / 2, cz: pz, hx: Math.abs(x0 - x1) / 2, hz: hw, yaw: Math.PI, y0: y, y1: y });
    for (const s of [-1, 1]) {
      prism(b.solid, [x0, pz], [x1, pz], y, y, 0, 1, s * hw - 0.1, s * hw + 0.1, 0, 1.0, C.woodDark, { bottom: false });
      ctx.box((x0 + x1) / 2, pz + s * hw, Math.abs(x0 - x1) / 2, 0.15, 0, y - 0.3, y + 1.2);
    }
    for (let x = x0; x > x1; x -= 18) {
      b.solid.cyl(x, -4, pz - hw + 0.3, 0.3, 0.3, 5.2, 6, C.woodDark); b.solid.cyl(x, -4, pz + hw - 0.3, 0.3, 0.3, 5.2, 6, C.woodDark);
      P.streetLamp(ctx, x, pz + hw - 0.5, 0, -1, { h: 5.5, arm: 1.2 });
    }
    // Endplattform mit kleinem Pavillon
    b.solid.box(x1 - 6, y - 0.35, pz, 20, 0.35, 20, 0, C.wood, { top: true });
    ctx.strip({ cx: x1 - 6, cz: pz, hx: 10, hz: 10, yaw: 0, y0: y, y1: y });
    b.office.box(x1 - 10, y, pz, 9, 3.6, 7, 0, col(0xe6e2d8), { uv: 'facade', ws: 24, hs: 28.8, topColor: col(0x2b2d30) });
    ctx.box(x1 - 10, pz, 4.5, 3.5, 0, y, y + 4);
    b.lamp.box(x1 - 10, y + 4.4, pz, 7, 0.9, 0.2, 0, [0.2, 0.8, 1.0], { top: true });
    // Kante der Plattform
    for (const [dx, dz, hx, hz] of [[-16, 0, 0.2, 10], [-6, -10, 10, 0.2], [-6, 10, 10, 0.2]]) ctx.box(x1 + dx, pz + dz, hx, hz, 0, y - 0.3, y + 1.2);
  }
}

// ------------------------------------------------------------------------------------------

/** Hook: wird von ChunkBuilder.build() nach den Standardinhalten aufgerufen. */
export function buildStructures(ctx, cx, cz) {
  const L = ctx.layout;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const inChunk = (x, z) => x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK;
  // Strandstreifen
  if (x0 > -1500 && x0 < -1000) beachChunk(ctx, cx, cz);
  // Aussichtsplätze
  const vp = L.viewpoint, sm = L.summit;
  if (vp && inChunk(vp.x, vp.z)) {
    const road = L.roads.find((r) => r.name === 'Cliff Road'); const n = road.pts.length;
    const a = road.pts[n - 2], c = road.pts[n - 1]; const d = Math.hypot(c[0] - a[0], c[1] - a[1]);
    overlook(ctx, c[0], c[1], vp.y, (c[0] - a[0]) / d, (c[1] - a[1]) / d, 34);
    ctx.lamps.push([c[0], vp.y + 6, c[1]]);
  }
  if (sm && inChunk(sm.x, sm.z)) {
    const road = L.roads.find((r) => r.name === 'Hillcrest Drive'); const n = road.pts.length;
    const a = road.pts[n - 2], c = road.pts[n - 1]; const d = Math.hypot(c[0] - a[0], c[1] - a[1]);
    overlook(ctx, c[0], c[1], sm.y, (c[0] - a[0]) / d, (c[1] - a[1]) / d, 40);
  }
}
