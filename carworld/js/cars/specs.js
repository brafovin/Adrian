// Physik-Daten der vier Fahrzeuge (SI-Einheiten). Reine Daten, keine Abhängigkeit von Three.js.
// Die Werte orientieren sich an den Serienfahrzeugen (Masse, Radstand, Leistung, Getriebe) und sind
// auf ein gut kontrollierbares Fahrverhalten abgestimmt. Optik/Geometrie steht in den eigenen Dateien je Auto.

import { BASE_TIRE } from '../physics/vehicle.js';

const base = {
  rolling: 0.013,
  rollDistF: 0.55,
  steer: { maxLock: 0.56, minLock: 0.03, rate: 1.5, returnRate: 2.4, charSpeed: 24 },
  susp: { pitchGain: 0.0034, rollGain: 0.0042, freq: 9, damping: 0.55, wheelRate: 70000 },
  trans: { eff: 0.92, shiftTime: 0.2 },
};

function mk(o) {
  const m = o.mass;
  return {
    ...base,
    ...o,
    yawInertia: o.yawInertia ?? m * (o.wheelbase * o.weightFront) * (o.wheelbase * (1 - o.weightFront)) * 1.15,
    tire: { ...BASE_TIRE, ...(o.tire || {}) },
    steer: { ...base.steer, ...(o.steer || {}) },
    susp: { ...base.susp, ...(o.susp || {}) },
    trans: { ...base.trans, ...(o.trans || {}) },
  };
}

export const SPECS = {
  // Mercedes-AMG CLS 63 S 4MATIC+ (C218-Optik), Widebody. 5,5 l V8 Biturbo, 585 PS.
  cls63: mk({
    id: 'cls63', name: 'Mercedes-AMG CLS 63 S', mass: 1900, wheelbase: 2.95, weightFront: 0.55, cgHeight: 0.52,
    trackF: 1.70, trackR: 1.69, wheelRadius: 0.335, wheelInertia: 1.6,
    drive: { front: 0.31, lock: 90 },
    engine: { idle: 750, redline: 6300, limiter: 6550, launchRpm: 3000, inertia: 0.22, brakeTorque: 110,
      torque: [[600, 200], [1000, 330], [1500, 640], [1900, 800], [4000, 800], [5000, 790], [5500, 765], [6000, 710], [6500, 600], [7000, 300]] },
    trans: { gears: [4.38, 2.86, 1.92, 1.37, 1.0, 0.82, 0.73], reverse: 3.42, final: 2.82 },
    brake: { front: 2900, rear: 1800, hand: 3400 },
    aero: { cdA: 0.78, clA: 0.28, balance: 0.45 },
    vmax: 300 / 3.6,
    tire: { mu: 1.14, muRear: 1.18 },
    steer: { maxLock: 0.54 },
  }),

  // Audi RS 7 Sportback (C8-Optik), Widebody. 4,0 l V8 Biturbo, 600 PS, quattro.
  rs7: mk({
    id: 'rs7', name: 'Audi RS 7', mass: 2150, wheelbase: 2.93, weightFront: 0.56, cgHeight: 0.53,
    trackF: 1.72, trackR: 1.70, wheelRadius: 0.355, wheelInertia: 1.8,
    drive: { front: 0.4, lock: 110 },
    engine: { idle: 750, redline: 6600, limiter: 6800, launchRpm: 3000, inertia: 0.2, brakeTorque: 100,
      torque: [[600, 200], [1000, 330], [1600, 640], [2050, 800], [4500, 800], [5500, 745], [6000, 705], [6600, 610], [7000, 300]] },
    trans: { gears: [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667], reverse: 3.317, final: 3.2 },
    brake: { front: 3200, rear: 2000, hand: 3600 },
    aero: { cdA: 0.74, clA: 0.3, balance: 0.45 },
    vmax: 305 / 3.6,
    tire: { mu: 1.15, muRear: 1.19 },
  }),

  // BMW i7 M70 xDrive (G70-Optik), Widebody. Zwei E-Motoren, 660 PS / 1.100 Nm, Eingang-Untersetzung.
  i7: mk({
    id: 'i7', name: 'BMW i7', ev: true, mass: 2950, wheelbase: 3.21, weightFront: 0.5, cgHeight: 0.5,
    trackF: 1.72, trackR: 1.74, wheelRadius: 0.375, wheelInertia: 2.2,
    drive: { front: 0.42, lock: 120 },
    engine: { idle: 0, redline: 15000, limiter: 16000, launchRpm: 0, inertia: 0.12,
      torque: [[0, 1000], [4600, 1000], [6000, 770], [8000, 579], [10000, 463], [12000, 386], [14000, 330], [16000, 290], [17000, 0]] },
    trans: { gears: [9.0], reverse: 9.0, final: 1.0, eff: 0.94, shiftTime: 0 },
    regen: 190,
    brake: { front: 3900, rear: 2500, hand: 4200 },
    aero: { cdA: 0.78, clA: 0.3, balance: 0.46 },
    vmax: 250 / 3.6,
    tire: { mu: 1.1, muRear: 1.14 },
    susp: { pitchGain: 0.003, rollGain: 0.0036, wheelRate: 80000 },
  }),

  // Mercedes-AMG G 63 im Mansory-Stil. 4,0 l V8 Biturbo (getunt, ca. 850 PS), Allrad.
  g63: mk({
    id: 'g63', name: 'Mercedes-AMG G 63 Mansory', mass: 2650, wheelbase: 2.89, weightFront: 0.52, cgHeight: 0.8,
    trackF: 1.80, trackR: 1.80, wheelRadius: 0.41, wheelInertia: 3.0,
    drive: { front: 0.4, lock: 130 },
    engine: { idle: 750, redline: 6300, limiter: 6500, launchRpm: 2800, inertia: 0.25, brakeTorque: 130,
      torque: [[600, 250], [1000, 380], [1500, 700], [2200, 1000], [5000, 1000], [5500, 960], [6000, 900], [6500, 780], [7000, 300]] },
    trans: { gears: [5.35, 3.24, 2.25, 1.64, 1.21, 1.0, 0.86, 0.72, 0.6], reverse: 4.8, final: 3.9 },
    brake: { front: 4400, rear: 2800, hand: 4600 },
    aero: { cdA: 1.6, clA: 0.12, balance: 0.5 },
    vmax: 250 / 3.6,
    tire: { mu: 1.02, muRear: 1.05, slipAngle: 0.17 },
    steer: { maxLock: 0.6, charSpeed: 20 },
    susp: { pitchGain: 0.0045, rollGain: 0.0075, freq: 8, damping: 0.5, wheelRate: 85000 },
  }),
};

export const CAR_ORDER = ['cls63', 'rs7', 'i7', 'g63'];
