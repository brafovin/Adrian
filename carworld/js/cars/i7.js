// BMW i7 (G70, M70-Optik), Widebody – nach Referenzbild 2.
// Koordinaten: +x vorne, +y oben, +z rechts, Ursprung = Mitte des Radstands am Boden.

import * as THREE from 'three';
import { curve, smoothstep } from '../util.js';
import { assembleCar } from './builder.js';
import { paintMaterial, carbonMaterial, matBlackGloss, matDarkChrome, canvas, canvasTexture, heightToNormal } from '../materials.js';
import { lightDecal, glowLine, surfaceLine, lineMat, exhaustTip, emblemMesh } from './parts.js';
import { buildInterior } from './interior.js';
import { sweep } from './loft.js';
import { decal, meshMaterial, plank, archLip, skirt, mirror, roundedBox, orient } from './kit.js';

const WB = 3.21;
const AX = WB / 2;

// Kotflügelverbreiterungen (Widebody): vorne moderat, hinten kräftig
const flare = (x) => 0.065 * smoothstep(0.85, 1.2, x) * (1 - 0.7 * smoothstep(1.95, 2.35, x))
  + 0.085 * smoothstep(-0.8, -1.2, x) * (1 - 0.5 * smoothstep(-2.4, -2.74, x));

// ---- Längsprofil der Mittellinie (Haube, Scheibe, Dach, Heckscheibe, Kofferraum)
const yTop = curve([[-2.74, 0.94], [-2.6, 0.972], [-2.4, 0.978], [-2.2, 1.0], [-2.0, 1.055], [-1.75, 1.15], [-1.5, 1.245], [-1.2, 1.32], [-0.9, 1.37], [-0.5, 1.398], [-0.2, 1.39], [0.1, 1.335], [0.4, 1.25], [0.7, 1.12], [0.85, 1.03], [0.95, 1.0], [1.3, 0.945], [1.7, 0.895], [2.0, 0.83], [2.25, 0.775], [2.4, 0.74]]);
// Halbbreite an der Dachkante (P1)
const z1 = curve([[-2.74, 0.78], [-2.5, 0.8], [-2.2, 0.76], [-1.9, 0.68], [-1.5, 0.62], [-0.9, 0.64], [-0.2, 0.66], [0.4, 0.69], [0.9, 0.76], [1.5, 0.8], [2.0, 0.83], [2.25, 0.83], [2.4, 0.8]]);
const dE = curve([[-2.74, 0.05], [-2.0, 0.06], [-1.0, 0.07], [0.0, 0.07], [0.6, 0.06], [1.0, 0.05], [2.4, 0.04]]);
// Gürtellinie / Schulter (P2)
const y2 = curve([[-2.74, 0.86], [-2.55, 0.93], [-2.2, 0.955], [-1.0, 0.957], [0.2, 0.957], [0.7, 0.95], [1.0, 0.92], [1.5, 0.87], [2.0, 0.82], [2.4, 0.7]]);
const z2 = curve([[-2.74, 0.85], [-2.5, 0.97], [-2.1, 0.985], [-1.6, 0.985], [-1.0, 0.96], [0, 0.95], [0.9, 0.96], [1.5, 0.975], [1.9, 0.98], [2.25, 0.97], [2.4, 0.93]]);
// größte Breite (P3)
const z3 = curve([[-2.74, 0.84], [-2.55, 0.94], [-2.2, 0.975], [-1.6, 0.975], [-0.9, 0.965], [0, 0.96], [0.9, 0.965], [1.6, 0.97], [2.0, 0.985], [2.25, 0.985], [2.4, 0.95]]);
const y3 = curve([[-2.74, 0.55], [-2.0, 0.6], [-1.0, 0.58], [1.0, 0.58], [2.0, 0.56], [2.4, 0.5]]);
// Schweller-Kante (P4) und Unterboden-Kante (P5)
const z4 = curve([[-2.74, 0.74], [-2.45, 0.9], [-2.0, 0.94], [-1.0, 0.95], [1.0, 0.95], [1.9, 0.945], [2.25, 0.94], [2.4, 0.9]]);
const y4 = curve([[-2.74, 0.22], [-2.4, 0.17], [-1.2, 0.13], [1.2, 0.13], [2.0, 0.14], [2.4, 0.17]]);
const z5 = curve([[-2.74, 0.62], [-2.2, 0.8], [-1.5, 0.84], [1.5, 0.84], [2.0, 0.86], [2.25, 0.85], [2.4, 0.8]]);
const y5 = curve([[-2.74, 0.17], [-2.3, 0.13], [-1.5, 0.11], [0, 0.11], [1.5, 0.1], [2.0, 0.09], [2.4, 0.1]]);

// Seitenfenster: Oberkante folgt der Dachlinie (Abstand = Dachrahmen)
const winTop = (x) => yTop(x) - 0.085;
function sideWindow(xFront, xRear, y0, xs) {
  const pts = [xFront, y0];
  for (const x of xs) pts.push(x, Math.min(winTop(x), 1.4));
  pts.push(xRear, y0);
  return pts;
}

export const I7_DEF = {
  id: 'i7',
  name: 'BMW i7',
  dims: { wheelbase: WB, trackF: 1.72, trackR: 1.74, length: 5.14, width: 2.1, height: 1.4, cgX: WB / 2 - WB * (1 - 0.5) },
  loft: {
    x0: -2.74, x1: 2.4, stations: 190,
    pts: [
      { z: 0, y: yTop },
      { z: z1, y: (x) => yTop(x) - dE(x) },
      { z: (x) => z2(x) + 0.9 * flare(x), y: y2 },
      { z: (x) => z3(x) + flare(x), y: y3 },
      { z: (x) => z4(x) + flare(x) * 0.4, y: y4 },
      { z: z5, y: y5 },
      { z: 0, y: y5 },
    ],
    rad: [6, curve([[-2.4, 0.15], [0, 0.14], [2, 0.12]]), 0.07, 1.2, 0.06, 0.05, 0],
    endF: { len: 0.2, nz: 5, nyT: 5, nyB: 5, cy: 0.45 },
    endR: { len: 0.28, nz: 3.0, nyT: 9, nyB: 7, cy: 0.55 },
  },
  masks: [
    // Seitenfenster: vordere Tür, hintere Tür
    { kind: 'window', plane: 'side', pts: sideWindow(0.64, -0.3, 0.957, [0.5, 0.3, 0.1, -0.1, -0.3]) },
    { kind: 'window', plane: 'side', pts: sideWindow(-0.4, -1.47, 0.957, [-0.4, -0.7, -1.0, -1.2, -1.34, -1.43]) },
    // Frontscheibe / Heckscheibe (x, |z|)
    { kind: 'window', plane: 'top', thr: 0.2, pts: [0.9, -0.3, 0.9, 0.63, 0.04, 0.55, 0.04, -0.3] },
    { kind: 'window', plane: 'top', thr: 0.2, pts: [-1.5, -0.3, -1.5, 0.55, -2.12, 0.66, -2.12, -0.3] },
  ],
  wheels: {
    archR: 0.41,
    front: { tireR: 0.365, tireW: 0.285, rimR: 0.28, rimW: 0.26, spokes: 10, pairs: true, hubR: 0.06, dish: 0.055, spokeW0: 0.034, spokeW1: 0.017, thick: 0.016, twist: 0.1, emblem: 'roundel', caliper: { color: 0xc4121a, angle: -0.5 } },
    rear: { tireR: 0.37, tireW: 0.32, rimR: 0.28, rimW: 0.3, spokes: 10, pairs: true, hubR: 0.06, dish: 0.05, spokeW0: 0.034, spokeW1: 0.017, thick: 0.016, twist: 0.1, emblem: 'roundel', caliper: { color: 0xc4121a, angle: 0.5 } },
  },
  headlightPos: { x: 2.0, y: 0.62, z: 0.7 },
  extras(ctx) { i7Extras(ctx); },
};

// ---------------------------------------------------------------------------------------------
// Eigene Hilfsfunktionen (Text, Logos, Kennzeichen, Embleme)

const mkCanvas = (w, h) => { const c = canvas(w, h); return [c, c.getContext('2d')]; };

/** ///M-Logo: drei schräge Streifen (hellblau, dunkelblau, rot) + "M". */
function drawMLogo(g, x, y, s, fg = '#e9e9ec') {
  const sk = s * 0.28;
  const cols = ['#7fc4ff', '#1253b8', '#e2182c'];
  const sw = s * 0.22;
  g.save();
  g.translate(x, y);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = cols[i];
    const x0 = i * (sw * 1.05);
    g.beginPath(); g.moveTo(x0 + sk, -s * 0.5); g.lineTo(x0 + sk + sw, -s * 0.5); g.lineTo(x0 + sw, s * 0.5); g.lineTo(x0, s * 0.5); g.closePath(); g.fill();
  }
  g.fillStyle = fg; g.font = `italic 700 ${s * 1.05}px Arial, Helvetica, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('M', 3 * sw * 1.05 + sk * 0.2 + s * 0.12, s * 0.04);
  g.restore();
}

/** Kennzeichen "THE i7" + ///M. */
function drawPlate(g, w, h) {
  g.fillStyle = '#17171a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6a6b72'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
  g.strokeStyle = '#2a2a2e'; g.lineWidth = 2; g.strokeRect(11, 11, w - 22, h - 22);
  g.fillStyle = '#f2f2f4'; g.font = 'bold 66px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THE i7', w / 2, h * 0.38);
  drawMLogo(g, w / 2 - 52, h * 0.77, 30);
}

/** Kennzeichenplatte als Quader, an die Fläche angelegt. */
function platePanel(ctx, proj, uc, vc, w, h, off = 0.006) {
  const a = proj(uc, vc);
  if (!a) return null;
  const [c, g] = mkCanvas(512, Math.round(512 * h / w));
  drawPlate(g, 512, c.height);
  const face = new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.4, metalness: 0, envMapIntensity: 0.5 });
  const side = matBlackGloss();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, w), [face, side, side, side, side, side]);
  const n = a.n.clone().normalize();
  mesh.position.copy(a.p).addScaledVector(n, off);
  mesh.quaternion.setFromRotationMatrix(orient(n));
  ctx.body.add(mesh);
  mesh.castShadow = false;
  return mesh;
}

/** Schriftzug / Logo als transparentes Decal. */
function logoDecal(ctx, proj, box, w, h, draw, opts = {}, matOpts = null) {
  const [c, g] = mkCanvas(w, h);
  draw(g, w, h);
  const base = { map: canvasTexture(c), transparent: true, alphaTest: 0.08, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
  const mat = matOpts
    ? new THREE.MeshPhysicalMaterial({ ...base, ...matOpts })
    : new THREE.MeshStandardMaterial({ ...base, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.3 });
  return decal(ctx, proj, box, mat, { nu: 8, nv: 4, off: 0.005, order: 3, ...opts });
}

/** Roundel mit korrekter Ausrichtung (Oberseite des Logos zeigt zum Dach). */
function badge(ctx, type, size, p, n) {
  const m = emblemMesh(type, size, p.clone().addScaledVector(n, 0.008), n);
  const Z = n.clone().normalize();
  let Y = new THREE.Vector3(0, 1, 0).addScaledVector(Z, -Z.y);
  if (Y.lengthSq() < 1e-6) Y.set(-1, 0, 0);
  Y.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  ctx.add(m, { shadow: false });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Frontgrafiken

/** Doppelniere: zwei große Nieren mit senkrechten Stäben, Rand leuchtet. Breite 1.06 m, Höhe 0.42 m. */
function kidneyMaterial() {
  const W = 1024, H = 420;
  const [c, g] = mkCanvas(W, H);
  const [hc, hg] = mkCanvas(W, H);
  const [ec, eg] = mkCanvas(W, H);
  g.clearRect(0, 0, W, H);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  hg.fillStyle = '#101010'; hg.fillRect(0, 0, W, H);
  const cx = W / 2, hw = W / 2 - 14, top = 8, bot = H - 8, hh = bot - top;
  // normierte Nierenform (nx 0 = Mitte, 1 = außen; ny 0 = unten, 1 = oben)
  const shape = (gg, side, inset = 0) => {
    const X = (nx) => cx + side * (nx * (hw - inset) + 7 + inset * 0.2);
    const Y = (ny) => bot - inset - ny * (hh - 2 * inset);
    gg.beginPath();
    gg.moveTo(X(0.0), Y(0.99));
    gg.lineTo(X(0.8), Y(1.0));
    gg.quadraticCurveTo(X(1.0), Y(1.0), X(1.0), Y(0.82));
    gg.lineTo(X(0.975), Y(0.14));
    gg.quadraticCurveTo(X(0.965), Y(0.0), X(0.8), Y(0.0));
    gg.lineTo(X(0.0), Y(0.03));
    gg.closePath();
  };
  for (const side of [1, -1]) {
    // Rahmen (dunkles Chrom)
    shape(g, side, 0);
    g.fillStyle = '#17181b'; g.fill();
    // Innenfläche mit Stäben
    g.save(); shape(g, side, 11); g.clip();
    g.fillStyle = '#030304'; g.fillRect(0, 0, W, H);
    hg.save(); shape(hg, side, 11); hg.clip();
    hg.fillStyle = '#181818'; hg.fillRect(0, 0, W, H);
    const nb = 17, pitch = (hw - 18) / nb;
    for (let i = 0; i < nb; i++) {
      const x = cx + side * (12 + (i + 0.5) * pitch);
      const gr = g.createLinearGradient(x - pitch * 0.34, 0, x + pitch * 0.34, 0);
      gr.addColorStop(0, '#0a0a0c'); gr.addColorStop(0.42, '#8a8e98'); gr.addColorStop(0.58, '#555861'); gr.addColorStop(1, '#0a0a0c');
      g.fillStyle = gr; g.fillRect(x - pitch * 0.34, 0, pitch * 0.68, H);
      const hgr = hg.createLinearGradient(x - pitch * 0.34, 0, x + pitch * 0.34, 0);
      hgr.addColorStop(0, '#303030'); hgr.addColorStop(0.5, '#ffffff'); hgr.addColorStop(1, '#303030');
      hg.fillStyle = hgr; hg.fillRect(x - pitch * 0.34, 0, pitch * 0.68, H);
    }
    // waagerechter Querholm (Radar-Träger)
    g.fillStyle = '#0b0b0d'; g.fillRect(0, H * 0.46, W, 7);
    g.restore(); hg.restore();
    // leuchtender Rand
    shape(eg, side, 4);
    eg.strokeStyle = '#ffffff'; eg.lineWidth = 3; eg.shadowColor = '#cfe0ff'; eg.shadowBlur = 6; eg.stroke();
    shape(g, side, 3);
    g.strokeStyle = '#9fa3ad'; g.lineWidth = 3; g.stroke();
  }
  // Mittelsteg
  g.fillStyle = '#16171a'; g.fillRect(cx - 7, 0, 14, H);
  const map = canvasTexture(c);
  const normalMap = canvasTexture(heightToNormal(hc, 3.2), { srgb: false });
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1, 1), metalness: 0.9, roughness: 0.34, envMapIntensity: 1.5,
    emissive: new THREE.Color(0xdbe6ff), emissiveMap: canvasTexture(ec), emissiveIntensity: 0.25,
    transparent: false, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mat.userData.setLevel = (v) => { mat.emissiveIntensity = 0.12 + v * 0.1; };
  return mat;
}

/** Oberer LED-Schlitz (Tagfahrlicht). Unmirrored: innen = x 0, außen = x 1. */
function drawSlit(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    if (!emis) {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.38)); g.lineTo(X(0.62), Y(0.5)); g.quadraticCurveTo(X(0.9), Y(0.62), X(1.0), Y(0.85));
      g.lineTo(X(0.96), Y(0.98)); g.quadraticCurveTo(X(0.7), Y(0.74), X(0.0), Y(0.66)); g.closePath();
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#16181c'); gr.addColorStop(0.5, '#050607'); gr.addColorStop(1, '#14161a');
      g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2b2d33'; g.stroke();
    } else {
      glowLine(g, [[X(0.03), Y(0.55)], [X(0.55), Y(0.62)], [X(0.85), Y(0.74)], [X(0.96), Y(0.88)]], h * 0.1, '#ffffff', 16);
      glowLine(g, [[X(0.1), Y(0.46)], [X(0.5), Y(0.53)]], h * 0.04, '#dbe8ff', 8);
    }
    g.restore();
  };
}

/** Untere Leuchtpods mit je drei kleinen runden Lampen. */
function drawPod(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const lamps = [[0.17, 0.5, 0.2], [0.5, 0.48, 0.16], [0.8, 0.46, 0.13]];
    if (!emis) {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.12)); g.lineTo(X(0.0), Y(0.9)); g.quadraticCurveTo(X(0.5), Y(1.0), X(0.97), Y(0.78)); g.lineTo(X(1.0), Y(0.3)); g.quadraticCurveTo(X(0.6), Y(0.05), X(0.0), Y(0.12)); g.closePath();
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#101216'); gr.addColorStop(0.5, '#040405'); gr.addColorStop(1, '#0d0f12');
      g.fillStyle = gr; g.fill(); g.lineWidth = 5; g.strokeStyle = '#5f626b'; g.stroke();
      for (const [u, v, r] of lamps) {
        const R = h * r;
        g.beginPath(); g.arc(X(u), Y(v), R * 1.25, 0, 7); g.fillStyle = '#000'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#7d818a'; g.stroke();
        const rg = g.createRadialGradient(X(u) - R * 0.3, Y(v) - R * 0.3, 1, X(u), Y(v), R);
        rg.addColorStop(0, '#c8d2e0'); rg.addColorStop(0.5, '#38404c'); rg.addColorStop(1, '#0a0c10');
        g.fillStyle = rg; g.beginPath(); g.arc(X(u), Y(v), R, 0, 7); g.fill();
      }
    } else {
      for (const [u, v, r] of lamps) {
        const R = h * r;
        const rg = g.createRadialGradient(X(u), Y(v), 1, X(u), Y(v), R * 0.9);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, '#fff1d6'); rg.addColorStop(1, 'rgba(255,230,190,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(X(u), Y(v), R * 0.9, 0, 7); g.fill();
      }
    }
    g.restore();
  };
}

/** Rückleuchte: schmaler roter Lichtstreifen mit Haken nach außen. Unmirrored: innen = x 0. */
function drawTail(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const line = [[X(0.02), Y(0.44)], [X(0.7), Y(0.46)], [X(0.8), Y(0.52)], [X(0.9), Y(0.66)], [X(0.99), Y(0.7)]];
    if (!emis) {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.3)); g.lineTo(X(0.72), Y(0.33)); g.lineTo(X(0.84), Y(0.42)); g.lineTo(X(1.0), Y(0.55));
      g.lineTo(X(1.0), Y(0.88)); g.lineTo(X(0.86), Y(0.84)); g.lineTo(X(0.72), Y(0.6)); g.lineTo(X(0.0), Y(0.58)); g.closePath();
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#2a0508'); gr.addColorStop(0.6, '#3d070c'); gr.addColorStop(1, '#22040a');
      g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = '#0d0203'; g.stroke();
      glowLine(g, line, h * 0.1, '#7a0f16', 2);
    } else {
      glowLine(g, line, h * 0.12, '#ff2a1c', 16);
      glowLine(g, [[X(0.78), Y(0.36)], [X(0.9), Y(0.44)], [X(0.99), Y(0.5)]], h * 0.06, '#ff3a26', 8);
    }
    g.restore();
  };
}

// ---------------------------------------------------------------------------------------------

function i7Extras(ctx) {
  const { loft, body, lights } = ctx;
  ctx.interior = buildInterior({
    leather: 0x0b0b0c, accent: 0xb01820, thread: '#2a62c0', quilt: true, carbon: true, emblem: 'roundel', screenText: 'i7', clusterColor: '#4aa8ff',
    dash: { x: 0.72, y: 0.72, w: 1.6, depth: 0.5, h: 0.22 }, wheel: { x: 0.46, y: 0.8, z: -0.37, r: 0.19, tilt: 0.38 },
    seat: { x: 0.05, y: 0.42, z: 0.37 }, rearSeat: { x: -1.0, y: 0.5, z: 0.37 }, console: { x: 0.15, y: 0.42, len: 1.1 }, floorY: 0.28,
    eye: [0.0, 1.08, -0.37],
  });
  const PF = loft.projFront(), PR = loft.projRear(), PT = loft.projTop();
  const PSr = loft.projSide(1), PSl = loft.projSide(-1);
  const paint = paintMaterial({ flakes: true });
  const carbon = carbonMaterial({ repeat: 7 });
  const gloss = matBlackGloss();
  const darkChrome = matDarkChrome();
  ctx.mats.glass.opacity = 0.9; // dunkel getönte Verglasung

  // ---- Front: Doppelniere
  const kid = kidneyMaterial();
  lights.head.push(kid);
  decal(ctx, PF, [0.47, -0.47, 0.33, 0.715], kid, { nu: 36, nv: 14, off: 0.006, order: 1 });

  // Roundel auf der Haubenkante
  const hp = PT(2.2, 0);
  if (hp) badge(ctx, 'roundel', 0.09, hp.p, hp.n);

  // Haubenkanten (Powerdome-Linien)
  {
    const lm = lineMat();
    for (const sg of [1, -1]) {
      for (const pts of [[[1.0, sg * 0.34], [1.6, sg * 0.31], [2.15, sg * 0.27]], [[0.98, sg * 0.66], [1.6, sg * 0.7], [2.1, sg * 0.72]]]) {
        const g = surfaceLine(PT, pts, 0.004, 0.0008);
        if (g) ctx.add(new THREE.Mesh(g, lm), { shadow: false });
      }
    }
  }

  // Scheinwerfer: oben LED-Schlitz, unten Pod mit je drei Lampen
  const slitR = lightDecal(drawSlit(true), 512, 96), slitL = lightDecal(drawSlit(false), 512, 96);
  const podR = lightDecal(drawPod(true), 512, 176), podL = lightDecal(drawPod(false), 512, 176);
  lights.head.push(slitR, slitL);
  for (const m of [podR, podL]) { m.userData.setLevel = (v) => { m.emissiveIntensity = 0.25 + v * 0.18; }; lights.head.push(m); }
  decal(ctx, PF, [0.96, 0.5, 0.675, 0.77], slitR, { nu: 28, nv: 6, off: 0.006, order: 2 });
  decal(ctx, PF, [-0.5, -0.96, 0.675, 0.77], slitL, { nu: 28, nv: 6, off: 0.006, order: 2 });
  decal(ctx, PF, [0.93, 0.51, 0.52, 0.665], podR, { nu: 24, nv: 8, off: 0.006, order: 2 });
  decal(ctx, PF, [-0.51, -0.93, 0.52, 0.665], podL, { nu: 24, nv: 8, off: 0.006, order: 2 });

  // seitliche senkrechte Lufteinlässe + kantige Facetten der Schürze
  const vent = meshMaterial('hex', { cells: 5, w: 256, h: 256, line: '#2c2d33' });
  const edge = new THREE.MeshStandardMaterial({ color: 0xa4a7b0, metalness: 1, roughness: 0.22, envMapIntensity: 1.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const addLine = (P, pts, w, off, mat, closed = false) => { const g = surfaceLine(P, pts, w, off, closed); if (g) ctx.add(new THREE.Mesh(g, mat), { shadow: false }); };
  for (const sg of [1, -1]) {
    decal(ctx, PF, [sg * 0.74, sg * 0.9, 0.17, 0.47], vent, { nu: 8, nv: 14, off: 0.004 });
    addLine(PF, [[sg * 0.74, 0.17], [sg * 0.9, 0.17], [sg * 0.9, 0.47], [sg * 0.74, 0.47]], 0.01, 0.005, edge, true);
    addLine(PF, [[sg * 0.5, 0.5], [sg * 0.56, 0.36], [sg * 0.66, 0.24], [sg * 0.74, 0.17], [sg * 0.74, 0.09]], 0.011, 0.005, edge);
    addLine(PF, [[sg * 0.5, 0.515], [sg * 0.93, 0.515]], 0.006, 0.004, edge);
    addLine(PF, [[sg * 0.36, 0.325], [sg * 0.62, 0.3]], 0.005, 0.004, edge);
  }
  // glänzende Mittelpartie der Schürze (Trapez um das Kennzeichen), Kanten hell abgesetzt
  logoDecal(ctx, PF, [0.97, -0.97, 0.08, 0.52], 1024, 232, (g, w, h) => {
    const X = (z) => ((0.97 - z) / 1.94) * w, Y = (y) => ((0.52 - y) / 0.44) * h;
    const poly = [[0.56, 0.36], [0.5, 0.325], [-0.5, 0.325], [-0.56, 0.36], [-0.66, 0.24], [-0.74, 0.17], [-0.74, 0.09], [0.74, 0.09], [0.74, 0.17], [0.66, 0.24]];
    g.beginPath(); poly.forEach(([z, y], i) => (i ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)))); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b0c0e'); gr.addColorStop(1, '#020203');
    g.fillStyle = gr; g.fill();
  }, { nu: 40, nv: 12, order: 1, off: 0.003 }, { metalness: 0.15, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 });
  platePanel(ctx, PF, 0, 0.25, 0.54, 0.125);

  // ---- Frontlippe (Carbon, kantig mit hochgezogenen Enden)
  {
    const yL = 0.075;
    const zs = [-1.0, -0.62, -0.42, 0.42, 0.62, 1.0];
    const xf = zs.map((z) => loft.endX(Math.sign(z) * Math.min(Math.abs(z), 0.95), 0.11, +1) ?? 2.3);
    const dx = [0.05, 0.1, 0.13, 0.13, 0.1, 0.05];
    const front = zs.map((z, i) => [xf[i] + dx[i], z]);
    const back = zs.map((z, i) => [xf[i] - 0.05, z * 0.97]).reverse();
    ctx.add(plank([...front, ...back], 0.012, yL, carbon));
    // dünne Kante vorn (dunkles Chrom)
    const e1 = zs.map((z, i) => [xf[i] + dx[i], z]);
    const e2 = zs.map((z, i) => [xf[i] + dx[i] - 0.012, z * 0.995]).reverse();
    ctx.add(plank([...e1, ...e2], 0.004, yL + 0.012, darkChrome, { bevel: 0.001 }));
    // hochgezogene Enden (Canards)
    for (const sg of [1, -1]) {
      const x0 = xf[sg > 0 ? 5 : 0];
      const fin = roundedBox(0.22, 0.09, 0.01, 0.003, carbon);
      fin.position.set(x0 + 0.01, 0.125, sg * 0.97);
      fin.rotation.set(sg * 0.22, sg * 0.28, 0);
      ctx.add(fin);
    }
  }

  // ---- Seitenschweller (mehrlagig, kantig) + Radlauf-Verbreiterungen + Spiegel
  for (const s of [1, -1]) {
    const sk = skirt(loft, s, -1.05, 1.1, 0.2, { out: 0.06, h: 0.115 }, gloss);
    if (sk) ctx.add(sk);
    const sk2 = skirt(loft, s, -1.0, 1.05, 0.118, { out: 0.085, h: 0.022 }, carbon);
    if (sk2) ctx.add(sk2);
    const sk3 = skirt(loft, s, -0.95, 1.0, 0.27, { out: 0.035, h: 0.03 }, paint);
    if (sk3) ctx.add(sk3);
    for (const [cx, cy, R] of [[AX, 0.365, 0.425], [-AX, 0.37, 0.425]]) {
      const l = archLip(loft, cx, cy, R, s, { out: 0.032, rad: 0.055, a0: -0.12, a1: Math.PI + 0.12 }, paint);
      if (l) ctx.add(l);
    }
    const m = mirror(paint, { x: 0.58, y: 0.93, z: 0.95, w: 0.22, h: 0.115, d: 0.15 });
    if (s < 0) m.scale.z = -1;
    ctx.add(m);
  }

  // Zierkanten an Schweller, Flankenlinie und Kanten der Kotflügelverbreiterung
  for (const P of [PSr, PSl]) {
    addLine(P, [[-1.0, 0.262], [0.0, 0.262], [1.0, 0.262]], 0.006, 0.062, edge);
    const lm2 = lineMat();
    for (const pts of [[[2.0, 0.76], [1.0, 0.8], [-1.0, 0.82], [-2.3, 0.86]], [[0.98, 0.3], [0.96, 0.6], [0.9, 0.88]], [[-0.98, 0.3], [-0.97, 0.55], [-1.0, 0.9]]]) {
      const g = surfaceLine(P, pts, 0.004, 0.0007);
      if (g) ctx.add(new THREE.Mesh(g, lm2), { shadow: false });
    }
  }

  // ---- Spaltmaße + Türgriffe
  for (const P of [PSr, PSl]) {
    const lm = lineMat();
    const lines = [
      [[0.74, 0.3], [0.76, 0.6], [0.72, 0.95]], [[-0.34, 0.28], [-0.34, 0.95]], [[-1.3, 0.3], [-1.31, 0.6], [-1.28, 0.95]],
      [[0.74, 0.3], [0.2, 0.28], [-0.34, 0.28], [-1.3, 0.3]],
    ];
    for (const l of lines) { const g = surfaceLine(P, l, 0.0035, 0.0006); if (g) ctx.add(new THREE.Mesh(g, lm), { shadow: false }); }
    for (const x of [-0.02, -0.92]) {
      const g = surfaceLine(P, [[x - 0.07, 0.8], [x + 0.07, 0.8]], 0.022, 0.003);
      if (g) ctx.add(new THREE.Mesh(g, darkChrome), { shadow: false });
    }
  }

  // Haifischflosse (Antenne) auf dem Dach
  {
    const fin = roundedBox(0.16, 0.045, 0.02, 0.008, gloss);
    fin.position.set(-1.33, yTop(-1.33) + 0.015, 0);
    fin.rotation.z = 0.2;
    ctx.add(fin);
  }

  // Curved Display (Kombiinstrument + Infotainment in einem gebogenen Glasband)
  {
    const [c, g] = mkCanvas(1024, 150);
    g.fillStyle = '#04070b'; g.fillRect(0, 0, 1024, 150);
    const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, '#0b2a4d'); gr.addColorStop(0.5, '#071626'); gr.addColorStop(1, '#0a1f38');
    g.fillStyle = gr; g.fillRect(8, 8, 1008, 134);
    g.fillStyle = '#4aa8ff'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.fillText('P', 150, 90);
    g.strokeStyle = '#4aa8ff'; g.lineWidth = 6; g.beginPath(); g.arc(150, 80, 52, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.fillStyle = '#9fb2c4'; g.font = '22px Arial'; g.fillText('km/h', 150, 125);
    for (let i = 0; i < 4; i++) { g.fillStyle = i === 1 ? '#1d5aa8' : '#12263d'; g.fillRect(380 + i * 160, 26, 144, 96); }
    g.fillStyle = '#dfe9f5'; g.font = 'bold 30px Arial'; g.fillText('BMW i7', 380 + 80, 80); g.fillText('M70', 380 + 240, 80);
    const tex = canvasTexture(c);
    const geo = new THREE.PlaneGeometry(0.98, 0.13, 40, 1);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const u = pa.getX(i); pa.setZ(i, 0.35 * u * u); } // Wölbung (Mitte nach hinten)
    geo.computeVertexNormals();
    const scr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: true }));
    scr.rotation.y = -Math.PI / 2; // Schauseite zum Fahrer (-x)
    scr.position.set(0.83, 0.915, -0.04);
    scr.rotation.x = 0;
    ctx.interior.add(scr);
  }

  // ---- Heck
  const tlR = lightDecal(drawTail(false), 1024, 186, { emissiveColor: 0xff2010 });
  const tlL = lightDecal(drawTail(true), 1024, 186, { emissiveColor: 0xff2010 });
  lights.tail.push(tlR, tlL);
  decal(ctx, PR, [0.25, 1.0, 0.75, 0.89], tlR, { nu: 40, nv: 8, off: 0.005, order: 2 });
  decal(ctx, PR, [-0.25, -1.0, 0.75, 0.89], tlL, { nu: 40, nv: 8, off: 0.005, order: 2 });
  platePanel(ctx, PR, 0, 0.42, 0.54, 0.125);
  const rp = PR(0, 0.87);
  if (rp) badge(ctx, 'roundel', 0.11, rp.p, rp.n);
  // "i7"-Schriftzug links, ///M rechts unten
  logoDecal(ctx, PR, [-0.72, -0.5, 0.845, 0.9], 256, 64, (g, w, h) => {
    g.fillStyle = '#e4e6ea'; g.font = 'italic 300 58px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('i7', w / 2, h * 0.55);
  });
  logoDecal(ctx, PR, [0.47, 0.67, 0.63, 0.69], 256, 64, (g, w, h) => drawMLogo(g, 70, h / 2, 54));
  // Zierlinie und seitliche Lufteinlässe der Heckschürze
  addLine(PR, [[-0.97, 0.575], [0.97, 0.575]], 0.006, 0.004, edge);
  addLine(PR, [[-0.97, 0.665], [-0.5, 0.665], [-0.3, 0.6]], 0.004, 0.004, edge);
  addLine(PR, [[0.97, 0.665], [0.5, 0.665], [0.3, 0.6]], 0.004, 0.004, edge);
  const rvent = meshMaterial('grid', { cells: 14, w: 256, h: 128, line: '#26272c' });
  for (const sg of [1, -1]) {
    decal(ctx, PR, [sg * 0.6, sg * 0.9, 0.35, 0.49], rvent, { nu: 10, nv: 6, off: 0.004 });
    addLine(PR, [[sg * 0.6, 0.35], [sg * 0.9, 0.35], [sg * 0.9, 0.49], [sg * 0.6, 0.49]], 0.009, 0.005, edge, true);
  }

  // Spoilerlippe (Entenbürzel): Profil entlang der hinteren Deckelkante, folgt der Wölbung des Kofferraumdeckels
  {
    const path = [], outs = [], ups = [];
    const xe = -2.63;
    for (let i = 0; i <= 28; i++) {
      const z = -0.72 + (1.44 * i) / 28;
      const y = loft.topY(xe, Math.abs(z));
      if (y === null) continue;
      path.push([xe, y, z]); outs.push([-1, 0, 0]); ups.push([0, 1, 0]);
    }
    if (path.length > 4) {
      const prof = [[-0.07, -0.012], [0.0, -0.006], [0.03, -0.004], [0.05, 0.012], [0.028, 0.022], [-0.05, 0.012]];
      const lip = new THREE.Mesh(sweep(path, outs, ups, prof, { closedProfile: true }), carbon);
      ctx.add(lip);
    }
  }

  // Diffusor: Wanne, Finnen, Endrohr-Gehäuse + 2x2 Attrappen
  ctx.add(plank([[-2.05, -0.9], [-2.74, -0.84], [-2.74, 0.84], [-2.05, 0.9]], 0.012, 0.115, carbon));
  const trim = roundedBox(0.014, 0.012, 1.74, 0.004, darkChrome); trim.position.set(-2.742, 0.32, 0); ctx.add(trim);
  for (let i = -3; i <= 3; i++) {
    const f = roundedBox(0.2, 0.16, 0.012, 0.003, carbon);
    f.position.set(-2.69, 0.215, i * 0.1); f.rotation.set(0, -i * 0.06, 0);
    ctx.add(f);
  }
  for (const sg of [1, -1]) {
    const cage = roundedBox(0.14, 0.18, 0.44, 0.02, gloss); cage.position.set(-2.69, 0.26, sg * 0.6); ctx.add(cage);
    const rim = roundedBox(0.02, 0.2, 0.47, 0.01, darkChrome); rim.position.set(-2.745, 0.26, sg * 0.6); ctx.add(rim);
    for (const dz of [-0.075, 0.075]) {
      const t = exhaustTip({ r: 0.052, len: 0.12 });
      t.position.set(-2.75, 0.265, sg * 0.6 + dz);
      ctx.add(t);
    }
  }
}

export function buildI7() { return assembleCar(I7_DEF); }
