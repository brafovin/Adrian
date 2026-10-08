// Verkehrssimulation ohne Rendering: Dichte, Kreuzungsverhalten (keine Überlappungen, kein Stillstand), Pfadstraßen.
import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./loader.mjs', import.meta.url);
const { makeLayout } = await import('../js/world/layout.js');
const { Traffic } = await import('../js/world/traffic.js');

const layout = makeLayout(7);

/** Welt-Attrappe: nur das, was der Verkehr braucht (Layout, geladene Chunks, Ampelphasen). */
function makeWorld() {
  return {
    layout, time: 0, chunks: { has: () => true },
    trafficState(t = this.time) {
      const p = ((t % 40) + 40) % 40;
      return { N: p < 14 ? 'g' : p < 17 ? 'y' : 'r', E: p >= 20 && p < 34 ? 'g' : p >= 34 && p < 37 ? 'y' : 'r' };
    },
  };
}
const scene = { add() {}, remove() {} };
const player = (x, z) => ({ y: 0, vehicle: { x, z, yaw: 0, fwd: [1, 0], u: 0, v: 0, worldVelocity: () => [0, 0] } });

function overlap(a, b) {
  const A = { x: a.x, z: a.z, f: [Math.cos(a.yaw), -Math.sin(a.yaw)], hl: a.hull.hl, hw: a.hull.hw };
  const B = { x: b.x, z: b.z, f: [Math.cos(b.yaw), -Math.sin(b.yaw)], hl: b.hull.hl, hw: b.hull.hw };
  for (const ax of [A.f, [-A.f[1], A.f[0]], B.f, [-B.f[1], B.f[0]]]) {
    const proj = (O) => O.hl * Math.abs(ax[0] * O.f[0] + ax[1] * O.f[1]) + O.hw * Math.abs(-ax[0] * O.f[1] + ax[1] * O.f[0]);
    if (Math.abs((B.x - A.x) * ax[0] + (B.z - A.z) * ax[1]) > proj(A) + proj(B) - 0.15) return false;
  }
  return true;
}

test('Raster-Verkehr: Dichte erreicht, keine Überlappungen, kein Dauerstillstand, keine NaN', () => {
  const world = makeWorld(), traffic = new Traffic(scene, world, { count: 100 });
  const pl = player(-60, 60);   // abseits der Straßen (Blockmitte)
  const dt = 1 / 60, stuck = new Map();
  let pairs = 0, samples = 0, worstStuck = 0;
  for (let k = 0; k < 60 * 240; k++) {
    world.time += dt;
    traffic.update(dt, pl, { lights: 0 });
    if (k % 6) continue;
    samples++;
    const cs = traffic.cars.filter((c) => c.mode !== 'free');
    for (const c of cs) {
      assert.ok(Number.isFinite(c.x + c.z + c.yaw + c.y + c.speed), 'NaN im Fahrzeugzustand');
      if (c.speed < 0.3) { const v = (stuck.get(c.id) || 0) + 0.1; stuck.set(c.id, v); worstStuck = Math.max(worstStuck, v); } else stuck.set(c.id, 0);
    }
    if (k > 60 * 20) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      if (Math.abs(cs[i].x - cs[j].x) > 14 || Math.abs(cs[i].z - cs[j].z) > 14 || Math.abs(cs[i].y - cs[j].y) > 3) continue;
      if (overlap(cs[i], cs[j])) pairs++;
    }
  }
  assert.ok(traffic.cars.length >= 95, `nur ${traffic.cars.length} Fahrzeuge`);
  assert.ok(pairs <= 12, `${pairs} Überlappungs-Stichproben (von ${samples})`);
  assert.ok(worstStuck < 80, `ein Fahrzeug stand ${worstStuck.toFixed(0)} s still (Verklemmung?)`);
});

test('Fahrzeugmix: auch Lkw und Busse, mehrere Farben', () => {
  const world = makeWorld(), traffic = new Traffic(scene, world, { count: 150 });
  const pl = player(-60, 60);
  for (let k = 0; k < 60 * 30; k++) { world.time += 1 / 60; traffic.update(1 / 60, pl, { lights: 0 }); }
  const types = new Set(traffic.cars.map((c) => c.type));
  assert.ok(types.has('truck') && types.has('bus') && types.has('sedan'), [...types].join(','));
  assert.ok(new Set(traffic.cars.map((c) => c.color)).size >= 6);
});

test('Streifenwagen: kommen im Verkehr vor, Einsatzfahrten melden Sirenen mit Position und Annäherung', () => {
  const world = makeWorld(), traffic = new Traffic(scene, world, { count: 150 });
  const pl = player(-60, 60);
  let seenSiren = false;
  for (let k = 0; k < 60 * 120; k++) {
    world.time += 1 / 60; traffic.update(1 / 60, pl, { lights: 0 });
    if (traffic.sirens.length) { seenSiren = true; const s = traffic.sirens[0]; assert.ok(Number.isFinite(s.x + s.z + s.dist + s.closing)); assert.ok(s.dist < 300); }
  }
  assert.ok(traffic.cars.some((c) => c.type === 'police'), 'kein Streifenwagen');
  assert.ok(seenSiren, 'nie eine Sirene in Hörweite');
  assert.ok(traffic.cars.filter((c) => c.siren).every((c) => c.type === 'police'));
});

test('Autobahn und Küstenstraße: Fahrzeuge folgen der Polylinie auf Fahrbahnhöhe', () => {
  for (const [name, x, z, kind] of [['Autobahn', 1290, 0, 'freeway'], ['Küstenstraße', -1240, 100, 'highway']]) {
    const world = makeWorld(), traffic = new Traffic(scene, world, { count: 80 });
    const pl = player(x, z);
    for (let k = 0; k < 60 * 60; k++) { world.time += 1 / 60; traffic.update(1 / 60, pl, { lights: 0 }); }
    const path = traffic.cars.filter((c) => c.mode === 'path' && c.road.kind === kind);
    assert.ok(path.length >= 5, `${name}: nur ${path.length} Fahrzeuge`);
    for (const c of path) {
      const P = traffic.pathOf.get(c.road.id), pt = traffic.pathPoint(P, c.dir, c.s, c.lane, {});
      assert.ok(Math.hypot(pt.x - c.x, pt.z - c.z) < 1.5, `${name}: Fahrzeug neben der Spur`);
      assert.ok(Math.abs(c.y - pt.y) < 0.01 && (kind !== 'freeway' || c.y === 9), `${name}: falsche Höhe ${c.y}`);
    }
    const avg = path.reduce((s, c) => s + c.speed, 0) / path.length;
    assert.ok(avg > 15, `${name}: mittleres Tempo nur ${(avg * 3.6).toFixed(0)} km/h`);
  }
});

test('Kollision mit dem Spieler ignoriert Fahrzeuge auf anderer Höhe (Autobahn über der Unterführung)', () => {
  const world = makeWorld(), traffic = new Traffic(scene, world, { count: 1 });
  traffic.cars.push({ id: 1, mode: 'path', x: 0, z: 0, y: 9, yaw: 0, speed: 20, vx: 0, vz: 0, w: 0, hull: { hl: 2.3, hw: 0.9, off: 0 }, m: 1500, hitT: 0 });
  const veh = { x: 0, z: 0, yaw: 0, fwd: [1, 0], u: 10, v: 0, w: 0, m: 2000, vx: 10, vz: 0 };
  const impacts = [];
  traffic.collide(veh, { hl: 2.4, hw: 1, off: 0 }, impacts, 0);
  assert.equal(impacts.length, 0);
});
