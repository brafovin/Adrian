// Reifenspuren und Reifenqualm. Beides wird vom Schlupf der Räder (vehicle.slipAmt, 1 = Haftgrenze) gesteuert.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TireFX {
  /**
   * @param {THREE.Scene} scene
   * @param {object} world  braucht world.height(x, z, hint, step)
   * @param {{marks?:number, smoke?:number}} opt  Anzahl Spurstücke (Ringpuffer) / Qualmpartikel
   */
  constructor(scene, world, { marks = 1400, smoke = 70 } = {}) {
    this.world = world;
    // ---- Spuren: ein Ringpuffer aus Vierecken (je Stück 4 Eckpunkte), Alpha pro Eckpunkt
    this.N = marks;
    const pos = new Float32Array(marks * 4 * 3), col = new Float32Array(marks * 4 * 4);
    for (let i = 0; i < marks * 4; i++) { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 0.015; }
    const idx = new Uint32Array(marks * 6);
    for (let s = 0; s < marks; s++) { const o = s * 4; idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], s * 6); }
    const geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(pos, 3); this.colA = new THREE.BufferAttribute(col, 4);
    this.posA.setUsage(THREE.DynamicDrawUsage); this.colA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posA); geo.setAttribute('color', this.colA); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.count = 0; this.head = 0; this.dirty = false;
    this.prev = [null, null, null, null];     // letzte Randpunkte je Rad: [lx, ly, lz, rx, ry, rz, alpha]

    // ---- Qualm: Pool aus Sprites
    this.tex = smokeTexture();
    this.smoke = [];
    for (let i = 0; i < smoke; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex, color: 0xcfc8c0, transparent: true, depthWrite: false, opacity: 0, fog: true });
      const sp = new THREE.Sprite(m); sp.visible = false; sp.frustumCulled = false;
      sp.userData = { life: 0, age: 0, vx: 0, vy: 0, vz: 0, by: 0, s0: 1, s1: 3, a: 0 };
      scene.add(sp); this.smoke.push(sp);
    }
    this.smokeI = 0; this.emitAcc = [0, 0, 0, 0];
    this.pp = null;
  }

  /** Alles Gezeichnete entfernen (z. B. beim Fahrzeugwechsel). */
  clear() { this.count = 0; this.head = 0; this.mesh.geometry.setDrawRange(0, 0); this.prev.fill(null); for (const s of this.smoke) { s.visible = false; s.userData.life = 0; } }

  _push(a, b) {
    // a, b: [lx, ly, lz, rx, ry, rz, alpha] – Anfang / Ende des Stücks
    const o = this.head * 4, P = this.posA.array, C = this.colA.array;
    P.set([a[0], a[1], a[2], a[3], a[4], a[5], b[0], b[1], b[2], b[3], b[4], b[5]], o * 3);
    C[o * 4 + 3] = a[6]; C[(o + 1) * 4 + 3] = a[6]; C[(o + 2) * 4 + 3] = b[6]; C[(o + 3) * 4 + 3] = b[6];
    this.head = (this.head + 1) % this.N;
    this.count = Math.min(this.count + 1, this.N);
    this.dirty = true;
  }

  /**
   * @param {number} dt
   * @param {import('./player.js').Player} player
   * @param {{lights?:number}} env  Tageszeit-Parameter (lights 0 = Tag, 1 = Nacht) für die Qualmhelligkeit
   * @param {{marks?:boolean, smoke?:boolean}} on
   */
  update(dt, player, env = {}, on = { marks: true, smoke: true }) {
    const v = player.vehicle;
    const speed = Math.hypot(v.u, v.v);
    const nightK = clamp(1 - 0.78 * (env.lights ?? 0), 0.15, 1);
    // Fahrzeuggeschwindigkeit in Weltkoordinaten aus der Positionsänderung (unabhängig von Achsenkonventionen)
    const vx = this.pp && dt > 0 ? (v.x - this.pp.x) / dt : 0, vz = this.pp && dt > 0 ? (v.z - this.pp.z) / dt : 0;
    if (this.pp && Math.hypot(v.x - this.pp.x, v.z - this.pp.z) > 6) this.prev.fill(null);   // Teleport: keine Spur quer durch die Stadt
    this.pp = { x: v.x, z: v.z };

    for (let i = 0; i < 4; i++) {
      const slip = v.slipAmt[i];
      const grounded = !player.air && speed > 2.2;
      const marking = on.marks && grounded && slip > 1.04;
      const [wx, wz] = player._wheelPos(i);
      if (marking) {
        const y = this.world.height(wx, wz, player.y + 0.4, 0.6) + 0.022;
        const alpha = clamp((slip - 1.04) * 1.15, 0.0, 0.62) * clamp(speed / 5, 0.25, 1);
        const p = this.prev[i];
        if (!p) { this.prev[i] = [wx, y, wz, wx, y, wz, alpha, true]; continue; }
        // Richtung aus dem letzten Randmittelpunkt
        const cx = (p[0] + p[3]) / 2, cz = (p[2] + p[5]) / 2;
        const dx = wx - cx, dz = wz - cz, d = Math.hypot(dx, dz);
        if (d < 0.18) continue;
        const half = (player.spec.tireWidth ?? 0.3) * 0.46;
        const nx = (-dz / d) * half, nz = (dx / d) * half;
        const cur = [wx + nx, y, wz + nz, wx - nx, y, wz - nz, alpha];
        if (p[7]) { // erster Abschnitt: Anfangskante mit der Richtung nachziehen
          p[0] = cx + nx; p[2] = cz + nz; p[3] = cx - nx; p[5] = cz - nz; p[7] = false;
        }
        this._push(p, cur);
        this.prev[i] = cur;
      } else this.prev[i] = null;

      // Qualm: hinten stärker (Antrieb/Handbremse), vorne nur bei starkem Schlupf
      const rear = i >= 2;
      if (on.smoke && grounded && slip > (rear ? 1.3 : 1.7)) {
        this.emitAcc[i] += dt * (rear ? 26 : 14) * clamp((slip - 1.2) * 1.2, 0.2, 1.4) * clamp(speed / 6, 0.4, 1);
        while (this.emitAcc[i] >= 1) {
          this.emitAcc[i] -= 1;
          const sp = this.smoke[this.smokeI]; this.smokeI = (this.smokeI + 1) % this.smoke.length;
          const u = sp.userData;
          u.age = 0; u.life = 0.9 + Math.random() * 0.9;
          u.vx = vx * 0.35 + (Math.random() - 0.5) * 0.9; u.vz = vz * 0.35 + (Math.random() - 0.5) * 0.9; u.vy = 0.5 + Math.random() * 0.7;
          u.s0 = 0.5 + Math.random() * 0.3; u.s1 = 2.2 + Math.random() * 1.6; u.a = 0.13 + Math.random() * 0.08;
          sp.position.set(wx + (Math.random() - 0.5) * 0.25, player.y + 0.18, wz + (Math.random() - 0.5) * 0.25); u.by = player.y + 0.05;
          sp.material.rotation = Math.random() * 6.28;
          sp.visible = true;
        }
      } else this.emitAcc[i] = Math.min(this.emitAcc[i], 0.99);
    }

    for (const sp of this.smoke) {
      const u = sp.userData;
      if (u.life <= 0) continue;
      u.age += dt;
      if (u.age >= u.life) { u.life = 0; sp.visible = false; sp.material.opacity = 0; continue; }
      const k = u.age / u.life;
      sp.position.x += u.vx * dt; u.by += u.vy * dt; sp.position.z += u.vz * dt;
      u.vx *= 1 - 1.4 * dt; u.vz *= 1 - 1.4 * dt; u.vy *= 1 - 0.9 * dt;
      const s = u.s0 + (u.s1 - u.s0) * Math.sqrt(k);
      sp.scale.set(s, s, 1);
      sp.position.y = u.by + s * 0.5;   // wächst nach oben statt in die Straße
      sp.material.opacity = u.a * Math.min(1, k * 7) * (1 - k) * (1 - k) * 1.5;
      sp.material.color.setScalar(0.82 * nightK).multiply(WARM);
    }

    if (this.dirty) {
      this.posA.needsUpdate = true; this.colA.needsUpdate = true;
      this.mesh.geometry.setDrawRange(0, this.count * 6);
      this.dirty = false;
    }
  }
}

const WARM = new THREE.Color(1.0, 0.93, 0.86);
