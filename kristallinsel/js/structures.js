// Bauwerke als Bauteil-Listen (Quader, Zylinder, Kegel, Giebeldach …) plus Kollisionskörper,
// Interaktionspunkte, Effekt-Marker und Kristallplätze. Reines JS – die Grafik baut daraus Meshes.
import {
  VILLAGE, PIER, LIGHTHOUSE, WINDMILL, FIELD, RUINS, TOWER, CAMP, WRECK, STONES, ROCKISLE, PEAK, PASTURE, SIGNS, NPCS,
} from './layout.js';
import { LAKE, CLIFF, WATER } from './terrain.js';

export const C = {
  wall: 0xefe3c8, wall2: 0xf4efe4, wall3: 0xe8d2b0, beam: 0x5b3d26, wood: 0x8a6240, woodL: 0xb08458, woodD: 0x4e3524,
  roofR: 0xb5452f, roofD: 0x8e3426, roofB: 0x48668f, roofG: 0x55804a, roofS: 0x6d6a66,
  stone: 0xa39d92, stoneD: 0x7c776f, stoneL: 0xc2bcae, door: 0x5a3a22, win: 0xffd38a, frame: 0x3d2a1c,
  red: 0xc23b2c, white: 0xf3f1ea, canvas: 0xe6dcc0, green: 0x4f7d3a, hay: 0xdcb65a, metal: 0x3b3f45, lamp: 0xfff1c0,
  fruitR: 0xd8402e, fruitY: 0xf0c330, fruitG: 0x7cb342, cloth: 0x3b6fb6,
};

function createKit() {
  const k = { parts: [], cols: [], groups: [], interact: [], markers: [], crystals: [] };

  function frame(ox, oy, oz, yaw = 0, parts = k.parts, cols = k.cols) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
    const rot = (o) => [o.rx || 0, (o.ry || 0) + yaw, o.rz || 0];
    const f = {
      P, yaw, ox, oy, oz,
      box(lx, ly, lz, sx, sy, sz, col, o = {}) {
        const p = P(lx, ly, lz), r = rot(o);
        parts.push({ s: 'box', p, d: [sx, sy, sz], r, c: col, m: o.m });
        if (o.solid && cols) cols.push({ t: 'b', x: p[0], z: p[2], hx: sx / 2, hz: sz / 2, rot: r[1], y0: p[1] - sy / 2, y1: p[1] + sy / 2, mat: o.mat || 'wood', tag: o.tag });
        return f;
      },
      cyl(lx, ly, lz, rt, rb, h, n, col, o = {}) {
        const p = P(lx, ly, lz);
        parts.push({ s: 'cyl', p, rt, rb, h, n, r: rot(o), c: col, m: o.m });
        if (o.solid && cols) cols.push({ t: 'c', x: p[0], z: p[2], r: o.cr || Math.max(rt, rb), y0: p[1] - h / 2, y1: p[1] + h / 2, mat: o.mat || 'stone', tag: o.tag });
        return f;
      },
      cone(lx, ly, lz, rb, h, n, col, o = {}) {
        parts.push({ s: 'cone', p: P(lx, ly, lz), rb, h, n, r: rot(o), c: col, m: o.m });
        return f;
      },
      ico(lx, ly, lz, rad, col, o = {}) {
        const p = P(lx, ly, lz);
        parts.push({ s: 'ico', p, rad, det: o.det || 0, sc: o.sc || [1, 1, 1], r: rot(o), c: col, m: o.m, seed: o.seed });
        if (o.solid && cols) cols.push({ t: 'c', x: p[0], z: p[2], r: o.cr || rad * Math.max(o.sc ? o.sc[0] : 1, o.sc ? o.sc[2] : 1) * 0.85, y0: p[1] - rad * (o.sc ? o.sc[1] : 1), y1: p[1] + (o.top ?? rad * (o.sc ? o.sc[1] : 1) * 0.8), mat: o.mat || 'stone' });
        return f;
      },
      sphere(lx, ly, lz, rad, col, o = {}) {
        parts.push({ s: 'sphere', p: P(lx, ly, lz), rad, sc: o.sc || [1, 1, 1], r: rot(o), c: col, m: o.m, n: o.n || 10 });
        return f;
      },
      /** Giebeldach: Grundfläche w × d (First entlang x), Höhe h, p = Mitte der Unterkante. */
      gable(lx, ly, lz, w, d, h, col, o = {}) {
        parts.push({ s: 'gable', p: P(lx, ly, lz), w, d, h, r: rot(o), c: col, m: o.m });
        return f;
      },
      collider(lx, lz, hx, hz, y0, y1, o = {}) {
        const p = P(lx, 0, lz);
        if (o.circle) cols.push({ t: 'c', x: p[0], z: p[2], r: hx, y0: oy + y0, y1: oy + y1, mat: o.mat || 'stone', tag: o.tag });
        else cols.push({ t: 'b', x: p[0], z: p[2], hx, hz, rot: yaw + (o.ry || 0), y0: oy + y0, y1: oy + y1, mat: o.mat || 'wood', tag: o.tag });
        return f;
      },
      crystal(id, lx, ly, lz) { const p = P(lx, ly, lz); k.crystals.push({ id, x: p[0], y: p[1], z: p[2] }); return f; },
      marker(type, lx, ly, lz, extra = {}) { const p = P(lx, ly, lz); k.markers.push({ type, x: p[0], y: p[1], z: p[2], ...extra }); return f; },
      interact(type, lx, lz, extra = {}) { const p = P(lx, 0, lz); k.interact.push({ type, x: p[0], y: oy, z: p[2], r: 2.6, ...extra }); return f; },
      /** Bewegliche Baugruppe (Mühlenflügel, Boot …): eigene Teile relativ zum Drehpunkt. */
      group(name, lx, ly, lz, gyaw = 0, extra = {}) {
        const g = { name, pos: P(lx, ly, lz), yaw: yaw + gyaw, parts: [], ...extra };
        k.groups.push(g);
        return frame(0, 0, 0, 0, g.parts, null);
      },
    };
    return f;
  }
  k.frame = frame;
  return k;
}

const faceTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // lokales +z zeigt zum Ziel

// ---------------------------------------------------------------- Einzelbauten

/** Satteldach aus zwei Dachflächen (First entlang x) über einer Giebelwand. */
function roof(f, y, w, d, rh, col, wallCol, over = 0.5) {
  const a = Math.atan2(rh, d / 2);
  const hd = d / 2 + over;
  const L = hd / Math.cos(a) + 0.12;
  for (const sz of [-1, 1]) {
    f.box(0, y + rh - (hd / 2) * Math.tan(a) + 0.08, sz * hd / 2, w + 0.9, 0.16, L, col, { rx: sz * a });
  }
  if (wallCol != null) f.gable(0, y - 0.01, 0, w - 0.02, d - 0.02, rh - 0.05, wallCol);
}

function house(k, x, y, z, yaw, v) {
  const f = k.frame(x, y, z, yaw);
  const w = v.w, d = v.d, wh = 3.1;
  f.box(0, -0.25, 0, w + 0.4, 1.1, d + 0.4, C.stoneD, { solid: true, mat: 'stone' });
  f.box(0, 0.3 + wh / 2, 0, w, wh, d, v.wall, { solid: true, mat: 'wood' });
  // Fachwerk
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(sx * (w / 2 - 0.08), 0.3 + wh / 2, sz * (d / 2 - 0.08), 0.24, wh, 0.24, C.beam);
  f.box(0, 0.3 + wh * 0.55, d / 2 + 0.02, w, 0.18, 0.1, C.beam).box(0, 0.3 + wh * 0.55, -d / 2 - 0.02, w, 0.18, 0.1, C.beam);
  f.box(w / 2 + 0.02, 0.3 + wh * 0.55, 0, 0.1, 0.18, d, C.beam).box(-w / 2 - 0.02, 0.3 + wh * 0.55, 0, 0.1, 0.18, d, C.beam);
  // Dach + Giebel
  const rh = v.rh || 2.3;
  roof(f, 0.3 + wh, w, d, rh, v.roof, v.wall);
  f.collider(0, 0, w / 2, d / 4, wh, wh + rh - 0.5, { mat: 'wood' });
  // Schornstein
  f.box(w * 0.28, 0.3 + wh + rh * 0.75, -d * 0.18, 0.6, 1.6, 0.6, C.stoneD);
  f.marker('smoke', w * 0.28, 0.3 + wh + rh * 0.75 + 0.9, -d * 0.18);
  // Tür + Treppe
  f.box(v.door || 0, 1.3, d / 2 + 0.06, 1.1, 2.0, 0.12, C.door);
  f.box(v.door || 0, 2.38, d / 2 + 0.08, 1.35, 0.16, 0.14, C.beam);
  f.box(v.door || 0, 0.12, d / 2 + 0.55, 1.6, 0.25, 0.9, C.stone, { solid: true, mat: 'stone' });
  // Fenster (leuchten nachts)
  const win = (lx, lz, ry) => {
    f.box(lx, 2.0, lz, 0.95, 0.95, 0.08, C.win, { m: 'glow', ry });
    f.box(lx, 2.0, lz, 1.12, 0.14, 0.12, C.frame, { ry }).box(lx, 1.5, lz, 1.2, 0.12, 0.2, C.frame, { ry });
    f.box(lx, 2.0, lz, 0.1, 1.1, 0.12, C.frame, { ry });
  };
  for (const lx of v.frontWin || [-w * 0.28, w * 0.28]) if (Math.abs(lx - (v.door || 0)) > 1) win(lx, d / 2 + 0.03, 0);
  win(0, -d / 2 - 0.03, 0);
  win(w / 2 + 0.03, 0, Math.PI / 2);
  win(-w / 2 - 0.03, 0, Math.PI / 2);
  // Blumenkasten
  f.box(-w * 0.28, 1.4, d / 2 + 0.22, 1.0, 0.25, 0.3, C.wood);
  for (let i = 0; i < 4; i++) f.sphere(-w * 0.28 - 0.36 + i * 0.24, 1.6, d / 2 + 0.22, 0.13, [0xe0457b, 0xf2c94c, 0xffffff, 0xd84a3a][i], { n: 6 });
}

function lantern(k, x, y, z) {
  const f = k.frame(x, y, z);
  f.cyl(0, 1.3, 0, 0.07, 0.09, 2.6, 6, C.metal, { solid: true, cr: 0.15, mat: 'wood' });
  f.box(0, 2.75, 0, 0.36, 0.42, 0.36, C.lamp, { m: 'glow' });
  f.cone(0, 3.08, 0, 0.32, 0.26, 4, C.metal, { ry: Math.PI / 4 });
  f.marker('lantern', 0, 2.75, 0);
}

function barrel(f, lx, lz, ly = 0) { f.cyl(lx, ly + 0.5, lz, 0.38, 0.38, 1.0, 9, C.wood, { solid: true, mat: 'wood' }); f.cyl(lx, ly + 1.0, lz, 0.36, 0.36, 0.04, 9, C.woodD); }
function crate(f, lx, lz, s = 0.9, ly = 0, ry = 0) { f.box(lx, ly + s / 2, lz, s, s, s, C.woodL, { solid: true, ry, mat: 'wood' }); f.box(lx, ly + s / 2, lz, s * 1.02, s * 0.14, s * 1.02, C.wood, { ry }); }

function bench(k, x, y, z, yaw) {
  const f = k.frame(x, y, z, yaw);
  f.box(0, 0.45, 0, 1.8, 0.1, 0.5, C.woodL, { solid: true, mat: 'wood' }).box(0, 0.8, -0.22, 1.8, 0.4, 0.08, C.woodL);
  for (const sx of [-0.75, 0.75]) f.box(sx, 0.22, 0, 0.1, 0.45, 0.45, C.woodD);
}

function fenceRing(k, cx, cz, r, n, gapAngle, heightAt) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const da = Math.atan2(Math.sin(am - gapAngle), Math.cos(am - gapAngle));
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    const y0 = heightAt(x0, z0);
    k.frame(x0, y0, z0).cyl(0, 0.55, 0, 0.08, 0.1, 1.3, 5, C.woodD, { solid: true, cr: 0.12, mat: 'wood' });
    if (Math.abs(da) < 0.3) continue;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
    const ym = heightAt(mx, mz);
    const yaw = Math.atan2(-(z1 - z0), x1 - x0); // lokales x entlang des Zauns
    const fr = k.frame(mx, ym, mz, yaw);
    fr.box(0, 0.5, 0, len, 0.1, 0.07, C.wood).box(0, 0.95, 0, len, 0.1, 0.07, C.wood);
    fr.collider(0, 0, len / 2, 0.12, -0.5, 1.1, { mat: 'wood' });
  }
}

function signpost(k, x, y, z, text) {
  const f = k.frame(x, y, z, 0.3);
  f.cyl(0, 1.1, 0, 0.08, 0.09, 2.2, 6, C.woodD, { solid: true, cr: 0.14, mat: 'wood' });
  f.box(0.35, 1.8, 0, 1.2, 0.3, 0.07, C.woodL, { ry: 0.25 }).box(-0.3, 1.45, 0, 1.0, 0.28, 0.07, C.woodL, { ry: -0.5 });
  f.interact('sign', 0, 0, { text, label: 'Wegweiser lesen' });
}

// ---------------------------------------------------------------- Orte

function village(k, T) {
  const { x: vx, z: vz, y: vy } = VILLAGE;
  const houses = [
    { a: 0.25, r: 25, w: 7, d: 5.6, wall: C.wall, roof: C.roofR },
    { a: 1.05, r: 26, w: 6.2, d: 5.2, wall: C.wall2, roof: C.roofB },
    { a: 2.3, r: 25, w: 7.4, d: 6, wall: C.wall3, roof: C.roofD, door: -1.6, frontWin: [0.6, 2.2] },
    { a: 2.8, r: 27, w: 6, d: 5, wall: C.wall, roof: C.roofG },
    { a: -2.5, r: 26, w: 6.8, d: 5.6, wall: C.wall2, roof: C.roofR },
    { a: -1.15, r: 25, w: 6.4, d: 5.4, wall: C.wall3, roof: C.roofS },
  ];
  for (const h of houses) {
    const x = vx + Math.cos(h.a) * h.r, z = vz + Math.sin(h.a) * h.r;
    house(k, x, T.heightAt(x, z), z, faceTo(x, z, vx, vz), h);
  }
  // Brunnen in der Mitte
  const w = k.frame(vx, vy, vz);
  w.cyl(0, 0.45, 0, 1.15, 1.25, 0.9, 12, C.stone, { solid: true, mat: 'stone' });
  w.cyl(0, 0.86, 0, 0.95, 0.95, 0.06, 12, 0x2f5f7a);
  for (const sx of [-1, 1]) w.box(sx * 1.0, 1.7, 0, 0.16, 1.8, 0.16, C.beam);
  w.gable(0, 2.55, 0, 2.6, 1.3, 0.75, C.roofR, { ry: Math.PI / 2 });
  w.cyl(0, 2.15, 0, 0.08, 0.08, 1.9, 6, C.woodD, { rz: Math.PI / 2 });
  w.cyl(0, 1.5, 0, 0.18, 0.15, 0.3, 7, C.wood);
  w.crystal('brunnen', 2.6, 0.95, 1.4);
  // Marktstand
  const m = k.frame(vx + 9, vy, vz - 6, faceTo(vx + 9, vz - 6, vx, vz));
  m.box(0, 0.5, 0, 3, 1, 1.2, C.woodL, { solid: true, mat: 'wood' });
  for (const sx of [-1.4, 1.4]) for (const sz of [-0.5, 0.5]) m.box(sx, 1.25, sz, 0.12, 2.5, 0.12, C.beam);
  for (let i = 0; i < 6; i++) m.box(-1.25 + i * 0.5, 2.55, 0.05, 0.5, 0.08, 1.7, i % 2 ? C.white : C.red, { rx: 0.25 });
  const fruit = [C.fruitR, C.fruitY, C.fruitG];
  for (let i = 0; i < 12; i++) m.sphere(-1.2 + (i % 6) * 0.48, 1.12, -0.25 + Math.floor(i / 6) * 0.45, 0.13, fruit[i % 3], { n: 6 });
  crate(m, 2.2, 0.3, 0.7);
  barrel(m, -2.2, 0.4);
  // Große Linde
  const lt = k.frame(vx - 10, vy, vz - 6);
  lt.cyl(0, 2.5, 0, 0.45, 0.7, 5, 8, C.woodD, { solid: true, cr: 0.7, mat: 'wood' });
  lt.ico(0, 7.2, 0, 4.2, 0x4f8a35, { det: 1, sc: [1, 0.85, 1], seed: 3 });
  lt.ico(2.4, 6.2, 1.2, 2.8, 0x5c9a3c, { det: 1, seed: 4 }).ico(-2.4, 6.4, -1, 3, 0x467e2f, { det: 1, seed: 5 });
  // Bänke, Laternen, Fässer
  bench(k, vx - 6, vy, vz - 1, Math.PI / 2 + 0.3);
  bench(k, vx - 3, vy, vz - 11, 0.4);
  for (const a of [-0.4 + 0.3, -0.4 - 0.3, 1.75 + 0.3, 1.75 - 0.3, Math.PI - 0.25, Math.PI + 0.25, -1.86 + 0.3, -1.86 - 0.3]) {
    const x = vx + Math.cos(a) * 16, z = vz + Math.sin(a) * 16;
    lantern(k, x, T.heightAt(x, z), z);
  }
  const misc = k.frame(vx, vy, vz);
  barrel(misc, 13, 9); barrel(misc, 13.8, 9.6); crate(misc, -12, 10, 0.9, 0, 0.3); crate(misc, -12.6, 11, 0.7, 0, 0.8);
  // Ein Kristall versteckt hinter dem Haus mit grünem Dach
  const h = houses[3];
  const hx = vx + Math.cos(h.a) * (h.r + 6.5), hz = vz + Math.sin(h.a) * (h.r + 6.5);
  k.crystals.push({ id: 'dorf-hinterhof', x: hx, y: T.heightAt(hx, hz) + 0.95, z: hz });
  // Weide mit Zaun
  fenceRing(k, PASTURE.x, PASTURE.z, 15, 22, Math.atan2(30 - PASTURE.z, -20 - PASTURE.x), T.heightAt);
  const tr = k.frame(PASTURE.x - 6, T.heightAt(PASTURE.x - 6, PASTURE.z + 5), PASTURE.z + 5);
  tr.box(0, 0.35, 0, 2.2, 0.5, 0.8, C.wood, { solid: true, mat: 'wood' }).box(0, 0.58, 0, 2.0, 0.06, 0.6, 0x3f7fa0);
}

function pier(k, T) {
  // Steg beginnt dort, wo der Strand unter Steghöhe fällt.
  let z0 = PIER.z - 20;
  while (T.heightAt(PIER.x, z0) > PIER.y - 0.1 && z0 < PIER.z + 20) z0 += 0.5;
  z0 -= 3;
  PIER.start = z0;
  const len = PIER.len;
  const f = k.frame(PIER.x, PIER.y, z0 + len / 2);
  f.box(0, -0.15, 0, 3, 0.3, len, C.woodL, { solid: true, mat: 'wood' });
  for (let i = 0; i < len / 0.9; i++) f.box(0, 0.005, -len / 2 + 0.45 + i * 0.9, 3.02, 0.02, 0.06, C.wood);
  for (let zz = -len / 2 + 1; zz <= len / 2; zz += 4) for (const sx of [-1.45, 1.45]) {
    f.cyl(sx, -3.5, zz, 0.15, 0.15, 7.4, 6, C.woodD);
    f.cyl(sx, 0.45, zz, 0.07, 0.07, 0.9, 5, C.woodD);
  }
  f.box(1.45, 0.85, 0, 0.08, 0.08, len, C.wood).box(-1.45, 0.85, 0, 0.08, 0.08, len, C.wood);
  f.collider(1.5, 0, 0.1, len / 2, 0, 1.0).collider(-1.5, -4, 0.1, len / 2 - 4, 0, 1.0);
  // Plattform am Ende
  const e = k.frame(PIER.x, PIER.y, z0 + len + 2.5);
  e.box(0, -0.15, 0, 6, 0.3, 5, C.woodL, { solid: true, mat: 'wood' });
  for (const sx of [-2.8, 2.8]) for (const sz of [-2.3, 2.3]) e.cyl(sx, -3.5, sz, 0.17, 0.17, 7.4, 6, C.woodD);
  crate(e, -2.1, -1.4, 0.8); barrel(e, -2.2, 0.2); barrel(e, 2.2, 1.6);
  e.crystal('stegende', 1.6, 0.95, 1.6);
  lantern(k, PIER.x - 1.7, PIER.y, z0 + 2);
  lantern(k, PIER.x + 2.7, PIER.y, z0 + len + 4.5);
  // Boot (schaukelt)
  const b = e.group('boat', -3.6, -0.75, -2, 0.08, { bob: true });
  b.box(0, 0, 0, 1.7, 0.35, 5.0, C.wood).box(0.85, 0.4, 0, 0.14, 0.6, 5.0, C.woodL, { rz: -0.2 }).box(-0.85, 0.4, 0, 0.14, 0.6, 5.0, C.woodL, { rz: 0.2 });
  b.box(0, 0.4, 2.55, 1.5, 0.6, 0.14, C.woodL).box(0, 0.4, -2.55, 1.4, 0.6, 0.14, C.woodL);
  b.box(0, 0.35, 0.4, 1.6, 0.08, 0.4, C.woodD).box(0, 0.35, -1.4, 1.6, 0.08, 0.4, C.woodD);
  b.cyl(0.6, 0.6, -0.4, 0.04, 0.04, 2.6, 4, C.woodD, { rx: 1.2 });
  // Fischerhütte am Strand
  const hx = PIER.x + 7, hz = PIER.z - 10;
  const hy = T.heightAt(hx, hz);
  const hut = k.frame(hx, hy, hz, faceTo(hx, hz, PIER.x, z0 + 4));
  hut.box(0, 1.3, 0, 4, 2.6, 3.4, C.woodL, { solid: true });
  roof(hut, 2.6, 4, 3.4, 1.4, C.roofS, C.woodL, 0.4);
  hut.box(0, 1.05, 1.73, 1.0, 1.9, 0.1, C.door);
  hut.box(-1.2, 1.7, 1.73, 0.7, 0.6, 0.06, C.win, { m: 'glow' });
  for (let i = 0; i < 3; i++) hut.box(2.15, 1.1 + i * 0.5, 0, 0.05, 0.05, 2.4, C.woodD);
}

function windmill(k, T) {
  const { x, z, y } = WINDMILL;
  const yaw = faceTo(x, z, VILLAGE.x, VILLAGE.z);
  const f = k.frame(x, y, z, yaw);
  f.cyl(0, 0.3, 0, 3.6, 3.8, 1.2, 10, C.stoneD, { solid: true, mat: 'stone' });
  f.cyl(0, 5.4, 0, 2.3, 3.3, 9.6, 10, C.wall2, { solid: true, mat: 'stone' });
  for (let i = 0; i < 3; i++) f.cyl(0, 2.2 + i * 3.1, 0, 3.25 - i * 0.33, 3.32 - i * 0.33, 0.18, 10, C.beam);
  f.cone(0, 11.6, 0, 2.9, 2.8, 10, C.roofD);
  f.box(0, 1.6, 3.32, 1.2, 2.2, 0.3, C.door);
  f.box(0, 6.2, 2.88, 0.8, 0.9, 0.15, C.win, { m: 'glow' }).box(0, 8.6, 2.6, 0.6, 0.7, 0.12, C.win, { m: 'glow' });
  f.box(0, 10.5, 2.6, 0.5, 0.5, 1.3, C.woodD);
  const s = f.group('mill', 0, 10.5, 3.3, 0, { spin: 0.6, axis: 'z' });
  s.cyl(0, 0, 0, 0.35, 0.35, 0.5, 8, C.woodD, { rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    s.box(ca * 4.2, sa * 4.2, 0.15, 0.22, 8.4, 0.18, C.woodD, { rz: a - Math.PI / 2 });
    s.box(ca * 4.8 - sa * 0.75, sa * 4.8 + ca * 0.75, 0.2, 1.3, 6.2, 0.05, C.canvas, { rz: a - Math.PI / 2 });
  }
  f.crystal('muehle', -3.8, 0.95, -4.6);
  // Feld mit Vogelscheuche und Heuballen
  const fy = FIELD.y;
  const sc = k.frame(FIELD.x, fy, FIELD.z, 0.4);
  sc.cyl(0, 1.1, 0, 0.06, 0.06, 2.2, 5, C.woodD, { solid: true, cr: 0.2, mat: 'wood' });
  sc.cyl(0, 1.65, 0, 0.05, 0.05, 1.8, 5, C.woodD, { rz: Math.PI / 2 });
  sc.box(0, 1.5, 0, 0.6, 0.7, 0.3, C.cloth).sphere(0, 2.3, 0, 0.23, C.canvas).cone(0, 2.6, 0, 0.42, 0.35, 8, C.hay);
  sc.crystal('feld', 1.5, 0.95, 1.5);
  for (const [dx, dz, r] of [[12, -8, 0.3], [-10, 9, 1.2], [8, 12, 2.0], [-14, -6, 0.6], [16, 6, 2.6]]) {
    const hx = FIELD.x + dx, hz = FIELD.z + dz;
    k.frame(hx, T.heightAt(hx, hz), hz, r).cyl(0, 0.7, 0, 0.75, 0.75, 1.3, 10, C.hay, { rz: Math.PI / 2, solid: true, cr: 0.8, mat: 'grass' });
  }
}

function lighthouse(k, T) {
  const { x, z, y } = LIGHTHOUSE;
  const yaw = faceTo(x, z, x + 10, z);
  const f = k.frame(x, y, z, yaw);
  f.cyl(0, 0.5, 0, 3.0, 3.2, 1.4, 14, C.stoneD, { solid: true, mat: 'stone' });
  const segs = 6, H = 17;
  for (let i = 0; i < segs; i++) {
    const r0 = 2.7 - (i / segs) * 0.8, r1 = 2.7 - ((i + 1) / segs) * 0.8;
    f.cyl(0, 1.2 + (i + 0.5) * (H / segs), 0, r1, r0, H / segs, 14, i % 2 ? C.white : C.red);
  }
  f.collider(0, 0, 2.6, 0, -1, 1.2 + H, { circle: true, mat: 'stone' });
  f.cyl(0, 1.2 + H + 0.15, 0, 2.6, 2.4, 0.3, 14, C.stoneD);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; f.cyl(Math.cos(a) * 2.45, H + 2.0, Math.sin(a) * 2.45, 0.04, 0.04, 1.0, 4, C.metal); }
  f.cyl(0, H + 2.5, 0, 2.45, 2.45, 0.07, 14, C.metal);
  f.cyl(0, H + 2.5, 0, 1.35, 1.35, 2.4, 10, C.lamp, { m: 'lamp' });
  f.cone(0, H + 4.6, 0, 1.75, 1.8, 10, C.roofD).sphere(0, H + 5.6, 0, 0.25, C.metal);
  f.marker('beacon', 0, H + 2.5, 0);
  f.box(0, 2.3, 2.75, 1.2, 2.2, 0.3, C.door);
  f.box(0, 7.5, 2.42, 0.6, 0.9, 0.2, C.win, { m: 'glow' }).box(0, 12.5, 2.15, 0.55, 0.8, 0.2, C.win, { m: 'glow' });
  f.interact('beacon', 0, 3.6, { label: 'Leuchtfeuer' });
  // Wärterhaus
  house(k, ...f.P(1, 0, 11), yaw + Math.PI / 2, { w: 5.2, d: 4.4, wall: C.wall2, roof: C.roofB, rh: 1.9, frontWin: [1.5] });
  // Kristall an der Klippenkante (Richtung Meer)
  const ex = x - 15, ez = z + 9;
  k.crystals.push({ id: 'klippe', x: ex, y: T.heightAt(ex, ez) + 0.95, z: ez });
  bench(k, x - 9, T.heightAt(x - 9, z - 6), z - 6, -Math.PI / 2);
}

function tower(k, T) {
  const { x, z, y } = TOWER;
  const yaw = faceTo(x, z, VILLAGE.x, VILLAGE.z) + Math.PI / 2;
  const f = k.frame(x, y, z, yaw);
  const top = 9.0, hw = 2.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(sx * (hw - 0.15), 6.0, sz * (hw - 0.15), 0.32, 12, 0.32, C.woodD, { solid: true, mat: 'wood' });
  // Querstreben
  for (const sz of [-1, 1]) f.box(0, 4.5, sz * (hw - 0.15), 0.18, 7.6, 0.14, C.wood, { rz: 0.62 });
  for (const sx of [-1, 1]) f.box(sx * (hw - 0.15), 4.5, 0, 0.14, 7.6, 0.18, C.wood, { rx: 0.62 });
  f.box(0, top - 0.15, 0, hw * 2 + 0.2, 0.3, hw * 2 + 0.2, C.woodL, { solid: true, mat: 'wood' });
  // Geländer (Lücke an der Treppe, Seite +x hinten)
  f.box(0, top + 0.95, -hw, hw * 2, 0.1, 0.1, C.wood).box(0, top + 0.95, hw, hw * 2, 0.1, 0.1, C.wood).box(-hw, top + 0.95, 0, 0.1, 0.1, hw * 2, C.wood);
  f.box(hw, top + 0.95, 0.9, 0.1, 0.1, hw * 2 - 1.8, C.wood);
  f.collider(0, -hw, hw, 0.1, top, top + 1.1).collider(0, hw, hw, 0.1, top, top + 1.1).collider(-hw, 0, 0.1, hw, top, top + 1.1);
  f.collider(hw, 0.9, 0.1, hw - 0.9, top, top + 1.1);
  // Dach
  f.cone(0, 12.9, 0, 4.4, 2.0, 4, C.roofD, { ry: Math.PI / 4 });
  // Treppe außen an der +x-Seite, steigt Richtung -z
  const steps = 28, rise = top / steps, run = 0.34, sx = hw + 0.75;
  const zStart = -1.9 + steps * run;
  for (let i = 0; i < steps; i++) {
    const tz = zStart - i * run, ty = (i + 1) * rise;
    f.box(sx, ty - 0.06, tz, 1.3, 0.12, run + 0.02, C.woodL);
    f.collider(sx, tz, 0.65, run / 2 + 0.01, ty - 0.4, ty, { mat: 'wood' });
  }
  const zEnd = zStart - steps * run;
  f.box(sx, top - 0.15, zEnd + 0.1, 1.5, 0.3, 1.2, C.woodL, { solid: true, mat: 'wood' });
  const len = Math.hypot(steps * run, top);
  const ang = Math.atan2(top, steps * run);
  for (const o of [-0.68, 0.68]) f.box(sx + o, top / 2, zStart - steps * run / 2, 0.1, 0.25, len, C.woodD, { rx: ang });
  for (const o of [0.7]) f.box(sx + o, top / 2 + 1, zStart - steps * run / 2, 0.06, 0.06, len, C.wood, { rx: ang });
  f.crystal('turm', -0.8, top + 0.95, -0.8);
  f.marker('stairs', sx, 0, zStart + 0.9, { to: f.P(sx, top, zEnd - 0.2), top: f.P(-0.8, top, -0.8) });
  // Lagerkiste am Fuß
  crate(f, -4, 2, 0.8); crate(f, -4.2, 3, 0.6, 0, 0.6);
}

function ruins(k, T) {
  const { x, z, y } = RUINS;
  const f = k.frame(x, y, z, 0.3);
  const st = { solid: true, mat: 'stone' };
  f.box(0, 0.0, 0, 14, 2.0, 12, C.stone, st);             // Terrasse 1 (Oberkante 1.0)
  f.box(-1.5, 1.05, -1.0, 8, 2.1, 7, C.stoneL, st);       // Terrasse 2 (Oberkante 2.1)
  // Stufen zur Terrasse 1 (vorne, +z)
  f.box(0, 0.25, 6.6, 4, 0.5, 1.2, C.stoneD, st);
  // Säulenring
  const cols = [
    [6.2, -4.8, 5.4], [6.6, 0, 1.6], [6.2, 4.8, 3.0], [-6.2, 4.8, 5.4], [-6.6, 0, 2.4], [-6.2, -4.8, 0.9],
  ];
  for (const [cx, cz, h] of cols) {
    f.cyl(cx, 1.0 + h / 2, cz, 0.55, 0.6, h, 10, C.stoneL, { ...st, cr: 0.6 });
    if (h > 5) f.box(cx, 1.0 + h + 0.15, cz, 1.4, 0.3, 1.4, C.stone, { solid: true, mat: 'stone' });
  }
  // Sprungpfad: Terrasse 2 -> Stumpf A (3.2) -> Stumpf B (4.3) -> Säule C (5.4) mit Kristall
  const path = [[1.2, -5.6, 3.2], [2.6, -7.6, 4.3], [0.4, -9.2, 5.4]];
  for (const [cx, cz, top] of path) f.cyl(cx, top / 2, cz, 0.62, 0.68, top, 10, C.stoneL, { ...st, cr: 0.68 });
  const last = path.at(-1);
  f.box(last[0], last[2] + 0.15, last[1], 1.5, 0.3, 1.5, C.stone, { solid: true, mat: 'stone' });
  f.crystal('ruinen-saeule', last[0], last[2] + 0.3 + 0.95, last[1]);
  f.marker('hops', 0, 0, 0, { pts: [[2.1, -4.2, 2.1], ...path.slice(0, 2), [last[0], last[1], last[2] + 0.3]].map(([lx, lz, t]) => f.P(lx, t, lz)) });
  // Torbogen mit Kristall darunter
  f.box(-2.6, 2.1 + 2.25, -4.0, 0.9, 4.5, 0.9, C.stoneL, st).box(1.0, 2.1 + 2.25, -4.0, 0.9, 4.5, 0.9, C.stoneL, st);
  f.box(-0.8, 2.1 + 4.85, -4.0, 4.6, 0.7, 1.1, C.stone, st);
  f.crystal('ruinen-bogen', -0.8, 2.1 + 0.95, -4.0);
  // Sonnenscheibe auf Terrasse 2
  f.cyl(-3.4, 2.2, 0.8, 1.3, 1.3, 0.2, 16, 0xd9b44a);
  // Umgestürzte Säulen und Brocken
  f.cyl(4.0, 0.55, 9.0, 0.55, 0.55, 4.5, 10, C.stoneL, { rx: Math.PI / 2, ry: 0.4 }).collider(4.0, 9.0, 0.55, 2.2, -0.2, 1.05, { ry: 0.4, mat: 'stone' });
  f.cyl(-8.5, 0.5, 7.0, 0.5, 0.5, 3.2, 10, C.stoneL, { rz: Math.PI / 2, ry: 1.1 });
  for (const [bx, bz, s] of [[9, -2, 0.8], [-9.5, -6, 1.0], [8.5, 6.5, 0.7], [-3, 8.5, 0.6], [10, 3, 0.5]]) f.ico(bx, s * 0.5, bz, s, C.stoneD, { seed: bx * 7 + bz, solid: true });
}

function shrine(k) {
  const { x, z } = PEAK;
  const y = PEAK.y - 9.5;
  const f = k.frame(x, y, z, 0.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    f.box(Math.cos(a) * 4.4, 1.1, Math.sin(a) * 4.4, 0.8, 2.6, 0.5, C.stone, { ry: -a + Math.PI / 2, rz: (i % 2 ? 0.06 : -0.05), solid: true, mat: 'stone' });
  }
  f.box(0, 0.5, 0, 1.4, 1.0, 1.4, C.stoneL, { solid: true, mat: 'stone' });
  f.box(0, 1.06, 0, 1.6, 0.12, 1.6, C.stoneD);
  f.crystal('gipfel', 0, 1.12 + 0.95, 0);
  f.cyl(2.2, 2.0, -2.0, 0.05, 0.06, 4.0, 5, C.woodD, { solid: true, cr: 0.12, mat: 'wood' });
  const flag = f.group('flag', 2.2, 3.55, -2.0, 0, { wave: true });
  flag.box(0.55, 0, 0, 1.1, 0.7, 0.03, C.red);
}

function camp(k, T) {
  const { x, z, y } = CAMP;
  const f = k.frame(x, y, z);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; f.ico(Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95, 0.24, C.stoneD, { seed: i }); }
  for (let i = 0; i < 4; i++) f.cyl(0, 0.2, 0, 0.09, 0.09, 1.3, 5, C.woodD, { rz: Math.PI / 2 - 0.3, ry: (i / 4) * Math.PI });
  f.marker('fire', 0, 0.35, 0);
  f.interact('rest', 0, 0, { label: 'Am Feuer ausruhen', r: 3.2 });
  f.collider(0, 0, 0.9, 0, -0.5, 0.35, { circle: true, mat: 'stone' });
  // Zelt
  const t = k.frame(x - 4.5, y, z - 2.5, 0.6);
  t.gable(0, 0, 0, 2.6, 3.0, 2.0, C.canvas, { ry: Math.PI / 2 }).collider(0, 0, 1.4, 1.3, -0.5, 1.7, { mat: 'wood' });
  t.box(0, 0.9, 1.31, 0.9, 1.4, 0.05, 0x5b4630, { ry: 0 });
  // Sitzstämme
  for (const [dx, dz, r] of [[2.6, 0.5, 0.3], [-0.6, 2.7, 1.6]]) f.cyl(dx, 0.25, dz, 0.28, 0.28, 2.0, 7, C.wood, { rz: Math.PI / 2, ry: r, solid: true, cr: 0.5, mat: 'wood' });
  // Großer Felsen mit Kristall
  const rx = x + 7, rz = z - 6;
  const ry = T.heightAt(rx, rz);
  k.frame(rx, ry, rz).ico(0, 0.15, 0, 1.6, C.stoneD, { sc: [1.3, 0.8, 1.1], seed: 11, solid: true, top: 1.15 });
  k.crystals.push({ id: 'lagerfels', x: rx, y: ry + 1.3 + 0.95, z: rz });
  lantern(k, x + 3.5, y, z - 2);
}

function wreck(k, T) {
  const { x, z } = WRECK;
  const y = Math.max(T.heightAt(x, z), WATER - 0.6);
  const f = k.frame(x, y, z, 0.9);
  f.box(0, -0.1, 0, 2.8, 0.4, 9, C.woodD, { rz: 0.15, solid: true, mat: 'wood' });
  f.box(1.5, 1.1, 0, 0.3, 2.2, 8.6, C.wood, { rz: -0.35 }).collider(1.6, 0, 0.25, 4.3, -0.5, 2.0);
  f.box(-1.45, 1.4, 0.8, 0.3, 2.6, 6.2, C.wood, { rz: 0.25 }).collider(-1.5, 0.8, 0.25, 3.1, -0.5, 2.4);
  for (let i = -3; i <= 3; i++) f.box(0, 1.3, i * 1.3, 3.4, 0.16, 0.2, C.woodD, { rz: 0.1 });
  f.box(0, 1.1, 4.7, 2.6, 2.4, 0.3, C.wood, { rx: -0.2 });
  f.collider(0, 4.7, 1.3, 0.25, -0.5, 2.2);
  f.marker('wreckEntry', 0, 0, -7);
  f.cyl(-3.5, 0.6, -2, 0.18, 0.22, 9, 6, C.woodD, { rx: Math.PI / 2 - 0.1, ry: 0.5 });
  f.box(-5.2, 0.4, 1.5, 3, 0.05, 2.2, C.canvas, { rz: 0.1, ry: 0.4 });
  f.crystal('wrack', 0, 0.1 + 0.95, -1.5);
  crate(f, 4, 3, 0.8, 0, 0.5);
  barrel(f, 3.4, -4.5);
}

function stones(k) {
  const { x, z, y } = STONES;
  const f = k.frame(x, y, z, 0.15);
  const n = 9, R = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h = i % 3 === 0 ? 3.2 : 2.6 + (i % 2) * 0.4;
    f.box(Math.cos(a) * R, h / 2 - 0.2, Math.sin(a) * R, 1.1, h, 0.7, C.stone, { ry: -a + Math.PI / 2, solid: true, mat: 'stone' });
  }
  for (const i of [0, 3, 6]) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    f.box(Math.cos(a) * R, 3.25, Math.sin(a) * R, 0.8, 0.5, 5.2, C.stoneD, { ry: -a, solid: true, mat: 'stone' });
  }
  f.box(0, 0.3, 0, 2.4, 0.6, 1.4, C.stoneL, { solid: true, mat: 'stone' });
  f.crystal('steinkreis', 0, 0.6 + 0.95, 0);
}

function rockIsle(k) {
  const { x, z, y } = ROCKISLE;
  const f = k.frame(x, y, z);
  f.ico(-3, 1.2, -2, 2.6, C.stoneD, { sc: [1, 1.4, 1], seed: 21, solid: true });
  f.ico(3.4, 0.6, 1.5, 1.8, C.stone, { seed: 22, solid: true, top: 1.5 });
  f.ico(-1, 0.2, 4, 1.2, C.stoneD, { seed: 23 });
  f.crystal('moewenfels', 0.8, 0.95, -0.5);
}

function lakeIslet(k, T) {
  const x = LAKE.x, z = LAKE.z;
  k.crystals.push({ id: 'seeinsel', x, y: T.heightAt(x, z) + 0.95, z });
}

/** Baut alle Bauwerke. T = Gelände (heightAt). */
export function buildStructures(T) {
  const k = createKit();
  village(k, T);
  pier(k, T);
  windmill(k, T);
  lighthouse(k, T);
  tower(k, T);
  ruins(k, T);
  shrine(k);
  camp(k, T);
  wreck(k, T);
  stones(k);
  rockIsle(k);
  lakeIslet(k, T);
  for (const s of SIGNS) signpost(k, s.x, T.heightAt(s.x, s.z), s.z, s.text);
  for (const n of NPCS) k.interact.push({ type: 'npc', id: n.id, x: n.x, y: T.heightAt(n.x, n.z), z: n.z, r: 2.8, label: `Mit ${n.name} sprechen` });
  return k;
}

export { CLIFF };
