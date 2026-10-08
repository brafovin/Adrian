import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLayout, highwayX, coastX, baseTerrain, PITCH } from '../js/world/layout.js';

const L = makeLayout(7);

test('Alle Straßenpunkte sind endlich und haben Höhen', () => {
  for (const r of L.roads) {
    assert.equal(r.pts.length, r.y.length, `Straße ${r.id}`);
    for (let i = 0; i < r.pts.length; i++) assert.ok(Number.isFinite(r.pts[i][0] + r.pts[i][1] + r.y[i]));
  }
});

test('Bergstraßen: Steigung höchstens 8,5 %, Start auf Stadthöhe', () => {
  for (const r of L.roads.filter((x) => x.hillRoad)) {
    assert.ok(Math.abs(r.y[0]) < 0.5, `${r.name} startet auf ${r.y[0]}`);
    for (let i = 1; i < r.pts.length; i++) {
      const d = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
      assert.ok(Math.abs(r.y[i] - r.y[i - 1]) / d <= 0.085, `${r.name}: Steigung bei Punkt ${i}`);
    }
  }
});

test('Autobahn liegt erhöht, Auffahrten verbinden Straßenhöhe und Deck', () => {
  const fw = L.roads.find((r) => r.kind === 'freeway');
  assert.ok(fw.y.every((y) => y === 9));
  const ramps = L.roads.filter((r) => r.kind === 'ramp');
  assert.equal(ramps.length, 4);
  for (const r of ramps) {
    const lo = Math.min(r.y[0], r.y.at(-1)), hi = Math.max(r.y[0], r.y.at(-1));
    assert.ok(lo < 0.5 && hi > 8.9, `Rampe ${r.id}: ${lo}..${hi}`);
  }
});

test('Tunnel: Gelände darüber ist höher als die Röhre, Portale am Hang', () => {
  assert.equal(L.tunnels.length, 1);
  const T = L.tunnels[0];
  const mx = (T.a[0] + T.b[0]) / 2, mz = (T.a[1] + T.b[1]) / 2;
  assert.ok(L.terrain(mx, mz) > (T.ya + T.yb) / 2 + 9, 'zu wenig Deckung über dem Tunnel');
});

test('Küstenstraße kollidiert nicht mit dem Straßenraster und liegt über Land', () => {
  for (let z = -1500; z <= 1500; z += 10) {
    assert.ok(highwayX(z) + 13 < -1080 - 8 - 40, 'zu nah am Raster');
    assert.ok(baseTerrain(highwayX(z), z) > -1.5 || Math.abs(z - 660) < 60, `Küstenstraße im Wasser bei z=${z}`);
    assert.ok(highwayX(z) - coastX(z) === 100);
  }
});

test('Raster: 420 Kreuzungen, Straßen enden an Kreuzungsrändern', () => {
  assert.equal(L.crossings.length, 420);
  const seg = L.roads.find((r) => r.axis === 'v' && r.gi === 0 && r.gj === 0);
  assert.ok(Math.abs(seg.pts[0][1] - (0 + 14)) < 1e-9 && Math.abs(seg.pts[1][1] - (PITCH - 8)) < 1e-9);
});

test('Gelände: Strand fällt zum Meer ab, Stadt ist eben', () => {
  assert.ok(baseTerrain(0, 0) === 0 && baseTerrain(-500, 300) === 0);
  assert.ok(baseTerrain(coastX(0) - 40, 0) < -2);
  assert.ok(baseTerrain(300, -2000) > 80);
});
