import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, CRYSTAL_COUNT } from '../js/world.js';
import { createPlayer, stepPlayer, P } from '../js/controller.js';
import { SIZE, SEG, CELL, HALF, WATER } from '../js/terrain.js';
import { LAYOUT } from '../js/layout.js';

const W = createWorld();
const T = W.terrain;

function sim(p, seconds, inputFn) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) stepPlayer(p, { canGlide: false, ...inputFn(p, t) }, dt, W);
}

test('Welt ist deterministisch', () => {
  const W2 = createWorld();
  assert.deepEqual(W2.crystals.map((c) => [c.id, c.x, c.y, c.z]), W.crystals.map((c) => [c.id, c.x, c.y, c.z]));
  assert.equal(W2.veg.trees.length, W.veg.trees.length);
  assert.equal(T.heightAt(12.3, -45.6), W2.terrain.heightAt(12.3, -45.6));
});

test(`${CRYSTAL_COUNT} Kristalle mit eindeutigen IDs, nicht übereinander`, () => {
  assert.equal(W.crystals.length, CRYSTAL_COUNT);
  assert.equal(new Set(W.crystals.map((c) => c.id)).size, CRYSTAL_COUNT);
  for (let i = 0; i < W.crystals.length; i++)
    for (let j = i + 1; j < W.crystals.length; j++) {
      const a = W.crystals[i], b = W.crystals[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 3, `${a.id} / ${b.id}`);
    }
});

test('Unter jedem Kristall ist Boden in Greifhöhe, kein Kristall steckt in einem Körper', () => {
  for (const c of W.crystals) {
    const floor = W.groundAt(c.x, c.z, c.y, 0.3);
    assert.ok(Math.abs(c.y - 0.95 - floor) < 0.15, `${c.id}: Boden ${floor.toFixed(2)} Kristall ${c.y.toFixed(2)}`);
    assert.ok(floor > WATER - 0.6, `${c.id} unter Wasser`);
    assert.ok(!W.colliders.solidAt(c.x, c.y, c.z, 0.1), `${c.id} in einem Körper`);
  }
});

test('Alle Kristalle am Boden sind zu Fuß oder schwimmend vom Start aus erreichbar', () => {
  // Rasterflutung: hinauf nur bis zur maximalen Hangneigung, hinab immer, Wasser ist schwimmbar.
  const N = SEG + 1, H = T.heights;
  const maxRise = CELL * Math.sqrt(1 / (P.maxSlopeNy ** 2) - 1) * 0.95;
  const seen = new Uint8Array(N * N);
  const idx = (x, z) => Math.round((z + HALF) / CELL) * N + Math.round((x + HALF) / CELL);
  const q = [idx(W.spawn.x, W.spawn.z)];
  seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop();
    const i = k % N, j = (k - i) / N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const n = b * N + a;
      if (seen[n]) continue;
      const swim = H[n] < WATER - 1 && H[k] < WATER + 1;
      if (swim || H[n] - H[k] <= maxRise) { seen[n] = 1; q.push(n); }
    }
  }
  for (const c of W.crystals) {
    if (Math.abs(T.heightAt(c.x, c.z) - (c.y - 0.95)) > 0.15) continue; // steht auf einem Bauwerk
    assert.ok(seen[idx(c.x, c.z)], `${c.id} (${c.x.toFixed(0)}, ${c.z.toFixed(0)}) nicht erreichbar`);
  }
});

test('Start, Bewohner und Wegpunkte liegen auf festem Boden', () => {
  assert.ok(W.spawn.y > WATER + 1);
  assert.ok(!W.colliders.solidAt(W.spawn.x, W.spawn.y + 1, W.spawn.z, P.radius));
  for (const n of W.npcs) {
    assert.ok(Number.isFinite(n.y) && n.y > WATER, `${n.id} y=${n.y}`);
    assert.ok(!W.colliders.solidAt(n.x, n.y + 1, n.z, 0.2), `${n.id} steckt fest`);
  }
  for (const p of LAYOUT.paths) for (const [x, z] of p.pts) assert.ok(T.heightAt(x, z) > WATER - 0.5, `${p.name} (${x}, ${z})`);
});

test('Keine Bäume auf Wegen, im Wasser oder in Bauwerken', () => {
  for (const t of W.veg.trees) {
    assert.ok(T.pathDist(t.x, t.z) > 2, 'auf Weg');
    assert.ok(t.y > WATER, 'im Wasser');
  }
  assert.ok(W.veg.trees.length > 1000, `Bäume: ${W.veg.trees.length}`);
});

test('Die Turmtreppe führt bis auf die Plattform', () => {
  const m = W.markers.find((k) => k.type === 'stairs');
  const p = createPlayer(m.x, T.heightAt(m.x, m.z), m.z);
  sim(p, 6, (q) => { const dx = m.to[0] - q.x, dz = m.to[2] - q.z, l = Math.hypot(dx, dz) || 1; return l < 0.3 ? {} : { mx: dx / l, mz: dz / l }; });
  assert.ok(Math.abs(p.y - m.to[1]) < 0.05, `oben angekommen: ${p.y.toFixed(2)} statt ${m.to[1].toFixed(2)}`);
  sim(p, 3, (q) => { const dx = m.top[0] - q.x, dz = m.top[2] - q.z, l = Math.hypot(dx, dz) || 1; return l < 0.3 ? {} : { mx: dx / l, mz: dz / l }; });
  assert.ok(Math.hypot(p.x - m.top[0], p.z - m.top[2]) < 0.5, 'zur Plattformmitte');
  const crystal = W.crystals.find((c) => c.id === 'turm');
  assert.ok(Math.abs(p.y + 0.95 - crystal.y) < 0.1);
});

test('Der Sprungpfad in den Ruinen ist schaffbar', () => {
  const hops = W.markers.find((k) => k.type === 'hops').pts;
  const p = createPlayer(hops[0][0], hops[0][1], hops[0][2]);
  sim(p, 0.3, () => ({}));
  assert.ok(Math.abs(p.y - hops[0][1]) < 0.05, `Start auf Terrasse: ${p.y}`);
  for (let i = 1; i < hops.length; i++) {
    const [tx, ty, tz] = hops[i];
    const sx = p.x, sz = p.z;
    let jumped = false;
    sim(p, 1.6, (q) => {
      const dx = tx - q.x, dz = tz - q.z, l = Math.hypot(dx, dz) || 1;
      if (jumped && q.mode === 'ground') return {};
      const jump = !jumped && Math.hypot(q.x - sx, q.z - sz) > 0.45;
      if (jump) jumped = true;
      return { mx: dx / l, mz: dz / l, run: true, jump };
    });
    assert.ok(Math.abs(p.y - ty) < 0.05, `Sprung ${i}: y ${p.y.toFixed(2)} statt ${ty.toFixed(2)}`);
  }
  const c = W.crystals.find((k) => k.id === 'ruinen-saeule');
  assert.ok(Math.hypot(p.x - c.x, p.z - c.z) < 1.2 && Math.abs(p.y + 0.95 - c.y) < 0.1);
});

test('Gelände hat Meer am Rand und Land in der Mitte', () => {
  assert.ok(T.heightAt(-HALF + 5, -HALF + 5) < WATER - 5);
  assert.ok(T.heightAt(0, 0) > WATER + 3);
  assert.equal(SIZE, SEG * CELL);
});

test('Die Figur kann den Bergpfad bis zum Gipfel hinauflaufen', () => {
  const path = LAYOUT.paths.find((p) => p.name === 'Bergpfad').pts;
  const [sx, sz] = path[0];
  const p = createPlayer(sx, T.heightAt(sx, sz), sz);
  let k = 1;
  sim(p, 140, (q) => {
    if (k >= path.length) return {};
    const [tx, tz] = path[k];
    const dx = tx - q.x, dz = tz - q.z, l = Math.hypot(dx, dz);
    if (l < 1.5) k++;
    return { mx: dx / (l || 1), mz: dz / (l || 1) };
  });
  const peak = path.at(-1);
  assert.equal(k, path.length, `nur bis Wegpunkt ${k} gekommen (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
  assert.ok(Math.hypot(p.x - peak[0], p.z - peak[1]) < 2, 'am Gipfel');
  const crystal = W.crystals.find((c) => c.id === 'gipfel');
  assert.ok(crystal.y - p.y < 2.5, `Gipfelkristall in Reichweite (Figur ${p.y.toFixed(1)}, Kristall ${crystal.y.toFixed(1)})`);
});

const wreckEntry = W.markers.find((m) => m.type === 'wreckEntry');
for (const [id, from, via] of [['moewenfels', [330, 46]], ['seeinsel', [-150, -70]], ['wrack', [-230, -200], [wreckEntry.x, wreckEntry.z]]]) {
  test(`Kristall „${id}“ ist schwimmend erreichbar`, () => {
    const c = W.crystals.find((k) => k.id === id);
    const [sx, sz] = from;
    const p = createPlayer(sx, Math.max(T.heightAt(sx, sz), WATER - 1.22), sz);
    let jumpT = 0, target = via || [c.x, c.z];
    sim(p, 60, (q, t) => {
      if (via && target === via && Math.hypot(via[0] - q.x, via[1] - q.z) < 1) target = [c.x, c.z];
      const dx = target[0] - q.x, dz = target[1] - q.z, l = Math.hypot(dx, dz);
      if (l < 0.6) return {};
      // wie ein Spieler: am Ufer ab und zu springen
      const jump = (q.mode === 'swim' || q.sliding) && t - jumpT > 1 ? ((jumpT = t), true) : false;
      return { mx: dx / l, mz: dz / l, jump };
    });
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    assert.ok(d < 1.5 && Math.abs(c.y - (p.y + 0.9)) < 1.5, `${id}: Figur bei (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), Abstand ${d.toFixed(1)} m`);
  });
}
