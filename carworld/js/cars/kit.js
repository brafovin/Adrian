// Bausteine für Karosserie-Anbauteile und Details (von allen Fahrzeugen genutzt).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture, heightToNormal, carbonMaterial, matBlackGloss, matBlackMatte, matChrome, matDarkChrome, plateTexture } from '../materials.js';
import { sweep } from './loft.js';
import { clamp, lerp } from '../util.js';

export { RoundedBoxGeometry, mergeGeometries };

// ---------------------------------------------------------------------------------------------
// Netz-/Gittertexturen (Grill, Lufteinlässe)

/**
 * kind: 'diamond' | 'hex' | 'bars' | 'slats' | 'grid'
 * Liefert ein Material mit dunkler Basis, hellen Stegen und Relief (Normalmap).
 */
export function meshMaterial(kind, { cells = 14, w = 512, h = 256, color = '#050506', line = '#3a3a40', metal = 0.9, rough = 0.35, bar = 0.18, emissive = null, repeat = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  const hc = canvas(w, h), hg = hc.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  hg.fillStyle = '#202020'; hg.fillRect(0, 0, w, h);
  const stroke = (ctx, col, lw, fn) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); fn(ctx); ctx.stroke(); };
  const cs = w / cells;
  if (kind === 'diamond') {
    const fn = (ctx) => { for (let i = -cells * 2; i < cells * 3; i++) { ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs + h, h); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs - h, h); } };
    stroke(g, line, 2.4, fn); stroke(hg, '#ffffff', 3, fn);
  } else if (kind === 'grid') {
    const fn = (ctx) => { for (let i = 0; i <= cells; i++) { ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, h); } for (let j = 0; j <= h / cs; j++) { ctx.moveTo(0, j * cs); ctx.lineTo(w, j * cs); } };
    stroke(g, line, 2.2, fn); stroke(hg, '#ffffff', 3, fn);
  } else if (kind === 'hex') {
    const hw = cs, hh = cs * Math.sqrt(3) / 2 * 1.0;
    const hexPath = (ctx, cx, cy, r) => { for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
    for (let row = -1; row < h / hh + 1; row++) for (let col = -1; col < cells + 1; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * hh;
      const r = hw * 0.5 / Math.cos(Math.PI / 6) * (1 - bar * 0.5);
      g.beginPath(); hexPath(g, cx, cy, r); g.strokeStyle = line; g.lineWidth = hw * bar * 0.9; g.stroke();
      hg.beginPath(); hexPath(hg, cx, cy, r); hg.strokeStyle = '#fff'; hg.lineWidth = hw * bar * 1.1; hg.stroke();
    }
  } else if (kind === 'bars') { // senkrechte Stäbe (BMW-Niere, G-Klasse-Kühlergrill)
    for (let i = 0; i <= cells; i++) {
      const x = (i + 0.5) * cs;
      const gr = g.createLinearGradient(x - cs * 0.3, 0, x + cs * 0.3, 0);
      gr.addColorStop(0, '#0a0a0c'); gr.addColorStop(0.5, line); gr.addColorStop(1, '#0a0a0c');
      g.fillStyle = gr; g.fillRect(x - cs * 0.3, 0, cs * 0.6, h);
      const hgr = hg.createLinearGradient(x - cs * 0.3, 0, x + cs * 0.3, 0);
      hgr.addColorStop(0, '#404040'); hgr.addColorStop(0.5, '#ffffff'); hgr.addColorStop(1, '#404040');
      hg.fillStyle = hgr; hg.fillRect(x - cs * 0.3, 0, cs * 0.6, h);
    }
  } else if (kind === 'slats') { // waagerechte Lamellen
    const n = Math.round(h / (cs * 0.6));
    for (let j = 0; j < n; j++) {
      const y = (j + 0.5) * (h / n);
      const gr = g.createLinearGradient(0, y - h / n * 0.4, 0, y + h / n * 0.4);
      gr.addColorStop(0, '#0a0a0c'); gr.addColorStop(0.5, line); gr.addColorStop(1, '#0a0a0c');
      g.fillStyle = gr; g.fillRect(0, y - h / n * 0.4, w, h / n * 0.8);
      const hgr = hg.createLinearGradient(0, y - h / n * 0.4, 0, y + h / n * 0.4);
      hgr.addColorStop(0, '#404040'); hgr.addColorStop(0.5, '#ffffff'); hgr.addColorStop(1, '#404040');
      hg.fillStyle = hgr; hg.fillRect(0, y - h / n * 0.4, w, h / n * 0.8);
    }
  }
  const map = canvasTexture(g.canvas);
  const normalMap = canvasTexture(heightToNormal(hc, 3.4), { srgb: false });
  if (repeat) { for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } }
  const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1, 1), metalness: metal, roughness: rough, envMapIntensity: 1.4,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveMap = map; m.emissiveIntensity = 0.0; }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Auflegen (Decals) und Verankern

/** Projiziertes Gitter als Mesh. u0..u1 / v0..v1 sind Koordinaten der Projektion. */
export function decal(ctx, proj, [u0, u1, v0, v1], mat, { nu = 36, nv = 18, off = 0.004, order = 0, flip = false } = {}) {
  const g = ctx.loft.drape(proj, u0, u1, v0, v1, nu, nv, off, flip);
  if (!g.index || g.index.count === 0) return null;
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = order;
  m.castShadow = false;
  ctx.body.add(m);
  return m;
}

/** Rotationsmatrix: lokale +x-Achse = Normale n, lokale +y-Achse = möglichst "oben". */
export function orient(n, up = new THREE.Vector3(0, 1, 0)) {
  const x = n.clone().normalize();
  let y = up.clone().sub(x.clone().multiplyScalar(up.dot(x)));
  if (y.lengthSq() < 1e-6) y = new THREE.Vector3(0, 0, 1).sub(x.clone().multiplyScalar(x.z));
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Position + Normale auf der Karosserie. */
export function anchor(proj, u, v) { return proj(u, v); }

/** Plakette/Kennzeichen: flaches Rechteck, an die Fläche angelegt (mit Rahmen). */
export function plate(ctx, proj, uc, vc, w, h, lines, { rear = false, off = 0.006, bg, fg, border } = {}) {
  const a = proj(uc, vc);
  if (!a) return null;
  const tex = plateTexture(lines, { w: 512, h: Math.round(512 * h / w), bg, fg, border, font: 'bold 62px "Arial Narrow", Arial, sans-serif' });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.5 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, w), [matBlackGloss(), matBlackGloss(), matBlackGloss(), matBlackGloss(), mat, matBlackGloss()]);
  // Box: +x-Seite zeigt nach vorne; Textur liegt auf +x (Index 0). Material-Reihenfolge der BoxGeometry: +x,-x,+y,-y,+z,-z
  mesh.material = [mat, matBlackGloss(), matBlackGloss(), matBlackGloss(), matBlackGloss(), matBlackGloss()];
  const n = a.n.clone().normalize();
  mesh.position.copy(a.p).addScaledVector(n, off);
  mesh.quaternion.setFromRotationMatrix(orient(n));
  ctx.body.add(mesh);
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Anbauteile

/** Flache Platte (Frontlippe, Diffusorboden, Heckspoilerlippe) aus einem Grundriss (x, z). */
export function plank(points, thickness, y, mat, { bevel = 0.004 } = {}) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/**
 * Wulst (Verbreiterungs-Rand) um ein Radhaus: folgt dem Kreis (cx, cy, R) auf der Seitenfläche.
 * Profil: out = Abstand von der Fläche, rad = Breite radial nach außen.
 */
export function archLip(loft, cx, cy, R, sign, { out = 0.02, rad = 0.03, a0 = -0.2, a1 = Math.PI + 0.2, n = 36, step = 0.012 } = {}, mat) {
  const proj = loft.projSide(sign);
  const path = [], outs = [], ups = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const r = proj(x, y);
    if (!r) continue;
    path.push([r.p.x, r.p.y, r.p.z]);
    outs.push([r.n.x, r.n.y, r.n.z]);
    ups.push([Math.cos(a), Math.sin(a), 0]);
  }
  if (path.length < 3) return null;
  const prof = [[-0.002, -0.004], [out * 0.7, -0.002], [out, 0.008], [out, rad - 0.01], [out * 0.5, rad], [-0.002, rad + 0.002]];
  const g = sweep(path, outs, ups, prof, { closedProfile: true });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Schweller/Seitenschweller: Profil entlang x auf Höhe y. */
export function skirt(loft, sign, x0, x1, y, { out = 0.05, h = 0.085, n = 40, tilt = 0 } = {}, mat) {
  const proj = loft.projSide(sign);
  const path = [], outs = [], ups = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n);
    const r = proj(x, y);
    if (!r) continue;
    path.push([r.p.x, r.p.y, r.p.z]);
    outs.push([r.n.x, r.n.y, r.n.z]);
    ups.push([0, 1, 0]);
  }
  if (path.length < 3) return null;
  const o = out;
  const prof = [[-0.01, -h / 2], [o * 0.4, -h / 2 - 0.004], [o, -h / 2 + 0.006], [o * 1.0, h * 0.2], [o * 0.55, h / 2], [-0.01, h / 2]];
  const g = sweep(path, outs, ups, prof, { closedProfile: true });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Außenspiegel: Gehäuse + Fuß, in Karosseriefarbe. Position der Fußbasis (x, y, z>0), Spiegel zeigt nach außen. */
export function mirror(mat, { x = 0.45, y = 1.0, z = 0.98, w = 0.24, h = 0.115, d = 0.13, glassMat } = {}) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new RoundedBoxGeometry(d, h, w, 5, 0.04), mat);
  housing.position.set(x - 0.02, y + h * 0.5, z + w * 0.5 - 0.02);
  housing.rotation.y = -0.08;
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.06, 0.1, 3, 0.02), mat);
  foot.position.set(x + 0.02, y - 0.015, z - 0.01);
  foot.rotation.z = 0.2;
  // Spiegelglas (hinten)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.78), glassMat || new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 1, roughness: 0.05, envMapIntensity: 1.3 }));
  glass.rotation.y = Math.PI / 2;
  glass.position.set(x - 0.02 - d / 2 - 0.002, y + h * 0.5, z + w * 0.5 - 0.02);
  g.add(housing, foot, glass);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** Diffusor mit Finnen: Platte + senkrechte Rippen, Grundriss in (x, z). */
export function diffuser({ x0, x1, zHalf, y, fins = 5, finH = 0.12, thick = 0.008, mat, base = true, finLen = null }) {
  const g = new THREE.Group();
  if (base) g.add(plank([[x0, -zHalf], [x1, -zHalf * 0.96], [x1, zHalf * 0.96], [x0, zHalf]], 0.014, y, mat));
  for (let i = 0; i < fins; i++) {
    const t = fins === 1 ? 0 : i / (fins - 1);
    const z = lerp(-zHalf * 0.55, zHalf * 0.55, t);
    const len = finLen ?? Math.abs(x1 - x0);
    const fin = new THREE.Mesh(new RoundedBoxGeometry(len, finH, thick, 2, 0.002), mat);
    fin.position.set((x0 + x1) / 2, y - finH / 2 + 0.014, z);
    fin.castShadow = true;
    g.add(fin);
  }
  return g;
}

/** Zusammenführbarer Quader (für Lufteinlassrahmen etc.). */
export function roundedBox(w, h, d, r = 0.01, mat) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.castShadow = true;
  return m;
}

export const mats = { carbon: carbonMaterial, gloss: matBlackGloss, matte: matBlackMatte, chrome: matChrome, darkChrome: matDarkChrome };
