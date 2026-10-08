// Spieler-Fahrzeug: verbindet Fahrphysik, Kollisionen, Bodenfolge (Hänge, Rampen, Brücken) und das 3D-Modell.

import * as THREE from 'three';
import { Vehicle } from './physics/vehicle.js';
import { SPECS } from './cars/specs.js';
import { collideStatic, hullOf } from './physics/collision.js';
import { clamp, damp, smoothstep } from './util.js';

const STEP = 1 / 240;

export class Player {
  constructor(model, world) {
    this.world = world;
    this.setModel(model);
    this.lightsMode = 'auto'; // 'auto' | 'on' | 'off'
    this.manual = false;
    this.assist = 1;
    this.accum = 0;
    this.impacts = [];
    this.air = false;
    this.vy = 0;
    this.pitchG = 0; this.rollG = 0;
    this.skid = 0;
    this.distance = 0;
    this.scratch = [];
  }

  setModel(model) {
    this.model = model;
    const spec = SPECS[model.id];
    this.spec = spec;
    const keep = this.vehicle;
    this.vehicle = new Vehicle(spec);
    const l = model.def.loft;
    this.hull = { hl: (l.x1 - l.x0) / 2 - 0.05, hw: model.dims.width / 2 - 0.07, off: (l.x0 + l.x1) / 2 - model.cgX };
    this.y = 0;
    if (keep) this.vehicle.reset(keep.x, keep.z, keep.yaw);
  }

  /** Auto auf die Straße stellen. */
  reset(x, z, yaw) {
    const v = this.vehicle;
    v.reset(x, z, yaw);
    this.y = this.world.height(x, z, 50, 0.7);
    this.vy = 0; this.air = false; this.pitchG = 0; this.rollG = 0;
    this.impacts.length = 0;
    this.apply();
  }

  /** Radkontaktpunkte in Weltkoordinaten. */
  _wheelPos(i) { return this.vehicle.toWorld(this.vehicle.tx[i], this.vehicle.ty[i]); }

  get lightsOn() { return this.lightsMode === 'on'; }

  step(dt, input, opts = {}) {
    const v = this.vehicle;
    this.accum = Math.min(this.accum + dt, 0.1);
    this.impacts.length = 0;
    const world = this.world;

    // Boden unter den vier Rädern (einmal pro Frame)
    const hp = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) { const [wx, wz] = this._wheelPos(i); hp[i] = world.height(wx, wz, this.y + 0.35, 0.55); }
    const hF = (hp[0] + hp[1]) / 2, hR = (hp[2] + hp[3]) / 2, hL = (hp[0] + hp[2]) / 2, hRt = (hp[1] + hp[3]) / 2;
    const wb = v.L, tr = (this.spec.trackF + this.spec.trackR) / 2;
    const groundY = (hF * v.b + hR * v.a) / v.L; // Höhe unter dem Schwerpunkt (Interpolation zwischen den Achsen)
    const slopeF = (hF - hR) / wb, slopeL = (hL - hRt) / tr;
    const targetPitch = Math.atan(slopeF), targetRoll = -Math.atan((hRt - hL) / tr);
    this.pitchG = damp(this.pitchG, targetPitch, 18, dt);
    this.rollG = damp(this.rollG, targetRoll, 18, dt);

    // Vertikale Bewegung: am Boden folgen, bei fehlendem Boden frei fallen
    if (this.air) {
      this.vy -= 9.81 * dt;
      this.y += this.vy * dt;
      if (this.y <= groundY) {
        const hit = -this.vy;
        this.y = groundY;
        this.vy = 0; this.air = false;
        if (hit > 2.5) { this.impacts.push({ speed: hit, vertical: true }); v.pitchV -= hit * 0.35; }
      }
    } else {
      const dy = groundY - this.y;
      const vyEst = dy / Math.max(dt, 1e-3);
      if (vyEst < -5.5 && Math.abs(v.u) > 2) { this.air = true; this.vy = clamp(this._vyPrev || 0, -2, 12); }
      else { this.y += clamp(dy, -0.5, 0.5) * Math.min(1, 38 * dt); this._vyPrev = clamp(dy / Math.max(dt, 1e-3), -10, 14) * 0.9; }
    }

    const env = { slopeF: this.air ? 0 : slopeF, slopeL: this.air ? 0 : slopeL, grip: this.air ? 0.02 : (opts.grip ?? 1), assist: this.assist, auto: !this.manual };
    const inp = { ...input };
    // Schaltwünsche gelten nur einmal pro Frame
    const sUp = opts.shiftUp, sDn = opts.shiftDown;
    inp.shiftUp = sUp; inp.shiftDown = sDn;
    let first = true;
    while (this.accum >= STEP) {
      if (!first) { inp.shiftUp = false; inp.shiftDown = false; }
      first = false;
      v.step(STEP, inp, env);
      const hits = collideStatic(v, this.hull, world.grid, { yCar: this.y, scratch: this.scratch });
      for (const h of hits) this.impacts.push(h);
      opts.traffic?.collide(v, this.hull, this.impacts, this.y);
      this.accum -= STEP;
    }
    // Weltgrenze: sanft zurückdrängen
    const R = opts.bound ?? 3000;
    const d = Math.hypot(v.x, v.z);
    if (d > R) { const k = (d - R) * 0.002; v.x -= (v.x / d) * k * dt * 60; v.z -= (v.z / d) * k * dt * 60; }
    this.distance += Math.abs(v.u) * dt;
    // Reifenquietschen: stärkster Schlupf der Räder
    let sk = 0;
    for (let i = 0; i < 4; i++) sk = Math.max(sk, v.slipAmt[i]);
    const speedK = smoothstep(2, 9, Math.hypot(v.u, v.v));
    this.skid = damp(this.skid, clamp((sk - 1.0) * 1.4, 0, 1) * speedK, 14, dt);
    this.apply();
    return this.impacts;
  }

  /** Physik -> 3D-Modell. */
  apply() {
    const v = this.vehicle, m = this.model;
    const f = v.fwd;
    m.root.position.set(v.x - f[0] * m.cgX, this.y, v.z - f[1] * m.cgX);
    m.root.rotation.set(this.rollG, v.yaw, this.pitchG, 'YZX');
    // Lenkwinkel je Rad (Ackermann) für die Optik
    const ack = (this.spec.trackF / 2) / v.L, t = Math.tan(v.steerAngle);
    v._steerL = Math.atan2(t, 1 - ack * t);
    v._steerR = Math.atan2(t, 1 + ack * t);
    m.update(v);
  }

  /** Lichter anhand von Zustand und Tageszeit. */
  updateLights(todLights, reverse) {
    const v = this.vehicle;
    const on = this.lightsMode === 'on' || (this.lightsMode === 'auto' && todLights > 0.28);
    const brake = (v.brakeOut > 0.05 && this.vehicle.dir > 0) || (this.vehicle.dir < 0 && v.throttleOut < 0.01 && v.brakeOut > 0.05) ? 1 : 0;
    this.model.setLights({ head: on ? 1 : 0, brake, reverse: v.dir < 0 && Math.abs(v.u) > 0.05 ? 1 : 0 });
    this.headOn = on;
  }

  get gearLabel() {
    const v = this.vehicle;
    if (v.ev) return v.dir < 0 ? 'R' : Math.abs(v.u) < 0.3 ? 'P' : 'D';
    if (v.dir < 0) return 'R';
    if (Math.abs(v.u) < 0.2 && v.throttleOut < 0.02) return this.manual ? 'N' : 'D';
    return String(v.gear);
  }

  get info() {
    const v = this.vehicle;
    return {
      kmh: Math.abs(v.u) * 3.6, gear: this.gearLabel, rpm: v.rpm, rpmFrac: v.rpm / v.spec.engine.redline, throttle: v.throttleOut, ev: v.ev,
      gLat: v.gLat, gLong: v.gLong, skid: this.skid, abs: v.absActive, esc: v.escActive, limiter: v.limiter,
    };
  }
}
