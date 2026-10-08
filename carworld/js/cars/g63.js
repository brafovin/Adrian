// Mercedes-AMG G 63 im Mansory-Stil (Widebody, Carbon) – nach Referenzbild 3.
// Koordinaten: +x vorne, +y oben, +z rechts, Ursprung = Mitte des Radstands am Boden.

import * as THREE from 'three';
import { curve, lerp, smoothstep } from '../util.js';
import { assembleCar } from './builder.js';
import { Loft, sweep } from './loft.js';
import { paintMaterial, glassMaterial, patchBodyMaterial, MASK_MODE, matBlackGloss, matDarkChrome, canvas, canvasTexture, heightToNormal } from '../materials.js';
import { lightDecal, glowLine, surfaceLine, lineMat, exhaustTip, emblemMesh, latheZ } from './parts.js';
import { decal, meshMaterial, plank, mirror, RoundedBoxGeometry, mergeGeometries, orient } from './kit.js';
import { buildG63Interior, carbonKit, boxUV, mansoryTex, TEAL, Batch, mx, mul } from './g63-art.js';

const WB = 2.89;
const X0 = -2.34, X1 = 2.30;           // Karosserie hinten / vorne (ohne Carbon-Stoßfänger)

// ---------------------------------------------------------------------------------------------
// Karosserie-Kurven (G-Klasse: Kasten, senkrechte Seiten, ebenes Dach, steile Scheiben)

const yTop = curve([[-2.34, 1.925], [-2.2, 1.935], [0.45, 1.94], [0.52, 1.912], [0.67, 1.615], [0.82, 1.292], [0.9, 1.282], [1.3, 1.278], [1.8, 1.252], [2.2, 1.222], [2.3, 1.215]]);
const crown = curve([[0.4, 0.013], [0.9, 0.03], [2.3, 0.035]]);
const z1 = curve([[-2.34, 0.875], [-2.0, 0.885], [0.4, 0.885], [0.52, 0.87], [0.82, 0.78], [0.97, 0.745], [2.3, 0.745]]);
const z2 = curve([[-2.34, 0.95], [-2.1, 0.962], [2.1, 0.962], [2.3, 0.95]]);
const y2 = curve([[-2.34, 1.22], [0.5, 1.22], [0.9, 1.2], [2.3, 1.17]]);
const z3 = curve([[-2.34, 0.93], [-2.0, 0.955], [2.0, 0.955], [2.3, 0.93]]);
const y3 = curve([[-2.34, 0.52], [-2.15, 0.42], [-1.9, 0.31], [1.9, 0.31], [2.15, 0.42], [2.3, 0.52]]);

export const G63_DEF = {
  id: 'g63',
  name: 'Mercedes-AMG G 63 Mansory',
  dims: { wheelbase: WB, trackF: 1.8, trackR: 1.8, length: 5.0, width: 2.23, height: 2.0, cgX: WB / 2 - WB * (1 - 0.52) },
  shellColor: 0x0b6a82,
  headlightPos: { x: 2.3, y: 1.0, z: 0.63 },
  loft: {
    x0: X0, x1: X1, stations: 190,
    pts: [
      { z: 0, y: yTop },
      { z: z1, y: (x) => yTop(x) - crown(x) },
      { z: z2, y: y2 },
      { z: z3, y: y3 },
      { z: 0, y: y3 },
    ],
    rad: [0, 0.055, 0.03, 0.05, 0],
    endF: { len: 0.14, nz: 9, nyT: 9, nyB: 9, cy: 0.9 },
    endR: { len: 0.12, nz: 9, nyT: 9, nyB: 9, cy: 1.1 },
  },
  masks: [
    // Seitenfenster (x, y): vordere Tür, hintere Tür, Seitenfenster hinten
    { kind: 'window', plane: 'side', pts: [0.77, 1.265, 0.53, 1.865, -0.27, 1.865, -0.27, 1.265] },
    { kind: 'window', plane: 'side', pts: [-0.42, 1.265, -0.42, 1.865, -1.18, 1.865, -1.18, 1.265] },
    { kind: 'window', plane: 'side', pts: [-1.32, 1.265, -1.32, 1.865, -2.02, 1.865, -2.02, 1.265] },
    // Türen (vorne = Index 0, hinten = Index 1; beide Seiten über doorSide)
    { kind: 'door', door: 0, plane: 'side', pts: [0.66, 0.5, 0.66, 1.2, 0.6, 1.9, -0.38, 1.9, -0.38, 0.5] },
    { kind: 'door', door: 1, plane: 'side', pts: [-0.38, 0.5, -0.38, 1.9, -1.29, 1.9, -1.29, 0.5] },
    // Frontscheibe (x, |z|) und Heckscheibe (|z|, y)
    { kind: 'window', plane: 'top', thr: 0.2, pts: [0.815, -0.3, 0.815, 0.68, 0.525, 0.78, 0.525, -0.3] },
    { kind: 'window', plane: 'front', nsign: -1, thr: 0.5, pts: [-0.1, 1.47, 0.62, 1.47, 0.62, 1.85, -0.1, 1.85] },
  ],
  wheels: {
    archR: 0.455,
    front: { tireR: 0.41, tireW: 0.3, rimR: 0.318, rimW: 0.27, spokes: 10, pairs: true, hubR: 0.075, dish: 0.075, spokeW0: 0.034, spokeW1: 0.021, thick: 0.017, twist: 0.3, emblem: 'm', discR: 0.268, caliper: { color: 0x19c7c0, angle: -0.5, span: 1.3 } },
    rear: { tireR: 0.41, tireW: 0.32, rimR: 0.318, rimW: 0.29, spokes: 10, pairs: true, hubR: 0.075, dish: 0.075, spokeW0: 0.034, spokeW1: 0.021, thick: 0.017, twist: 0.3, emblem: 'm', discR: 0.268, caliper: { color: 0x19c7c0, angle: 0.5, span: 1.3 } },
  },
  extras(ctx) { g63Extras(ctx); },
};


// ---------------------------------------------------------------------------------------------
// Hilfsfunktionen

const dbl = (m) => { m.side = THREE.DoubleSide; return m; };
const lx = (profile, segs = 48) => latheZ(profile, segs).rotateY(Math.PI / 2); // Drehachse = +x, a -> x

function decalOn(ctx, loft, proj, [u0, u1, v0, v1], mat, { nu = 24, nv = 12, off = 0.004, order = 0, flip = false } = {}) {
  const g = loft.drape(proj, u0, u1, v0, v1, nu, nv, off, flip);
  if (!g.index || g.index.count === 0) return null;
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = order; m.castShadow = false;
  ctx.body.add(m);
  return m;
}

/** Gitter-Material, dessen Zellen auf einer Fläche (wm x hm Meter) etwa cellM groß sind. */
function meshFor(kind, wm, hm, cellM, o = {}) {
  const w = 512, h = Math.max(32, Math.round(512 * hm / wm));
  return meshMaterial(kind, { cells: Math.max(2, Math.round(wm / cellM)), w, h, ...o });
}

/** Ebenes Abzeichen (Kennzeichen, Plakette) an Position/Normale einer Projektion. */
function badge(ctx, proj, uc, vc, w, h, tex, { off = 0.006, thick = 0.012 } = {}) {
  const a = proj(uc, vc);
  if (!a) return null;
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.3, envMapIntensity: 0.8 });
  const side = matBlackGloss();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, h, w), [front, side, side, side, side, side]);
  const n = a.n.clone().normalize();
  mesh.position.copy(a.p).addScaledVector(n, off + thick / 2);
  mesh.quaternion.setFromRotationMatrix(orient(n));
  ctx.body.add(mesh);
  mesh.castShadow = false;
  return mesh;
}

/** Rahmen (vier Leisten) um ein Rechteck auf einer senkrechten Fläche. dirX = +1 vorne, -1 hinten. */
function frameRect(carbon, x, z0, z1, y0, y1, dirX, { t = 0.028, d = 0.026 } = {}) {
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, w = z1 - z0, h = y1 - y0;
  const xc = x + dirX * d / 2;
  carbon.box(d, t, w + t, 0.008, xc, y1 - t / 2 + 0.004, zc);
  carbon.box(d, t, w + t, 0.008, xc, y0 + t / 2 - 0.004, zc);
  carbon.box(d, h, t, 0.008, xc, yc, z0 + t / 2 - 0.004);
  carbon.box(d, h, t, 0.008, xc, yc, z1 - t / 2 + 0.004);
}

/** Kotflügelverbreiterung: Seitenansicht-Umriss (x,y) mit Radausschnitt, in z extrudiert. poly: hinten unten -> ... -> vorne unten. */
function flareGeo(poly, arch, s, { zIn = 0.95, zOut = 1.095, bev = 0.008 } = {}) {
  const [cx, cy, R] = arch;
  const yb = poly[0][1];
  const Rh = R + bev;
  const cb = Math.sqrt(Math.max(1e-6, Rh * Rh - (yb - cy) * (yb - cy)));
  const a0 = Math.atan2(yb - cy, cb);
  const sh = new THREE.Shape();
  poly.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.lineTo(cx + cb, yb);
  const N = 40;
  for (let i = 0; i <= N; i++) { const a = lerp(a0, Math.PI - a0, i / N); sh.lineTo(cx + Math.cos(a) * Rh, cy + Math.sin(a) * Rh); }
  sh.closePath();
  const depth = zOut - zIn - 2 * bev;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, s > 0 ? zIn + bev : -zOut + bev);
  return g;
}

/** Ring (Kreisbogen-Band) um das Radhaus als aufgesetzte Kante. */
function archRingGeo(cx, cy, Ri, Ro, a0, a1, z0, z1) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, Ro, a0, a1, false);
  sh.absarc(0, 0, Ri, a1, a0, true);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 40 });
  g.translate(cx, cy, Math.min(z0, z1));
  return g;
}


/** Panamericana-Grill: senkrechte, dunkel verchromte Lamellen, jede zweite mit türkisem Schimmer. */
function grilleMaterial(wm, hm, n = 22) {
  const w = 512, h = Math.round(512 * hm / wm);
  const c = canvas(w, h), g = c.getContext('2d');
  const e = canvas(w, h), eg = e.getContext('2d');
  const hc = canvas(w, h), hg = hc.getContext('2d');
  g.fillStyle = '#040506'; g.fillRect(0, 0, w, h);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, w, h);
  hg.fillStyle = '#101010'; hg.fillRect(0, 0, w, h);
  const cs = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * cs + cs * 0.17, bw = cs * 0.66;
    const gr = g.createLinearGradient(x0, 0, x0 + bw, 0);
    gr.addColorStop(0, '#0b0d0f'); gr.addColorStop(0.35, '#6c7a80'); gr.addColorStop(0.5, '#c4d0d3'); gr.addColorStop(0.65, '#5d6a70'); gr.addColorStop(1, '#0b0d0f');
    g.fillStyle = gr; g.fillRect(x0, 0, bw, h);
    const hgr = hg.createLinearGradient(x0, 0, x0 + bw, 0); hgr.addColorStop(0, '#303030'); hgr.addColorStop(0.5, '#ffffff'); hgr.addColorStop(1, '#303030');
    hg.fillStyle = hgr; hg.fillRect(x0, 0, bw, h);
    if (i % 2 === 0) {
      eg.strokeStyle = '#19d8cc'; eg.lineWidth = Math.max(2, cs * 0.12); eg.beginPath(); eg.moveTo(x0 + bw * 0.5, h * 0.04); eg.lineTo(x0 + bw * 0.5, h * 0.96); eg.stroke();
    }
  }
  // zwei dünne Querstreben
  for (const y of [0.34, 0.68]) { g.fillStyle = '#05070a'; g.fillRect(0, y * h - 2, w, 4); }
  const m = new THREE.MeshStandardMaterial({ map: canvasTexture(c), normalMap: canvasTexture(heightToNormal(hc, 3.0), { srgb: false }), metalness: 0.95, roughness: 0.3, envMapIntensity: 1.5,
    emissive: new THREE.Color(0xffffff), emissiveMap: canvasTexture(e), emissiveIntensity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return m;
}


/** Teilnetz der Karosserie für eine Tür (nur Dreiecke im x-Bereich der Tür auf der gewünschten Seite). */
function subsetGeo(geo, x0, x1, side) {
  const pos = geo.attributes.position, idx = geo.index.array;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const xa = pos.getX(a), xb = pos.getX(b), xc = pos.getX(c);
    if (Math.max(xa, xb, xc) < x0 - 0.04 || Math.min(xa, xb, xc) > x1 + 0.04) continue;
    if (((pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3) * side < 0.2) continue;
    out.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos); g.setAttribute('normal', geo.attributes.normal); g.setAttribute('uv', geo.attributes.uv);
  g.setIndex(out);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Lichter-Grafiken

function drawTail(g, w, h, emis) {
  const X = (u) => u * w, Y = (v) => (1 - v) * h;
  if (!emis) {
    g.fillStyle = '#16060a'; g.beginPath(); g.roundRect(X(0.0), Y(1.0), X(1.0), Y(0.0) - Y(1.0), h * 0.35); g.fill();
    g.strokeStyle = '#2a2d33'; g.lineWidth = 3; g.stroke();
    glowLine(g, [[X(0.07), Y(0.5)], [X(0.93), Y(0.5)]], h * 0.34, '#7a0f16', 4);
  } else {
    glowLine(g, [[X(0.07), Y(0.5)], [X(0.93), Y(0.5)]], h * 0.38, '#ff2a1c', 16);
    glowLine(g, [[X(0.1), Y(0.5)], [X(0.9), Y(0.5)]], h * 0.15, '#ff9a80', 6);
  }
}

// ---------------------------------------------------------------------------------------------
// Karosserie-Anbauteile

function g63Extras(ctx) {
  const { loft, lights } = ctx;
  ctx.interior = buildG63Interior();

  const PF = loft.projFront(), PR = loft.projRear(), PT = loft.projTop();
  const PSr = loft.projSide(1), PSl = loft.projSide(-1);
  const paint = paintMaterial({ flakes: true });
  const carbon = carbonKit();
  const gloss = dbl(matBlackGloss());
  const darkChrome = dbl(matDarkChrome());
  const tealMat = dbl(new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 1.3, roughness: 0.35, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const chromeLine = dbl(new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.14, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const ledMat = () => { const m = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.3 }); m.userData.setLevel = (v) => { m.emissiveIntensity = 0.6 + v; }; return m; };

  // ===== Front: Kühlergrill (Panamericana), Emblem
  const grille = grilleMaterial(0.78, 0.32, 22);
  decal(ctx, PF, [-0.39, 0.39, 0.81, 1.13], grille, { nu: 26, nv: 8, off: 0.009 });
  const gf = new THREE.MeshStandardMaterial({ color: 0x08090a, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.6 });
  for (const [a, b, c, d] of [[-0.42, 0.42, 1.13, 1.16], [-0.42, 0.42, 0.78, 0.81], [-0.42, -0.39, 0.78, 1.16], [0.39, 0.42, 0.78, 1.16]]) decal(ctx, PF, [a, b, c, d], gf, { nu: 6, nv: 2, off: 0.0125 });
  const em = PF(0, 0.97);
  if (em) ctx.add(emblemMesh('m', 0.175, em.p.clone().addScaledVector(em.n, 0.015), em.n), { shadow: false });
  {
    const f = PF(0, 1.19);
    if (f) carbon.box(0.05, 0.02, 1.5, 0.007, f.p.x - 0.0, 1.205, 0);
  }

  // ===== Scheinwerfer: Ring-Tagfahrlicht im eckigen Gehäuse (Teile nach Material zusammengefasst)
  {
    const hb = new Batch();
    const drl = new THREE.MeshStandardMaterial({ color: 0x777f88, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3 });
    drl.userData.setLevel = (v) => { drl.emissiveIntensity = v * 1.6; };
    const lensIn = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, emissive: 0x6f8fb0, emissiveIntensity: 0.0, metalness: 0.4, roughness: 0.1 });
    lensIn.userData.setLevel = (v) => { lensIn.emissiveIntensity = v * 0.35; };
    lights.head.push(drl, lensIn);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.4, metalness: 0.7 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x090c10, metalness: 0.3, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.9 });
    const projMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 1, roughness: 0.15, envMapIntensity: 1.6 });
    for (const s of [1, -1]) {
      const zc = s * 0.655, yc = 1.0;
      const f = PF(zc, yc);
      if (!f) continue;
      const M0 = mx(f.p.x - 0.004, yc, zc);
      hb.add(new RoundedBoxGeometry(0.07, 0.285, 0.3, 3, 0.05), gloss, mul(M0, mx(0.005, 0, 0)));
      hb.add(lx([[0.108, -0.01], [0.126, -0.01], [0.126, 0.044], [0.118, 0.052], [0.108, 0.046]], 40), darkChrome, mul(M0, mx(0.03, 0, 0)));
      hb.add(new THREE.CircleGeometry(0.108, 32), baseMat, mul(M0, mx(0.04, 0, 0, 0, Math.PI / 2, 0)));
      hb.add(new THREE.SphereGeometry(0.082, 28, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), lensMat, mul(M0, mx(-0.026, 0, 0, 0, 0, -Math.PI / 2)));
      hb.add(new THREE.TorusGeometry(0.09, 0.0095, 8, 56), drl, mul(M0, mx(0.056, 0, 0, 0, Math.PI / 2, 0)));
      hb.add(new THREE.TorusGeometry(0.05, 0.004, 6, 40), lensIn, mul(M0, mx(0.052, 0, 0, 0, Math.PI / 2, 0)));
      hb.add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), projMat, mul(M0, mx(0.045, 0, 0, 0, 0, Math.PI / 2)));
      hb.add(new THREE.CircleGeometry(0.024, 20), lensIn, mul(M0, mx(0.062, 0, 0, 0, Math.PI / 2, 0)));
      // Blinker-Pod oben am Kotflügel
      const e = PT(2.06, s * 0.9);
      if (e) { carbon.box(0.12, 0.04, 0.09, 0.012, 2.06, e.p.y + 0.02, s * 0.9); carbon.box(0.1, 0.012, 0.06, 0.004, 2.05, e.p.y + 0.047, s * 0.9); }
    }
    hb.build(ctx.body);
  }

  // ===== Front-Stoßfänger (Carbon, eigener Loft)
  const FB = { x0: 1.95, x1: 2.41, yT: 0.72, yB: 0.34, zW: 1.075 };
  const bumperF = new Loft({
    x0: FB.x0, x1: FB.x1, stations: 90,
    pts: [{ z: 0, y: FB.yT }, { z: FB.zW, y: FB.yT }, { z: FB.zW, y: FB.yB }, { z: 0, y: FB.yB }],
    rad: [0, 0.07, 0.05, 0],
    endF: { len: 0.34, nz: 5, nyT: 9, nyB: 7, cy: 0.53 },
  });
  carbon.add(bumperF.build());
  const PBF = bumperF.projFront();
  const xFace = (z, y) => { const r = PBF(z, y); return r ? r.p.x : FB.x1; };
  // Mittlerer Lufteinlass (Waben) + Kennzeichen "MANSORY"
  decalOn(ctx, bumperF, PBF, [-0.5, 0.5, 0.385, 0.545], meshFor('hex', 1.0, 0.16, 0.032, { line: '#2a2c31', color: '#020203' }), { nu: 24, nv: 4, off: 0.008 });
  frameRect(carbon, xFace(0, 0.46) - 0.004, -0.52, 0.52, 0.37, 0.56, 1);
  {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.86), chromeLine); bar.position.set(xFace(0, 0.465) + 0.008, 0.465, 0); ctx.add(bar, { shadow: false });
    const amb = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.045, 0.02), new THREE.MeshStandardMaterial({ color: 0xc8821a, emissive: 0xe09a20, emissiveIntensity: 0.9 })); amb.position.set(xFace(0.02, 0.43) + 0.005, 0.43, 0.02); ctx.add(amb, { shadow: false });
    for (const sg of [1, -1]) carbon.box(0.045, 0.3, 0.026, 0.006, xFace(sg * 0.56, 0.47) + 0.012, 0.5, sg * 0.56, -sg * 0.3, 0, 0);
  }
  badge(ctx, PBF, 0, 0.625, 0.5, 0.115, mansoryTex(512, 118, { bg: '#0a0a0c', fg: '#dfe3e8', fontScale: 0.5, border: '#3a3d44' }), { off: 0.01 });
  for (const s of [1, -1]) {
    // Seitliche Einlässe mit LED-Streifen
    const z0 = 0.58, z1 = 0.95;
    const a = s > 0 ? z0 : -z1, b = s > 0 ? z1 : -z0;
    decalOn(ctx, bumperF, PBF, [a, b, 0.4, 0.64], meshFor('hex', 0.37, 0.24, 0.03, { line: '#2a2c31', color: '#020203' }), { nu: 10, nv: 8, off: 0.008 });
    frameRect(carbon, xFace(s * 0.77, 0.52) - 0.004, a, b, 0.385, 0.655, 1);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.3), ledMat());
    lights.head.push(led.material);
    led.position.set(xFace(s * 0.77, 0.69) + 0.004, 0.69, s * 0.77);
    ctx.add(led, { shadow: false });
    // schräge Zierstreben neben dem Einlass + Eckklinge
    carbon.box(0.05, 0.3, 0.03, 0.006, xFace(s * 0.97, 0.5) + 0.014, 0.52, s * 0.97, 0, s * 0.3, 0);
    carbon.box(0.1, 0.05, 0.3, 0.01, xFace(s * 0.77, 0.725) - 0.02, 0.73, s * 0.77);
  }
  // Frontlippe (Carbon-Klinge, zweilagig) + Canards
  {
    const outl = [];
    const N = 14;
    for (let i = 0; i <= N; i++) { const z = -1.0 + (2.0 * i) / N; outl.push([FB.x1 + 0.04 - 0.03 * Math.pow(Math.abs(z) / 1.0, 3) - (Math.abs(z) > 0.9 ? (Math.abs(z) - 0.9) * 1.2 : 0), z]); }
    const inner = outl.map(([x, z]) => [x - 0.2, z]).reverse();
    carbon.addMesh(plank([...outl, ...inner], 0.022, 0.29, carbon.mat, { bevel: 0.006 }));
    const outl2 = outl.map(([x, z]) => [x - 0.04, z * 0.93]);
    carbon.addMesh(plank([...outl2, ...outl2.map(([x, z]) => [x - 0.16, z]).reverse()], 0.016, 0.318, carbon.mat, { bevel: 0.004 }));
    for (const s of [1, -1]) {
      carbon.box(0.2, 0.1, 0.014, 0.004, FB.x1 - 0.02, 0.38, s * 1.045, 0, s * 0.35, 0);
    }
  }

  // ===== Haube: Carbon, Mittelgrat, Lufthutzen
  {
    carbon.add(loft.drape(PT, 0.92, 2.265, -0.7, 0.7, 40, 14, 0.01));
    const n = 36, path = [], outs = [], ups = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(0.98, 2.2, i / n);
      const u = i / n;
      const k = smoothstep(0, 0.12, u) * smoothstep(1, 0.8, u);
      const y = loft.topY(x, 0);
      path.push([x, y + 0.003, 0]); outs.push([0, 0, 0.35 + 0.65 * k]); ups.push([0, 0.2 + 0.8 * k, 0]);
    }
    const prof = [[-0.36, -0.006], [-0.31, 0.025], [-0.2, 0.062], [0.2, 0.062], [0.31, 0.025], [0.36, -0.006]];
    carbon.add(sweep(path, outs, ups, prof, { closedProfile: true }));
    for (const s of [1, -1]) {
      const y = loft.topY(1.05, s * 0.55) ?? 1.28;
      carbon.box(0.26, 0.05, 0.14, 0.014, 1.08, y + 0.022, s * 0.56, 0, s * -0.25, 0);
    }
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), meshFor('slats', 0.13, 0.22, 0.02, { line: '#3a8e8a', color: '#020203' }));
    vent.rotation.x = -Math.PI / 2;
    vent.position.set(1.12, loft.topY(1.12, 0) + 0.066, 0);
    ctx.add(vent, { shadow: false });
    // Scheibenwischer
    for (const [z, rz] of [[-0.3, 0.2], [0.34, 0.2]]) carbon.box(0.5, 0.01, 0.014, 0.003, 0.9, 1.31, z, 0, rz + (z < 0 ? 0 : 0.0), 0);
  }

  // ===== Kotflügelverbreiterungen (Carbon) mit Lüftungsschlitzen
  const archF = [WB / 2, 0.41, 0.462], archR = [-WB / 2, 0.41, 0.462];
  // Umrisse: Lüftungspaneel hinter/vor dem Radhaus + Bogenband (folgt dem Radlauf) + Eckstück zum Stoßfänger
  const band = (cx, xa, xb, Ro, n = 16) => { const o = []; for (let i = 0; i <= n; i++) { const x = lerp(xa, xb, i / n); o.push([x, 0.41 + Math.sqrt(Math.max(0.01, Ro * Ro - (x - cx) * (x - cx)))]); } return o; };
  const flF = [[0.64, 0.5], [0.64, 1.17], [1.0, 1.175], ...band(WB / 2, 1.0, 1.9, 0.62), [2.1, 0.83], [2.33, 0.88], [2.325, 0.7], [2.3, 0.5]];
  const flR = [[-0.6, 0.5], [-0.84, 1.17], [-1.0, 1.175], ...band(-WB / 2, -1.0, -1.89, 0.62), [-2.1, 0.84], [-2.4, 0.9], [-2.42, 0.7], [-2.4, 0.5]];
  const slatMat = meshFor('slats', 0.2, 0.4, 0.03, { line: '#3b9892', color: '#020203', metal: 0.8 });
  for (const s of [1, -1]) {
    carbon.add(flareGeo(flF, archF, s));
    carbon.add(flareGeo(flR.slice().reverse(), archR, s));
    for (const ar of [archF, archR]) {
      carbon.add(archRingGeo(ar[0], ar[1], ar[2] + 0.006, ar[2] + 0.05, -0.1, Math.PI + 0.1, s > 0 ? 1.09 : -1.108, s > 0 ? 1.108 : -1.09));
    }
    for (const [xc, w] of [[0.82, 0.24], [-0.87, 0.18]]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.4), slatMat);
      v.position.set(xc, 0.86, s * 1.0965);
      if (s < 0) v.rotation.y = Math.PI;
      ctx.add(v, { shadow: false });
      carbon.box(w + 0.03, 0.02, 0.014, 0.005, xc, 0.86 + 0.21, s * 1.1);
      carbon.box(w + 0.03, 0.02, 0.014, 0.005, xc, 0.86 - 0.21, s * 1.1);
    }
  }

  // ===== Seitenschweller / Trittbretter (Carbon) + türkise Leisten
  for (const s of [1, -1]) {
    const pl = plank([[-0.97, s * 0.9], [-0.9, s * 1.095], [0.9, s * 1.095], [0.97, s * 0.9]], 0.085, 0.355, carbon.mat, { bevel: 0.012 });
    carbon.addMesh(pl);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.007, 0.012), tealMat);
    strip.position.set(0, 0.455, s * 1.098);
    ctx.add(strip, { shadow: false });
  }

  // ===== Türen (öffenbar, Scharnier an der Vorderkante) mit Spiegel, Spaltmaßen, Griffen, Zierlinien, Verkleidung
  const bodyGeo = ctx.body.children[0].geometry;
  const lm = lineMat();
  const doors = {};
  const DOORS = [
    { idx: 0, x0: -0.38, x1: 0.66, hinge: 0.66, max: 1.15, handle: -0.25, name: 'F',
      lines: [[[0.66, 0.5], [0.66, 1.2]], [[0.66, 0.5], [-0.38, 0.5]]],
      teal: [[[0.64, 1.235], [-0.36, 1.235]], [[0.6, 0.84], [-0.36, 0.84]]], chrome: [[0.66, 1.262], [-0.38, 1.262]] },
    { idx: 1, x0: -1.29, x1: -0.38, hinge: -0.38, max: 1.0, handle: -1.16, name: 'R',
      lines: [[[-0.38, 0.5], [-0.38, 1.22]], [[-0.38, 0.5], [-1.29, 0.5]], [[-1.29, 0.5], [-1.29, 1.22]]],
      teal: [[[-0.4, 1.235], [-1.3, 1.235]], [[-0.4, 0.84], [-1.26, 0.84]]], chrome: [[-0.38, 1.262], [-1.29, 1.262]] },
  ];
  for (const s of [-1, 1]) {
    const P = s > 0 ? PSr : PSl;
    // feste Teile: Chrom-Leiste an Frontscheibenrahmen und hinterem Seitenfenster
    for (const l of [[[0.8, 1.262], [0.66, 1.262]], [[-1.29, 1.262], [-2.02, 1.262]]]) {
      const gc = surfaceLine(P, l, 0.011, 0.002); if (gc) ctx.add(new THREE.Mesh(gc, chromeLine), { shadow: false });
    }
    for (const d of DOORS) {
      const hz = s * 0.962;
      const door = new THREE.Group();
      door.position.set(d.hinge, 0, hz);
      const content = new THREE.Group();
      content.position.set(-d.hinge, 0, -hz);
      door.add(content);
      const sub = subsetGeo(bodyGeo, d.x0, d.x1, s);
      const mp = paintMaterial({ masks: ctx.masks, mode: MASK_MODE.DOOR_PAINT, doors: true, doorIdx: d.idx, doorSide: s, maskKey: ctx.def.id });
      const mg = glassMaterial({ masks: ctx.masks, doors: true, doorIdx: d.idx, doorSide: s, mode: MASK_MODE.DOOR_GLASS, maskKey: ctx.def.id });
      const ms = new THREE.MeshStandardMaterial({ color: ctx.def.shellColor, roughness: 0.85, metalness: 0, side: THREE.BackSide });
      ms.alphaToCoverage = true; ms.alphaTest = 0.5;
      patchBodyMaterial(ms, { masks: ctx.masks, mode: MASK_MODE.DOOR_PAINT, doors: true, doorIdx: d.idx, doorSide: s, maskKey: ctx.def.id });
      const paintM = new THREE.Mesh(sub, mp); paintM.castShadow = false; paintM.receiveShadow = true;
      const glassM = new THREE.Mesh(sub, mg); glassM.renderOrder = 2;
      const shellM = new THREE.Mesh(sub, ms);
      content.add(paintM, shellM, glassM);
      // Details der Tür (nach Material zusammengefasst)
      const parts = new Map();
      const put = (geo, mat) => { if (!geo) return; if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); };
      for (const l of d.lines) put(surfaceLine(P, l, 0.0045, 0.0007), lm);
      put(surfaceLine(P, [[d.handle - 0.06, 1.04], [d.handle + 0.06, 1.04]], 0.03, 0.006), darkChrome);
      put(surfaceLine(P, d.chrome, 0.011, 0.002), chromeLine);
      for (const l of d.teal) put(surfaceLine(P, l, 0.016, 0.0016), tealMat);
      for (const y of [0.78, 1.08]) { const hg = new RoundedBoxGeometry(0.05, 0.12, 0.03, 2, 0.01); hg.translate(d.hinge + 0.008, y, s * 0.975); put(hg, darkChrome); }
      for (const [mat, geos] of parts) {
        const gs = geos.map((q) => { const c = q.index ? q.toNonIndexed() : q.clone(); for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); c.clearGroups(); return c; });
        const mm = new THREE.Mesh(mergeGeometries(gs), mat); mm.castShadow = false;
        content.add(mm);
      }
      if (d.idx === 0) {
        const m = mirror(paint, { x: 0.72, y: 1.27, z: 0.93, w: 0.2, h: 0.15, d: 0.13 });
        if (s < 0) m.scale.z = -1;
        content.add(m);
      }
      const key = d.name + (s < 0 ? 'L' : 'R');
      const api = { name: key, side: s, group: door, content, open: 0, max: d.max, set(f) { this.open = Math.max(0, Math.min(1, f)); door.rotation.y = s * this.open * this.max; } };
      doors[key] = api;
      ctx.body.add(door);
      door.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
  }
  ctx.doors = doors;
  // Innenverkleidungen an die Türen hängen
  for (const t of ctx.interior.userData.doorTrims || []) {
    const api = doors[(t.idx === 0 ? 'F' : 'R') + (t.side < 0 ? 'L' : 'R')];
    if (api) api.content.add(t.group);
  }

  // ===== Dach: Querträger mit LED-Pods, Reling, Heckspoiler
  carbon.box(0.1, 0.05, 1.6, 0.015, 0.4, 1.965, 0);
  for (const s of [1, -1]) {
    carbon.box(0.07, 0.05, 0.42, 0.012, 0.4 + 0.03, 1.965, s * 0.55);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.36), ledMat());
    led.position.set(0.4 + 0.067, 1.965, s * 0.55);
    ctx.add(led, { shadow: false });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.03), chromeLine); rail.position.set(-0.95, 1.952, s * 0.82); ctx.add(rail);
    for (const x of [0.2, -0.8, -1.8]) carbon.box(0.05, 0.03, 0.045, 0.006, x, 1.948, s * 0.82);
  }
  carbon.box(0.1, 0.07, 0.4, 0.02, 0.4, 1.965, 0);
  {
    const sp = plank([[-2.1, -0.88], [-2.42, -0.9], [-2.42, 0.9], [-2.1, 0.88]], 0.022, 1.955, carbon.mat, { bevel: 0.007 });
    carbon.addMesh(sp);
    for (const s of [1, -1]) carbon.box(0.4, 0.08, 0.014, 0.005, -2.28, 1.96, s * 0.9);
  }

  // ===== Heck: Reserverad mit Carbon-Abdeckung
  {
    const R = 0.455, face = -0.095, Rf = R - 0.09;
    const rim = new THREE.Mesh(lx([[Rf, face], [Rf + 0.055, face + 0.004], [R - 0.008, face + 0.03], [R, face + 0.07], [R, 0.1], [R - 0.02, 0.12], [0, 0.12]], 72), gloss);
    const cover = new THREE.Group();
    cover.add(rim);
    const dg = lx([[0, face], [Rf + 0.002, face]], 72);
    const dm = new THREE.Mesh(boxUV(dg.index ? dg.toNonIndexed() : dg, 0.075), carbon.mat);
    cover.add(dm);
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(Rf, 0.006, 8, 72), chromeLine); ringC.rotation.y = Math.PI / 2; ringC.position.x = face + 0.002; cover.add(ringC);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: mansoryTex(512, 128, { bg: '#08090b', fg: '#e3e6ea', fontScale: 0.46, border: '#555a62' }), roughness: 0.35, metalness: 0.4 }));
    plaque.rotation.y = -Math.PI / 2; plaque.position.x = face - 0.004;
    cover.add(plaque);
    cover.position.set(-2.42, 1.2, 0);
    ctx.add(cover);
    carbon.box(0.18, 0.1, 0.1, 0.02, -2.38, 0.76, 0);
  }

  // ===== Heck-Stoßfänger (Carbon, eigener Loft), Diffusor, Auspuff, Leuchten
  const RB = { x0: -2.44, x1: -2.0, yT: 0.74, yB: 0.34, zW: 1.075 };
  const bumperR = new Loft({
    x0: RB.x0, x1: RB.x1, stations: 90,
    pts: [{ z: 0, y: RB.yT }, { z: RB.zW, y: RB.yT }, { z: RB.zW, y: RB.yB }, { z: 0, y: RB.yB }],
    rad: [0, 0.07, 0.05, 0],
    endR: { len: 0.34, nz: 5, nyT: 9, nyB: 7, cy: 0.54 },
  });
  carbon.add(bumperR.build());
  const PBR = bumperR.projRear();
  const xRear = (z, y) => { const r = PBR(z, y); return r ? r.p.x : RB.x0; };
  badge(ctx, PBR, 0, 0.655, 0.5, 0.115, mansoryTex(512, 118, { bg: '#0a0a0c', fg: '#dfe3e8', fontScale: 0.5, border: '#3a3d44' }), { off: 0.01 });
  {
    const xd = xRear(0, 0.48);
    decalOn(ctx, bumperR, PBR, [-0.4, 0.4, 0.39, 0.59], new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.5, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { nu: 6, nv: 3, off: 0.008 });
    frameRect(carbon, xd - 0.004, -0.42, 0.42, 0.375, 0.6, -1);
    for (let i = 0; i < 5; i++) carbon.box(0.07, 0.2, 0.013, 0.004, xd - 0.025, 0.49, lerp(-0.34, 0.34, i / 4));
    for (const s of [1, -1]) {
      for (const dz of [-0.095, 0.095]) {
        const t = exhaustTip({ shape: 'rect', w: 0.18, h: 0.13, len: 0.1 });
        t.position.set(xRear(s * 0.7, 0.5) - 0.025, 0.5, s * 0.7 + dz * 1.12);
        ctx.add(t);
      }
      frameRect(carbon, xRear(s * 0.7, 0.5) - 0.004, s * 0.7 - 0.22, s * 0.7 + 0.22, 0.41, 0.6, -1, { t: 0.03, d: 0.034 });
    }
  }
  {
    const tlm = lightDecal(drawTail, 512, 64, { emissiveColor: 0xff2010 });
    lights.tail.push(tlm);
    for (const s of [1, -1]) {
      const a = s > 0 ? 0.5 : -0.9, b = s > 0 ? 0.9 : -0.5;
      decal(ctx, PR, [a, b, 0.765, 0.875], tlm, { nu: 16, nv: 3, off: 0.012, order: 2 });
    }
  }

  // Zusammenfassen: alle Carbon-Teile -> ein Mesh
  ctx.add(carbon.build());
}

export function buildG63() { return assembleCar(G63_DEF); }
