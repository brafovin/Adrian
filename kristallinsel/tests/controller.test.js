import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, P } from '../js/controller.js';
import { Colliders } from '../js/collide.js';

/** Testwelt mit Höhenfunktion h(x, z). */
function makeWorld(h = () => 0, cols = new Colliders()) {
  const e = 0.05;
  return {
    water: 0,
    colliders: cols,
    terrain: {
      heightAt: h,
      normalAt(x, z) {
        const dx = (h(x + e, z) - h(x - e, z)) / (2 * e), dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
        const l = Math.hypot(dx, 1, dz);
        return [-dx / l, 1 / l, -dz / l];
      },
      surfaceAt: () => 'grass',
    },
  };
}

function run(p, w, input, seconds, onEv) {
  const evs = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    const ev = stepPlayer(p, { canGlide: false, ...input }, dt, w);
    evs.push(...ev);
    if (onEv) onEv(ev, p);
    input = { ...input, jump: false };
  }
  return evs;
}

test('Gehen auf ebenem Boden erreicht die Gehgeschwindigkeit', () => {
  const w = makeWorld(() => 5);
  const p = createPlayer(0, 5, 0);
  const ev = run(p, w, { mx: 1, mz: 0 }, 2);
  assert.ok(Math.abs(p.vx - P.walk) < 0.05, `vx ${p.vx}`);
  assert.ok(p.x > 7.5 && p.x < 9, `x ${p.x}`);
  assert.equal(p.y, 5);
  assert.equal(p.mode, 'ground');
  assert.ok(ev.filter((e) => e.type === 'step').length >= 6, 'Schritte');
});

test('Sprinten ist schneller und kostet Ausdauer, leer = erschöpft', () => {
  const w = makeWorld();
  const p = createPlayer(0, 0, 0);
  run(p, w, { mx: 0, mz: 1, run: true }, 2);
  assert.ok(Math.abs(p.vz - P.run) < 0.1);
  assert.ok(p.stamina < 0.8);
  const ev = run(p, w, { mx: 0, mz: 1, run: true }, 10);
  assert.ok(ev.some((e) => e.type === 'exhausted'));
  assert.ok(p.vz < P.walk + 0.1, 'erschöpft nur Gehtempo');
  run(p, w, {}, 4);
  assert.ok(p.stamina === 1 && !p.exhausted);
});

test('Sprunghöhe etwa 1,47 m, danach Landung', () => {
  const w = makeWorld();
  const p = createPlayer(0, 0, 0);
  let maxY = 0;
  const ev = run(p, w, { jump: true }, 1.5, (_, q) => { maxY = Math.max(maxY, q.y); });
  assert.ok(Math.abs(maxY - P.jumpV ** 2 / (2 * P.gravity)) < 0.06, `maxY ${maxY}`);
  assert.ok(ev.some((e) => e.type === 'jump') && ev.some((e) => e.type === 'land'));
  assert.equal(p.y, 0);
});

test('Wände halten auf, auch gedrehte Quader und Kreise', () => {
  const cols = new Colliders();
  cols.addBox({ x: 3, z: 0, hx: 0.5, hz: 4, rot: 0, y0: 0, y1: 3 });
  const w = makeWorld(() => 0, cols);
  const p = createPlayer(0, 0, 0);
  run(p, w, { mx: 1, mz: 0 }, 3);
  assert.ok(p.x <= 3 - 0.5 - P.radius + 1e-3, `x ${p.x}`);

  const c2 = new Colliders();
  c2.addBox({ x: 0, z: 5, hx: 3, hz: 0.3, rot: Math.PI / 4, y0: 0, y1: 3 });
  c2.addCircle({ x: 10, z: 0, r: 1, y0: 0, y1: 3 });
  const w2 = makeWorld(() => 0, c2);
  const q = createPlayer(0, 0, 0);
  run(q, w2, { mx: 0, mz: 1 }, 3);
  assert.ok(Colliders.delta(c2.list[0], q.x, q.z).d >= P.radius - 1e-3, 'nicht im gedrehten Quader');
  const r = createPlayer(7, 0, 0);
  run(r, w2, { mx: 1, mz: 0 }, 2);
  assert.ok(Math.hypot(r.x - 10, r.z) >= 1 + P.radius - 1e-3);
});

test('Niedrige Stufen werden erstiegen, hohe brauchen einen Sprung', () => {
  const cols = new Colliders();
  cols.addBox({ x: 3, z: 0, hx: 1, hz: 1, y0: -1, y1: 0.35 });
  cols.addBox({ x: 3, z: 6, hx: 1, hz: 1, y0: -1, y1: 1.1 });
  const w = makeWorld(() => 0, cols);
  const p = createPlayer(0, 0, 0);
  run(p, w, { mx: 1, mz: 0 }, 0.75);
  assert.ok(Math.abs(p.y - 0.35) < 1e-6, `auf Stufe: ${p.y}`);

  const q = createPlayer(0, 0, 6);
  run(q, w, { mx: 1, mz: 0 }, 1.5);
  assert.equal(q.y, 0, 'zu hoch zum Hochgehen');
  assert.ok(q.x < 2);
  run(q, w, { mx: 1, mz: 0, jump: true }, 0.8);
  assert.ok(Math.abs(q.y - 1.1) < 1e-6, `nach Sprung oben: ${q.y}`);
});

test('Auf Plattformen landen, unter hohen Plattformen durchgehen', () => {
  const cols = new Colliders();
  cols.addBox({ x: 0, z: 0, hx: 2, hz: 2, y0: 3.7, y1: 4 });
  const w = makeWorld(() => 0, cols);
  const p = createPlayer(0, 10, 0);
  p.mode = 'air';
  const ev = run(p, w, {}, 2);
  assert.equal(p.y, 4);
  assert.ok(ev.some((e) => e.type === 'land'));
  const q = createPlayer(-5, 0, 0);
  run(q, w, { mx: 1, mz: 0 }, 2.5);
  assert.ok(q.x > 3, 'darunter hindurch');
  assert.equal(q.y, 0);
  // Kopf stößt beim Springen an
  const r = createPlayer(0, 0, 0);
  let maxY = 0;
  run(r, w, { jump: true }, 1, (_, s) => { maxY = Math.max(maxY, s.y); });
  assert.ok(maxY + P.height <= 3.7 + 1e-3, `Kopf ${maxY + P.height}`);
});

test('Steile Hänge: hinauf geht nicht, man rutscht ab; flache Hänge gehen', () => {
  const steep = makeWorld((x) => Math.max(0, x) * 2);  // 63°
  const p = createPlayer(5, 10, 0);
  run(p, steep, { mx: 1, mz: 0 }, 3);
  assert.ok(p.x < 5, `rutscht ab: x ${p.x}`);
  const gentle = makeWorld((x) => Math.max(0, x) * 0.6); // 31°
  const q = createPlayer(0, 0, 0);
  run(q, gentle, { mx: 1, mz: 0 }, 3);
  assert.ok(q.x > 9 && q.y > 5, `geht hinauf: ${q.x} ${q.y}`);
  assert.equal(q.mode, 'ground');
});

test('Hangabwärts bleibt man am Boden, an Kanten fällt man', () => {
  const w = makeWorld((x) => 50 - Math.max(0, x) * 0.7);
  const p = createPlayer(0, 50, 0);
  let air = false;
  run(p, w, { mx: 1, mz: 0, run: true }, 2, (_, q) => { if (q.mode !== 'ground') air = true; });
  assert.ok(!air, 'kein Abheben am Hang');
  const cliff = makeWorld((x) => (x > 2 ? 15 : 20));
  const q = createPlayer(0, 20, 0);
  const ev = run(q, cliff, { mx: 1, mz: 0 }, 2);
  assert.ok(ev.some((e) => e.type === 'land' && e.fall > 4.5));
});

test('Tiefes Wasser: schwimmen mit Kopf über Wasser, hinauslaufen', () => {
  const w = makeWorld((x) => -6 + Math.max(0, x - 4) * 0.5);
  const p = createPlayer(0, 3, 0);
  p.mode = 'air';
  const ev = run(p, w, {}, 3);
  assert.ok(ev.some((e) => e.type === 'splash'));
  assert.equal(p.mode, 'swim');
  assert.ok(Math.abs(p.y - (-1.22)) < 0.1, `Schwimmhöhe ${p.y}`);
  assert.ok(p.y + P.height > 0.3, 'Kopf über Wasser');
  run(p, w, { mx: 1, mz: 0 }, 8);
  assert.equal(p.mode, 'ground', 'an Land gewatet');
  assert.ok(p.x > 17 && p.y > 0, `x ${p.x} y ${p.y}`);
});

test('Gleiter bremst den Fall, nur wenn freigeschaltet', () => {
  const w = makeWorld(() => 0);
  const p = createPlayer(0, 60, 0);
  p.mode = 'air';
  stepPlayer(p, { jump: true, canGlide: true }, 1 / 60, w);
  assert.equal(p.mode, 'glide');
  run(p, w, { mx: 0, mz: 1, canGlide: true }, 2);
  assert.ok(Math.abs(p.vy + P.glideFall) < 0.2, `vy ${p.vy}`);
  assert.ok(p.vz > 7, 'fliegt vorwärts');
  const q = createPlayer(0, 60, 0);
  q.mode = 'air';
  run(q, w, { jump: true }, 1);
  assert.equal(q.mode, 'air');
  assert.ok(q.vy < -15);
});

test('Gleiten verbraucht Ausdauer und endet bei leerer Ausdauer', () => {
  const w = makeWorld(() => 0);
  const p = createPlayer(0, 200, 0);
  p.mode = 'air';
  stepPlayer(p, { jump: true, canGlide: true }, 1 / 60, w);
  const ev = run(p, w, { mx: 1, mz: 0, canGlide: true }, 25);
  assert.ok(ev.some((e) => e.type === 'glideOff'));
  assert.notEqual(p.mode, 'glide');
});
