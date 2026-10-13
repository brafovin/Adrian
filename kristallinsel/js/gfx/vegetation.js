// Pflanzen und Felsen: Low-Poly-Vorlagen, instanziert und in Kacheln aufgeteilt (Sichtbarkeitsprüfung je Kachel).
import * as THREE from 'three';
import { colored, mergeGeos, lumpyIco, addSway } from './geo.js';
import { HALF } from '../terrain.js';

function oak(seed) {
  const g = [];
  g.push(colored(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 6), 0x6b4a2e, { y: 1.7, jitter: 0.05 }));
  g.push(colored(new THREE.CylinderGeometry(0.08, 0.14, 1.6, 5), 0x6b4a2e, { x: 0.5, y: 2.9, rz: -0.7 }));
  const greens = [0x4d8a32, 0x5a9a3a, 0x427a2c];
  g.push(colored(lumpyIco(2.3, 1, seed, 0.2), greens[0], { y: 4.6, jitter: 0.1, seed }));
  g.push(colored(lumpyIco(1.7, 0, seed + 1, 0.2), greens[1], { x: 1.4, y: 4.0, z: 0.5, jitter: 0.1, seed }));
  g.push(colored(lumpyIco(1.6, 0, seed + 2, 0.2), greens[2], { x: -1.2, y: 4.2, z: -0.6, jitter: 0.1, seed }));
  g.push(colored(lumpyIco(1.4, 0, seed + 3, 0.2), greens[1], { x: 0.2, y: 5.9, z: 0.3, jitter: 0.1, seed }));
  return mergeGeos(g);
}

function pine() {
  const g = [];
  g.push(colored(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6), 0x5a3d26, { y: 1.3 }));
  const tiers = [[2.3, 2.8, 2.5], [1.8, 2.5, 3.9], [1.25, 2.2, 5.2], [0.7, 1.6, 6.3]];
  const greens = [0x2f5e34, 0x356a39, 0x2c5a31, 0x3b743d];
  tiers.forEach(([r, h, y], i) => g.push(colored(new THREE.ConeGeometry(r, h, 7), greens[i], { y, ry: i * 0.5, jitter: 0.08, seed: i })));
  return mergeGeos(g);
}

function palm() {
  const g = [];
  let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    const nx = x + 0.12 + i * 0.05, ny = y + 1.0;
    const len = Math.hypot(nx - x, ny - y);
    g.push(colored(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.22 - i * 0.012, len, 6), i % 2 ? 0x8a6a45 : 0x7a5c3b, { x: (x + nx) / 2, y: (y + ny) / 2, rz: -Math.atan2(nx - x, ny - y) }));
    x = nx; y = ny;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const fr = colored(new THREE.BoxGeometry(0.5, 0.05, 2.6), i % 2 ? 0x4f9a3a : 0x3f8a30, { z: 1.2, rx: 0.45 });
    fr.rotateY(a);
    fr.translate(x, y + 0.1, 0);
    g.push(fr);
  }
  for (let i = 0; i < 3; i++) g.push(colored(new THREE.SphereGeometry(0.16, 5, 4), 0x5a4024, { x: x + Math.cos(i * 2) * 0.25, y: y - 0.15, z: Math.sin(i * 2) * 0.25 }));
  return mergeGeos(g);
}

function bush(seed) {
  return mergeGeos([
    colored(lumpyIco(0.9, 1, seed, 0.25), 0x4a8a34, { y: 0.55, sy: 0.8, jitter: 0.1, seed }),
    colored(lumpyIco(0.65, 0, seed + 1, 0.25), 0x579a3c, { x: 0.6, y: 0.45, z: 0.2, jitter: 0.1, seed }),
    colored(lumpyIco(0.55, 0, seed + 2, 0.25), 0x3f7a2d, { x: -0.5, y: 0.4, z: -0.3, jitter: 0.1, seed }),
  ]);
}

function rock(seed) {
  return mergeGeos([colored(lumpyIco(1, 1, seed, 0.28), 0x8f8a82, { y: 0.15, sy: 0.75, jitter: 0.12, seed })]);
}

function flower() {
  // Stiel + flache Blüte (Oktaeder) + Mitte: rund 30 Dreiecke für zwei Blüten
  const one = (x, y, z) => [
    colored(new THREE.CylinderGeometry(0.018, 0.022, y, 3, 1, true), 0x3f7a2d, { x, y: y / 2, z }),
    colored(new THREE.OctahedronGeometry(0.11, 0), 0xffffff, { x, y, z, sy: 0.35 }),
    colored(new THREE.TetrahedronGeometry(0.045, 0), 0xffe066, { x, y: y + 0.03, z }),
  ];
  return mergeGeos([...one(0, 0.42, 0), ...one(0.17, 0.3, 0.1)]);
}

// Vereinfachte Bäume für die Ferne
function oakLow(seed) {
  return mergeGeos([
    colored(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 5), 0x6b4a2e, { y: 1.7 }),
    colored(lumpyIco(2.5, 0, seed, 0.2), 0x4d8a32, { y: 4.7, jitter: 0.1, seed }),
    colored(lumpyIco(1.8, 0, seed + 1, 0.2), 0x55923a, { x: 1.2, y: 4.1, z: 0.4, jitter: 0.1, seed }),
  ]);
}
function pineLow() {
  return mergeGeos([
    colored(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 4), 0x5a3d26, { y: 1.3 }),
    colored(new THREE.ConeGeometry(2.2, 3.6, 6), 0x2f5e34, { y: 3.0 }),
    colored(new THREE.ConeGeometry(1.4, 3.0, 6), 0x356a39, { y: 5.2 }),
  ]);
}

function grassTuft() {
  const pos = [], col = [], nor = [];
  const base = new THREE.Color(0x3e7a28), tip = new THREE.Color(0x9ccc58);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3, w = 0.07, h = 0.42 + (i % 2) * 0.16;
    const cx = Math.cos(a), cz = Math.sin(a);
    const ox = Math.cos(a * 3) * 0.08, oz = Math.sin(a * 3) * 0.08;
    const lean = 0.12;
    // beide Seiten als eigene Dreiecke mit Normale nach oben (sonst wäre die Rückseite schwarz)
    pos.push(ox - cx * w, 0, oz - cz * w, ox + cx * w, 0, oz + cz * w, ox + cz * lean, h, oz - cx * lean);
    pos.push(ox + cx * w, 0, oz + cz * w, ox - cx * w, 0, oz - cz * w, ox + cz * lean, h, oz - cx * lean);
    for (let k = 0; k < 2; k++) col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    for (let k = 0; k < 6; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Vegetation {
  constructor(scene, veg, quality, uniforms) {
    this.scene = scene;
    this.chunks = [];
    this.uniforms = uniforms;
    this.lodDist = quality.lodDist ?? 60;
    const std = (sway) => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
      return sway ? addSway(m, uniforms, sway) : m;
    };
    const treeMat = std({ start: 2.5, amount: 0.018 });
    const palmMat = std({ start: 1.0, amount: 0.025 });
    const bushMat = std({ start: 0.2, amount: 0.04 });
    const rockMat = std(null);
    const flowerMat = std({ start: 0.05, amount: 0.12 });
    const grassMat = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), uniforms, { start: 0.0, amount: 0.32 });
    this.materials = [treeMat, palmMat, bushMat, rockMat, flowerMat, grassMat];

    const protos = {
      oak: [oak(1)], oakLow: [oakLow(1)], pine: [pine()], pineLow: [pineLow()], palm: [palm()], bush: [bush(3)], rock: [rock(1), rock(5)],
      flower: [flower()], grass: [grassTuft()],
    };
    const FLOWER_COLS = [0xe8455f, 0xf2c94c, 0xffffff, 0x9b6bd6].map((h) => new THREE.Color(h));
    const shadows = quality.shadows;
    const sets = [
      { items: veg.trees.filter((t) => t.type === 'oak'), protos: protos.oak, low: protos.oakLow, mat: treeMat, cast: shadows, chunk: 160 },
      { items: veg.trees.filter((t) => t.type === 'pine'), protos: protos.pine, low: protos.pineLow, mat: treeMat, cast: shadows, chunk: 160 },
      { items: veg.trees.filter((t) => t.type === 'palm'), protos: protos.palm, mat: palmMat, cast: shadows, chunk: 160, maxDist: 600 },
      { items: veg.bushes, protos: protos.bush, mat: bushMat, cast: shadows, chunk: 160, maxDist: 260 },
      { items: veg.rocks, protos: protos.rock, mat: rockMat, cast: shadows, chunk: 160, rock: true },
      { items: veg.flowers, protos: protos.flower, mat: flowerMat, cast: false, chunk: 128, flowers: FLOWER_COLS, maxDist: 160 },
      { items: quality.grass > 0 ? veg.grass : [], protos: protos.grass, mat: grassMat, cast: false, chunk: 64, maxDist: quality.grassDist, grass: true },
    ];
    for (const set of sets) this._build(set);
  }

  _build(set) {
    const { items, protos, mat, chunk } = set;
    const buckets = new Map();
    for (const it of items) {
      const v = (it.v ?? Math.floor(Math.abs(it.x * 7.31 + it.z * 3.17))) % protos.length;
      const key = `${Math.floor((it.x + HALF) / chunk)},${Math.floor((it.z + HALF) / chunk)},${v}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    const tint = new THREE.Color();
    for (const [key, list] of buckets) {
      const v = +key.split(',')[2];
      const mesh = new THREE.InstancedMesh(protos[v], mat, list.length);
      const low = set.low ? new THREE.InstancedMesh(set.low[v % set.low.length], mat, list.length) : null;
      const box = new THREE.Box3();
      list.forEach((it, i) => {
        _q.setFromAxisAngle(_up, it.r);
        if (set.rock) _s.set(it.s, it.s * (0.7 + (i % 3) * 0.15), it.s * 0.9);
        else _s.setScalar(it.s);
        _p.set(it.x, it.y - (set.rock ? 0.2 * it.s : 0.05), it.z);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
        if (set.flowers) mesh.setColorAt(i, set.flowers[it.v % set.flowers.length]);
        else {
          const h = Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453;
          const j = 0.88 + (h - Math.floor(h)) * 0.24;
          mesh.setColorAt(i, tint.setRGB(j, j, j * 0.95));
        }
        box.expandByPoint(_p);
      });
      box.min.y -= 2; box.max.y += 14; box.expandByScalar(4);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = set.cast;
      mesh.receiveShadow = !set.grass;
      mesh.computeBoundingSphere();
      mesh.boundingBox = box;
      const center = box.getCenter(new THREE.Vector3());
      this.scene.add(mesh);
      if (low) {
        low.instanceMatrix = mesh.instanceMatrix;
        low.instanceColor = mesh.instanceColor;
        low.boundingSphere = mesh.boundingSphere.clone();
        low.boundingBox = box;
        low.castShadow = false;
        low.receiveShadow = true;
        low.visible = false;
        this.scene.add(low);
      }
      this.chunks.push({ mesh, low, center, radius: box.getSize(new THREE.Vector3()).length() / 2, maxDist: set.maxDist });
    }
  }

  /** Gras und Blumen nur in der Nähe, Bäume in der Ferne vereinfacht. */
  update(camPos) {
    for (const c of this.chunks) {
      const d = c.center.distanceTo(camPos) - c.radius;
      if (c.low) {
        const near = d < this.lodDist;
        c.mesh.visible = near; c.low.visible = !near;
      } else if (c.maxDist) c.mesh.visible = d < c.maxDist;
    }
  }
}
