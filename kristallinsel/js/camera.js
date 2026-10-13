// Verfolgerkamera hinter der Figur: Maus/Finger drehen, Rad/Pinch zoomt, weicht Gelände und Wänden aus.
import * as THREE from 'three';

export class FollowCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;            // 0 = Kamera steht südlich der Figur und schaut nach Norden
    this.pitch = 0.32;
    this.dist = 6.5;
    this.want = 6.5;
    this.cur = 6.5;
    this.target = new THREE.Vector3();
    this.smoothY = null;
    this.shake = 0;
  }

  /** Blickrichtung (waagerecht) und Rechtsrichtung für die Bewegung. */
  basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: -s, fz: -c, rx: c, rz: -s };
  }

  look(dx, dy, sens, invert) {
    this.yaw -= dx * 0.0032 * sens;
    this.pitch += dy * 0.0026 * sens * (invert ? -1 : 1);
    this.pitch = Math.max(-0.45, Math.min(1.25, this.pitch));
  }

  zoomBy(z) { this.want = Math.max(2.4, Math.min(16, this.want * (1 + z * 0.1))); }

  /** Dreht die Kamera langsam hinter die Figur (für Touch und Controller ohne Blickeingabe). */
  follow(playerYaw, amount) {
    const want = playerYaw + Math.PI;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * amount;
  }

  update(dt, focus, world, opts = {}) {
    // Höhe glätten, damit Treppen und Stufen nicht ruckeln
    if (this.smoothY === null || Math.abs(this.smoothY - focus.y) > 6) this.smoothY = focus.y;
    this.smoothY += (focus.y - this.smoothY) * (1 - Math.exp(-dt * 10));
    this.target.set(focus.x, this.smoothY + (opts.height ?? 1.5), focus.z);
    const extra = opts.extraDist || 0;
    const want = this.want + extra;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // Hindernisse zwischen Figur und Kamera
    let allowed = want;
    const T = world.terrain;
    for (let i = 1; i <= 12; i++) {
      const d = (want * i) / 12;
      const x = this.target.x + dir.x * d, y = this.target.y + dir.y * d, z = this.target.z + dir.z * d;
      if (T.heightAt(x, z) + 0.4 > y || world.colliders.solidAt(x, y, z, 0.25)) { allowed = Math.max(1.2, d - want / 12); break; }
    }
    if (allowed < this.cur) this.cur = allowed;
    else this.cur += (allowed - this.cur) * (1 - Math.exp(-dt * 2.5));
    const p = this.target.clone().addScaledVector(dir, this.cur);
    // Abstand zum Gelände auch rund um die Kamera (steile Hänge neben der Kamera)
    let ground = T.heightAt(p.x, p.z);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ground = Math.max(ground, T.heightAt(p.x + Math.cos(a) * 1.3, p.z + Math.sin(a) * 1.3) - 0.35); }
    const minY = Math.max(ground + 0.55, (world.water ?? 0) + 0.35);
    if (p.y < minY) p.y = minY;
    if (this.shake > 0) {
      p.x += (Math.random() - 0.5) * this.shake; p.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    this.cam.position.copy(p);
    this.cam.lookAt(this.target);
  }
}
