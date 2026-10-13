// Baut die komplette Spielwelt (ohne Grafik): Gelände, Bauwerke, Kollision, Pflanzen, Kristalle, Figuren.
import { buildTerrain, forestAt, HALF, WATER, noiseB } from './terrain.js';
import { LAYOUT, POIS, NPCS, SPAWN, VILLAGE } from './layout.js';
import { buildStructures } from './structures.js';
import { Colliders } from './collide.js';
import { mulberry32 } from './noise.js';

export const CRYSTAL_COUNT = 40;

function nearZone(x, z, pad) {
  for (const f of LAYOUT.flatten) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true;
  return false;
}

function blockedByStructure(cols, x, z, pad) {
  for (const c of cols.query(x, z, pad + 1)) if (Colliders.delta(c, x, z).d < pad) return true;
  return false;
}

/** Bäume, Büsche, Felsen, Blumen, Gras. */
export function scatter(T, cols, crystals, density = 1) {
  const rnd = mulberry32(777);
  const trees = [], rocks = [], bushes = [], flowers = [], grass = [];
  const nearCrystal = (x, z, d) => crystals.some((c) => Math.hypot(c.x - x, c.z - z) < d);

  // Bäume: gejittertes 7-m-Raster
  const S = 7;
  for (let gz = -HALF + 20; gz < HALF - 20; gz += S) {
    for (let gx = -HALF + 20; gx < HALF - 20; gx += S) {
      const x = gx + (rnd() - 0.5) * S * 0.9, z = gz + (rnd() - 0.5) * S * 0.9;
      const roll = rnd(), scale = rnd(), rot = rnd() * Math.PI * 2;
      const h = T.heightAt(x, z);
      if (h < WATER + 0.6) continue;
      const n = T.smoothNormal(x, z);
      const surf = T.surfaceAt(x, z, h, n[1]);
      if (surf === 'path' || surf === 'plaza' || surf === 'field' || surf === 'dirt' || surf === 'snow') continue;
      if (T.pathDist(x, z) < 2.5 || nearZone(x, z, 3) || nearCrystal(x, z, 3.5) || blockedByStructure(cols, x, z, 3)) continue;
      const fo = forestAt(x, z);
      let type = null;
      if (surf === 'sand') { if (roll < 0.1 && h < 4) type = 'palm'; }
      else if (surf === 'rock') { if (roll < 0.12 && h < 62 && n[1] > 0.6) type = 'pine'; }
      else {
        const p = 0.07 + 0.8 * fo;
        if (roll < p) type = h > 34 ? 'pine' : (rnd() < 0.55 + 0.25 * noiseB(x * 0.01, z * 0.01) ? 'oak' : 'pine');
        else if (roll < p + 0.06) type = 'bush';
      }
      if (!type) continue;
      const item = { type, x, y: h, z, r: rot, s: 0.75 + scale * 0.55 };
      if (type === 'bush') { item.s = 0.7 + scale * 0.7; bushes.push(item); continue; }
      trees.push(item);
    }
  }
  // Felsen
  for (let gz = -HALF + 20; gz < HALF - 20; gz += 13) {
    for (let gx = -HALF + 20; gx < HALF - 20; gx += 13) {
      const x = gx + (rnd() - 0.5) * 12, z = gz + (rnd() - 0.5) * 12;
      const roll = rnd(), sc = rnd(), rot = rnd() * 6.283;
      const h = T.heightAt(x, z);
      if (h < WATER - 2) continue;
      const n = T.smoothNormal(x, z);
      const surf = T.surfaceAt(x, z, h, n[1]);
      const p = surf === 'rock' || surf === 'snow' ? 0.35 : surf === 'sand' ? 0.06 : surf === 'grass' ? 0.07 : 0;
      if (roll >= p) continue;
      if (T.pathDist(x, z) < 2 || nearZone(x, z, 2) || nearCrystal(x, z, 3) || blockedByStructure(cols, x, z, 2.5)) continue;
      rocks.push({ type: 'rock', x, y: h, z, r: rot, s: 0.6 + sc * sc * 2.2, v: Math.floor(rnd() * 3) });
    }
  }
  // Blumen und Gras (nur Wiesen, Grasdichte über Qualitätsstufe)
  const FS = 4.2;
  for (let gz = -HALF + 20; gz < HALF - 20; gz += FS) {
    for (let gx = -HALF + 20; gx < HALF - 20; gx += FS) {
      const x = gx + (rnd() - 0.5) * FS, z = gz + (rnd() - 0.5) * FS;
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      const h = T.heightAt(x, z);
      if (h < 1.5) continue;
      const n = T.smoothNormal(x, z);
      if (T.surfaceAt(x, z, h, n[1]) !== 'grass' || T.pathDist(x, z) < 1) continue;
      const patch = noiseB(x * 0.02 + 40, z * 0.02);
      if (patch > 0.25 && r1 < 0.55) flowers.push({ x, y: h, z, r: r2 * 6.283, s: 0.8 + r3 * 0.5, v: Math.floor(r3 * 4) });
      const g = Math.round((1.5 + 2.5 * (1 - forestAt(x, z) * 0.7)) * density);
      for (let i = 0; i < g; i++) {
        const gx2 = x + (rnd() - 0.5) * FS, gz2 = z + (rnd() - 0.5) * FS;
        grass.push({ x: gx2, y: T.heightAt(gx2, gz2), z: gz2, r: rnd() * 6.283, s: 0.7 + rnd() * 0.6 });
      }
    }
  }
  return { trees, rocks, bushes, flowers, grass };
}

/** Kristalle abseits der Bauwerke, gleichmäßig über die Insel verteilt. */
function randomCrystals(T, cols, fixed, count) {
  const rnd = mulberry32(4242);
  const out = [];
  let minD = 52;
  for (let attempt = 0; out.length < count && attempt < 40000; attempt++) {
    if (attempt % 6000 === 5999) minD *= 0.85;
    const x = (rnd() - 0.5) * 2 * (HALF - 60), z = (rnd() - 0.5) * 2 * (HALF - 60);
    const h = T.heightAt(x, z);
    if (h < 1.8) continue;
    const n = T.smoothNormal(x, z);
    if (n[1] < 0.8) continue;
    if (nearZone(x, z, 4) || blockedByStructure(cols, x, z, 3)) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 60) continue;
    if ([...fixed, ...out].some((c) => Math.hypot(c.x - x, c.z - z) < minD)) continue;
    out.push({ id: `wild-${out.length + 1}`, x, y: h + 0.95, z, wild: true });
  }
  return out;
}

export function createWorld({ density = 1 } = {}) {
  const terrain = buildTerrain(LAYOUT);
  const st = buildStructures(terrain);
  const colliders = new Colliders(16);
  for (const c of st.cols) {
    if (c.t === 'c') colliders.addCircle(c); else colliders.addBox(c);
  }
  const crystals = [...st.crystals];
  crystals.push(...randomCrystals(terrain, colliders, crystals, CRYSTAL_COUNT - crystals.length));

  const veg = scatter(terrain, colliders, crystals, density);
  for (const t of veg.trees) {
    const tr = t.type === 'palm' ? 0.28 : t.type === 'pine' ? 0.32 : 0.42;
    colliders.addCircle({ x: t.x, z: t.z, r: tr * t.s, y0: t.y - 1, y1: t.y + 3.2 * t.s, mat: 'wood', tag: 'tree' });
  }
  for (const r of veg.rocks) {
    colliders.addCircle({ x: r.x, z: r.z, r: r.s * 0.75, y0: r.y - 1, y1: r.y + r.s * 0.62, mat: 'stone', tag: 'rock' });
  }

  /** Bodenhöhe inkl. begehbarer Bauwerke, höchstens maxTop. */
  function groundAt(x, z, maxTop = Infinity, r = 0.3) {
    const t = terrain.heightAt(x, z);
    const f = colliders.floorAt(x, z, r, maxTop);
    return f > t ? f : t;
  }

  const npcs = NPCS.map((n) => ({ ...n, y: groundAt(n.x, n.z, Math.max(terrain.heightAt(n.x, n.z), WATER) + 4) }));
  for (const i of st.interact) if (i.type === 'npc') i.y = npcs.find((n) => n.id === i.id).y;
  const spawn = { ...SPAWN, y: groundAt(SPAWN.x, SPAWN.z) };

  return {
    terrain, colliders, structures: st, crystals, veg, npcs, pois: POIS, spawn, groundAt,
    interact: st.interact, markers: st.markers, water: WATER,
  };
}
