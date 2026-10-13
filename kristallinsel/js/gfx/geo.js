// Geometrie-Helfer: Bauteile (aus structures.js) in Dreiecke mit Vertexfarben umwandeln und zusammenführen.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

function hash3(x, y, z, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453;
  return s - Math.floor(s);
}

/** Dreiecksprisma: Grundfläche w × d bei y=0, First entlang x in Höhe h. */
export function gableGeometry(w, d, h) {
  const a = w / 2, b = d / 2;
  const v = [
    // Dachfläche vorne (+z)
    -a, 0, b, a, 0, b, a, h, 0, -a, 0, b, a, h, 0, -a, h, 0,
    // Dachfläche hinten (-z)
    a, 0, -b, -a, 0, -b, -a, h, 0, a, 0, -b, -a, h, 0, a, h, 0,
    // Giebel links / rechts
    -a, 0, -b, -a, 0, b, -a, h, 0,
    a, 0, b, a, 0, -b, a, h, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Felsen/Baumkronen: Ikosaeder mit leicht verschobenen Ecken (gleiche Ecke -> gleiche Verschiebung). */
export function lumpyIco(rad, det = 0, seed = 1, amount = 0.18) {
  const g = new THREE.IcosahedronGeometry(rad, det);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100), seed) - 0.5) * 2 * amount;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Erzeugt die Geometrie eines Bauteils (nicht indiziert, in Weltkoordinaten, mit Farbattribut). */
export function partGeometry(part, colorOverride) {
  let g;
  switch (part.s) {
    case 'box': g = new THREE.BoxGeometry(part.d[0], part.d[1], part.d[2]); break;
    case 'cyl': g = new THREE.CylinderGeometry(part.rt, part.rb, part.h, part.n); break;
    case 'cone': g = new THREE.ConeGeometry(part.rb, part.h, part.n); break;
    case 'sphere': g = new THREE.SphereGeometry(part.rad, part.n, Math.max(4, Math.round(part.n * 0.7))); break;
    case 'ico': g = lumpyIco(part.rad, part.det, part.seed ?? 1); break;
    case 'gable': g = gableGeometry(part.w, part.d, part.h); break;
    default: throw new Error('Unbekanntes Bauteil ' + part.s);
  }
  if (g.index) g = g.toNonIndexed();
  const r = part.r || [0, 0, 0];
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  _p.set(part.p[0], part.p[1], part.p[2]);
  if (part.sc) _s.set(part.sc[0], part.sc[1], part.sc[2]); else _s.set(1, 1, 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(colorOverride ?? part.c);
  // leichte Farbabweichung je Bauteil, damit Flächen lebendiger wirken
  const jit = 1 + (hash3(part.p[0], part.p[1], part.p[2]) - 0.5) * 0.08;
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r * jit; col[i * 3 + 1] = _c.g * jit; col[i * 3 + 2] = _c.b * jit; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Führt nicht indizierte Geometrien mit position/normal/color zusammen. */
export function mergeGeos(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

/** Bauteile nach Material gruppiert zu Geometrien zusammenfassen. */
export function buildParts(parts) {
  const byMat = new Map();
  for (const p of parts) {
    const m = p.m || 'std';
    const g = partGeometry(p, m === 'glow' || m === 'lamp' ? 0xffffff : undefined);
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  }
  const out = new Map();
  for (const [m, list] of byMat) out.set(m, mergeGeos(list));
  return out;
}

/** Farbige Teilgeometrie für Prototypen (Bäume usw.): geo wird verschoben/gedreht und eingefärbt. */
export function colored(geo, hex, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0, seed = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (hash3(i, seed, n) - 0.5) * 2 * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) { col[(i + k) * 3] = _c.r * j; col[(i + k) * 3 + 1] = _c.g * j; col[(i + k) * 3 + 2] = _c.b * j; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Radialer Leuchtpunkt als Textur (für Glanz, Glühwürmchen, Funken). */
export function glowTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wind-Wiegen für Pflanzen: verschiebt Ecken abhängig von ihrer Höhe im Modell. */
export function addSway(material, uniforms, { start = 0, amount = 0.05 } = {}) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #endif
          float hgt = max(position.y - ${start.toFixed(3)}, 0.0);
          float ph = uTime * 1.6 + ip.x * 0.21 + ip.z * 0.17;
          float s = hgt * ${amount.toFixed(4)} * uWind;
          transformed.x += (sin(ph) + 0.35 * sin(ph * 2.7 + 1.3)) * s;
          transformed.z += cos(ph * 0.8 + 0.7) * s * 0.6;
        }`);
  };
  material.customProgramCacheKey = () => `sway-${start}-${amount}`;
  return material;
}
