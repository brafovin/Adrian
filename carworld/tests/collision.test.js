import test from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle } from '../js/physics/vehicle.js';
import { SPECS } from '../js/cars/specs.js';
import { SpatialGrid, collideStatic, hullOf } from '../js/physics/collision.js';

const DT = 1 / 240;
const hull = { hl: 2.4, hw: 0.98, off: -0.33 };

function car(speed = 0, yaw = 0, x = 0, z = 0) {
  const v = new Vehicle(SPECS.cls63);
  v.reset(x, z, yaw);
  v.u = speed;
  for (let i = 0; i < 4; i++) v.omega[i] = speed / v.R;
  v.gear = 4;
  return v;
}
function sim(v, grid, secs, input = () => ({ throttle: 0, brake: 0, steer: 0 })) {
  let maxPen = 0, hits = 0, bad = false;
  for (let i = 0; i < secs / DT; i++) {
    v.step(DT, input(i * DT, v), { assist: 1 });
    const h = collideStatic(v, hull, grid);
    hits += h.length;
    if (![v.x, v.z, v.u, v.v, v.w].every(Number.isFinite)) bad = true;
  }
  return { hits, bad };
}

test('Frontalaufprall auf eine Wand: kein Durchdringen, Geschwindigkeit stark abgebaut', () => {
  const g = new SpatialGrid(16);
  g.addBox(30, 0, 0.5, 30, 0); // Wand bei x = 30, quer zur Fahrtrichtung
  const v = car(25);
  const r = sim(v, g, 3);
  assert.equal(r.bad, false);
  const frontX = hullOf(v, hull).cx + hull.hl * Math.cos(v.yaw);
  assert.ok(frontX < 29.55, `Front steckt in der Wand: ${frontX}`);
  assert.ok(Math.abs(v.u) < 5.5, `Zu schnell nach dem Aufprall: ${v.u}`);
  assert.ok(r.hits > 0);
});

test('Streifender Aufprall: Auto bleibt in Bewegung, wird nur abgelenkt', () => {
  const g = new SpatialGrid(16);
  g.addBox(40, -4.6, 60, 0.5, 0); // lange Wand entlang x bei z = -4.6 (seitlich links)
  const v = car(25, 0.0, 0, -2.2);
  v.yaw = 0.07; // leicht zur Wand hin
  v.setWorldVelocity(25 * Math.cos(0.07), -25 * Math.sin(0.07));
  const r = sim(v, g, 2, () => ({ throttle: 0.5, steer: 0 }));
  assert.equal(r.bad, false);
  assert.ok(v.u > 12, `Streifschuss darf nicht zum Stillstand führen: ${v.u}`);
  const H = hullOf(v, hull);
  // linke Seite der Hülle darf nicht über z = -4.1 hinaus
  const leftmost = H.cz + Math.abs(H.lz) * hull.hw + Math.abs(H.fz) * hull.hl;
  assert.ok(H.cz - Math.abs(H.lz) * hull.hw - Math.abs(H.fz) * hull.hl > -4.15, `Seitenwand durchdrungen: ${leftmost}`);
});

test('Pfosten (Kreis) wird getroffen und das Auto wird abgelenkt', () => {
  const g = new SpatialGrid(16);
  g.addCircle(20, 0.3, 0.25);
  const v = car(20);
  const r = sim(v, g, 2);
  assert.equal(r.bad, false);
  assert.ok(r.hits > 0);
  assert.ok(Math.hypot(v.x - 20, v.z - 0.3) > 1.0);
});

test('Gedrehte Wand (45°): keine NaN, Auto bleibt außerhalb', () => {
  const g = new SpatialGrid(16);
  g.addBox(25, 0, 0.5, 20, Math.PI / 4);
  const v = car(18);
  const r = sim(v, g, 3, () => ({ throttle: 0.4 }));
  assert.equal(r.bad, false);
  const dx = hullOf(v, hull).cx - 25, dz = hullOf(v, hull).cz;
  const d = Math.abs(dx * Math.cos(Math.PI / 4) + dz * -Math.sin(Math.PI / 4)); // Abstand zur Wandmitte (Normale = f der Wand)
  assert.ok(d > 0.5 - 0.05, `Wand durchdrungen: ${d}`);
});

test('Höhenfilter: Hindernis auf anderer Ebene wird ignoriert', () => {
  const g = new SpatialGrid(16);
  g.addBox(20, 0, 0.5, 20, 0, 8, 12); // Brückenbrüstung in 8–12 m Höhe
  const v = car(20);
  let hits = 0;
  for (let i = 0; i < 2 / DT; i++) { v.step(DT, { throttle: 0.5 }); hits += collideStatic(v, hull, g, { yCar: 0 }).length; }
  assert.equal(hits, 0);
  assert.ok(v.x > 30);
});
