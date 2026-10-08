// Straßenausstattung und Gebäude-Bausteine. Alle Funktionen schreiben in die Buckets des Chunk-Kontexts.
//
// ctx: { b: {solid, palm, lamp, glass, office, apartment, villa, industrial, pool, win, red, tlN: {r,y,g}, tlE: {r,y,g} ...},
//        circle(x,z,r,y0,y1), box(x,z,hx,hz,rot,y0,y1), lamps: [] }

import { col, mixCol, mulCol } from './geo.js';

export const STYLE = {
  glass: { ws: 19.2, hs: 30.4, cols: 6, rows: 8, floor: 3.8 },
  office: { ws: 24, hs: 28.8, cols: 8, rows: 8, floor: 3.6 },
  apartment: { ws: 19.2, hs: 18, cols: 6, rows: 6, floor: 3.0 },
  villa: { ws: 9.6, hs: 12, cols: 4, rows: 4, floor: 3.0 },
  industrial: { ws: 20, hs: 12, cols: 5, rows: 3, floor: 4 },
};

const C = {
  trunk: col(0x6b5a45), trunkDark: col(0x4a3e30), pole: col(0x2a2c30), poleLight: col(0x6a6d72), concrete: col(0x8d8b86),
  roofDark: col(0x2c2e31), white: col(0xe9e6df), glass: col(0x1c2a33), red: col(0xaa2020), grass: col(0x6a8a3a),
  metal: col(0x9aa0a5), dark: col(0x18191b), sand: col(0xc9b48a),
};

// ------------------------------------------------------------------------------------------
// Palme: gebogener Stamm mit Ringen + Wedelkrone

export function palm(ctx, x, z, rnd, h = rnd.range(7.5, 12.5)) {
  const lean = rnd.range(0.2, 1.4), ang = rnd() * Math.PI * 2;
  const bx = Math.cos(ang) * lean, bz = Math.sin(ang) * lean;
  ctx.b.solid.cyl(x, 0, z, 0.3, 0.17, h, 6, mixCol(C.trunk, C.trunkDark, rnd() * 0.5), { rows: 4, bendX: bx, bendZ: bz, ring: true, ringColor: C.trunkDark });
  const tx = x + bx, tz = z + bz, ty = h;
  const n = 7 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
    const len = rnd.range(3.6, 5.0), wid = rnd.range(1.5, 2.0), rise = rnd.range(0.2, 1.0), droop = rnd.range(1.4, 2.6);
    const dx = Math.cos(a), dz = Math.sin(a);
    const rows = 3;
    const pts = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      pts.push([tx + dx * len * t, ty + rise * Math.sin(t * 2.2) - droop * t * t, tz + dz * len * t, wid * 0.5 * Math.sin(Math.PI * (0.12 + 0.88 * t)) + 0.05]);
    }
    const g = mixCol(col(0x3f6b24), col(0x6f9638), rnd());
    for (let r = 0; r < rows; r++) {
      const p0 = pts[r], p1 = pts[r + 1];
      const nx = -dz, nz = dx; // seitlich
      const q = (p, s) => [p[0] + nx * p[3] * s, p[1], p[2] + nz * p[3] * s];
      const v0 = r / rows, v1 = (r + 1) / rows;
      ctx.b.palm.quad(q(p0, -1), q(p0, 1), q(p1, 1), q(p1, -1), g, [[0, v0], [1, v0], [1, v1], [0, v1]]); // Material ist doppelseitig
    }
  }
  ctx.circle(x + bx * 0.1, z + bz * 0.1, 0.32, 0, 4);
}

// ------------------------------------------------------------------------------------------
// Straßenlaterne: Mast + Ausleger + leuchtender Kopf (nach (dx,dz) zur Fahrbahn)

export function streetLamp(ctx, x, z, dx, dz, { h = 8.5, arm = 2.4 } = {}) {
  ctx.b.solid.cyl(x, 0, z, 0.11, 0.07, h, 6, C.pole, { cap: true });
  const ex = x + dx * arm, ez = z + dz * arm;
  ctx.b.solid.box((x + ex) / 2, h - 0.12, (z + ez) / 2, arm, 0.1, 0.1, Math.atan2(-dz, dx), C.pole);
  ctx.b.lamp.box(ex, h - 0.3, ez, 0.9, 0.12, 0.4, Math.atan2(-dz, dx), [1, 0.85, 0.6], { top: false });
  ctx.b.solid.box(ex, h - 0.18, ez, 1.0, 0.07, 0.5, Math.atan2(-dz, dx), C.pole);
  ctx.lamps.push([ex, h - 0.4, ez]);
  ctx.circle(x, z, 0.16, 0, h);
}

// ------------------------------------------------------------------------------------------
// Ampel (axis 'N' = Fahrzeuge in Nord-Süd-Richtung sehen sie, 'E' = Ost-West). (dx,dz) = Auslegerrichtung zur Straße.

export function trafficLight(ctx, x, z, dx, dz, axis, { arm = 7.5 } = {}) {
  ctx.b.solid.cyl(x, 0, z, 0.13, 0.1, 6.0, 6, C.pole, { cap: true });
  const rot = Math.atan2(-dz, dx);
  ctx.b.solid.box(x + (dx * arm) / 2, 5.7, z + (dz * arm) / 2, arm, 0.14, 0.14, rot, C.pole);
  // Lampen blicken entlang der Achse (N: ±z, E: ±x); Köpfe hängen am Ausleger
  const sx = axis === 'N' ? 0 : 1, sz = axis === 'N' ? 1 : 0;
  const dim = axis === 'N' ? [0.2, 0.2, 0.06] : [0.06, 0.2, 0.2];
  for (const t of [0.6, arm * 0.8]) {
    const hx = x + dx * t, hz = z + dz * t;
    ctx.b.solid.box(hx, 4.5, hz, 0.42, 1.2, 0.42, 0, C.dark);
    for (const [c, y] of [['r', 5.4], ['y', 5.1], ['g', 4.8]]) {
      for (const s of [-1, 1]) ctx.b['tl' + axis + c].box(hx + sx * 0.22 * s, y - 0.1, hz + sz * 0.22 * s, dim[0], dim[1], dim[2], 0, [1, 1, 1], { top: true });
    }
  }
  ctx.circle(x, z, 0.2, 0, 6);
}

// ------------------------------------------------------------------------------------------
// Gebäude

function snap(v, q) { return Math.max(q, Math.round(v / q) * q); }

/** Hochhaus mit Sockel, Rücksprüngen, Dachaufbauten und rotem Flugwarnlicht. */
export function tower(ctx, o) {
  const { x, z, rnd } = o;
  const st = STYLE.glass;
  const w = snap(o.w, 3.2), d = snap(o.d, 3.2), h = snap(o.h, st.floor);
  const rot = o.rot || 0;
  const tint = o.tint || mixCol(col(0x9fb8c8), col(0xd8c9a8), rnd());
  const tintD = mixCol(tint, col(0x6f8794), 0.4);
  const ws = st.ws, hs = st.hs;
  // Sockel (Büro-Fassade, 3 Geschosse)
  const pw = snap(w + 12, 3.2), pd = snap(d + 12, 3.2), ph0 = 3 * 3.6, ph = 3 * 3.8;
  ctx.b.office.box(x, 0, z, pw, ph0, pd, rot, mixCol(col(0xbdb8ae), tint, 0.25), { uv: 'facade', ws: STYLE.office.ws, hs: STYLE.office.hs, uo: Math.floor(rnd() * 8) / 8, top: false });
  ctx.b.solid.box(x, ph0, z, pw + 0.8, ph - ph0, pd + 0.8, rot, C.roofDark);
  ctx.box(x, z, pw / 2, pd / 2, rot, 0, ph);
  // Turm in Abschnitten
  const sec = [[0, 0.62, 1.0], [0.62, 0.84, 0.82], [0.84, 1.0, 0.64]];
  let topY = ph;
  for (const [a, b, sc] of sec) {
    const y0 = snap(h * a, st.floor), y1 = snap(h * b, st.floor);
    if (y1 <= y0) continue;
    const sw = snap(w * sc, 3.2), sd = snap(d * sc, 3.2);
    const base = a === 0 ? ph : y0;
    ctx.b.glass.box(x, base, z, sw, y1 - base, sd, rot, tint, { uv: 'facade', ws, hs, uo: Math.floor(rnd() * 6) / 6, vo: (base % hs) / hs, topColor: C.roofDark });
    // dunkle Bänder zwischen Abschnitten
    ctx.b.solid.box(x, y1 - 0.01, z, sw + 0.6, 0.6, sd + 0.6, rot, tintD);
    topY = y1;
  }
  ctx.box(x, z, w / 2, d / 2, rot, 0, h);
  // Dachaufbau + Antenne + Warnlicht
  const rw = Math.max(3, w * 0.35), rd = Math.max(3, d * 0.35);
  ctx.b.solid.box(x, topY, z, rw, 3.2, rd, rot, C.concrete);
  if (h > 110) {
    ctx.b.solid.cyl(x, topY + 3.2, z, 0.35, 0.12, 26, 6, C.metal, { rows: 3 });
    ctx.b.lamp.box(x, topY + 29, z, 0.7, 0.7, 0.7, 0, [1, 0.12, 0.08], { top: true });
    ctx.redLights.push([x, topY + 29, z]);
  }
}

/** Mittelhohes Büro-/Wohnhaus. */
export function midrise(ctx, o) {
  const { x, z, rnd } = o;
  const style = o.style || (rnd() < 0.5 ? 'office' : 'apartment');
  const st = STYLE[style];
  const w = snap(o.w, 3.2), d = snap(o.d, 3.2), h = snap(o.h, st.floor);
  const rot = o.rot || 0;
  const tint = o.tint || mixCol(col(0xcfc7b8), col(0x9a9a9a), rnd());
  ctx.b[style].box(x, 0, z, w, h, d, rot, tint, { uv: 'facade', ws: st.ws, hs: st.hs, uo: Math.floor(rnd() * st.cols) / st.cols, topColor: C.roofDark });
  ctx.box(x, z, w / 2, d / 2, rot, 0, h);
  // Dachkante und Technik
  ctx.b.solid.box(x, h, z, w + 0.4, 0.5, d + 0.4, rot, mulCol(tint, 0.6), { top: true });
  for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
    const ox = (rnd() - 0.5) * (w - 6), oz = (rnd() - 0.5) * (d - 6);
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.b.solid.box(x + ox * c + oz * s, h + 0.5, z - ox * s + oz * c, rnd.range(2, 4), rnd.range(1.4, 2.6), rnd.range(2, 4), rot, C.metal);
  }
}

/** Moderne Villa mit Flachdach, Glasband, Pool, Hecken. Grundfläche w x d um (x,z). */
export function villa(ctx, o) {
  const { x, z, rnd } = o;
  const w = o.w, d = o.d, rot = o.rot || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const plaster = mixCol(col(0xf1ede4), col(0xd9d0c0), rnd());
  const st = STYLE.villa;
  // Erdgeschoss + Obergeschoss (versetzt)
  const h0 = 3.3, h1 = 3.1;
  ctx.b.villa.box(x, 0.2, z, w, h0, d, rot, plaster, { uv: 'facade', ws: st.ws, hs: st.hs, uo: Math.floor(rnd() * 4) / 4, topColor: C.roofDark });
  const [ux, uz] = P(-w * 0.1, d * 0.05);
  ctx.b.villa.box(ux, 0.2 + h0, uz, w * 0.7, h1, d * 0.75, rot, mixCol(plaster, col(0xb9b2a4), 0.35), { uv: 'facade', ws: st.ws, hs: st.hs, uo: Math.floor(rnd() * 4) / 4, topColor: C.roofDark });
  // Dachplatten mit Überstand
  ctx.b.solid.box(x, 0.2 + h0 - 0.02, z, w + 0.9, 0.25, d + 0.9, rot, col(0x3a3b3e));
  ctx.b.solid.box(ux, 0.2 + h0 + h1 - 0.02, uz, w * 0.7 + 0.9, 0.25, d * 0.75 + 0.9, rot, col(0x3a3b3e));
  // Glasband (nachts beleuchtet)
  const [gx, gz] = P(0, d / 2 + 0.03);
  ctx.b.win.box(gx, 0.6, gz, w * 0.78, 2.4, 0.05, rot, [1, 1, 1], { top: false });
  // Garten: Rasen, Hecke, Pool
  if (o.pool !== false) {
    const [px, pz] = P(-w * 0.1, -d / 2 - 6);
    ctx.b.pool.box(px, 0.02, pz, Math.min(w * 0.8, 12), 0.04, 5, rot, [1, 1, 1], { top: true, sides: false });
    ctx.b.solid.box(px, 0.0, pz, Math.min(w * 0.8, 12) + 1.4, 0.12, 6.4, rot, col(0xd4cfc4), { top: true });
  }
  ctx.box(x, z, w / 2, d / 2, rot, 0, h0 + h1 + 0.3);
}

/** Lagerhalle mit Satteldach. */
export function warehouse(ctx, o) {
  const { x, z, rnd } = o;
  const w = o.w, d = o.d, h = o.h || 10, rot = o.rot || 0;
  const st = STYLE.industrial;
  const c = mixCol(col(0xb7bcc0), col(0x8e9aa4), rnd());
  ctx.b.industrial.box(x, 0, z, w, h, d, rot, c, { uv: 'facade', ws: st.ws, hs: st.hs, uo: Math.floor(rnd() * 5) / 5, top: false });
  // Satteldach
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (lx, ly, lz) => [x + lx * cs + lz * sn, ly, z - lx * sn + lz * cs];
  const rh = 2.4, hw = w / 2, hd = d / 2;
  const roof = mulCol(c, 0.7);
  ctx.b.solid.quad(P(-hw, h, -hd), P(hw, h, -hd), P(hw, h + rh, 0), P(-hw, h + rh, 0), roof);
  ctx.b.solid.quad(P(-hw, h, hd), P(-hw, h + rh, 0), P(hw, h + rh, 0), P(hw, h, hd), roof);
  ctx.b.solid.quad(P(hw, h, -hd), P(hw, h, hd), P(hw, h + rh, 0), P(hw, h + rh, 0), roof);
  ctx.b.solid.quad(P(-hw, h, hd), P(-hw, h, -hd), P(-hw, h + rh, 0), P(-hw, h + rh, 0), roof);
  ctx.box(x, z, w / 2, d / 2, rot, 0, h + rh);
}

export function containerStack(ctx, x, z, rot, rnd, cols = 3, rows = 2, stackH = 3) {
  const palette = [0xb8372b, 0x2c5aa0, 0xd7a13a, 0x2f7d5b, 0x8a8f94, 0xc4cacf, 0x6b3b8a];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const ox = i * 13.2, oz = j * 3.0;
    const px = x + ox * cs + oz * sn, pz = z - ox * sn + oz * cs;
    const hgt = 1 + Math.floor(rnd() * stackH);
    for (let k = 0; k < hgt; k++) ctx.b.solid.box(px, k * 2.6, pz, 12.2, 2.6, 2.45, rot, col(palette[Math.floor(rnd() * palette.length)]), { top: true });
  }
  ctx.box(x + ((cols - 1) * 13.2) / 2 * cs + ((rows - 1) * 3) / 2 * sn, z - ((cols - 1) * 13.2) / 2 * sn + ((rows - 1) * 3) / 2 * cs, (cols * 13.2) / 2, (rows * 3.0) / 2 + 0.2, rot, 0, 2.6 * stackH);
}

export function tank(ctx, x, z, r = 8, h = 12) {
  ctx.b.solid.cyl(x, 0, z, r, r, h, 14, col(0xe5e3dc), { cap: true });
  ctx.b.solid.cyl(x, h, z, r * 0.6, r * 0.5, 1.4, 12, C.metal, { cap: true });
  ctx.circle(x, z, r, 0, h);
}

/** Tankstelle: Vordach auf 4 Säulen, Zapfsäulen, Shop, Preisturm. rot = Ausrichtung. */
export function gasStation(ctx, x, z, rot = 0) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const cw = 24, cd = 14;
  const [cx, cz] = P(0, 0);
  ctx.b.solid.box(cx, 5.4, cz, cw, 0.7, cd, rot, C.white, { top: true });
  ctx.b.lamp.box(cx, 5.35, cz, cw + 0.2, 0.18, cd + 0.2, rot, [1.0, 0.35, 0.12], { top: false, sides: true });
  for (const [lx, lz] of [[-9, -4.5], [9, -4.5], [-9, 4.5], [9, 4.5]]) {
    const [px, pz] = P(lx, lz);
    ctx.b.solid.cyl(px, 0, pz, 0.32, 0.32, 5.4, 8, C.white, { cap: true });
    ctx.circle(px, pz, 0.35, 0, 5.5);
  }
  for (const lx of [-6, -2, 2, 6]) for (const lz of [-2.2, 2.2]) {
    const [px, pz] = P(lx, lz);
    ctx.b.solid.box(px, 0, pz, 0.6, 1.5, 0.45, rot, col(0xdddddd), { top: true });
    ctx.b.lamp.box(px, 1.0, pz, 0.62, 0.3, 0.47, rot, [0.4, 1.0, 0.6], { top: false });
  }
  for (const lz of [-2.2, 2.2]) { const [px, pz] = P(0, lz); ctx.b.solid.box(px, 0, pz, 15, 0.18, 1.4, rot, C.concrete); }
  // Shop
  const [sx, sz] = P(0, -cd / 2 - 8);
  ctx.b.office.box(sx, 0, sz, 20, 4.2, 8, rot, col(0xe8e4dc), { uv: 'facade', ws: STYLE.office.ws, hs: STYLE.office.hs, topColor: C.roofDark });
  ctx.box(sx, sz, 10, 4, rot, 0, 4.4);
  { const [wx, wz] = P(0, -cd / 2 - 3.97); ctx.b.win.box(wx, 0.6, wz, 15, 2.6, 0.05, rot, [1, 1, 1], { top: false }); }
  // Preisturm
  const [tx, tz] = P(cw / 2 + 4, 6);
  ctx.b.solid.cyl(tx, 0, tz, 0.3, 0.3, 8, 8, C.white, { cap: true });
  ctx.b.lamp.box(tx, 6.2, tz, 3.2, 3.6, 0.3, rot, [1, 0.45, 0.15], { top: true });
  ctx.circle(tx, tz, 0.4, 0, 8);
  for (const lx of [-8, 8]) { const [lx2, lz2] = P(lx, 0); ctx.lamps.push([lx2, 5.0, lz2]); }
}

/** Grünanlage mit Wegen, Palmen und Teich. */
export function parkBlock(ctx, r, rnd) {
  ctx.b.solid.floor(r.x0, r.z0, r.x1, r.z1, 0.04, mixCol(col(0x6c8f3d), col(0x7aa045), 0.5));
  // Wege (Kreuz) + Teich
  const w = 3.2;
  ctx.b.solid.floor(r.cx - w / 2, r.z0, r.cx + w / 2, r.z1, 0.06, col(0xc9bfa6));
  ctx.b.solid.floor(r.x0, r.cz - w / 2, r.x1, r.cz + w / 2, 0.06, col(0xc9bfa6));
  ctx.b.pool.box((r.cx + r.x0) / 2 + 6, 0.05, (r.cz + r.z0) / 2 + 6, 22, 0.05, 16, 0, [1, 1, 1], { top: true, sides: false });
  for (let k = 0; k < 26; k++) {
    const px = r.x0 + 4 + rnd() * (r.w - 8), pz = r.z0 + 4 + rnd() * (r.d - 8);
    if (Math.abs(px - r.cx) < 4 || Math.abs(pz - r.cz) < 4) continue;
    palm(ctx, px, pz, rnd);
  }
}
