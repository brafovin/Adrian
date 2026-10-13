// 3D-Spielfigur aus Grundformen mit prozeduraler Animation (Stehen, Gehen, Rennen, Springen, Fallen,
// Schwimmen, Gleiten, Rutschen, Reden). Aussehen (Haut, Haare, Frisur, Kleidung) ist änderbar.
import * as THREE from 'three';

export const LOOKS = {
  skin: ['#f7d9c4', '#ecc3a1', '#d6a27d', '#a8714f', '#6e4a33'],
  hair: ['#2a1d15', '#5a3825', '#8a5a2b', '#c98e3d', '#e8c36a', '#b8432f', '#d9d4cc', '#1f2a44', '#7b3f8c'],
  top: ['#d64545', '#3f7fd9', '#3fae5a', '#f2b632', '#8e55c7', '#f07fae', '#2f3a4a', '#e8e2d5', '#1f8f8f'],
  bottom: ['#2f3e5c', '#4a3b2a', '#3d4a33', '#22252b', '#7a6a55', '#5c2f2f'],
  hairStyle: ['kurz', 'lang', 'zopf', 'dutt', 'muetze'],
};
export const STYLE_NAMES = { kurz: 'Kurz', lang: 'Lang', zopf: 'Zopf', dutt: 'Dutt', muetze: 'Mütze' };
export const DEFAULT_LOOK = { skin: 1, hair: 2, hairStyle: 'kurz', top: 1, bottom: 0 };

const caps = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);

const FIG_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ee = new THREE.Euler(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3();

/** Alle Teile eines Gelenks werden zu einem Mesh mit Vertexfarben zusammengefasst (wenige Zeichenaufrufe). */
class Part {
  constructor(group, shadows) {
    this.items = [];
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), FIG_MAT);
    this.mesh.castShadow = shadows;
    group.add(this.mesh);
  }
  add(geo, key, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    _ee.set(rx, ry, rz); _qq.setFromEuler(_ee); _pp.set(x, y, z); _ss.set(sx, sy, sz);
    geo.applyMatrix4(_mm.compose(_pp, _qq, _ss));
    this.items.push({ geo: geo.index ? geo.toNonIndexed() : geo, key });
    return this;
  }
  clear(filter) { this.items = this.items.filter((i) => !filter(i)); }
  build(pal) {
    let n = 0;
    for (const it of this.items) n += it.geo.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const it of this.items) {
      const c = pal[it.key], cnt = it.geo.attributes.position.count;
      pos.set(it.geo.attributes.position.array, o * 3);
      nor.set(it.geo.attributes.normal.array, o * 3);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += cnt;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

export class Figure {
  constructor(look = DEFAULT_LOOK, { small = false, backpack = false, shadows = true } = {}) {
    this.root = new THREE.Group();
    this.mats = { shoe: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8 }), dark: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }) };
    const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.parts = [];
    const P = (group) => { const p = new Part(group, shadows); this.parts.push(p); return p; };

    this.body = J(this.root, 0, 0, 0);
    this.hips = J(this.body, 0, 0.92, 0);
    P(this.hips).add(new THREE.BoxGeometry(0.32, 0.17, 0.2), 'bottom', { y: 0.02 });
    this.torso = J(this.hips, 0, 0.06, 0);
    const torso = P(this.torso);
    torso.add(caps(0.165, 0.3), 'top', { y: 0.27, sx: 1.18, sz: 0.78 });
    torso.add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), 'bottom', { y: 0.04 });
    torso.add(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), 'skin', { y: 0.58 });
    if (backpack) {
      torso.add(new THREE.BoxGeometry(0.28, 0.32, 0.13), 'bag', { y: 0.3, z: -0.18 });
      torso.add(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), 'top', { y: 0.5, z: -0.18, rz: Math.PI / 2 });
    }
    this.neck = J(this.torso, 0, 0.55, 0);
    this.head = J(this.neck, 0, 0.17, 0);
    this.headPart = P(this.head);
    const hp = this.headPart;
    hp.add(new THREE.SphereGeometry(0.165, 16, 12), 'skin');
    for (const s of [-1, 1]) {
      hp.add(new THREE.SphereGeometry(0.024, 8, 6), 'dark', { x: s * 0.058, y: 0.015, z: 0.148, sy: 1.25, sz: 0.6 });
      hp.add(new THREE.SphereGeometry(0.03, 8, 6), 'cheek', { x: s * 0.095, y: -0.04, z: 0.135, sy: 0.6, sz: 0.4 });
      hp.add(new THREE.SphereGeometry(0.03, 6, 5), 'skin', { x: s * 0.163 });
    }
    hp.add(new THREE.SphereGeometry(0.022, 6, 5), 'skin', { y: -0.02, z: 0.163 });
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), this.mats.dark);
    this.mouth.position.set(0, -0.07, 0.153);
    this.head.add(this.mouth);

    this.arms = [-1, 1].map((s) => {
      const sh = J(this.torso, s * 0.215, 0.46, 0);
      P(sh).add(caps(0.058, 0.18), 'top', { y: -0.13 });
      const el = J(sh, 0, -0.28, 0);
      P(el).add(caps(0.048, 0.17), 'skin', { y: -0.11 }).add(new THREE.SphereGeometry(0.056, 8, 6), 'skin', { y: -0.25, z: 0.01 });
      return { sh, el, s };
    });
    this.legs = [-1, 1].map((s) => {
      const hip = J(this.hips, s * 0.092, -0.04, 0);
      P(hip).add(caps(0.078, 0.26), 'bottom', { y: -0.21 });
      const knee = J(hip, 0, -0.42, 0);
      P(knee).add(caps(0.066, 0.26), 'bottom', { y: -0.19 }).add(new THREE.BoxGeometry(0.115, 0.085, 0.23), 'shoe', { y: -0.42, z: 0.045 });
      return { hip, knee, s };
    });
    this.glider = this._buildGlider();
    this.glider.visible = false;
    this.torso.add(this.glider);
    if (small) this.root.scale.setScalar(0.74);

    this.pose = this._emptyPose();
    this.t = Math.random() * 10;
    this.land = 0;
    this.gliderOpen = 0;
    this.setLook(look);
  }

  _buildGlider() {
    const g = new THREE.Group();
    g.position.set(0, 1.0, 0.05);
    // Bogen über dem Kopf: Zylinderausschnitt, Achse von vorn nach hinten
    const geo = new THREE.CylinderGeometry(1.5, 1.5, 0.95, 16, 1, true, -1.1, 2.2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const stripe = Math.floor(((a + 1.1) / 2.2) * 6 + 0.001) % 2;
      cols.set(stripe ? [0.95, 0.86, 0.62] : [0.78, 0.24, 0.2], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.rotateX(-Math.PI / 2);
    const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, flatShading: true }));
    canopy.position.y = -0.4;
    canopy.castShadow = true;
    g.add(canopy);
    const edge = (sx) => [Math.sin(1.1) * 1.5 * sx, -0.4 + Math.cos(1.1) * 1.5];
    const pts = [];
    for (const sx of [-1, 1]) for (const z of [-0.42, 0.42]) {
      const [ex, ey] = edge(sx);
      pts.push(new THREE.Vector3(sx * 0.14, 0, 0), new THREE.Vector3(ex, ey, z));
      pts.push(new THREE.Vector3(sx * 0.14, 0, 0), new THREE.Vector3(sx * 0.6, -0.4 + Math.cos(0.41) * 1.5, z));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a20 })));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5).rotateZ(Math.PI / 2), this.mats.shoe));
    return g;
  }

  setLook(look) {
    this.look = { ...DEFAULT_LOOK, ...look };
    const L = this.look;
    const C = (hex) => new THREE.Color(hex);
    const skin = C(LOOKS.skin[L.skin % LOOKS.skin.length]);
    const pal = {
      skin, hair: C(LOOKS.hair[L.hair % LOOKS.hair.length]), top: C(LOOKS.top[L.top % LOOKS.top.length]),
      bottom: C(LOOKS.bottom[L.bottom % LOOKS.bottom.length]), shoe: C(0x3a2a20), dark: C(0x1a1a1a), bag: C(0x7a5432),
      cheek: skin.clone().lerp(C(0xe86a6a), 0.45),
    };
    // Frisur neu aufbauen
    const hp = this.headPart;
    hp.clear((i) => i.hair);
    const H = (geo, key, o) => { hp.add(geo, key, o); hp.items.at(-1).hair = true; };
    const cap = () => new THREE.SphereGeometry(0.178, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const style = L.hairStyle;
    if (style === 'muetze') {
      H(new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 'top', { y: 0.02, z: -0.005, sy: 1.12 });
      H(new THREE.TorusGeometry(0.17, 0.03, 6, 18), 'top', { y: 0.03, rx: Math.PI / 2 });
      H(new THREE.SphereGeometry(0.055, 8, 6), 'bottom', { y: 0.235, z: -0.01 });
      H(new THREE.BoxGeometry(0.3, 0.07, 0.05), 'hair', { y: -0.01, z: 0.14, rx: -0.2 });
    } else {
      H(cap(), 'hair', { y: 0.012, z: -0.012, rx: -0.25 });
      H(new THREE.BoxGeometry(0.26, 0.06, 0.06), 'hair', { y: 0.09, z: 0.135, rx: -0.5 });
      if (style === 'lang') {
        H(caps(0.13, 0.22), 'hair', { y: -0.13, z: -0.08, sx: 1.18, sz: 0.55 });
        for (const s of [-1, 1]) H(caps(0.05, 0.2), 'hair', { x: s * 0.14, y: -0.1 });
      } else if (style === 'zopf') {
        H(new THREE.SphereGeometry(0.05, 8, 6), 'hair', { y: 0.05, z: -0.17 });
        H(caps(0.05, 0.24), 'hair', { y: -0.13, z: -0.21, rx: 0.25 });
      } else if (style === 'dutt') {
        H(new THREE.SphereGeometry(0.085, 10, 8), 'hair', { y: 0.15, z: -0.1 });
      } else {
        H(new THREE.SphereGeometry(0.07, 8, 6), 'hair', { x: 0.1, y: 0.12, z: 0.05, sy: 0.6 });
      }
    }
    for (const p of this.parts) p.build(pal);
  }

  _emptyPose() {
    return { hy: 0, hrx: 0, trx: 0, try: 0, hdx: 0, hdy: 0, s0x: 0, s0z: 0, s1x: 0, s1z: 0, e0: 0, e1: 0, l0: 0, l1: 0, k0: 0, k1: 0 };
  }

  /** st: { mode, speed, phase, running, sliding, vy, talk, walk, run } */
  update(dt, st) {
    this.t += dt;
    const t = this.t;
    const p = this._emptyPose();
    const walkV = st.walk || 4.4, runV = st.run || 7.8;
    if (st.mode === 'swim') {
      const moving = Math.min(1, st.speed / 1.5);
      const ph = st.phase;
      p.hrx = 0.25 + moving * 0.95; p.hy = -0.32 * moving - 0.05;
      p.hdx = -0.2 - moving * 0.85;
      p.s0x = -1.5 + Math.sin(ph) * 1.5 * moving; p.s1x = -1.5 - Math.sin(ph) * 1.5 * moving;
      p.s0z = (1 - moving) * (0.9 + Math.sin(t * 4) * 0.25); p.s1z = p.s0z;
      if (moving < 0.5) { p.s0x *= moving * 2; p.s1x *= moving * 2; }
      p.e0 = p.e1 = -0.35;
      p.l0 = Math.sin(t * 9) * 0.35 * (0.3 + moving); p.l1 = -p.l0; p.k0 = p.k1 = 0.25;
    } else if (st.mode === 'glide') {
      p.hrx = 0.12; p.s0x = p.s1x = -2.85; p.s0z = p.s1z = 0.22; p.e0 = p.e1 = -0.15;
      p.l0 = 0.15 + Math.sin(t * 2.3) * 0.08; p.l1 = 0.1 - Math.sin(t * 2.3) * 0.08; p.k0 = p.k1 = 0.45; p.hdx = -0.1;
    } else if (st.mode === 'air') {
      if (st.vy > -3) { p.l0 = -0.75; p.k0 = 1.1; p.l1 = 0.25; p.k1 = 0.35; p.s0x = -0.7; p.s1x = 0.4; p.s0z = p.s1z = 0.35; p.e0 = p.e1 = -0.6; p.trx = 0.1; }
      else {
        p.s0z = p.s1z = 1.15 + Math.sin(t * 12) * 0.12; p.s0x = Math.sin(t * 9) * 0.3; p.s1x = -p.s0x;
        p.l0 = -0.35 + Math.sin(t * 8) * 0.2; p.l1 = -0.1 - Math.sin(t * 8) * 0.2; p.k0 = p.k1 = 0.5; p.e0 = p.e1 = -0.3;
      }
    } else if (st.sliding) {
      p.hy = -0.22; p.l0 = p.l1 = -0.9; p.k0 = p.k1 = 1.3; p.trx = 0.35; p.s0z = p.s1z = 0.9; p.e0 = p.e1 = -0.4;
    } else {
      const w = Math.min(1, st.speed / walkV);
      const r = Math.max(0, Math.min(1, (st.speed - walkV) / (runV - walkV)));
      const ph = st.phase;
      const A = (0.5 + 0.38 * r) * w, B = (0.65 + 0.75 * r) * w, AA = (0.45 + 0.55 * r) * w;
      p.l0 = -Math.sin(ph) * A; p.l1 = Math.sin(ph) * A;
      p.k0 = B * Math.max(0, Math.cos(ph)) + 0.08 * w; p.k1 = B * Math.max(0, -Math.cos(ph)) + 0.08 * w;
      p.s0x = Math.sin(ph) * AA; p.s1x = -Math.sin(ph) * AA;
      p.e0 = p.e1 = -(0.2 + 1.2 * r) * w - 0.12 * (1 - w);
      p.s0z = p.s1z = 0.07 + 0.05 * (1 - w);
      p.hy = Math.cos(ph * 2) * (0.03 + 0.03 * r) * w - 0.04 * r;
      p.trx = 0.05 * w + 0.2 * r;
      p.try = Math.sin(ph) * 0.12 * w;
      p.hdx = -p.trx * 0.6;
      // Atmen und Umschauen im Stand
      const idle = 1 - w;
      p.trx += Math.sin(t * 1.8) * 0.02 * idle;
      p.hdy = Math.sin(t * 0.37) * 0.35 * idle * (st.talk ? 0.3 : 1);
      p.hdx += Math.sin(t * 0.23) * 0.06 * idle;
      if (st.talk) {
        p.s1x = -0.5 + Math.sin(t * 3.1) * 0.35; p.e1 = -1.1 + Math.sin(t * 4.3) * 0.3; p.s1z = 0.25;
        p.hdx += Math.sin(t * 5) * 0.06;
      }
      if (st.wave) { p.s1x = -2.6; p.s1z = 0.4 + Math.sin(t * 9) * 0.35; p.e1 = -0.4; }
    }
    // Landestauchung
    p.hy -= this.land * 0.18;
    p.k0 += this.land * 0.6; p.k1 += this.land * 0.6; p.l0 -= this.land * 0.3; p.l1 -= this.land * 0.3;
    this.land = Math.max(0, this.land - dt * 4);

    const k = 1 - Math.exp(-dt * 14);
    const q = this.pose;
    for (const key in q) q[key] += (p[key] - q[key]) * k;
    this.hips.position.y = 0.92 + q.hy;
    this.hips.rotation.x = q.hrx;
    this.torso.rotation.x = q.trx;
    this.torso.rotation.y = q.try;
    this.head.rotation.x = q.hdx;
    this.head.rotation.y = q.hdy;
    this.arms[0].sh.rotation.set(q.s0x, 0, -q.s0z); this.arms[1].sh.rotation.set(q.s1x, 0, q.s1z);
    this.arms[0].el.rotation.x = q.e0; this.arms[1].el.rotation.x = q.e1;
    this.legs[0].hip.rotation.x = q.l0; this.legs[1].hip.rotation.x = q.l1;
    this.legs[0].knee.rotation.x = q.k0; this.legs[1].knee.rotation.x = q.k1;
    // Mund beim Reden
    this.mouth.scale.y = st.talk ? 1 + Math.abs(Math.sin(t * 14)) * 4 : 1;
    // Gleiter auf-/zuklappen
    this.gliderOpen += ((st.mode === 'glide' ? 1 : 0) - this.gliderOpen) * Math.min(1, dt * 8);
    this.glider.visible = this.gliderOpen > 0.02;
    this.glider.scale.set(this.gliderOpen, 0.3 + 0.7 * this.gliderOpen, 1);
  }

  landed(strength) { this.land = Math.min(1, Math.max(this.land, strength)); }
}
