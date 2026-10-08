// Audi RS 7 Sportback (C8), Widebody – nach Referenzbild 4 (rs7.webp).
// Koordinaten: +x vorne, +y oben, +z rechts, Ursprung = Mitte des Radstands am Boden.

import * as THREE from 'three';
import { curve, smoothstep } from '../util.js';
import { assembleCar } from './builder.js';
import { paintMaterial, carbonMaterial, matBlackGloss, matDarkChrome, canvas, canvasTexture, heightToNormal } from '../materials.js';
import { lightDecal, glowLine, surfaceLine, lineMat, exhaustTip } from './parts.js';
import { buildInterior } from './interior.js';
import { decal, plate, plank, archLip, skirt, mirror, diffuser } from './kit.js';
import { sweep } from './loft.js';

// Verbreiterung: Kotflügel-Bäuche um die Räder (Kante an der Tür, weich auslaufend zum Bug/Heck)
const flare = (x) =>
  0.075 * smoothstep(0.62, 0.95, x) * (1 - smoothstep(1.9, 2.18, x)) +
  0.078 * smoothstep(-0.62, -0.92, x) * (1 - smoothstep(-2.0, -2.32, x));

// Mittelschnitt / Dachlinie, abgelesen aus der Seitenansicht des Referenzbilds
const yTop = curve([[-2.4, 0.8], [-2.34, 0.88], [-2.25, 0.915], [-2.17, 0.935], [-1.88, 1.011], [-1.475, 1.128], [-1.26, 1.205], [-1.0, 1.263], [-0.61, 1.304],
  [-0.39, 1.315], [-0.15, 1.31], [0.06, 1.29], [0.21, 1.236], [0.43, 1.147], [0.6, 1.058], [0.69, 1.005], [0.78, 0.962], [0.86, 0.935], [0.98, 0.925],
  [1.13, 0.915], [1.27, 0.906], [1.42, 0.894], [1.56, 0.874], [1.7, 0.846], [1.85, 0.794], [1.99, 0.738], [2.08, 0.677], [2.22, 0.55]]);
const z1 = curve([[-2.4, 0.78], [-2.25, 0.8], [-2.0, 0.74], [-1.7, 0.66], [-1.4, 0.6], [-1.0, 0.56], [-0.5, 0.55], [0, 0.56], [0.4, 0.6], [0.8, 0.68], [1.1, 0.73],
  [1.5, 0.76], [1.9, 0.78], [2.1, 0.76], [2.22, 0.7]]);
const dE = curve([[-2.4, 0.03], [-2.0, 0.04], [-1.4, 0.05], [-0.5, 0.045], [0.4, 0.05], [0.8, 0.04], [1.2, 0.03], [2.2, 0.03]]);
const y2 = curve([[-2.4, 0.72], [-2.3, 0.8], [-2.1, 0.85], [-1.8, 0.88], [-1.4, 0.93], [-1.1, 0.935], [-0.5, 0.935], [0.3, 0.935], [0.7, 0.935], [1.0, 0.91],
  [1.3, 0.88], [1.6, 0.84], [1.9, 0.78], [2.1, 0.69], [2.22, 0.55]]);
const z2 = curve([[-2.4, 0.85], [-2.2, 0.97], [-1.8, 1.0], [-1.465, 1.02], [-1.0, 0.95], [-0.5, 0.925], [0.3, 0.925], [0.8, 0.94], [1.2, 0.97], [1.465, 1.0],
  [1.9, 0.98], [2.1, 0.94], [2.22, 0.8]]);
const y3 = 0.6;
const z3 = curve([[-2.4, 0.84], [-2.2, 0.95], [-1.9, 0.975], [-1.2, 0.965], [-0.6, 0.95], [0.3, 0.95], [0.9, 0.96], [1.3, 0.97], [1.8, 0.985], [2.05, 0.96], [2.22, 0.8]]);
const z4 = curve([[-2.4, 0.74], [-2.2, 0.88], [-1.8, 0.93], [-1.0, 0.93], [1.0, 0.93], [1.8, 0.93], [2.05, 0.9], [2.22, 0.75]]);
const y4 = curve([[-2.4, 0.3], [-2.2, 0.2], [-1.2, 0.17], [1.2, 0.17], [2.0, 0.16], [2.22, 0.2]]);
const z5 = curve([[-2.4, 0.6], [-2.2, 0.78], [-1.5, 0.84], [1.5, 0.84], [2.0, 0.82], [2.22, 0.62]]);
const y5 = curve([[-2.4, 0.2], [-2.3, 0.15], [-1.8, 0.1], [0, 0.1], [1.5, 0.1], [2.0, 0.095], [2.22, 0.1]]);

export const RS7_DEF = {
  id: 'rs7',
  name: 'Audi RS 7',
  dims: { wheelbase: 2.93, trackF: 1.72, trackR: 1.7, length: 4.78, width: 2.1, height: 1.32, cgX: 2.93 / 2 - 2.93 * (1 - 0.56) },
  headlightPos: { x: 2.0, y: 0.62, z: 0.68 },
  loft: {
    x0: -2.46, x1: 2.22, stations: 190,
    pts: [
      { z: 0, y: yTop },
      { z: z1, y: (x) => yTop(x) - dE(x) },
      { z: (x) => z2(x) + flare(x) * 0.25, y: y2 },
      { z: (x) => z3(x) + flare(x), y: y3 },
      { z: (x) => z4(x) + flare(x) * 0.4, y: y4 },
      { z: z5, y: y5 },
      { z: 0, y: y5 },
    ],
    rad: [6, curve([[-2.4, 0.15], [0, 0.13], [2, 0.12]]), 0.07, 1.2, 0.06, 0.05, 0],
    endF: { len: 0.17, nz: 5, nyT: 3.4, nyB: 5, cy: 0.4 },
    endR: { len: 0.3, nz: 3.4, nyT: 2.4, nyB: 4, cy: 0.37 },
  },
  masks: [
    // Seitenfenster (x, y): vordere Tür, hintere Tür/Seitenscheibe
    { kind: 'window', plane: 'side', pts: [0.4, 0.935, 0.17, 1.2, -0.12, 1.27, -0.24, 1.275, -0.24, 0.935] },
    { kind: 'window', plane: 'side', pts: [-0.4, 0.935, -0.4, 1.275, -0.9, 1.245, -1.2, 1.15, -1.5, 1.0, -1.45, 0.96, -1.3, 0.935] },
    // Frontscheibe / Heckscheibe (x, |z|)
    { kind: 'window', plane: 'top', thr: 0.2, pts: [0.8, -0.3, 0.8, 0.64, -0.08, 0.5, -0.08, -0.3] },
    { kind: 'window', plane: 'top', thr: 0.2, pts: [-1.5, -0.3, -1.5, 0.52, -2.14, 0.62, -2.14, -0.3] },
  ],
  wheels: {
    archR: 0.39,
    front: { tireR: 0.355, tireW: 0.285, rimR: 0.28, rimW: 0.25, spokes: 15, hubR: 0.05, dish: 0.07, spokeW0: 0.02, spokeW1: 0.012, thick: 0.013, twist: 0.14, emblem: 'rings', caliper: { color: 0xc01010, angle: -0.5 } },
    rear: { tireR: 0.355, tireW: 0.3, rimR: 0.28, rimW: 0.27, spokes: 15, hubR: 0.05, dish: 0.065, spokeW0: 0.02, spokeW1: 0.012, thick: 0.013, twist: 0.14, emblem: 'rings', caliper: { color: 0xc01010, angle: 0.5 } },
  },
  extras(ctx) { rs7Extras(ctx); },
};

// ---------------------------------------------------------------------------------------------
// Lokale Helfer (Umriss-Decals, Wabengitter, Embleme)

/** Material aus einer Canvas-Zeichnung, die auf ein Decal-Rechteck [u0,u1,v0,v1] gelegt wird. draw(g, X, Y, w, h): X(u), Y(v) -> Canvas-Pixel. */
function shapeMat(rect, px, draw, { rough = 0.3, metal = 0.5, env = 1.2, normal = null, alphaTest = 0.5 } = {}) {
  const [u0, u1, v0, v1] = rect;
  const w = Math.max(8, Math.round(Math.abs(u1 - u0) * px)), h = Math.max(8, Math.round(Math.abs(v1 - v0) * px));
  const c = canvas(w, h), g = c.getContext('2d');
  const X = (u) => ((u - u0) / (u1 - u0)) * w, Y = (v) => (1 - (v - v0) / (v1 - v0)) * h;
  draw(g, X, Y, w, h);
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(c), normalMap: normal, roughness: rough, metalness: metal, envMapIntensity: env, alphaTest,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/**
 * Waben-Gitter (flache Sechsecke, Ecken links/rechts, wie im RS-Singleframe) auf den Umriss `polys` beschnitten.
 * rect = [u0,u1,v0,v1] des Decals, polys = [[[u,v],...], ...]. cw = Zellbreite (Ecke zu Ecke) in m.
 */
function hexMat(rect, polys, { cw = 0.085, aspect = 1.55, px = 1100, lineW = 0.17, bg = '#030304', line = '#55575e', frame = '#6a6c73', frameW = 0.006, rough = 0.42, metal = 0.5, off = 0 } = {}) {
  const [u0, u1, v0, v1] = rect;
  const w = Math.round(Math.abs(u1 - u0) * px), h = Math.round(Math.abs(v1 - v0) * px);
  const c = canvas(w, h), g = c.getContext('2d');
  const hc = canvas(w, h), hg = hc.getContext('2d');
  const X = (u) => ((u - u0) / (u1 - u0)) * w, Y = (v) => (1 - (v - v0) / (v1 - v0)) * h;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  hg.fillStyle = '#1c1c1c'; hg.fillRect(0, 0, w, h);
  const cwp = cw * px, chp = cwp / aspect;
  const hexPath = (ctx, cx, cy) => {
    ctx.beginPath();
    ctx.moveTo(cx - cwp / 2, cy); ctx.lineTo(cx - cwp / 4, cy - chp / 2); ctx.lineTo(cx + cwp / 4, cy - chp / 2);
    ctx.lineTo(cx + cwp / 2, cy); ctx.lineTo(cx + cwp / 4, cy + chp / 2); ctx.lineTo(cx - cwp / 4, cy + chp / 2); ctx.closePath();
  };
  g.lineJoin = 'round'; hg.lineJoin = 'round';
  for (let col = -1; col * cwp * 0.75 < w + cwp; col++) {
    const cx = col * cwp * 0.75;
    for (let row = -1; row * chp < h + chp; row++) {
      const cy = row * chp + (col & 1 ? chp / 2 : 0);
      hexPath(g, cx, cy); g.strokeStyle = line; g.lineWidth = chp * lineW; g.stroke();
      hexPath(hg, cx, cy); hg.strokeStyle = '#fff'; hg.lineWidth = chp * lineW * 1.3; hg.stroke();
    }
  }
  const out = canvas(w, h), og = out.getContext('2d');
  const poly = () => { og.beginPath(); for (const p of polys) { p.forEach(([u, v], i) => (i ? og.lineTo(X(u), Y(v)) : og.moveTo(X(u), Y(v)))); og.closePath(); } };
  og.save(); poly(); og.clip(); og.drawImage(c, 0, 0); og.restore();
  poly(); og.strokeStyle = frame; og.lineWidth = frameW * px; og.lineJoin = 'round'; og.stroke();
  const m = new THREE.MeshStandardMaterial({
    map: canvasTexture(out), normalMap: canvasTexture(heightToNormal(hc, 3.0), { srgb: false }), normalScale: new THREE.Vector2(1, 1),
    metalness: metal, roughness: rough, envMapIntensity: 1.4, alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -1.5 - off, polygonOffsetUnits: -1.5 - off,
  });
  return m;
}

/** Vier Ringe (Audi-Logo) als Textur: 'black' = schwarz verchromt mit hellem Rand (Kühlergrill), 'silver' = hell (Heck). */
function ringsTexture(kind) {
  const w = 1024, h = 256;
  const c = canvas(w, h), g = c.getContext('2d');
  const r = h * 0.4, step = r * 1.08 * 1.0, cx = w / 2, cy = h / 2;
  for (let k = 0; k < 4; k++) {
    const x = cx + (k - 1.5) * step;
    if (kind === 'black') {
      g.strokeStyle = '#6e7076'; g.lineWidth = h * 0.15; g.beginPath(); g.arc(x, cy, r, 0, 7); g.stroke();
      g.strokeStyle = '#070708'; g.lineWidth = h * 0.095; g.beginPath(); g.arc(x, cy, r, 0, 7); g.stroke();
    } else {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#f0f0f2'); gr.addColorStop(0.5, '#8c8d92'); gr.addColorStop(1, '#d9d9dc');
      g.strokeStyle = gr; g.lineWidth = h * 0.11; g.beginPath(); g.arc(x, cy, r, 0, 7); g.stroke();
    }
  }
  return canvasTexture(c);
}

/** Flaches Emblem (Plane) an Position/Normale, Breite w. */
function ringsEmblem(kind, wid, pos, normal) {
  const tex = ringsTexture(kind);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, wid * 0.25), new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.05, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.5,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  m.position.copy(pos);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  return m;
}

/** Kleines "RS 7"-Typenschild (rote Sportmarke + Schriftzug). */
function badgeMat(text = 'RS 7') {
  const w = 256, h = 96;
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8b8d92'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#d3141c';
  g.beginPath(); g.moveTo(18, 22); g.lineTo(40, 22); g.lineTo(28, 74); g.lineTo(6, 74); g.closePath(); g.fill();
  g.fillStyle = '#e8e8ea'; g.font = 'italic bold 58px Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, 54, 50);
  return new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.3, metalness: 0.6, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}

// ---------------------------------------------------------------------------------------------
// Lichter-Grafiken

/**
 * Matrix-LED-Scheinwerfer, Sicht von vorne. Ohne Spiegelung: inneres Ende = Canvas links (x 0), außen = x 1.
 * Schlanker Keil, außen höher; oben geknicktes LED-Tagfahrlicht mit Segmenten, darunter drei Projektor-Linsen.
 */
function drawHeadlight(mirrorX) {
  return (g, w, h, emis) => {
    g.save();
    if (mirrorX) { g.translate(w, 0); g.scale(-1, 1); }
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const outline = () => {
      g.beginPath();
      g.moveTo(X(0.0), Y(0.5)); g.lineTo(X(0.3), Y(0.66)); g.lineTo(X(0.62), Y(0.84)); g.lineTo(X(1.0), Y(0.98));
      g.lineTo(X(1.0), Y(0.52)); g.lineTo(X(0.8), Y(0.36)); g.lineTo(X(0.55), Y(0.22)); g.lineTo(X(0.25), Y(0.1)); g.lineTo(X(0.0), Y(0.06)); g.closePath();
    };
    const drl = (col, blur, k) => {
      // Außenstück, Knick (Stufe), Innenstück
      glowLine(g, [[X(0.97), Y(0.91)], [X(0.7), Y(0.8)], [X(0.57), Y(0.75)]], h * 0.07 * k, col, blur);
      glowLine(g, [[X(0.57), Y(0.75)], [X(0.52), Y(0.66)]], h * 0.06 * k, col, blur * 0.8);
      glowLine(g, [[X(0.52), Y(0.66)], [X(0.28), Y(0.56)], [X(0.03), Y(0.44)]], h * 0.07 * k, col, blur);
      g.fillStyle = col;
      for (let i = 0; i < 8; i++) { const u = 0.06 + i * 0.058; g.fillRect(X(u), Y(0.5 + u * 0.28) + h * 0.02, w * 0.02 * k, h * 0.1 * k); }
      glowLine(g, [[X(0.18), Y(0.14)], [X(0.55), Y(0.28)], [X(0.9), Y(0.45)]], h * 0.03 * k, '#cfe0ff', blur * 0.5);
    };
    if (!emis) {
      outline();
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#15181d'); gr.addColorStop(0.5, '#060709'); gr.addColorStop(1, '#101216');
      g.fillStyle = gr; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#2b2e34'; g.stroke();
      for (const [cx, cy, r] of [[0.34, 0.3, 0.12], [0.5, 0.36, 0.12], [0.68, 0.44, 0.12]]) {
        const rg = g.createRadialGradient(X(cx) - 3, Y(cy) - 3, 1, X(cx), Y(cy), h * r);
        rg.addColorStop(0, '#aab4c2'); rg.addColorStop(0.35, '#2c323c'); rg.addColorStop(1, '#050608');
        g.fillStyle = rg; g.beginPath(); g.arc(X(cx), Y(cy), h * r, 0, 7); g.fill();
        g.strokeStyle = '#7d8087'; g.lineWidth = 2; g.stroke();
      }
      drl('#8a919c', 0, 0.8); // Leuchtkörper im Ruhezustand: graue Linie
    } else {
      drl('#ffffff', 22, 1);
    }
    g.restore();
  };
}

/** Heck: durchgehendes rotes LED-Band quer über die Klappe (symmetrisch, daher unabhängig von der Spiegelung). */
function drawTail() {
  return (g, w, h, emis) => {
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const bar = (col, lw, blur) => {
      glowLine(g, [[X(0.045), Y(0.5)], [X(0.14), Y(0.56)], [X(0.5), Y(0.56)], [X(0.86), Y(0.56)], [X(0.955), Y(0.5)]], lw, col, blur);
    };
    if (!emis) {
      // dunkle Blende hinter dem Band, außen als Leuchtkörper verdickt
      g.fillStyle = '#060607';
      g.beginPath(); g.moveTo(X(0.03), Y(0.58)); g.lineTo(X(0.5), Y(0.72)); g.lineTo(X(0.97), Y(0.58)); g.lineTo(X(0.975), Y(0.38)); g.lineTo(X(0.5), Y(0.46)); g.lineTo(X(0.025), Y(0.38)); g.closePath(); g.fill();
      for (const s of [0, 1]) {
        g.save(); if (s) { g.translate(w, 0); g.scale(-1, 1); }
        g.fillStyle = '#2a0508';
        g.beginPath(); g.moveTo(X(0.025), Y(0.78)); g.lineTo(X(0.2), Y(0.7)); g.lineTo(X(0.2), Y(0.42)); g.lineTo(X(0.02), Y(0.34)); g.closePath(); g.fill();
        g.strokeStyle = '#150204'; g.lineWidth = 3; g.stroke();
        g.restore();
      }
      bar('#7a0f16', h * 0.06, 3);
    } else {
      bar('#ff2a1c', h * 0.075, 18);
      for (const s of [0, 1]) {
        g.save(); if (s) { g.translate(w, 0); g.scale(-1, 1); }
        // kräftigere Außenpartie (zweite Zeile) und abfallender Kick
        glowLine(g, [[X(0.04), Y(0.66)], [X(0.12), Y(0.7)], [X(0.19), Y(0.62)]], h * 0.07, '#ff3a26', 14);
        glowLine(g, [[X(0.035), Y(0.44)], [X(0.12), Y(0.47)], [X(0.19), Y(0.5)]], h * 0.06, '#ff3a26', 12);
        glowLine(g, [[X(0.03), Y(0.5)], [X(0.02), Y(0.36)]], h * 0.05, '#ff2a1c', 10);
        g.restore();
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------

function rs7Extras(ctx) {
  const { loft, body, lights } = ctx;
  if (typeof location !== 'undefined' && /[?&]dbg=1/.test(location.search)) { // DBG: helle, matte Karosserie zum Formenstudium
    const pm = ctx.mats.paint; pm.color.set(0x8a8a92); pm.metalness = 0; pm.roughness = 0.55; pm.clearcoat = 0; pm.sheen = 0; pm.envMapIntensity = 1.0;
  }
  ctx.interior = buildInterior({
    leather: 0x0b0b0c, accent: 0xb01010, thread: '#8a1212', quilt: true, carbon: true, emblem: 'rings', screenText: 'RS 7', clusterColor: '#ff2a1a',
    dash: { x: 0.62, y: 0.72, w: 1.5, depth: 0.5, h: 0.22 }, wheel: { x: 0.36, y: 0.8, z: -0.36, r: 0.19, tilt: 0.38 },
    seat: { x: 0.0, y: 0.42, z: 0.36 }, rearSeat: { x: -0.85, y: 0.43, z: 0.36 }, console: { x: 0.1, y: 0.42, len: 1.0 }, floorY: 0.28,
    eye: [-0.05, 1.08, -0.36],
  });
  const PF = loft.projFront(), PR = loft.projRear();
  const PSr = loft.projSide(1), PSl = loft.projSide(-1);
  const paint = paintMaterial({ flakes: true });
  const carbon = carbonMaterial({ repeat: 7 });
  const gloss = matBlackGloss();
  const darkChrome = matDarkChrome();
  const mirrorY = (g) => { g.scale.z = -1; return g; };

  // ---- Front: sechseckiger Singleframe-Grill mit Wabengitter
  const GY0 = 0.255, GY1 = 0.645;
  const grillPoly = (k = 1) => {
    const hw = 0.5 * k;
    return [[0, GY1], [hw - 0.04, GY1], [hw + 0.02, GY1 - 0.06], [hw - 0.07 + 0.02, GY0 + 0.05], [hw - 0.1, GY0], [0, GY0], [-(hw - 0.1), GY0], [-(hw - 0.05), GY0 + 0.05], [-(hw + 0.02), GY1 - 0.06], [-(hw - 0.04), GY1]];
  };
  const gRect = [0.56, -0.56, 0.24, 0.655];
  const grillMat = hexMat(gRect, [grillPoly()], { cw: 0.085, px: 1000, frame: '#585a60', frameW: 0.007 });
  decal(ctx, PF, gRect, grillMat, { nu: 36, nv: 14, off: 0.004, order: 1 });
  // Kühlermaske: Audi-Ringe oben mittig (schwarz), "RS 7"-Plakette links im Grill (Auto rechts)
  const ringP = PF(0, GY1 - 0.065);
  if (ringP) ctx.add(ringsEmblem('black', 0.27, ringP.p.clone().addScaledVector(ringP.n, 0.014), ringP.n), { shadow: false });
  plate(ctx, PF, 0.33, GY1 - 0.07, 0.12, 0.044, ['RS 7'], { bg: '#0b0b0d', fg: '#ececee', border: '#8b8d92', off: 0.008 });

  // ---- seitliche Lufteinlässe (große, senkrechte Wabeneinsätze) + Rahmen
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x040405, metalness: 0.25, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const intakeRect = [0.98, 0.46, 0.14, 0.62];
  const frameShape = [[0.93, 0.6], [0.62, 0.585], [0.5, 0.32], [0.56, 0.195], [0.93, 0.165], [0.97, 0.3]];
  const meshShape = [[0.885, 0.565], [0.885, 0.215], [0.6, 0.31]];
  for (const s of [1, -1]) {
    const R = s > 0 ? [0.98, 0.46, 0.14, 0.62] : [-0.46, -0.98, 0.14, 0.62];
    const tr = (pts) => pts.map(([z, y]) => [s * z, y]);
    // Rahmen (schwarzer Hochglanz) als Umriss
    const fm = shapeMat(R, 900, (g, X, Y) => {
      g.fillStyle = '#050506'; g.beginPath(); tr(frameShape).forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath(); g.fill();
      g.strokeStyle = '#2c2d32'; g.lineWidth = 4; g.stroke();
      // Facettenlinien im Rahmen
      g.strokeStyle = '#1c1d21'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(s * 0.93), Y(0.6)); g.lineTo(X(s * 0.885), Y(0.565)); g.moveTo(X(s * 0.93), Y(0.165)); g.lineTo(X(s * 0.885), Y(0.215)); g.stroke();
    }, { rough: 0.22, metal: 0.3 });
    decal(ctx, PF, R, fm, { nu: 26, nv: 18, off: 0.005, order: 1 });
    const mm = hexMat(R, [tr(meshShape)], { cw: 0.07, px: 900, frame: '#4b4d52', frameW: 0.006, off: 0.5 });
    decal(ctx, PF, R, mm, { nu: 26, nv: 18, off: 0.007, order: 2 });
  }
  // schmale Eck-Entlüftung ganz außen
  for (const s of [1, -1]) {
    const R = s > 0 ? [1.02, 0.9, 0.2, 0.55] : [-0.9, -1.02, 0.2, 0.55];
    const poly = [[0.99, 0.52], [0.93, 0.5], [0.935, 0.26], [0.99, 0.24]].map(([z, y]) => [s * z, y]);
    const m = hexMat(R, [poly], { cw: 0.05, px: 1100, frame: '#3b3c41', frameW: 0.005, off: 0.5 });
    decal(ctx, PF, R, m, { nu: 8, nv: 14, off: 0.006, order: 2 });
  }
  // dunkler Steg unter dem Grill (Lippen-Aufnahme)
  const chin = shapeMat([0.9, -0.9, 0.12, 0.27], 700, (g, X, Y) => {
    g.fillStyle = '#040405'; g.fillRect(0, 0, 4000, 4000);
    g.strokeStyle = '#26272b'; g.lineWidth = 3;
    for (const v of [0.2, 0.235]) { g.beginPath(); g.moveTo(X(0.9), Y(v)); g.lineTo(X(-0.9), Y(v)); g.stroke(); }
  }, { rough: 0.25, metal: 0.4, alphaTest: 0 });
  decal(ctx, PF, [0.9, -0.9, 0.12, 0.27], chin, { nu: 30, nv: 6, off: 0.003, order: 0 });

  // ---- Scheinwerfer
  const hlR = lightDecal(drawHeadlight(true), 768, 192);
  const hlL = lightDecal(drawHeadlight(false), 768, 192);
  lights.head.push(hlR, hlL);
  decal(ctx, PF, [0.93, 0.46, 0.53, 0.75], hlR, { nu: 30, nv: 10, off: 0.007, order: 3 });
  decal(ctx, PF, [-0.46, -0.93, 0.53, 0.75], hlL, { nu: 30, nv: 10, off: 0.007, order: 3 });

  // ---- Frontlippe aus Carbon: breite Platte, zweite Lage, seitliche Flügel (Canards)
  const zs = []; for (let i = 0; i <= 20; i++) zs.push(-1.0 + (2.0 * i) / 20);
  const xf = zs.map((z) => loft.endX(z, 0.13, +1) ?? 2.1);
  const protrude = (z, a, b) => a - (a - b) * smoothstep(0.5, 1.0, Math.abs(z));
  const outer = zs.map((z, i) => [xf[i] + protrude(z, 0.11, 0.02), z]);
  const inner = zs.map((z, i) => [xf[i] - 0.03, z]).reverse();
  ctx.add(plank([...outer, ...inner], 0.014, 0.112, carbon));
  const zs2 = zs.filter((z) => Math.abs(z) <= 0.84);
  const xf2 = zs2.map((z) => loft.endX(z, 0.18, +1) ?? 2.1);
  const outer2 = zs2.map((z, i) => [xf2[i] + protrude(z, 0.07, 0.015), z]);
  const inner2 = zs2.map((z, i) => [xf2[i] - 0.03, z]).reverse();
  ctx.add(plank([...outer2, ...inner2], 0.012, 0.168, carbon));
  for (const s of [1, -1]) {
    // Canard: geneigtes Carbon-Blech am äußeren Lippenende (vorn unten, zur Karosserie hin ansteigend)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.25), carbon);
    fin.position.set(xf[s > 0 ? 18 : 2] + 0.005, 0.2, s * 0.84);
    fin.rotation.set(0, 0, -0.85);
    ctx.add(fin);
  }

  // ---- Seitenschweller (schwarz glänzend) + untere Carbon-Klinge
  for (const s of [1, -1]) {
    const sk = skirt(loft, s, -1.0, 1.0, 0.2, { out: 0.05, h: 0.1 }, gloss);
    if (sk) ctx.add(sk);
    const sk2 = skirt(loft, s, -1.04, 1.04, 0.118, { out: 0.07, h: 0.026 }, carbon);
    if (sk2) ctx.add(sk2);
    // Radhaus-Ränder der Verbreiterung
    for (const [cx, R] of [[1.465, 0.4], [-1.465, 0.4]]) {
      const l = archLip(loft, cx, 0.355, R, s, { out: 0.02, rad: 0.04, a0: -0.12, a1: Math.PI + 0.12 }, paint);
      if (l) ctx.add(l);
    }
    // Außenspiegel: schwarze Kappen
    const m = mirror(gloss, { x: 0.5, y: 0.9, z: 0.93, w: 0.2, h: 0.105, d: 0.13 });
    if (s < 0) mirrorY(m);
    ctx.add(m);
  }

  // ---- Seite: Fugen, Griffe, Kotflügel-Entlüftung hinter dem Vorderrad
  for (const [P, sgn] of [[PSr, 1], [PSl, -1]]) {
    const lm = lineMat();
    const lines = [
      [[0.82, 0.3], [0.84, 0.6], [0.8, 0.95]], [[-0.24, 0.28], [-0.25, 0.95]], [[-1.07, 0.3], [-1.09, 0.6], [-1.06, 0.93]],
      [[0.82, 0.3], [0.3, 0.28], [-0.24, 0.28], [-1.07, 0.3]],
      // Flanken der Verbreiterung (Kanten der Kotflügel-Aufsätze)
      [[-1.12, 0.84], [-0.9, 0.62], [-0.8, 0.47], [-0.78, 0.3]], [[1.04, 0.82], [0.95, 0.6], [0.9, 0.3]],
    ];
    for (const l of lines) { const g = surfaceLine(P, l, 0.0035, 0.0006); if (g) ctx.add(new THREE.Mesh(g, lm), { shadow: false }); }
    for (const x of [-0.07, -1.0]) {
      const g = surfaceLine(P, [[x - 0.075, 0.79], [x + 0.075, 0.79]], 0.022, 0.003);
      if (g) ctx.add(new THREE.Mesh(g, darkChrome), { shadow: false });
    }
    // Lufteinlass im Kotflügel (schwarz, drei Lamellen)
    const R = sgn > 0 ? [0.78, 1.1, 0.3, 0.8] : [1.1, 0.78, 0.3, 0.8];
    const vp = [[1.06, 0.74], [0.9, 0.76], [0.84, 0.42], [0.99, 0.38]];
    const ventMat = shapeMat(R, 900, (g, X, Y) => {
      g.beginPath(); vp.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath();
      g.fillStyle = '#030304'; g.fill(); g.strokeStyle = '#2a2b30'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#34353a'; g.lineWidth = 5;
      for (const f of [0.25, 0.5, 0.75]) { const y = 0.76 - f * 0.34; g.beginPath(); g.moveTo(X(0.9 + (0.74 - y) * -0.2), Y(y)); g.lineTo(X(1.04 - (0.74 - y) * 0.4), Y(y - 0.015)); g.stroke(); }
    }, { rough: 0.3, metal: 0.5 });
    decal(ctx, P, R, ventMat, { nu: 18, nv: 18, off: 0.004, order: 1 });
  }

  // ---- Heck: LED-Lichtband, Embleme, Kennzeichenfeld, Spoilerlippe, Diffusor, Auspuff
  const tl = lightDecal(drawTail(), 1536, 192, { emissiveColor: 0xff2010 });
  lights.tail.push(tl);
  decal(ctx, PR, [0.98, -0.98, 0.63, 0.87], tl, { nu: 60, nv: 8, off: 0.005, order: 3 });
  const rp = PR(0, 0.835);
  if (rp) ctx.add(ringsEmblem('silver', 0.2, rp.p.clone().addScaledVector(rp.n, 0.012), rp.n), { shadow: false });
  plate(ctx, PR, -0.4, 0.655, 0.12, 0.044, ['RS 7'], { rear: true, bg: '#0b0b0d', fg: '#ececee', border: '#8b8d92', off: 0.008 });
  plate(ctx, PR, 0, 0.5, 0.5, 0.115, ['RS 7'], { rear: true, bg: '#0e0e11', fg: '#2a2b30', border: '#26272b', off: 0.004 });
  // schwarze Blende im unteren Stoßfänger
  const apron = shapeMat([0.95, -0.95, 0.18, 0.42], 500, (g, X, Y) => { g.fillStyle = '#040405'; g.fillRect(0, 0, 4000, 4000); }, { rough: 0.2, metal: 0.3, alphaTest: 0 });
  decal(ctx, PR, [0.95, -0.95, 0.2, 0.4], apron, { nu: 30, nv: 6, off: 0.003, order: 0 });

  // Spoilerlippe: gestufter Flügel, über die Heckklappe gezogen, Enden laufen spitz aus
  {
    const pathP = [], outs = [], ups = [];
    const x0 = -2.1;
    for (let i = 0; i <= 28; i++) {
      const z = -0.86 + (1.72 * i) / 28;
      const y = loft.topY(x0, z) ?? 0.93;
      const taper = 1 - 0.55 * smoothstep(0.55, 0.86, Math.abs(z));
      pathP.push([x0, y, z]); outs.push([-taper, 0, 0]); ups.push([0, 1, 0]);
    }
    const prof = [[-0.02, -0.03], [0.1, -0.014], [0.21, 0.006], [0.27, 0.022], [0.275, 0.038], [0.2, 0.04], [0.1, 0.028], [-0.02, 0.0]];
    const wingMat = matBlackGloss(); wingMat.side = THREE.DoubleSide;
    ctx.add(new THREE.Mesh(sweep(pathP, outs, ups, prof, { closedProfile: true }), wingMat));
    // zweite, kürzere Lage darunter
    const p2 = pathP.filter((_, i) => i >= 4 && i <= 24);
    const prof2 = [[-0.02, -0.03], [0.08, -0.024], [0.2, -0.004], [0.225, 0.0], [0.225, 0.012], [0.08, -0.01], [-0.02, -0.005]];
    const carbon2 = carbonMaterial({ repeat: 7 }); carbon2.side = THREE.DoubleSide;
    ctx.add(new THREE.Mesh(sweep(p2, outs.slice(4, 25), ups.slice(4, 25), prof2, { closedProfile: true }), carbon2));
  }

  // Diffusor mit Finnen, schwarzer Hochglanz-Boden
  ctx.add(diffuser({ x0: -2.0, x1: -2.46, zHalf: 0.86, y: 0.19, fins: 5, finH: 0.12, mat: carbon }));
  // vier runde, schwarze Endrohre (je zwei links/rechts)
  for (const z of [0.5, 0.675, -0.5, -0.675]) {
    const t = exhaustTip({ r: 0.05, len: 0.15 });
    t.position.set(-2.4, 0.275, z);
    ctx.add(t);
  }
}

export function buildRS7() { return assembleCar(RS7_DEF); }
