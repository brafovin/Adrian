import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCar, run, kmh, DT } from './sim.mjs';
import { CAR_ORDER } from '../js/cars/specs.js';

const IDS = CAR_ORDER;
const full = () => ({ throttle: 1, brake: 0, steer: 0, handbrake: 0 });

test('Beschleunigung 0–100 km/h liegt für alle Fahrzeuge im plausiblen Bereich', () => {
  for (const id of IDS) {
    const v = makeCar(id);
    let t100 = null;
    run(v, 12, full, {}, (t, c) => { if (t100 === null && kmh(c) >= 100) t100 = t; });
    assert.ok(t100 !== null, `${id}: erreicht 100 km/h nicht`);
    assert.ok(t100 > 3.2 && t100 < 6.0, `${id}: 0–100 in ${t100.toFixed(2)} s`);
  }
});

test('Höchstgeschwindigkeit wird erreicht und begrenzt', () => {
  const want = { cls63: [250, 301], rs7: [250, 306], i7: [235, 252], g63: [225, 252] };
  for (const id of IDS) {
    const v = makeCar(id);
    run(v, 45, full);
    const k = kmh(v);
    assert.ok(k > want[id][0] && k < want[id][1], `${id}: Spitze ${k.toFixed(0)} km/h`);
  }
});

test('Bremsen aus 100 km/h: Bremsweg < 45 m, Fahrzeug bleibt in der Spur', () => {
  for (const id of IDS) {
    const v = makeCar(id);
    v.u = 100 / 3.6; for (let i = 0; i < 4; i++) v.omega[i] = v.u / v.R;
    let d = 0, maxYaw = 0;
    run(v, 8, () => ({ throttle: 0, brake: 1, steer: 0 }), {}, (t, c) => { if (c.u > 0.1) d += c.u * DT; maxYaw = Math.max(maxYaw, Math.abs(c.w)); });
    assert.ok(d < 45, `${id}: Bremsweg ${d.toFixed(1)} m`);
    assert.ok(maxYaw < 0.1, `${id}: bricht beim Bremsen aus (${maxYaw})`);
  }
});

test('Kurvenfahrt: Querbeschleunigung ca. 0,7–1,2 g, stabil', () => {
  for (const id of IDS) for (const sp of [60, 100]) {
    const v = makeCar(id); v.u = sp / 3.6; for (let i = 0; i < 4; i++) v.omega[i] = v.u / v.R; v.gear = 5;
    run(v, 1, () => ({ throttle: 0.25, steer: 0 }));
    let maxBeta = 0;
    run(v, 5, () => ({ throttle: 0.2, steer: 1 }), {}, (t, c) => { maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(c.v, Math.abs(c.u)))); });
    assert.ok(Math.abs(v.gLat) > 0.6 && Math.abs(v.gLat) < 1.3, `${id} @${sp}: ${v.gLat.toFixed(2)} g`);
    assert.ok(maxBeta < (id === 'g63' ? 0.25 : 0.2), `${id} @${sp}: Schwimmwinkel ${(maxBeta * 57.3).toFixed(1)}°`);
  }
});

test('Stillstand: keine Eigenbewegung', () => {
  for (const id of IDS) {
    const v = makeCar(id);
    run(v, 10, () => ({ throttle: 0, brake: 0, steer: 0 }));
    assert.ok(Math.hypot(v.x, v.z) < 0.01, `${id}: rollt weg`);
    assert.ok(Math.abs(v.w) < 1e-3);
  }
});

test('Rückwärtsfahrt über die Bremse, Geschwindigkeit begrenzt', () => {
  for (const id of IDS) {
    const v = makeCar(id);
    run(v, 6, () => ({ throttle: 0, brake: 1 }));
    assert.ok(v.u < -3, `${id}: fährt nicht rückwärts (${v.u})`);
    assert.ok(-v.u * 3.6 < 45, `${id}: Rückwärtstempo ${(-v.u * 3.6).toFixed(0)} km/h`);
    run(v, 4, () => ({ throttle: 1, brake: 0 }));
    assert.ok(v.u > 1, `${id}: wechselt nicht wieder nach vorn`);
  }
});

test('Handbremse: Heck bricht aus, Auto lässt sich danach abfangen', () => {
  for (const id of ['cls63', 'rs7']) {
    const v = makeCar(id); v.u = 80 / 3.6; for (let i = 0; i < 4; i++) v.omega[i] = v.u / v.R; v.gear = 4;
    run(v, 0.3, () => ({ throttle: 0.3, steer: 0 }));
    const y0 = v.yaw;
    run(v, 1.2, () => ({ throttle: 0, steer: -1, handbrake: 1 }));
    assert.ok(Math.abs(v.yaw - y0) > 0.6, `${id}: dreht sich kaum (${(v.yaw - y0).toFixed(2)} rad)`);
    run(v, 6, () => ({ throttle: 0, steer: 0, handbrake: 0, brake: 0 }));
    assert.ok(Math.abs(v.w) < 0.05, `${id}: dreht weiter (${v.w})`);
  }
});

test('Manuelles Schalten', () => {
  const v = makeCar('rs7');
  run(v, 4, () => ({ throttle: 0.6 }), { auto: false });
  const g0 = v.gear;
  v.step(DT, { throttle: 0.6, shiftUp: true }, { auto: false });
  assert.equal(v.gear, g0 + 1);
  v.step(DT, { throttle: 0.6, shiftDown: true }, { auto: false });
  assert.equal(v.gear, g0);
});

test('Zufallseingaben: nie NaN, Geschwindigkeit bleibt physikalisch', () => {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const id of IDS) {
    const v = makeCar(id);
    let thr = 0, brk = 0, st = 0, hb = 0;
    run(v, 40, (t) => {
      if (Math.floor(t * 4) !== Math.floor((t - DT) * 4)) { thr = r() < 0.6 ? r() : 0; brk = r() < 0.2 ? r() : 0; st = (r() - 0.5) * 2; hb = r() < 0.1 ? 1 : 0; }
      return { throttle: thr, brake: brk, steer: st, handbrake: hb };
    }, { assist: 1 }, (t, c) => {
      if (![c.x, c.z, c.u, c.v, c.w, ...c.omega].every(Number.isFinite)) assert.fail(`${id}: NaN bei t=${t}`);
      assert.ok(Math.abs(c.u) < 120 && Math.abs(c.v) < 120, `${id}: unphysikalisch ${c.u}`);
    });
  }
});

test('Elektro-Fahrzeug: Rekuperation bremst beim Gaswegnehmen', () => {
  const v = makeCar('i7'); v.u = 30; for (let i = 0; i < 4; i++) v.omega[i] = v.u / v.R;
  run(v, 2, () => ({ throttle: 0, brake: 0 }));
  assert.ok(v.u < 28.5, `keine Rekuperation (${v.u})`);
});
