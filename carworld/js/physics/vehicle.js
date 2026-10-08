// Fahrdynamik: Einspur-/Vierrad-Modell in der Ebene (reines JS, ohne Three.js, damit testbar).
//
// Koordinaten: Welt x/z (y = oben). Fahrtrichtung f = (cos yaw, -sin yaw), links l = (-sin yaw, -cos yaw).
// Im Fahrzeugsystem: u = Längsgeschwindigkeit (vorwärts +), v = Quergeschwindigkeit (links +),
// w = Gierrate (links drehen +). Lenkwinkel steer > 0 = nach links.

import { clamp, lerp, smoothstep, table } from '../util.js';

const G = 9.81;
const RHO = 1.2;

/** Reifenkennlinie: 1 beim Haftungsmaximum (s = 1), danach Abfall auf (1 - fall). */
function tireShape(s, fall) {
  if (s < 1) return s * (2 - s);
  return 1 - fall * (1 - Math.exp(-(s - 1) * 2.2));
}

export class Vehicle {
  constructor(spec) {
    this.spec = spec;
    const s = spec;
    this.m = s.mass;
    this.Iz = s.yawInertia;
    this.L = s.wheelbase;
    this.b = s.wheelbase * s.weightFront; // Schwerpunkt -> Hinterachse
    this.a = s.wheelbase - this.b; // Schwerpunkt -> Vorderachse
    this.h = s.cgHeight;
    this.R = s.wheelRadius;
    this.tx = [this.a, this.a, -this.b, -this.b];
    this.ty = [s.trackF / 2, -s.trackF / 2, s.trackR / 2, -s.trackR / 2];
    this.engineTorque = table(s.engine.torque);
    this.gears = s.trans.gears;
    this.ev = !!s.ev;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.u = 0; this.v = 0; this.w = 0;
    this.omega = [0, 0, 0, 0];
    this.spin = [0, 0, 0, 0];
    this.steerAngle = 0;
    this.dir = 1; // 1 vorwärts, -1 rückwärts
    this.gear = 1;
    this.rpm = this.spec.engine.idle;
    this.shiftTimer = 0;
    this.shiftCool = 0;
    this.axF = 0; this.ayF = 0; // gefilterte Beschleunigungen (m/s²) für Lastverlagerung
    this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0;
    this.fz = [0, 0, 0, 0];
    this.kappa = [0, 0, 0, 0];
    this.alpha = [0, 0, 0, 0];
    this.slipAmt = [0, 0, 0, 0]; // 0..>1 (1 = Haftgrenze)
    this.absActive = false;
    this.escActive = false;
    this.throttleOut = 0;
    this.brakeOut = 0;
    this.limiter = false;
    this.travel = [0, 0, 0, 0]; // Federweg (m, + = eingefedert), nur Optik
    this.y = 0; this.vy = 0; this.airborne = false;
    this.gLong = 0; this.gLat = 0;
  }

  get speed() { return this.u; } // m/s (vorzeichenbehaftet)
  get speedKmh() { return Math.abs(this.u) * 3.6; }
  get fwd() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }
  get left() { return [-Math.sin(this.yaw), -Math.cos(this.yaw)]; }

  worldVelocity() {
    const f = this.fwd, l = this.left;
    return [f[0] * this.u + l[0] * this.v, f[1] * this.u + l[1] * this.v];
  }
  setWorldVelocity(vx, vz) {
    const f = this.fwd, l = this.left;
    this.u = vx * f[0] + vz * f[1];
    this.v = vx * l[0] + vz * l[1];
  }
  /** Weltposition eines Fahrzeugpunkts (lx vorwärts, ly links). */
  toWorld(lx, ly) {
    const f = this.fwd, l = this.left;
    return [this.x + f[0] * lx + l[0] * ly, this.z + f[1] * lx + l[1] * ly];
  }

  // ---------------------------------------------------------------- Getriebe
  _gearRatio(g) { return this.gears[clamp(g, 1, this.gears.length) - 1] * this.spec.trans.final; }

  _autoShift(dt, thr, rpmWheel) {
    const s = this.spec, e = s.engine, n = this.gears.length;
    this.shiftCool -= dt;
    if (this.dir < 0 || this.shiftCool > 0 || n === 1) return;
    const up = lerp(0.58, 0.93, thr) * e.redline;
    const down = lerp(0.2, 0.42, thr) * e.redline;
    if (rpmWheel > up && this.gear < n && this.speedKmh > 5) {
      this._doShift(this.gear + 1);
    } else if (this.gear > 1) {
      const lowerRpm = rpmWheel * (this._gearRatio(this.gear - 1) / this._gearRatio(this.gear));
      const kick = thr > 0.85 && lowerRpm < 0.86 * e.redline && rpmWheel < 0.7 * e.redline;
      if (rpmWheel < down || kick) this._doShift(this.gear - 1);
    }
  }
  _doShift(g) {
    this.gear = clamp(g, 1, this.gears.length);
    this.shiftTimer = this.spec.trans.shiftTime;
    this.shiftCool = 0.45;
  }

  // ---------------------------------------------------------------- Reifen
  _tire(kappa, tanA, fz, mu, pk, ap) {
    const kh = kappa / pk.slipRatio, ah = tanA / pk.slipAngle;
    const s = Math.hypot(kh, ah);
    if (s < 1e-7 || fz <= 0) return [0, 0, s];
    const f = tireShape(s, pk.fall) * mu * fz;
    return [(f * kh) / s, (-f * ah) / s, s];
  }

  /**
   * Ein Simulationsschritt.
   * inp: {throttle 0..1, brake 0..1, steer -1..1 (+ = rechts), handbrake 0..1, shiftUp, shiftDown, reverse}
   * env: {slopeF, slopeL (Steigung in Fahrt-/Linksrichtung, m/m), grip (Faktor), assist 0..2, auto (bool)}
   */
  step(dt, inp, env = {}) {
    const s = this.spec, e = s.engine, t = s.trans, R = this.R;
    const grip = env.grip ?? 1;
    const assist = env.assist ?? 1;
    const auto = env.auto ?? true;
    const u = this.u, v = this.v, w = this.w;
    const speed = Math.hypot(u, v);

    // ---- Pedale und Fahrtrichtung
    const thrIn = clamp(inp.throttle || 0, 0, 1);
    const brkIn = clamp(inp.brake || 0, 0, 1);
    const hb = clamp(inp.handbrake || 0, 0, 1);
    let thr = thrIn, brk = brkIn;
    if (auto) {
      // Stillstand + Bremse gehalten -> Rückwärtsgang; Gas im Stand/rückwärts -> wieder vorwärts
      if (this.dir > 0 && u < 0.7 && brkIn > 0.05 && thrIn < 0.05) this.dir = -1;
      else if (this.dir < 0 && ((thrIn > 0.05 && u > -0.7) || u > 0.5)) this.dir = 1;
      if (this.dir < 0) { thr = brkIn; brk = thrIn; } // S = Gas rückwärts, W = Bremse
      else if (u < -0.7 && thrIn > 0.05) { brk = Math.max(brkIn, thrIn); thr = 0; } // rückwärts rollend: erst bremsen
    } else {
      if (inp.shiftUp) this._doShift(this.gear + 1);
      if (inp.shiftDown) this._doShift(this.gear - 1);
      this.dir = inp.reverse ? -1 : 1;
    }
    // Traktionskontrolle: bei durchdrehenden Antriebsrädern Gas zurücknehmen
    if (assist > 0 && thr > 0.05) {
      let kmax = 0;
      for (let i = 0; i < 4; i++) {
        const driven = (i < 2 ? s.drive.front : 1 - s.drive.front) > 0.05;
        if (driven) kmax = Math.max(kmax, this.kappa[i] * this.dir);
      }
      const lim = assist === 1 ? 0.2 : 0.14;
      if (kmax > lim) thr *= clamp(1 - (kmax - lim) / 0.12, 0.25, 1);
    }
    this.throttleOut = thr;
    this.brakeOut = brk;

    // ---- Lenkung (geschwindigkeitsabhängig, nach Traktionsgrenze begrenzt)
    const aLatMax = s.tire.mu * G * grip;
    const vAbs = Math.max(Math.abs(u), 0.1);
    const gripLimit = (1.7 * this.L * aLatMax) / (vAbs * vAbs + 4);
    const lock = clamp(gripLimit, s.steer.minLock, s.steer.maxLock);
    const target = -clamp(inp.steer || 0, -1, 1) * lock;
    const rate = (Math.abs(target) > Math.abs(this.steerAngle) ? s.steer.rate : s.steer.returnRate) * (1 + 0.5 * smoothstep(5, 30, Math.abs(u)));
    const dSteer = clamp(target - this.steerAngle, -rate * dt, rate * dt);
    this.steerAngle += dSteer;
    // Begrenzung, falls die Haftgrenze (Geschwindigkeit) gesunken ist
    this.steerAngle = clamp(this.steerAngle, -lock, lock);
    const del = this.steerAngle;
    // Ackermann: Innenrad schlägt etwas stärker ein
    const ack = this.L > 0 ? (s.trackF / 2) / this.L : 0;
    const delL = Math.atan2(Math.tan(del), 1 - ack * Math.tan(del)); // linkes Rad
    const delR = Math.atan2(Math.tan(del), 1 + ack * Math.tan(del));
    const steerW = [delL, delR, 0, 0];

    // ---- Lasten (statisch + Längs-/Querverlagerung + Abtrieb)
    const q = 0.5 * RHO * u * u;
    const down = q * s.aero.clA;
    const downF = down * s.aero.balance, downR = down - downF;
    const dFzLong = (this.m * this.axF * this.h) / this.L;
    const fzF = clamp((this.m * G * this.b) / this.L - dFzLong + downF, 0, 1e6);
    const fzR = clamp((this.m * G * this.a) / this.L + dFzLong + downR, 0, 1e6);
    const rollShareF = s.rollDistF ?? 0.55;
    const dLatF = (this.m * this.ayF * this.h * rollShareF) / s.trackF;
    const dLatR = (this.m * this.ayF * this.h * (1 - rollShareF)) / s.trackR;
    // ay > 0 = Beschleunigung nach links -> Last auf die rechten Räder
    const fz = [
      clamp(fzF / 2 - dLatF, 0, 1e6), clamp(fzF / 2 + dLatF, 0, 1e6),
      clamp(fzR / 2 - dLatR, 0, 1e6), clamp(fzR / 2 + dLatR, 0, 1e6),
    ];
    this.fz = fz;

    // ---- Antrieb
    const driveFront = s.drive.front; // Anteil des Moments auf die Vorderachse
    let omegaDrv = 0, wsum = 0;
    for (let i = 0; i < 4; i++) {
      const wgt = i < 2 ? driveFront : 1 - driveFront;
      omegaDrv += Math.abs(this.omega[i]) * wgt * 0.5;
      wsum += wgt * 0.5;
    }
    omegaDrv = wsum > 0 ? omegaDrv / wsum : 0;
    let omegaSigned = 0; // vorzeichenbehaftete Drehzahl der Antriebsräder (für die Richtung der Motorbremse)
    for (let i = 0; i < 4; i++) omegaSigned += this.omega[i] * (i < 2 ? driveFront : 1 - driveFront) * 0.5;
    const ratio = this._gearRatio(this.gear) * (this.dir < 0 ? t.reverse / this.gears[0] : 1);
    const rpmWheel = (omegaDrv * ratio * 60) / (2 * Math.PI);
    if (auto && !this.ev) this._autoShift(dt, thr, rpmWheel);
    const launch = e.launchRpm ?? 2600;
    const clutchSlip = !this.ev && (this.gear === 1 || this.dir < 0) && rpmWheel < launch;
    let rpmEng = this.ev ? Math.max(rpmWheel, e.idle) : clutchSlip ? Math.max(rpmWheel, lerp(e.idle, launch, thr)) : Math.max(rpmWheel, e.idle);
    rpmEng = Math.min(rpmEng, e.limiter + 300);
    this.rpm += (rpmEng - this.rpm) * Math.min(1, 14 * dt);
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);

    let torque = 0;
    this.limiter = false;
    if (this.shiftTimer <= 0) {
      const tq = this.engineTorque(rpmEng);
      if (rpmEng >= e.limiter) { this.limiter = thr > 0.1; torque = 0; }
      else torque = tq * thr;
      if (thr < 0.05) {
        const eb = this.ev ? (s.regen ?? 0) * Math.min(1, speed) : (e.brakeTorque ?? 80) * (rpmEng / e.redline) * smoothstep(0, 900, rpmWheel);
        torque = -eb * (omegaSigned * this.dir >= 0 ? 1 : -1); // bremst immer gegen die Raddrehung
      }
      // Geschwindigkeitsbegrenzer
      const vmax = s.vmax ?? 80;
      if (this.dir > 0 && u > vmax * 0.985 && torque > 0) torque *= clamp((vmax - u) / (vmax * 0.015), 0, 1);
      const vrev = s.vmaxReverse ?? 11; // Rückwärtsgang ist begrenzt (~40 km/h)
      if (this.dir < 0 && -u > vrev * 0.9 && torque > 0) torque *= clamp((vrev - -u) / (vrev * 0.1), 0, 1);
    }
    const wheelTq = torque * ratio * t.eff * this.dir;

    const tDrive = [0, 0, 0, 0];
    const lsd = s.drive.lock ?? 60;
    const fT = wheelTq * driveFront, rT = wheelTq * (1 - driveFront);
    const biasF = clamp(lsd * (this.omega[0] - this.omega[1]), -0.35 * Math.abs(fT) - 1, 0.35 * Math.abs(fT) + 1);
    const biasR = clamp(lsd * (this.omega[2] - this.omega[3]), -0.35 * Math.abs(rT) - 1, 0.35 * Math.abs(rT) + 1);
    tDrive[0] = fT / 2 - biasF; tDrive[1] = fT / 2 + biasF;
    tDrive[2] = rT / 2 - biasR; tDrive[3] = rT / 2 + biasR;

    // ---- Bremsen (ABS-ähnlich) und Handbremse
    const bT = [0, 0, 0, 0];
    const bF = s.brake.front * brk, bR = s.brake.rear * brk;
    this.absActive = false;
    for (let i = 0; i < 4; i++) {
      let tb = (i < 2 ? bF : bR);
      if (brk > 0 && assist > 0) {
        const k = this.kappa[i];
        if (k < -0.13 && Math.abs(u) > 3) { // blockiert -> Bremsdruck zurücknehmen
          tb *= clamp(1 - (-k - 0.13) / 0.07, 0.15, 1);
          this.absActive = true;
        }
      }
      bT[i] = tb;
    }
    if (hb > 0) { bT[2] = Math.max(bT[2], s.brake.hand * hb); bT[3] = Math.max(bT[3], s.brake.hand * hb); }

    // ---- Reifenkräfte
    const fxB = [0, 0, 0, 0], fyB = [0, 0, 0, 0];
    let Fx = 0, Fy = 0, Mz = 0;
    let slipMax = 0;
    const tr = s.tire;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const c = Math.cos(steerW[i]), sn = Math.sin(steerW[i]);
      const vcx = u - w * this.ty[i];
      const vcy = v + w * this.tx[i];
      const vl = c * vcx + sn * vcy; // in Radrichtung
      const vt = -sn * vcx + c * vcy; // quer (links +)
      const vlAbs = Math.abs(vl);
      const kappa = clamp((this.omega[i] * R - vl) / Math.max(vlAbs, 1.2), -1.5, 1.5);
      const tanA = vt / Math.sqrt(vl * vl + 2.2 * 2.2);
      this.kappa[i] = kappa;
      this.alpha[i] = Math.atan(tanA);
      const mu0 = (front ? tr.mu : tr.muRear ?? tr.mu) * grip;
      const load0 = (this.m * G) / 4;
      const mu = mu0 * clamp(1 - tr.loadSens * (fz[i] / load0 - 1), 0.6, 1.3);
      const pk = tr;
      let [fl, ft, sMag] = this._tire(kappa, tanA, fz[i], mu, pk);
      this.slipAmt[i] = sMag;
      slipMax = Math.max(slipMax, sMag);

      // Raddynamik (implizit linearisiert, damit niedrige Geschwindigkeiten stabil bleiben)
      const dk = 0.02;
      const [fl2] = this._tire(kappa + dk, tanA, fz[i], mu, pk);
      const dFdw = Math.max(0, (fl2 - fl) / dk) * R / Math.max(vlAbs, 1.2); // dFx/d(omega)
      const share = i < 2 ? s.drive.front : 1 - s.drive.front;
      const Iw = s.wheelInertia + ((e.inertia ?? 0.25) * ratio * ratio * share) / 2;
      let dw = (dt * (tDrive[i] - fl * R)) / Iw / (1 + (dt * R * dFdw) / Iw);
      let om = this.omega[i] + dw;
      // Bremse: wirkt nur gegen die Drehung, kann sie nicht umkehren
      if (bT[i] > 0) {
        const dec = (dt * bT[i]) / Iw;
        if (Math.abs(om) <= dec) om = 0; else om -= Math.sign(om) * dec;
      }
      this.omega[i] = om;

      // Kraft ins Fahrzeugsystem
      const fxb = fl * c - ft * sn;
      const fyb = fl * sn + ft * c;
      fxB[i] = fxb; fyB[i] = fyb;
      Fx += fxb; Fy += fyb;
      Mz += this.tx[i] * fyb - this.ty[i] * fxb;
      this.spin[i] += om * dt;
    }

    // ---- Luftwiderstand, Rollwiderstand, Hangabtrieb
    const speedS = Math.hypot(u, v);
    const cdA = s.aero.cdA;
    Fx -= 0.5 * RHO * cdA * Math.abs(u) * u;
    Fy -= 0.5 * RHO * cdA * 2.2 * Math.abs(v) * v;
    Fx -= s.rolling * this.m * G * Math.tanh(u * 1.5);
    Fy -= s.rolling * 2 * this.m * G * Math.tanh(v * 1.5);
    if (env.slopeF !== undefined) {
      Fx -= this.m * G * env.slopeF;
      Fy -= this.m * G * (env.slopeL || 0);
    }

    // ---- Stabilitätshilfe (ESC-ähnlich): dämpft ungewolltes Übersteuern
    this.escActive = false;
    if (assist > 0 && hb < 0.1 && Math.abs(u) > 4) {
      const wDes = (u * Math.tan(del)) / (this.L * (1 + (u * u) / (s.steer.charSpeed * s.steer.charSpeed)));
      const beta = Math.atan2(v, Math.abs(u));
      let err = w - wDes;
      // nur eingreifen, wenn das Heck deutlich ausbricht (Gierrate größer als gewollt und Schwimmwinkel)
      const over = Math.abs(beta) > 0.12 && Math.sign(beta) * w > Math.sign(beta) * wDes + 0.05;
      if (over || Math.abs(beta) > 0.35) {
        const gain = assist === 1 ? 0.55 : 1.0;
        const mz = clamp(-err * gain * this.Iz * 2.4 - beta * gain * this.Iz * 3.0, -0.9 * this.Iz * 3.2, 0.9 * this.Iz * 3.2);
        Mz += mz;
        this.escActive = true;
      }
    }

    // ---- Integration
    const du = Fx / this.m + w * v;
    const dv = Fy / this.m - w * u;
    const dwdt = Mz / this.Iz;
    this.u += du * dt;
    this.v += dv * dt;
    this.w += dwdt * dt;

    // Standhaltekraft: kleine Reste bei Stillstand sauber ausrollen lassen
    if (Math.abs(this.u) < 0.35 && thr < 0.02 && (brk > 0.02 || hb > 0.1 || Math.abs(this.v) < 0.5)) {
      const k = Math.exp(-6 * dt);
      this.u *= k; this.v *= k; this.w *= Math.exp(-5 * dt);
      for (let i = 0; i < 4; i++) this.omega[i] *= Math.exp(-8 * dt);
    }

    // Position
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wx = cy * this.u - sy * this.v;
    const wz = -sy * this.u - cy * this.v;
    this.x += wx * dt;
    this.z += wz * dt;
    this.yaw += this.w * dt;

    // ---- Fahrwerk (nur Optik): Nicken/Wanken folgen den Beschleunigungen
    const axM = Fx / this.m, ayM = Fy / this.m;
    this.axF += (axM - this.axF) * Math.min(1, 9 * dt);
    this.ayF += (ayM - this.ayF) * Math.min(1, 9 * dt);
    this.gLong = this.axF / G; this.gLat = this.ayF / G;
    const sus = s.susp;
    const pitchT = this.axF * sus.pitchGain;
    const rollT = this.ayF * sus.rollGain;
    const kS = sus.freq * sus.freq, cS = 2 * sus.damping * sus.freq;
    this.pitchV += (kS * (pitchT - this.pitch) - cS * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += (kS * (rollT - this.roll) - cS * this.rollV) * dt;
    this.roll += this.rollV * dt;
    for (let i = 0; i < 4; i++) {
      const stat = (this.m * G) / 4;
      this.travel[i] += ((fz[i] - stat) / sus.wheelRate - this.travel[i]) * Math.min(1, 16 * dt);
    }
  }
}

/**
 * Tuning-Werte, die in allen Autos gleich sind. Pro Auto überschreibbar.
 */
export const BASE_TIRE = {
  mu: 1.12, muRear: 1.16, slipRatio: 0.12, slipAngle: 0.15, fall: 0.2, loadSens: 0.14,
};
