// Mercedes-AMG CLS 63 S (Widebody) – nach Referenzbild 1.
// Koordinaten: +x vorne, +y oben, +z rechts, Ursprung = Mitte des Radstands am Boden.

import * as THREE from 'three';
import { curve, bump } from '../util.js';
import { assembleCar } from './builder.js';
import { paintMaterial, carbonMaterial, matBlackGloss, matChrome, matDarkChrome, canvas, canvasTexture } from '../materials.js';
import { lightDecal, glowLine, surfaceLine, lineMat, exhaustTip, emblemMesh } from './parts.js';
import { buildInterior } from './interior.js';
import { decal, meshMaterial, plate, plank, archLip, skirt, mirror, diffuser, roundedBox } from './kit.js';

const flare = (x) => 0.058 * bump(x, 1.475, 0.62) + 0.064 * bump(x, -1.475, 0.7);

const yTop = curve([[-2.58, 0.93], [-2.48, 0.957], [-2.18, 0.965], [-2.0, 1.0], [-1.74, 1.07], [-1.31, 1.21], [-0.87, 1.31], [-0.61, 1.34], [-0.35, 1.33], [-0.09, 1.3], [0.126, 1.23], [0.43, 1.09], [0.735, 0.957], [0.865, 0.95], [1.3, 0.9], [1.73, 0.83], [1.91, 0.78], [2.12, 0.76], [2.2, 0.74]]);
const z1 = curve([[-2.58, 0.78], [-2.2, 0.8], [-1.95, 0.66], [-1.4, 0.58], [-0.8, 0.6], [0.0, 0.62], [0.6, 0.66], [0.95, 0.72], [1.5, 0.74], [2.0, 0.72], [2.2, 0.68]]);
const dE = curve([[-2.58, 0.04], [-2.1, 0.04], [-1.8, 0.05], [-1.0, 0.06], [0, 0.06], [0.6, 0.045], [1.2, 0.03], [2.2, 0.03]]);
const y2 = curve([[-2.58, 0.88], [-2.3, 0.94], [-2.0, 0.955], [-1.0, 0.957], [0, 0.957], [0.6, 0.95], [0.95, 0.9], [1.3, 0.85], [1.8, 0.78], [2.1, 0.72], [2.2, 0.68]]);
const z2 = curve([[-2.58, 0.85], [-2.2, 0.98], [-1.6, 0.99], [-1.0, 0.95], [0, 0.94], [0.9, 0.96], [1.4, 0.97], [1.9, 0.93], [2.2, 0.8]]);
const z3 = curve([[-2.58, 0.84], [-2.35, 0.95], [-1.95, 0.985], [-1.2, 0.975], [-0.7, 0.965], [0.7, 0.965], [1.2, 0.96], [1.8, 0.98], [2.05, 0.95], [2.2, 0.8]]);
const y3 = curve([[-2.58, 0.55], [-2.0, 0.6], [-1.0, 0.58], [1.0, 0.58], [2.0, 0.55], [2.2, 0.5]]);
const z4 = curve([[-2.58, 0.75], [-2.3, 0.9], [-1.8, 0.94], [-1.0, 0.95], [1.0, 0.95], [1.8, 0.93], [2.05, 0.88], [2.2, 0.74]]);
const y4 = curve([[-2.58, 0.34], [-2.3, 0.22], [-1.2, 0.13], [1.2, 0.13], [2.0, 0.14], [2.2, 0.18]]);
const z5 = curve([[-2.58, 0.6], [-2.2, 0.8], [-1.5, 0.84], [1.5, 0.84], [2.0, 0.8], [2.2, 0.6]]);
const y5 = curve([[-2.58, 0.26], [-2.3, 0.17], [-1.5, 0.11], [0, 0.11], [1.5, 0.1], [2.0, 0.08], [2.2, 0.08]]);

export const CLS_DEF = {
  id: 'cls63',
  name: 'Mercedes-AMG CLS 63 S',
  dims: { wheelbase: 2.95, trackF: 1.7, trackR: 1.7, length: 4.78, width: 2.05, height: 1.37, cgX: 2.95 / 2 - 1.33 },
  loft: {
    x0: -2.58, x1: 2.2, stations: 190,
    pts: [
      { z: 0, y: yTop },
      { z: z1, y: (x) => yTop(x) - dE(x) },
      { z: z2, y: y2 },
      { z: (x) => z3(x) + flare(x), y: y3 },
      { z: (x) => z4(x) + flare(x) * 0.4, y: y4 },
      { z: z5, y: y5 },
      { z: 0, y: y5 },
    ],
    rad: [6, curve([[-2.4, 0.15], [0, 0.13], [2, 0.12]]), 0.07, 1.2, 0.06, 0.05, 0],
    endF: { len: 0.28, nz: 3.0, nyT: 4, nyB: 4, cy: 0.42 },
    endR: { len: 0.3, nz: 3.2, nyT: 4.5, nyB: 4, cy: 0.55 },
  },
  masks: [
    // Seitenfenster (x, y): vordere Tür, hintere Tür, Seitenfenster hinten
    { kind: 'window', plane: 'side', pts: [0.365, 0.957, -0.09, 1.275, -0.43, 1.265, -0.43, 0.957] },
    { kind: 'window', plane: 'side', pts: [-0.49, 0.957, -0.49, 1.265, -0.87, 1.25, -1.08, 1.2, -1.08, 0.957] },
    { kind: 'window', plane: 'side', pts: [-1.15, 0.957, -1.15, 1.18, -1.45, 1.115, -1.78, 1.0, -1.78, 0.957] },
    // Frontscheibe / Heckscheibe (x, |z|)
    { kind: 'window', plane: 'top', thr: 0.2, pts: [0.78, -0.3, 0.78, 0.66, -0.09, 0.5, -0.09, -0.3] },
    { kind: 'window', plane: 'top', thr: 0.2, pts: [-1.4, -0.3, -1.4, 0.52, -2.08, 0.6, -2.08, -0.3] },
  ],
  wheels: {
    archR: 0.4,
    front: { tireR: 0.325, tireW: 0.27, rimR: 0.258, rimW: 0.235, spokes: 14, hubR: 0.058, dish: 0.05, spokeW0: 0.034, spokeW1: 0.016, thick: 0.014, twist: 0.5, emblem: 'star', caliper: { color: 0x2a2a2e, angle: -0.5 } },
    rear: { tireR: 0.332, tireW: 0.3, rimR: 0.258, rimW: 0.265, spokes: 14, hubR: 0.058, dish: 0.045, spokeW0: 0.034, spokeW1: 0.016, thick: 0.014, twist: 0.5, emblem: 'star', caliper: { color: 0x2a2a2e, angle: 0.5 } },
  },
  extras(ctx) { clsExtras(ctx); },
};

// ---------------------------------------------------------------------------------------------
// Lichter-Grafiken

/** Scheinwerfer (Sicht von vorne, linke Leuchte des Autos = rechts im Bild). inner = x 0, außen = x 1. */
function drawHeadlight(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const outline = () => {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.9)); g.bezierCurveTo(X(0.3), Y(1.0), X(0.7), Y(0.95), X(1.0), Y(0.6));
      g.bezierCurveTo(X(0.85), Y(0.42), X(0.6), Y(0.3), X(0.35), Y(0.12)); g.lineTo(X(0.0), Y(0.04)); g.closePath();
    };
    if (!emis) {
      outline();
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#15181d'); gr.addColorStop(0.5, '#07080a'); gr.addColorStop(1, '#101216');
      g.fillStyle = gr; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#1b1d22'; g.stroke();
      // Projektor-Linsen
      for (const [cx, cy, r] of [[0.2, 0.5, 0.2], [0.5, 0.5, 0.15]]) {
        const rg = g.createRadialGradient(X(cx) - 4, Y(cy) - 4, 2, X(cx), Y(cy), h * r);
        rg.addColorStop(0, '#9ea8b6'); rg.addColorStop(0.35, '#2c323c'); rg.addColorStop(1, '#050608');
        g.fillStyle = rg; g.beginPath(); g.arc(X(cx), Y(cy), h * r, 0, 7); g.fill();
        g.strokeStyle = '#8a8d94'; g.lineWidth = 3; g.stroke();
      }
      g.fillStyle = '#3a3e46';
      for (let i = 0; i < 4; i++) g.fillRect(X(0.55 + i * 0.07), Y(0.26 - i * 0.04), w * 0.045, h * 0.07);
    } else {
      // Tagfahrlicht: geschwungener LED-Streifen entlang der oberen Kante + zweite Linie
      glowLine(g, [[X(0.03), Y(0.86)], [X(0.35), Y(0.92)], [X(0.72), Y(0.84)], [X(0.96), Y(0.62)]], h * 0.09, '#fff', 22);
      glowLine(g, [[X(0.05), Y(0.7)], [X(0.35), Y(0.76)], [X(0.7), Y(0.66)]], h * 0.04, '#dfeaff', 12);
      g.fillStyle = '#ffd9a0'; g.fillRect(X(0.45), Y(0.2), w * 0.08, h * 0.04);
    }
    g.restore();
  };
}

/** Rückleuchte, Sicht von hinten: inner (Mitte) = x 0, außen = x 1. */
function drawTail(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const outline = () => {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.62)); g.bezierCurveTo(X(0.25), Y(0.98), X(0.75), Y(0.98), X(1.0), Y(0.72));
      g.lineTo(X(1.0), Y(0.4)); g.bezierCurveTo(X(0.7), Y(0.34), X(0.3), Y(0.3), X(0.0), Y(0.3)); g.closePath();
    };
    if (!emis) {
      outline();
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#3a0509'); gr.addColorStop(0.5, '#5a070e'); gr.addColorStop(1, '#2b0408');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#120204'; g.lineWidth = 4; g.stroke();
      glowLine(g, [[X(0.05), Y(0.6)], [X(0.4), Y(0.8)], [X(0.8), Y(0.74)], [X(0.97), Y(0.6)]], h * 0.07, '#8a1018', 4);
    } else {
      glowLine(g, [[X(0.05), Y(0.6)], [X(0.4), Y(0.8)], [X(0.8), Y(0.74)], [X(0.97), Y(0.6)]], h * 0.08, '#ff2a1c', 18);
      glowLine(g, [[X(0.06), Y(0.42)], [X(0.5), Y(0.4)], [X(0.9), Y(0.46)]], h * 0.06, '#ff3a26', 12);
    }
    g.restore();
  };
}

function clsExtras(ctx) {
  const { loft, body, lights, def } = ctx;
  ctx.interior = buildInterior({
    leather: 0x0b0b0c, accent: 0xb01010, thread: '#8a1212', quilt: true, carbon: true, emblem: 'star', screenText: 'AMG',
    dash: { x: 0.62, y: 0.72, w: 1.5, depth: 0.5, h: 0.22 }, wheel: { x: 0.36, y: 0.8, z: -0.36, r: 0.19, tilt: 0.38 },
    seat: { x: 0.0, y: 0.42, z: 0.36 }, rearSeat: { x: -0.95, y: 0.5, z: 0.36 }, console: { x: 0.1, y: 0.42, len: 1.0 }, floorY: 0.28,
    eye: [-0.05, 1.08, -0.36],
  });
  const PF = loft.projFront(), PR = loft.projRear();
  const PSr = loft.projSide(1), PSl = loft.projSide(-1);
  const paint = paintMaterial({ flakes: true });
  const carbon = carbonMaterial({ repeat: 7 });
  const gloss = matBlackGloss();
  const darkChrome = matDarkChrome();

  // ---- Front: Grill, Lufteinlässe, Kennzeichen, Scheinwerfer
  const grille = meshMaterial('diamond', { cells: 34, w: 512, h: 128, line: '#34353b' });
  decal(ctx, PF, [0.4, -0.4, 0.52, 0.775], grille, { nu: 30, nv: 14, off: 0.004 });
  const bar = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
  for (const v of [0.675, 0.635]) decal(ctx, PF, [0.4, -0.4, v - 0.007, v + 0.007], bar, { nu: 30, nv: 2, off: 0.009 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.4 });
  for (const [a, b] of [[0.52, 0.536], [0.762, 0.778]]) decal(ctx, PF, [0.42, -0.42, a, b], frame, { nu: 30, nv: 2, off: 0.0075 });
  const star = PF(0, 0.655);
  if (star) ctx.add(emblemMesh('star', 0.19, star.p.clone().addScaledVector(star.n, 0.013), star.n), { shadow: false });

  const lower = meshMaterial('diamond', { cells: 40, w: 512, h: 128, line: '#2c2d32' });
  decal(ctx, PF, [0.62, -0.62, 0.13, 0.39], lower, { nu: 40, nv: 16, off: 0.003 });
  for (const s of [1, -1]) decal(ctx, PF, [s * 0.64, s * 0.9, 0.2, 0.43], lower, { nu: 16, nv: 12, off: 0.003 });
  plate(ctx, PF, 0, 0.455, 0.52, 0.12, ['////AMG'], { bg: '#1b1b1e', fg: '#ececee', border: '#555' });

  const hlR = lightDecal(drawHeadlight(true), 512, 160);   // Auto rechts (z > 0) = links im Bild
  const hlL = lightDecal(drawHeadlight(false), 512, 160);
  lights.head.push(hlR, hlL);
  decal(ctx, PF, [0.9, 0.42, 0.57, 0.77], hlR, { nu: 28, nv: 10, off: 0.006, order: 2 });
  decal(ctx, PF, [-0.42, -0.9, 0.57, 0.77], hlL, { nu: 28, nv: 10, off: 0.006, order: 2 });

  // ---- Frontlippe aus Carbon (breite Platte mit nach oben gebogenen Enden)
  const pts = [];
  const zs = []; for (let i = 0; i <= 14; i++) zs.push(-0.9 + (1.8 * i) / 14);
  const xf = zs.map((z) => loft.endX(z, 0.11, +1) ?? 2.1);
  const outer = zs.map((z, i) => [xf[i] + 0.085 + 0.025 * (1 - Math.abs(z) / 0.9), z]);
  const inner = zs.map((z, i) => [xf[i] - 0.03, z]).reverse();
  const lip = plank([...outer, ...inner], 0.012, 0.062, carbon);
  ctx.add(lip, { kit: 'lip' });
  for (const s of [1, -1]) {
    const fin = roundedBox(0.2, 0.1, 0.012, 0.004, carbon);
    fin.position.set(xf[s > 0 ? 14 : 0] + 0.02, 0.1, s * 0.9);
    fin.rotation.set(0, s * 0.25, 0);
    ctx.add(fin, { kit: 'lip' });
  }

  // ---- Seitenschweller (Carbon) + untere Klinge
  for (const s of [1, -1]) {
    const sk = skirt(loft, s, -1.03, 1.03, 0.19, { out: 0.05, h: 0.1 }, gloss);
    if (sk) ctx.add(sk, { kit: 'skirt' });
    const sk2 = skirt(loft, s, -1.05, 1.05, 0.125, { out: 0.065, h: 0.025 }, carbon);
    if (sk2) ctx.add(sk2, { kit: 'skirt' });
    // Radhaus-Ränder der Verbreiterung
    for (const [cx, cy, R] of [[1.475, 0.325, 0.405], [-1.475, 0.332, 0.405]]) {
      const l = archLip(loft, cx, cy, R, s, { out: 0.018, rad: 0.035, a0: -0.12, a1: Math.PI + 0.12 }, paint);
      if (l) ctx.add(l, { kit: 'flares' });
    }
    // Spiegel
    const m = mirror(paint, { x: 0.5, y: 0.9, z: 0.92, w: 0.2, h: 0.1, d: 0.13 });
    if (s < 0) m.scale.z = -1;
    ctx.add(m);
  }

  // ---- Spaltmaße (Türen) + Griffe
  for (const [P, sgn] of [[PSr, 1], [PSl, -1]]) {
    const lm = lineMat();
    const lines = [
      [[0.78, 0.3], [0.8, 0.6], [0.78, 0.95]], [[-0.4, 0.28], [-0.4, 0.95]], [[-1.27, 0.3], [-1.28, 0.6], [-1.25, 0.95]],
      [[0.78, 0.3], [0.2, 0.28], [-0.4, 0.28], [-1.27, 0.3]],
    ];
    for (const l of lines) { const g = surfaceLine(P, l, 0.0035, 0.0006); if (g) ctx.add(new THREE.Mesh(g, lm), { shadow: false }); }
    for (const x of [-0.12, -0.98]) {
      const g = surfaceLine(P, [[x - 0.07, 0.8], [x + 0.07, 0.8]], 0.022, 0.003);
      if (g) ctx.add(new THREE.Mesh(g, darkChrome), { shadow: false });
    }
  }

  // ---- Heck: Rückleuchten, Kennzeichen, Embleme, Spoilerlippe, Diffusor, Auspuff
  const tlR = lightDecal(drawTail(false), 512, 128, { emissiveColor: 0xff2010 });
  const tlL = lightDecal(drawTail(true), 512, 128, { emissiveColor: 0xff2010 });
  lights.tail.push(tlR, tlL);
  decal(ctx, PR, [0.38, 0.93, 0.62, 0.9], tlR, { nu: 28, nv: 10, off: 0.005, order: 2 });
  decal(ctx, PR, [-0.38, -0.93, 0.62, 0.9], tlL, { nu: 28, nv: 10, off: 0.005, order: 2 });
  plate(ctx, PR, 0, 0.58, 0.52, 0.12, ['////AMG'], { rear: true, bg: '#1b1b1e', fg: '#ececee', border: '#555' });
  const rs = PR(0, 0.84);
  if (rs) ctx.add(emblemMesh('star', 0.075, rs.p.clone().addScaledVector(rs.n, 0.01), rs.n), { shadow: false });
  const lipPts = [[-2.31, -0.76], [-2.57, -0.78], [-2.6, -0.7], [-2.6, 0.7], [-2.57, 0.78], [-2.31, 0.76]];
  const spo = plank(lipPts, 0.014, 0.935, carbon);
  ctx.add(spo, { kit: 'spoiler' });
  const dif = diffuser({ x0: -2.0, x1: -2.62, zHalf: 0.84, y: 0.2, fins: 6, finH: 0.13, mat: carbon });
  ctx.add(dif, { kit: 'diffuser' });
  for (const z of [0.5, 0.67, -0.5, -0.67]) {
    const t = exhaustTip({ r: 0.043, len: 0.14 });
    t.position.set(-2.6, 0.275, z);
    ctx.add(t);
  }
}

export function buildCLS() { return assembleCar(CLS_DEF); }
