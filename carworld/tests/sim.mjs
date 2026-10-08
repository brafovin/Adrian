// Hilfsfunktionen für Fahrphysik-Tests (Node, ohne Browser).
import { Vehicle } from '../js/physics/vehicle.js';
import { SPECS } from '../js/cars/specs.js';

export const DT = 1 / 240;
export function makeCar(id) { const v = new Vehicle(SPECS[id]); v.reset(0, 0, 0); return v; }
export function run(v, seconds, inputFn, env = {}, cb) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    v.step(DT, inputFn(t, v), env);
    if (cb) cb(t, v);
  }
}
export const kmh = (v) => v.u * 3.6;
