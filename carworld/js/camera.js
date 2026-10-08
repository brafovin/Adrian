// Kamera-Rig: Verfolger (nah/fern), Motorhaube, Cockpit, freie Orbit-Kamera.

import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, wrapPi } from './util.js';

export const CAM_MODES = ['chase', 'far', 'hood', 'cockpit'];
export const CAM_NAMES = { chase: 'Verfolger', far: 'Verfolger weit', hood: 'Motorhaube', cockpit: 'Cockpit', free: 'Freie Kamera' };

function blocked(grid, x, y, z, pad = 0.35) {
  const arr = grid.query(x, z, 3);
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (y < o.y0 || y > o.y1) continue;
    if (o.type === 1) { if (Math.hypot(x - o.cx, z - o.cz) < o.r + pad) return true; }
    else {
      const dx = x - o.cx, dz = z - o.cz;
      const lx = dx * o.cs - dz * o.sn, lz = -dx * o.sn - dz * o.cs;
      if (Math.abs(lx) < o.hx + pad && Math.abs(lz) < o.hz + pad) return true;
    }
  }
  return false;
}

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'chase';
    this.free = false; // Fotomodus
    this.yaw = 0; // Kamera-Blickrichtung (rad, wie Fahrzeug-yaw)
    this.yawOff = 0; this.pitchOff = 0.0; this.idle = 10;
    this.zoom = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.t = 0;
    this.fov = 62;
    this.inited = false;
    this.tmp = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.freeDist = 7;
  }

  cycle() {
    const i = CAM_MODES.indexOf(this.mode);
    this.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    this.free = false;
    return CAM_NAMES[this.mode];
  }

  togglePhoto() { this.free = !this.free; if (this.free) { this.yawOff = 0.6; this.pitchOff = 0.18; this.freeDist = 7; } return this.free; }

  impact(speed) { this.shake = Math.min(1.2, this.shake + clamp(speed / 22, 0.1, 1)); }

  snap(player) { this.inited = false; this.update(1, player, { lookX: 0, lookY: 0, zoom: 0, drag: false }, {}); }

  update(dt, player, input, opts = {}) {
    const cam = this.camera, v = player.vehicle, model = player.model;
    this.t += dt;
    const spd = Math.hypot(v.u, v.v);
    const speedK = smoothstep(2, 60, spd);
    const carPos = this.tmp.set(v.x, player.y, v.z);

    // Nutzereingaben (Maus/Stick)
    const stopped = spd < 1.0;
    const userLook = Math.abs(input.lookX) + Math.abs(input.lookY) > 0.002 || input.drag;
    if (userLook) this.idle = 0; else this.idle += dt;
    this.yawOff -= input.lookX;
    this.pitchOff = clamp(this.pitchOff + input.lookY * 0.8, -0.35, 1.1);
    this.zoom = clamp(this.zoom + input.zoom * 0.8, -3, 8);
    if (this.mode === 'cockpit' || this.mode === 'hood') this.yawOff = clamp(this.yawOff, -2.2, 2.2);
    const decays = !this.free && this.idle > 2.2 && !(stopped && this.idle < 30);
    if (decays) { this.yawOff = damp(this.yawOff, 0, 2.2, dt); this.pitchOff = damp(this.pitchOff, 0.0, 2.2, dt); this.zoom = damp(this.zoom, 0, 1.0, dt); }
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // Blickrichtung des Verfolgers: Fahrzeug-Kurs, bei Geschwindigkeit teilweise in Bewegungsrichtung (zeigt Drifts)
    const f = v.fwd;
    let target = v.yaw;
    if (spd > 5 && v.u > 0) {
      const [vx, vz] = v.worldVelocity();
      const va = Math.atan2(-vz, vx);
      target = v.yaw + clamp(wrapPi(va - v.yaw), -0.9, 0.9) * 0.65;
    }
    if (!this.inited) this.yaw = v.yaw;
    this.yaw += wrapPi(target - this.yaw) * (1 - Math.exp(-(spd > 2 ? 4.2 : 1.8) * dt));

    let fovT = 62;
    if (this.mode === 'cockpit' || this.mode === 'hood') {
      // Innenansicht: fest am Fahrzeug
      const eye = this.mode === 'cockpit' ? (model.interior?.userData.cockpitEye || [0.0, 1.1, -0.36]) : (model.def.cams?.hood || [model.dims.length * 0.1, 1.18, 0]);
      const local = new THREE.Vector3(eye[0], eye[1], eye[2]);
      // leichte Kopfbewegung durch Querbeschleunigung/Nicken
      local.z += clamp(v.ayF * 0.004, -0.05, 0.05); local.x += clamp(-v.axF * 0.003, -0.04, 0.04);
      model.root.updateMatrixWorld(true);
      const worldPos = model.root.localToWorld(local);
      cam.position.copy(worldPos);
      const yawLook = v.yaw + this.yawOff;
      const pitch = -this.pitchOff * 0.45 + player.pitchG * 0.5;
      const dir = new THREE.Vector3(Math.cos(yawLook) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yawLook) * Math.cos(pitch));
      // Leichtes Mitrollen mit der Karosserie
      cam.up.set(0, 1, 0).applyAxisAngle(dir, player.rollG * 0.6);
      cam.lookAt(cam.position.clone().add(dir));
      fovT = this.mode === 'cockpit' ? 72 + speedK * 6 : 66 + speedK * 8;
      cam.near = 0.04;
      this.pos.copy(cam.position);
      if (this.shake > 0) cam.position.y += Math.sin(this.t * 60) * 0.01 * this.shake;
    } else {
      cam.near = 0.15;
      cam.up.set(0, 1, 0);
      const far = this.mode === 'far';
      let dist, height, lookH;
      if (this.free) { dist = this.freeDist + this.zoom; height = 0; lookH = 0.7; }
      else { dist = (far ? 9.2 : 6.0) + speedK * (far ? 3.5 : 2.4) + this.zoom * 0.7; height = (far ? 2.6 : 1.55) + speedK * 0.5; lookH = far ? 1.1 : 0.95; }
      const yawC = (this.free ? v.yaw : this.yaw) + this.yawOff + (this.free ? 0 : clamp(input.steer || 0, -1, 1) * -0.06 * speedK);
      const pitch = this.free ? this.pitchOff : this.pitchOff * 0.7;
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const fx = Math.cos(yawC), fz = -Math.sin(yawC);
      const desired = new THREE.Vector3(
        carPos.x - fx * dist * cosP,
        carPos.y + height + dist * sinP + (this.free ? 1.0 : 0),
        carPos.z - fz * dist * cosP,
      );
      // Boden und Gebäude: Kamera darf nicht darunter/darin landen
      const gy = this.world.height(desired.x, desired.z, carPos.y + 4, 4) + 0.55;
      if (desired.y < gy) desired.y = gy;
      const origin = new THREE.Vector3(carPos.x, carPos.y + 1.2, carPos.z);
      const steps = 14;
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        const px = lerp(origin.x, desired.x, k), py = lerp(origin.y, desired.y, k), pz = lerp(origin.z, desired.z, k);
        if (blocked(this.world.grid, px, py, pz)) {
          const kk = Math.max(0.12, (s - 1.4) / steps);
          desired.set(lerp(origin.x, desired.x, kk), lerp(origin.y, desired.y, kk), lerp(origin.z, desired.z, kk));
          break;
        }
      }
      if (!this.inited) { this.pos.copy(desired); }
      else {
        const kxz = this.free ? 12 : 8.5, ky = this.free ? 12 : 6;
        this.pos.x = damp(this.pos.x, desired.x, kxz, dt); this.pos.z = damp(this.pos.z, desired.z, kxz, dt); this.pos.y = damp(this.pos.y, desired.y, ky, dt);
      }
      const lookT = new THREE.Vector3(carPos.x + f[0] * (this.free ? 0 : 2.0 + speedK * 3), carPos.y + lookH, carPos.z + f[1] * (this.free ? 0 : 2.0 + speedK * 3));
      if (!this.inited) this.look.copy(lookT); else { this.look.x = damp(this.look.x, lookT.x, 10, dt); this.look.y = damp(this.look.y, lookT.y, 8, dt); this.look.z = damp(this.look.z, lookT.z, 10, dt); }
      cam.position.copy(this.pos);
      // Wackeln: Geschwindigkeit + Einschläge
      const sh = this.shake * 0.12 + speedK * speedK * 0.012;
      if (sh > 0.001) cam.position.add(new THREE.Vector3(Math.sin(this.t * 41) * sh, Math.sin(this.t * 53 + 1) * sh, Math.cos(this.t * 47) * sh));
      cam.lookAt(this.look);
      // seitliche Neigung bei Kurvenfahrt
      cam.rotateZ(clamp(-v.ayF * 0.0016, -0.03, 0.03) * (this.free ? 0 : 1));
      fovT = (this.free ? 44 : 60) + speedK * speedK * 16;
    }
    this.fov = damp(this.fov, fovT, 5, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05 || cam.near !== this._near) { cam.fov = this.fov; this._near = cam.near; cam.updateProjectionMatrix(); }
    this.inited = true;
    if (opts.listener) { /* Platz für Audio-Listener */ }
  }
}
