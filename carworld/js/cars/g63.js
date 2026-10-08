// Mercedes-AMG G 63 im Mansory-Stil (Widebody, Carbon) – nach Referenzbild 3.
// Koordinaten: +x vorne, +y oben, +z rechts, Ursprung = Mitte des Radstands am Boden.

import * as THREE from 'three';
import { curve, bump, lerp, clamp, smoothstep } from '../util.js';
import { assembleCar } from './builder.js';
import { Loft, sweep } from './loft.js';
import { paintMaterial, carbonMaterial, matBlackGloss, matBlackMatte, matChrome, matDarkChrome, canvas, canvasTexture } from '../materials.js';
import { lightDecal, glowLine, surfaceLine, lineMat, exhaustTip, emblemMesh, latheZ } from './parts.js';
import { decal, meshMaterial, plank, mirror, roundedBox, RoundedBoxGeometry, mergeGeometries } from './kit.js';
import { buildG63Interior, carbonKit, boxUV, xf, mansoryTex, TEAL } from './g63-art.js';
import { orient } from './kit.js';

const WB = 2.89;
const X0 = -2.34, X1 = 2.30;           // Karosserie hinten / vorne (ohne Carbon-Stoßfänger)

// ---------------------------------------------------------------------------------------------
// Karosserie-Kurven (G-Klasse: Kasten, senkrechte Seiten, ebenes Dach, steile Scheiben)

const yTop = curve([[-2.34, 1.945], [-2.2, 1.955], [0.45, 1.96], [0.52, 1.93], [0.67, 1.62], [0.82, 1.292], [0.9, 1.282], [1.3, 1.275], [1.8, 1.24], [2.2, 1.207], [2.3, 1.2]]);
const crown = curve([[0.4, 0.013], [0.9, 0.03], [2.3, 0.035]]);
const z1 = curve([[-2.34, 0.875], [-2.0, 0.885], [0.4, 0.885], [0.52, 0.87], [0.82, 0.78], [0.97, 0.745], [2.3, 0.745]]);
const z2 = curve([[-2.34, 0.95], [-2.1, 0.962], [2.1, 0.962], [2.3, 0.95]]);
const y2 = curve([[-2.34, 1.22], [0.5, 1.22], [0.9, 1.2], [2.3, 1.17]]);
const z3 = curve([[-2.34, 0.93], [-2.0, 0.955], [2.0, 0.955], [2.3, 0.93]]);
const y3 = curve([[-2.34, 0.52], [-2.15, 0.42], [-1.9, 0.31], [1.9, 0.31], [2.15, 0.42], [2.3, 0.52]]);

export const G63_DEF = {
  id: 'g63',
  name: 'Mercedes-AMG G 63 Mansory',
  dims: { wheelbase: WB, trackF: 1.8, trackR: 1.8, length: 4.99, width: 2.22, height: 1.99, cgX: WB / 2 - WB * (1 - 0.52) },
  shellColor: 0x0a5551,
  headlightPos: { x: 2.3, y: 1.0, z: 0.63 },
  loft: {
    x0: X0, x1: X1, stations: 230,
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
    // Frontscheibe (x, |z|) und Heckscheibe (|z|, y)
    { kind: 'window', plane: 'top', thr: 0.2, pts: [0.815, -0.3, 0.815, 0.68, 0.525, 0.78, 0.525, -0.3] },
    { kind: 'window', plane: 'front', nsign: -1, thr: 0.5, pts: [-0.1, 1.47, 0.62, 1.47, 0.62, 1.85, -0.1, 1.85] },
  ],
  wheels: {
    archR: 0.455,
    front: { tireR: 0.41, tireW: 0.3, rimR: 0.3, rimW: 0.27, spokes: 10, pairs: true, hubR: 0.07, dish: 0.07, spokeW0: 0.024, spokeW1: 0.017, thick: 0.015, twist: 0.3, emblem: 'm', caliper: { color: 0x19c7c0, angle: -0.5 } },
    rear: { tireR: 0.41, tireW: 0.32, rimR: 0.3, rimW: 0.29, spokes: 10, pairs: true, hubR: 0.07, dish: 0.07, spokeW0: 0.024, spokeW1: 0.017, thick: 0.015, twist: 0.3, emblem: 'm', caliper: { color: 0x19c7c0, angle: 0.5 } },
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

// ---------------------------------------------------------------------------------------------
// Lichter-Grafiken

function drawTail(g, w, h, emis) {
  const X = (u) => u * w, Y = (v) => (1 - v) * h;
  if (!emis) {
    g.fillStyle = '#16060a'; g.beginPath(); g.roundRect(X(0.0), Y(1.0), X(1.0), Y(0.0) - Y(1.0), h * 0.35); g.fill();
    g.strokeStyle = '#2a2d33'; g.lineWidth = 3; g.stroke();
    glowLine(g, [[X(0.06), Y(0.5)], [X(0.94), Y(0.5)]], h * 0.2, '#7a0f16', 4);
  } else {
    glowLine(g, [[X(0.06), Y(0.5)], [X(0.94), Y(0.5)]], h * 0.26, '#ff2a1c', 16);
    glowLine(g, [[X(0.1), Y(0.5)], [X(0.9), Y(0.5)]], h * 0.1, '#ff9a80', 6);
  }
}

// ---------------------------------------------------------------------------------------------
// Karosserie-Anbauteile

function g63Extras(ctx) {
  const { loft, lights } = ctx;
  ctx.interior = buildG63Interior();
  // DEBUG-CUT
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('cut')) { const c = ctx.body.children; c[0].visible = false; c[1].visible = false; c[2].visible = false; }

  const PF = loft.projFront(), PR = loft.projRear(), PT = loft.projTop();
  const PSr = loft.projSide(1), PSl = loft.projSide(-1);
  const paint = paintMaterial({ flakes: true });
  const carbon = carbonKit();
  const gloss = dbl(matBlackGloss());
  const darkChrome = matDarkChrome();
  const tealMat = new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const ledMat = () => { const m = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.3 }); m.userData.setLevel = (v) => { m.emissiveIntensity = 0.6 + v; }; return m; };

  // ===== Front: Kühlergrill (Panamericana), Emblem
  const grille = meshFor('bars', 0.78, 0.32, 0.036, { line: '#8fd0cc', metal: 1, rough: 0.3 });
  decal(ctx, PF, [-0.39, 0.39, 0.81, 1.13], grille, { nu: 26, nv: 8, off: 0.004 });
  const gf = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.4 });
  for (const [a, b, c, d] of [[-0.415, 0.415, 1.13, 1.155], [-0.415, 0.415, 0.785, 0.81], [-0.415, -0.39, 0.785, 1.155], [0.39, 0.415, 0.785, 1.155]]) decal(ctx, PF, [a, b, c, d], gf, { nu: 6, nv: 2, off: 0.0065 });
  const em = PF(0, 0.97);
  if (em) ctx.add(emblemMesh('m', 0.17, em.p.clone().addScaledVector(em.n, 0.013), em.n), { shadow: false });

  // ===== Scheinwerfer: rund, Ring-Tagfahrlicht
  for (const s of [1, -1]) {
    const zc = s * 0.645, yc = 1.0;
    const f = PF(zc, yc);
    if (!f) continue;
    const grp = new THREE.Group();
    grp.position.set(f.p.x - 0.004, yc, zc);
    const bez = new THREE.Mesh(lx([[0.1, -0.03], [0.124, -0.03], [0.124, 0.05], [0.114, 0.06], [0.1, 0.054], [0.098, 0.0]], 44), gloss);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.098, 36, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.2, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.8 }));
    lens.rotation.z = -Math.PI / 2; lens.position.x = 0.0;
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.1, 36), new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.5, metalness: 0.6 }));
    base.rotation.y = Math.PI / 2; base.position.x = -0.02;
    const drl = new THREE.MeshStandardMaterial({ color: 0x777f88, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3 });
    drl.userData.setLevel = (v) => { drl.emissiveIntensity = v * 1.6; };
    lights.head.push(drl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.0105, 10, 56), drl); ring.rotation.y = Math.PI / 2; ring.position.x = 0.03;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.005, 8, 40), drl); ring2.rotation.y = Math.PI / 2; ring2.position.x = 0.026;
    const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 1, roughness: 0.15, envMapIntensity: 1.6 }));
    proj.rotation.z = Math.PI / 2; proj.position.set(0.03, 0.0, 0.0);
    const lensIn = new THREE.Mesh(new THREE.CircleGeometry(0.025, 24), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, emissive: 0x6f8fb0, emissiveIntensity: 0.0, metalness: 0.4, roughness: 0.1 }));
    lensIn.material.userData.setLevel = (v) => { lensIn.material.emissiveIntensity = v * 0.25; };
    lights.head.push(lensIn.material);
    lensIn.rotation.y = Math.PI / 2; lensIn.position.x = 0.052;
    grp.add(bez, base, lens, ring, ring2, proj, lensIn);
    ctx.add(grp, { shadow: false });
    // Blinker-Pod oben am Kotflügel
    const e = PT(2.08, s * 0.88);
    if (e) carbon.box(0.1, 0.045, 0.1, 0.014, 2.08, e.p.y + 0.02, s * 0.88);
  }

  // ===== Front-Stoßfänger (Carbon, eigener Loft)
  const FB = { x0: 1.95, x1: 2.46, yT: 0.72, yB: 0.34, zW: 1.075 };
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
  decalOn(ctx, bumperF, PBF, [-0.5, 0.5, 0.385, 0.545], meshFor('hex', 1.0, 0.16, 0.032, { line: '#2a2c31', color: '#020203' }), { nu: 24, nv: 4, off: 0.004 });
  frameRect(carbon, xFace(0, 0.46) - 0.004, -0.52, 0.52, 0.37, 0.56, 1);
  badge(ctx, PBF, 0, 0.625, 0.5, 0.115, mansoryTex(512, 118, { bg: '#0a0a0c', fg: '#dfe3e8', fontScale: 0.5, border: '#3a3d44' }), { off: 0.004 });
  for (const s of [1, -1]) {
    // Seitliche Einlässe mit LED-Streifen
    const z0 = 0.58, z1 = 0.95;
    const a = s > 0 ? z0 : -z1, b = s > 0 ? z1 : -z0;
    decalOn(ctx, bumperF, PBF, [a, b, 0.4, 0.64], meshFor('hex', 0.37, 0.24, 0.03, { line: '#2a2c31', color: '#020203' }), { nu: 10, nv: 8, off: 0.004 });
    frameRect(carbon, xFace(s * 0.77, 0.52) - 0.004, a, b, 0.385, 0.655, 1);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.3), ledMat());
    lights.head.push(led.material);
    led.position.set(xFace(s * 0.77, 0.69) + 0.004, 0.69, s * 0.77);
    ctx.add(led, { shadow: false });
  }
  // Frontlippe (Carbon-Klinge) + Canards
  {
    const outl = [];
    const N = 14;
    for (let i = 0; i <= N; i++) { const z = -1.0 + (2.0 * i) / N; outl.push([FB.x1 + 0.065 - 0.03 * Math.pow(Math.abs(z) / 1.0, 3) - (Math.abs(z) > 0.9 ? (Math.abs(z) - 0.9) * 1.2 : 0), z]); }
    const inner = outl.map(([x, z]) => [x - 0.2, z]).reverse();
    const lip = plank([...outl, ...inner], 0.022, 0.29, carbon.mat, { bevel: 0.006 });
    carbon.addMesh(lip);
    for (const s of [1, -1]) carbon.box(0.2, 0.1, 0.014, 0.004, FB.x1 - 0.02, 0.38, s * 1.045, 0, s * 0.35, 0);
  }

  // ===== Haube: Carbon, Mittelgrat, Lufthutzen
  {
    carbon.add(loft.drape(PT, 0.92, 2.265, -0.7, 0.7, 40, 14, 0.004));
    const n = 36, path = [], outs = [], ups = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(1.0, 2.15, i / n);
      const u = i / n;
      const k = smoothstep(0, 0.12, u) * smoothstep(1, 0.8, u);
      const y = loft.topY(x, 0);
      path.push([x, y + 0.003, 0]); outs.push([0, 0, 0.35 + 0.65 * k]); ups.push([0, 0.2 + 0.8 * k, 0]);
    }
    const prof = [[-0.3, -0.006], [-0.26, 0.016], [-0.17, 0.03], [0.17, 0.03], [0.26, 0.016], [0.3, -0.006]];
    carbon.add(sweep(path, outs, ups, prof, { closedProfile: true }));
    for (const s of [1, -1]) {
      const y = loft.topY(1.05, s * 0.55) ?? 1.28;
      carbon.box(0.26, 0.05, 0.14, 0.014, 1.08, y + 0.022, s * 0.56, 0, s * -0.25, 0);
    }
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), meshFor('slats', 0.13, 0.22, 0.02, { line: '#3a8e8a', color: '#020203' }));
    vent.rotation.x = -Math.PI / 2;
    vent.position.set(1.12, loft.topY(1.12, 0) + 0.034, 0);
    ctx.add(vent, { shadow: false });
  }

  // ===== Kotflügelverbreiterungen (Carbon) mit Lüftungsschlitzen
  const archF = [WB / 2, 0.41, 0.462], archR = [-WB / 2, 0.41, 0.462];
  const flF = [[0.64, 0.5], [0.64, 1.17], [1.0, 1.175], [1.03, 1.02], [1.9, 1.02], [2.2, 1.0], [2.325, 0.9], [2.3, 0.5]];
  const flR = [[-0.6, 0.5], [-0.84, 1.17], [-1.0, 1.175], [-1.03, 1.02], [-2.0, 1.02], [-2.38, 1.0], [-2.42, 0.9], [-2.4, 0.5]];
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

  // ===== Spiegel, Spaltmaße, Griffe, Zierlinien
  for (const s of [1, -1]) {
    const m = mirror(paint, { x: 0.72, y: 1.27, z: 0.93, w: 0.25, h: 0.17, d: 0.14 });
    if (s < 0) m.scale.z = -1;
    ctx.add(m);
    const P = s > 0 ? PSr : PSl;
    const lm = lineMat();
    const lines = [[[0.66, 0.5], [0.66, 1.2]], [[-0.38, 0.5], [-0.38, 1.22]], [[-1.29, 0.5], [-1.29, 1.22]], [[0.66, 0.5], [-0.38, 0.5], [-1.29, 0.5]]];
    for (const l of lines) { const g = surfaceLine(P, l, 0.0045, 0.0007); if (g) ctx.add(new THREE.Mesh(g, lm), { shadow: false }); }
    for (const x of [-0.25, -1.16]) {
      const g = surfaceLine(P, [[x - 0.06, 1.04], [x + 0.06, 1.04]], 0.03, 0.006);
      if (g) ctx.add(new THREE.Mesh(g, darkChrome), { shadow: false });
    }
    for (const l of [[[0.64, 1.24], [-1.3, 1.24]], [[0.6, 0.86], [-0.36, 0.86]], [[-0.4, 0.86], [-1.26, 0.86]]]) {
      const g = surfaceLine(P, l, 0.006, 0.0012);
      if (g) ctx.add(new THREE.Mesh(g, tealMat), { shadow: false });
    }
  }

  // ===== Dach: Querträger mit LED-Pods, Reling, Heckspoiler
  carbon.box(0.1, 0.05, 1.6, 0.015, 0.58, 1.99, 0);
  for (const s of [1, -1]) {
    carbon.box(0.07, 0.05, 0.42, 0.012, 0.58 + 0.03, 1.99, s * 0.55);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.36), ledMat());
    led.position.set(0.58 + 0.067, 1.99, s * 0.55);
    ctx.add(led, { shadow: false });
    carbon.box(2.3, 0.022, 0.032, 0.008, -0.9, 1.972, s * 0.82);
  }
  carbon.box(0.1, 0.07, 0.4, 0.02, 0.58, 2.0, 0);
  {
    const sp = plank([[-2.1, -0.88], [-2.46, -0.9], [-2.46, 0.9], [-2.1, 0.88]], 0.026, 1.975, carbon.mat, { bevel: 0.008 });
    carbon.addMesh(sp);
    for (const s of [1, -1]) carbon.box(0.4, 0.09, 0.014, 0.005, -2.28, 2.0, s * 0.9);
  }

  // ===== Heck: Reserverad mit Carbon-Abdeckung
  {
    const R = 0.4, face = -0.095;
    const rim = new THREE.Mesh(lx([[0.31, face], [0.365, face + 0.004], [0.392, face + 0.03], [R, face + 0.07], [R, 0.1], [R - 0.02, 0.12], [0, 0.12]], 64), gloss);
    const cover = new THREE.Group();
    cover.add(rim);
    const dg = lx([[0, face], [0.312, face]], 64);
    const dm = new THREE.Mesh(boxUV(dg.index ? dg.toNonIndexed() : dg, 0.07), carbon.mat);
    cover.add(dm);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshStandardMaterial({ map: mansoryTex(512, 128, { bg: '#08090b', fg: '#e3e6ea', fontScale: 0.46, border: '#555a62' }), roughness: 0.35, metalness: 0.4 }));
    plaque.rotation.y = -Math.PI / 2; plaque.position.x = face - 0.004;
    cover.add(plaque);
    cover.position.set(-2.46, 1.15, 0);
    ctx.add(cover);
    carbon.box(0.18, 0.1, 0.1, 0.02, -2.4, 0.74, 0);
  }

  // ===== Heck-Stoßfänger (Carbon, eigener Loft), Diffusor, Auspuff, Leuchten
  const RB = { x0: -2.47, x1: -2.0, yT: 0.74, yB: 0.34, zW: 1.075 };
  const bumperR = new Loft({
    x0: RB.x0, x1: RB.x1, stations: 90,
    pts: [{ z: 0, y: RB.yT }, { z: RB.zW, y: RB.yT }, { z: RB.zW, y: RB.yB }, { z: 0, y: RB.yB }],
    rad: [0, 0.07, 0.05, 0],
    endR: { len: 0.34, nz: 5, nyT: 9, nyB: 7, cy: 0.54 },
  });
  carbon.add(bumperR.build());
  const PBR = bumperR.projRear();
  const xRear = (z, y) => { const r = PBR(z, y); return r ? r.p.x : RB.x0; };
  badge(ctx, PBR, 0, 0.655, 0.5, 0.115, mansoryTex(512, 118, { bg: '#0a0a0c', fg: '#dfe3e8', fontScale: 0.5, border: '#3a3d44' }), { off: 0.004 });
  {
    const xd = xRear(0, 0.48);
    decalOn(ctx, bumperR, PBR, [-0.4, 0.4, 0.39, 0.59], new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.5, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { nu: 6, nv: 3, off: 0.004 });
    frameRect(carbon, xd - 0.004, -0.42, 0.42, 0.375, 0.6, -1);
    for (let i = 0; i < 5; i++) carbon.box(0.07, 0.2, 0.013, 0.004, xd - 0.025, 0.49, lerp(-0.34, 0.34, i / 4));
    for (const s of [1, -1]) {
      for (const dz of [-0.095, 0.095]) {
        const t = exhaustTip({ shape: 'rect', w: 0.165, h: 0.115, len: 0.14 });
        t.position.set(xRear(s * 0.7, 0.5) - 0.045, 0.5, s * 0.7 + dz);
        ctx.add(t);
      }
      frameRect(carbon, xRear(s * 0.7, 0.5) - 0.004, s * 0.7 - 0.22, s * 0.7 + 0.22, 0.41, 0.6, -1, { t: 0.03, d: 0.034 });
    }
  }
  {
    const tlm = lightDecal(drawTail, 512, 64, { emissiveColor: 0xff2010 });
    lights.tail.push(tlm);
    for (const s of [1, -1]) {
      const a = s > 0 ? 0.56 : -0.95, b = s > 0 ? 0.95 : -0.56;
      decal(ctx, PR, [a, b, 0.78, 0.85], tlm, { nu: 16, nv: 3, off: 0.005, order: 2 });
    }
  }

  // Zusammenfassen: alle Carbon-Teile -> ein Mesh
  ctx.add(carbon.build());
}

export function buildG63() { return assembleCar(G63_DEF); }
