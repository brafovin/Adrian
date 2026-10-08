// Mercedes-AMG G 63 (Mansory) – Hilfsfunktionen: Texturen, Carbon-Sammler, Innenraum in Tiffany Blue.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture, carbonMaterial, matBlackGloss, matChrome, matDarkChrome, emblemTexture } from '../materials.js';
import { leatherMaterial, makeCluster, TIFFANY } from './interior.js';

export const TEAL = 0x19c7c0;
const INT_TEAL = 0x11aebf;   // Tiffany Blue (leicht ins Blaue verschoben, damit es im warmen Licht wie im Referenzbild wirkt)

// ---------------------------------------------------------------------------------------------
// Carbon-Sammler: viele Teile -> ein Mesh, UV als Kastenprojektion in Metern (ein Material, gleiche Gewebegröße überall)

export function boxUV(g, tile = 0.12) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export const xf = (x, y, z, rx = 0, ry = 0, rz = 0) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s).clone();

export function carbonKit(tile = 0.075) {
  const mat = carbonMaterial({ repeat: 1 });
  mat.color.setScalar(0.8); mat.normalScale.set(0.2, 0.2); mat.roughness = 0.3; mat.metalness = 0.9; mat.envMapIntensity = 1.6;
  const geos = [];
  const add = (geo, m4) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m4) g.applyMatrix4(m4);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    boxUV(g, tile);
    geos.push(g);
  };
  const box = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => add(new RoundedBoxGeometry(w, h, d, r <= 0.012 ? 1 : 2, Math.min(r, Math.min(w, h, d) * 0.45)), xf(x, y, z, rx, ry, rz));
  const addMesh = (mesh) => { mesh.updateMatrixWorld(true); add(mesh.geometry, mesh.matrixWorld); };
  const build = () => { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = false; return m; };
  return { mat, add, addMesh, box, build, count: () => geos.length };
}

// ---------------------------------------------------------------------------------------------
// Texturen

/** "MANSORY" mit Flügeln (Schriftzug/Kennzeichen). */
export function mansoryTex(w, h, { bg = null, fg = '#d9dde2', wings = true, fontScale = 0.5, border = null, glow = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(2, h * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth); }
  g.fillStyle = fg; g.strokeStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = Math.round(h * fontScale);
  g.font = `${fs}px Georgia, "Times New Roman", serif`;
  const txt = 'MANSORY';
  const sp = fs * 0.13;
  let tw = 0; const ws = [];
  for (const ch of txt) { const m = g.measureText(ch).width; ws.push(m); tw += m + sp; }
  tw -= sp;
  const tx0 = w / 2 - tw / 2;
  if (glow) { g.shadowColor = glow; g.shadowBlur = fs * 0.35; }
  let x = tx0;
  g.textAlign = 'left';
  for (let i = 0; i < txt.length; i++) { g.fillText(txt[i], x, h * 0.52); x += ws[i] + sp; }
  g.shadowBlur = 0;
  if (wings) {
    const wl = (w - tw) / 2 - h * 0.32;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? tx0 - h * 0.12 : tx0 + tw + h * 0.12;
      for (let k = 0; k < 3; k++) {
        const len = wl * (1 - k * 0.22);
        const y = h * (0.40 + k * 0.1);
        g.lineWidth = Math.max(1.5, h * 0.035);
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + s * len, y - h * 0.045 * (k + 1) * 0.6 + h * 0.03); g.stroke();
      }
    }
  }
  return canvasTexture(c);
}

/** Rautenmuster (Sitz-/Türpolster) als Textur: Farbe + Normal liefert interior.js nicht für Teilflächen, daher eigene Variante. */


// ---------------------------------------------------------------------------------------------
// Innenraum (komplett Tiffany Blue)

const rbg = (w, h, d, r = 0.02, seg = r <= 0.015 ? 1 : 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w * 0.49, h * 0.49, d * 0.49)));

class Batch {
  constructor() { this.m = new Map(); }
  add(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat).push(g);
  }
  build(parent) {
    for (const [mat, geos] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      parent.add(mesh);
    }
  }
}

const mx = (x, y, z, rx = 0, ry = 0, rz = 0) => xf(x, y, z, rx, ry, rz);
const mul = (a, b) => a.clone().multiply(b);

/** Rautenmuster-Leder mit passender Wiederholung (Rautengröße in Metern). */
function quiltFactory(color, thread) {
  const base = leatherMaterial({ color, quilt: true, thread });
  return (wm, hm, cell = 0.062) => {
    const m = base.clone();
    m.map = base.map.clone(); m.normalMap = base.normalMap.clone();
    for (const t of [m.map, m.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(wm / (cell * 5), hm / (cell * 5)); t.needsUpdate = true; }
    return m;
  };
}

function textPlaneMat(w, h, draw, { rough = 0.5, metal = 0.0, emissive = null, transparent = true } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  const tex = canvasTexture(c);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, transparent, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveMap = tex; m.emissiveIntensity = 1.0; }
  return m;
}

/** Türverkleidung als Textur (Tiffany-Leder, Naht, Carbon-Einsätze, MANSORY). flip = rechte Tür (gespiegelt). */
function doorTexture(flip, W = 1024, H = 760) {
  const c = canvas(W, H), g = c.getContext('2d');
  if (flip) { g.translate(W, 0); g.scale(-1, 1); }
  // Leder
  g.fillStyle = '#14aebf'; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const stitch = (pts, col = '#0a4f4c', lw = 2) => {
    g.save(); g.strokeStyle = col; g.lineWidth = lw; g.setLineDash([9, 6]); g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  // Carbon-Muster
  const carbonFill = (x, y, w, h, r) => {
    g.save(); rr(x, y, w, h, r); g.clip();
    g.fillStyle = '#0a0b0c'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(140,150,160,0.30)'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 9) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = -h; i < w + h; i += 9) { g.beginPath(); g.moveTo(x + i + 4.5, y + h); g.lineTo(x + i + 4.5 + h, y); g.stroke(); }
    g.restore();
    g.save(); rr(x, y, w, h, r); g.strokeStyle = '#1fd6cb'; g.lineWidth = 3; g.globalAlpha = 0.65; g.stroke(); g.restore();
  };
  // Obere Polsterleiste mit Naht
  rr(40, 40, W - 80, 150, 40); g.strokeStyle = 'rgba(8,70,68,0.55)'; g.lineWidth = 3; g.stroke();
  stitch([[70, 60], [W - 70, 60]]); stitch([[70, 170], [W - 70, 170]]);
  // Carbon-Einsatz oben mit Schriftzug (zum hinteren Türende)
  carbonFill(W * 0.42, 70, W * 0.46, 92, 24);
  g.save(); g.fillStyle = '#d6dadf'; g.font = '56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('M A N S O R Y', W * 0.65, 118); g.restore();
  // Griffmulde / Mittelfeld
  carbonFill(70, 260, W - 150, 210, 46);
  g.fillStyle = '#05070a'; rr(W * 0.30, 290, W * 0.58, 140, 28); g.fill();
  stitch([[80, 505], [W - 80, 505]]);
  // Armlehnen-Wulst und Seitenzug
  carbonFill(W * 0.22, 500, W * 0.7, 70, 30);
  // untere Tasche mit Lautsprecherschlitz
  rr(70, 600, W - 140, 120, 36); g.strokeStyle = 'rgba(8,70,68,0.6)'; g.lineWidth = 3; g.stroke();
  carbonFill(120, 628, W - 240, 64, 26);
  g.strokeStyle = 'rgba(31,214,203,0.7)'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(180 + i * 55, 645); g.lineTo(180 + i * 55, 675); g.stroke(); }
  stitch([[60, 740], [W - 60, 740]]);
  // Fensterheber-Bereich (vorne = Griff-Gegenseite)
  g.fillStyle = '#06080a'; rr(110, 285, 190, 130, 22); g.fill();
  g.fillStyle = '#9aa3ab';
  for (let i = 0; i < 4; i++) { rr(128 + i * 42, 300, 30, 22, 6); g.fill(); }
  g.fillStyle = '#1fd6cb'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(150 + i * 60, 385, 8, 0, 7); g.fill(); }
  const tex = canvasTexture(c);
  return tex;
}


/** Kombiinstrument im Mansory-Stil (gleiche Schnittstelle wie makeCluster: draw(kmh, rpmFrac, gear, ev)). */
function makeG63Cluster() {
  const W = 768, H = 288;
  const c = canvas(W, H), g = c.getContext('2d');
  const tex = canvasTexture(c);
  const A = '#27e6d8';
  const draw = (kmh, rpmFrac, gear, ev = false) => {
    g.fillStyle = '#03060a'; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.55); bg.addColorStop(0, 'rgba(20,150,150,0.20)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const dial = (cx, cy, R, frac, maxLab, nTick, labelFn, unit, red) => {
      const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
      g.lineCap = 'round';
      g.strokeStyle = '#1b2a34'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R, a0, a0 + span); g.stroke();
      if (red) { g.strokeStyle = '#9a1c22'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R, a0 + span * 0.82, a0 + span); g.stroke(); }
      const f = Math.max(0, Math.min(1, frac));
      g.strokeStyle = A; g.shadowColor = A; g.shadowBlur = 14; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R, a0, a0 + span * f); g.stroke(); g.shadowBlur = 0;
      g.lineWidth = 3; g.strokeStyle = '#8fa4ae';
      for (let i = 0; i <= nTick; i++) {
        const a = a0 + (span * i) / nTick, big = i % 2 === 0;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); g.lineTo(cx + Math.cos(a) * (R - (big ? 40 : 32)), cy + Math.sin(a) * (R - (big ? 40 : 32))); g.stroke();
        if (big) { g.fillStyle = '#cfe6ea'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(labelFn(i / nTick), cx + Math.cos(a) * (R - 62), cy + Math.sin(a) * (R - 62)); }
      }
      // Zeiger
      const an = a0 + span * f;
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.shadowColor = A; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(cx + Math.cos(an) * 22, cy + Math.sin(an) * 22); g.lineTo(cx + Math.cos(an) * (R - 18), cy + Math.sin(an) * (R - 18)); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = '#10181e'; g.beginPath(); g.arc(cx, cy, 18, 0, 7); g.fill(); g.strokeStyle = A; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#7fa0a8'; g.font = '18px Arial'; g.textAlign = 'center'; g.fillText(unit, cx, cy + R * 0.55);
    };
    dial(180, 150, 120, ev ? rpmFrac : rpmFrac, 8, 16, (u) => String(Math.round(u * 8)), ev ? '%' : 'x1000 /min', !ev);
    dial(588, 150, 120, kmh / 320, 320, 16, (u) => String(Math.round(u * 320)), 'km/h', false);
    g.fillStyle = A; g.shadowColor = A; g.shadowBlur = 16; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(gear), W / 2, H * 0.52); g.shadowBlur = 0;
    g.fillStyle = '#d9f6f3'; g.font = '26px Georgia, serif'; g.fillText('MANSORY', W / 2, 40);
    g.fillStyle = '#7fa0a8'; g.font = '20px Arial'; g.fillText(Math.round(kmh) + ' km/h', W / 2, H - 38);
    tex.needsUpdate = true;
  };
  draw(0, 0, 'P');
  return { texture: tex, draw };
}

export function buildG63Interior() {
  const g = new THREE.Group();
  const batch = new Batch();
  const SEAT_Z = 0.4, DRV_Z = -0.4;

  // ---- Materialien
  const lea = leatherMaterial({ color: INT_TEAL, rough: 0.5 });
  const leaDash = leatherMaterial({ color: 0x0e9fb2, rough: 0.62 });
  const quilt = quiltFactory(INT_TEAL, '#073f4a');
  const carbon = carbonMaterial({ repeat: 5 }); carbon.normalScale.set(0.25, 0.25); carbon.color.setScalar(0.8);
  const gloss = matBlackGloss();
  const chrome = matChrome();
  const dchrome = matDarkChrome();
  const carpet = new THREE.MeshStandardMaterial({ color: 0x0b4f4c, roughness: 0.95, metalness: 0 });
  const glowTeal = new THREE.MeshStandardMaterial({ color: 0x0fd8cc, emissive: 0x19e8dc, emissiveIntensity: 1.6, roughness: 0.4 });
  const matteBlack = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.7, metalness: 0.2 });
  const tealGlow = new THREE.MeshStandardMaterial({ color: 0x0fd8cc, emissive: 0x19e8dc, emissiveIntensity: 1.4, roughness: 0.4 });

  // ---- Boden, Rückwand, Laderaum
  batch.add(new THREE.BoxGeometry(2.9, 0.04, 1.66), carpet, mx(-0.62, 0.46, 0));
  batch.add(new THREE.BoxGeometry(0.04, 0.9, 1.7), matteBlack, mx(-2.2, 1.0, 0));
  batch.add(new THREE.BoxGeometry(0.8, 0.5, 0.04), matteBlack, mx(0.0, 0.7, 0.84));
  // Tunnel
  batch.add(rbg(2.4, 0.2, 0.36, 0.08), carpet, mx(-0.4, 0.55, 0));

  // ---- Armaturenbrett (Profil quer extrudiert)
  {
    const pts = [[0.82, 0.5], [0.82, 1.15], [0.66, 1.158], [0.5, 1.15], [0.44, 1.11], [0.455, 1.04], [0.5, 0.9], [0.55, 0.76], [0.62, 0.58], [0.68, 0.5]];
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 1.66, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
    eg.translate(0, 0, -0.83);
    // UV für Leder in Metern
    boxUV(eg, 0.25);
    batch.add(eg, leaDash);
  }
  // Display-Sockel (schwarzes Glas, durchgehend) + Haube
  const SCR_X = 0.58, SCR_Y = 1.235;
  batch.add(rbg(0.07, 0.25, 1.34, 0.02), gloss, mx(SCR_X + 0.01, SCR_Y, -0.04, 0, 0, -0.16));
  batch.add(rbg(0.16, 0.026, 1.38, 0.012), carbon, mx(SCR_X + 0.02, SCR_Y + 0.135, -0.04, 0, 0, -0.1));
  // Carbon-Zierleiste über die Instrumententafel (Beifahrerseite) und unter dem Display
  batch.add(rbg(0.03, 0.05, 0.84, 0.012), carbon, mx(0.47, 1.045, 0.42, 0, 0, 0.08));
  batch.add(rbg(0.03, 0.04, 0.5, 0.012), carbon, mx(0.51, 0.93, -0.62, 0, 0, 0.1));
  // Handschuhfach-Mulde (Beifahrer)
  batch.add(rbg(0.03, 0.06, 0.32, 0.02), matteBlack, mx(0.53, 0.86, 0.56, 0, 0, 0.1));

  // Anzeigen (Plane auf der Fahrerseite der Glasfläche, zeigt nach hinten/oben)
  const cluster = makeG63Cluster();
  const scrNormalY = -Math.PI / 2;
  const mkScreen = (mat, w, h, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.set(0, scrNormalY, 0); m.rotateX(0); m.rotation.z = 0;
    m.position.set(SCR_X - 0.032, SCR_Y, z);
    m.rotateZ(0.0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, scrNormalY, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16));
    m.quaternion.copy(q);
    g.add(m);
    return m;
  };
  mkScreen(new THREE.MeshBasicMaterial({ map: cluster.texture, toneMapped: true }), 0.6, 0.225, -0.4 - 0.0);
  const infoTex = textPlaneMat(768, 288, (c, w, h) => {
    c.fillStyle = '#04080c'; c.fillRect(0, 0, w, h);
    const gr = c.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.6); gr.addColorStop(0, 'rgba(25,200,192,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#19c7c0'; c.lineWidth = 3; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#d9fffc'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#19e8dc'; c.shadowBlur = 18;
    c.font = '78px Georgia, serif'; c.fillText('MANSORY', w / 2, h * 0.48);
    c.shadowBlur = 0; c.lineWidth = 4; c.strokeStyle = '#d9fffc';
    for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(w / 2 + sgn * 250, h * (0.38 + k * 0.08)); c.lineTo(w / 2 + sgn * (330 - k * 30), h * (0.34 + k * 0.08)); c.stroke(); }
    c.font = '28px Arial'; c.fillStyle = '#7fe9e1'; c.fillText('G 63  ·  EXCLUSIVE EDITION', w / 2, h * 0.8);
  }, { rough: 0.2, metal: 0.0, emissive: 0xffffff, transparent: false });
  infoTex.emissiveIntensity = 0.55;
  mkScreen(infoTex, 0.66, 0.225, 0.3);

  // ---- Turbinen-Lüftungsdüsen
  const bladeGeo = (R, n) => {
    const geos = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.BoxGeometry(0.022, R * 0.8, 0.0035);
      b.rotateY(0.6);
      b.translate(0, R * 0.46, 0);
      b.applyMatrix4(new THREE.Matrix4().makeRotationX((i / n) * Math.PI * 2));
      geos.push(b);
    }
    return mergeGeometries(geos);
  };
  const ventMatDark = new THREE.MeshStandardMaterial({ color: 0x06090b, roughness: 0.35, metalness: 0.8 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b8f89, emissive: 0x19e8dc, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.7 });
  const vent = (x, y, z, R, tilt) => {
    const gp = new THREE.Group();
    gp.position.set(x, y, z); gp.rotation.z = tilt; // Achse = x, Blick nach hinten (-x)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.12, 10, 40), chrome); ring.rotation.y = Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 36), ventMatDark); disc.rotation.y = -Math.PI / 2; disc.position.x = 0.012;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(R * 0.84, R * 0.055, 8, 40), glowTeal); glow.rotation.y = Math.PI / 2; glow.position.x = -0.002;
    const bl = new THREE.Mesh(bladeGeo(R, 18), bladeMat); bl.position.x = -0.006;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.012, 16), chrome); hub.rotation.z = Math.PI / 2; hub.position.x = -0.006;
    gp.add(ring, disc, glow, bl, hub);
    g.add(gp);
  };
  const faceX = (y) => 0.425 + (1.04 - y) * 0.3214;    // Vorderseite (Fahrerseite) des Armaturenbretts in Höhe y
  const TILT = 0.31;
  batch.add(rbg(0.02, 0.34, 0.98, 0.05), gloss, mx(faceX(0.91) + 0.0, 0.91, 0, 0, 0, TILT));
  batch.add(rbg(0.02, 0.022, 0.98, 0.008), tealGlow, mx(faceX(1.1) - 0.004, 1.1, 0, 0, 0, TILT));
  vent(faceX(0.99) - 0.014, 0.99, -0.27, 0.066, TILT);
  vent(faceX(0.975) - 0.014, 0.975, -0.005, 0.048, TILT);
  vent(faceX(0.99) - 0.014, 0.99, 0.27, 0.066, TILT);
  vent(faceX(1.07) - 0.004, 1.07, -0.78, 0.042, TILT);
  vent(faceX(1.07) - 0.004, 1.07, 0.8, 0.042, TILT);
  const onFace = (mesh, y, z, dx = 0.014) => { mesh.rotation.order = 'ZYX'; mesh.rotation.set(0, -Math.PI / 2, TILT); mesh.position.set(faceX(y) - dx, y, z); g.add(mesh); return mesh; };
  {
    const m1 = textPlaneMat(512, 160, (c, w, h) => {
      c.fillStyle = '#05070a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#19e8dc'; c.font = 'bold 28px Arial'; c.textAlign = 'center';
      c.fillText('21.5', w * 0.17, 58); c.fillText('21.0', w * 0.83, 58);
      c.strokeStyle = '#7fe9e1'; c.lineWidth = 3;
      for (let i = 0; i < 4; i++) { c.strokeRect(36 + i * 112, 88, 80, 46); c.beginPath(); c.arc(76 + i * 112, 111, 9, 0, 7); c.stroke(); }
    }, { rough: 0.25, emissive: 0xffffff, transparent: false });
    m1.emissiveIntensity = 0.6;
    onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.08), m1), 0.855, 0.0, 0.0145);
    const m2 = textPlaneMat(1024, 96, (c, w, h) => {
      c.fillStyle = '#07090c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 3 === 1 ? '#19e8dc' : '#b9c2c9'; c.beginPath(); c.roundRect(20 + i * 82, 20, 64, 56, 10); c.fill(); }
    }, { rough: 0.3, metal: 0.6, transparent: false });
    onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.043), m2), 0.775, 0.0, 0.0145);
  }

  // ---- Mittelkonsole
  batch.add(rbg(1.15, 0.34, 0.3, 0.05), lea, mx(0.05, 0.64, 0.0));
  batch.add(rbg(0.55, 0.24, 0.3, 0.05), lea, mx(0.5, 0.74, 0.0, 0, 0, 0.18));
  batch.add(rbg(0.78, 0.035, 0.27, 0.014), lea, mx(-0.3, 0.826, 0.0));
  // Ablage-Mulde (schwarz, glänzend) mit Controller
  batch.add(rbg(0.38, 0.012, 0.2, 0.01), gloss, mx(0.19, 0.826, 0.0));
  batch.add(new THREE.CylinderGeometry(0.03, 0.036, 0.04, 20), dchrome, mx(0.22, 0.848, 0.0));
  batch.add(new THREE.CylinderGeometry(0.018, 0.02, 0.05, 14), chrome, mx(0.13, 0.855, 0.05));
  for (const z of [-0.07, 0.07]) batch.add(rbg(0.012, 0.02, 0.04, 0.004), glowTeal, mx(0.34, 0.835, z));
  batch.add(rbg(0.3, 0.012, 0.16, 0.008), carbon, mx(-0.2, 0.832, 0.0));

  // ---- Pedale
  batch.add(rbg(0.025, 0.09, 0.14, 0.01), dchrome, mx(0.5, 0.58, DRV_Z + 0.02, 0, 0, 0.5));
  batch.add(rbg(0.025, 0.1, 0.05, 0.01), dchrome, mx(0.5, 0.58, DRV_Z - 0.14, 0, 0, 0.5));
  batch.add(rbg(0.03, 0.14, 0.24, 0.02), matteBlack, mx(0.58, 0.6, DRV_Z + 0.26, 0, 0, 0.4));

  // ---- Sitze
  const quiltBack = quilt(0.3, 0.42), quiltBase = quilt(0.36, 0.3), quiltRear = quilt(0.36, 0.4);
  const mansoryText = textPlaneMat(512, 128, (c, w, h) => {
    c.fillStyle = '#073c3a'; c.strokeStyle = '#073c3a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '60px Georgia, serif';
    c.fillText('M A N S O R Y', w / 2, h * 0.5); c.lineWidth = 3;
    for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(w / 2 + sgn * 205, h * (0.42 + k * 0.1)); c.lineTo(w / 2 + sgn * (245 - k * 14), h * (0.38 + k * 0.1)); c.stroke(); }
  }, { rough: 0.7 });
  const mMark = textPlaneMat(128, 128, (c, w, h) => {
    c.fillStyle = '#073c3a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '86px Georgia, serif'; c.fillText('M', w / 2, h * 0.52);
  }, { rough: 0.7 });
  const seat = (sx, sz, { rear = false, w = 0.54 } = {}) => {
    const S = mx(sx, 0.86, sz);
    batch.add(rbg(0.56, 0.17, w, 0.07), lea, mul(S, mx(0, -0.085, 0)));
    batch.add(rbg(0.42, 0.034, w - 0.2, 0.015), quiltBase, mul(S, mx(0.0, 0.004, 0)));
    for (const sgn of [-1, 1]) batch.add(rbg(0.52, 0.07, 0.085, 0.034), lea, mul(S, mx(-0.01, 0.014, sgn * (w / 2 - 0.045))));
    batch.add(rbg(0.1, 0.1, w * 0.9, 0.04), lea, mul(S, mx(0.26, 0.0, 0)));
    const Bk = mul(S, mx(-0.26, 0.02, 0, 0, 0, 0.2));
    batch.add(rbg(0.12, 0.62, w, 0.055), lea, mul(Bk, mx(0, 0.31, 0)));
    for (const sgn of [-1, 1]) batch.add(rbg(0.16, 0.5, 0.09, 0.04), lea, mul(Bk, mx(0.028, 0.29, sgn * (w / 2 - 0.045))));
    batch.add(rbg(0.034, 0.4, 0.31, 0.014), quiltBack, mul(Bk, mx(0.075, 0.24, 0)));
    batch.add(rbg(0.034, 0.12, 0.31, 0.014), lea, mul(Bk, mx(0.075, 0.51, 0)));
    batch.add(rbg(0.11, 0.24, 0.31, 0.055), lea, mul(Bk, mx(0.0, 0.76, 0)));
    for (const sgn of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), dchrome, mul(Bk, mx(0.0, 0.62, sgn * 0.07)));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), mansoryText);
    lab.rotation.y = Math.PI / 2; lab.matrixAutoUpdate = false; lab.matrix.copy(mul(Bk, mx(0.059, 0.78, 0, 0, Math.PI / 2, 0)));
    g.add(lab);
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), mMark);
    mm.matrixAutoUpdate = false; mm.matrix.copy(mul(Bk, mx(0.0925, 0.505, 0, 0, Math.PI / 2, 0)));
    g.add(mm);
    void rear; void quiltRear;
  };
  seat(-0.34, DRV_Z); seat(-0.34, SEAT_Z);
  // Rückbank (3 Plätze)
  for (const z of [-0.5, 0, 0.5]) seat(-1.2, z, { rear: true, w: 0.5 });
  // Mittelarmlehne
  batch.add(rbg(0.5, 0.09, 0.2, 0.04), lea, mx(-0.5, 0.89, 0));

  // ---- Türverkleidungen
  const doorMat = (flip) => {
    const m = new THREE.MeshPhysicalMaterial({ map: doorTexture(flip), roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x40e0d0) });
    return m;
  };
  const doorL = doorMat(false), doorR = doorMat(true);
  const doorTrims = [];   // je Tür eine Gruppe (Fahrzeugkoordinaten); der Aufrufer kann sie an die Tür hängen
  for (const [idx, x0, x1] of [[0, -0.3, 0.62], [1, -1.25, -0.4]]) {
    const len = x1 - x0, xc = (x0 + x1) / 2;
    for (const s of [-1, 1]) {
      const mat = s < 0 ? doorL : doorR;
      const grp = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 0.05), [matteBlack, matteBlack, matteBlack, matteBlack, s < 0 ? mat : matteBlack, s < 0 ? matteBlack : mat]);
      slab.position.set(xc, 0.88, s * 0.845);
      const arm = new THREE.Mesh(rbg(len * 0.34, 0.04, 0.06, 0.02), lea); arm.position.set(xc - len * 0.24, 1.07, s * 0.818);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len * 0.26, 10), chrome); handle.rotation.z = Math.PI / 2; handle.position.set(xc + len * 0.12, 1.0, s * 0.815);
      grp.add(slab, arm, handle);
      g.add(grp);
      doorTrims.push({ idx, side: s, group: grp });
    }
  }

  // ---- Lenkrad (dreht um die Säulenachse)
  const steer = new THREE.Group();
  steer.position.set(0.4, 1.1, DRV_Z);
  steer.rotation.order = 'ZYX';
  steer.rotation.z = -0.5;
  {
    const R = 0.185;
    const rimGeo = new THREE.TorusGeometry(R, 0.019, 14, 56, Math.PI * 2 - 0.9);
    rimGeo.rotateZ(Math.PI / 2 + 0.45 + Math.PI);
    const rim = new THREE.Mesh(rimGeo, lea); rim.rotation.y = Math.PI / 2;
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.07, 28), lea); hubM.rotation.z = Math.PI / 2; hubM.position.x = -0.012;
    const spokeL = new THREE.Mesh(rbg(0.026, 0.045, R * 0.95, 0.012), lea); spokeL.position.set(0, 0, R * 0.55);
    const spokeR = spokeL.clone(); spokeR.position.z = -R * 0.55;
    const bottom = new THREE.Mesh(rbg(0.03, 0.04, R * 1.05, 0.012), carbon); bottom.position.set(0, -R * 0.84, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, R * 1.5, 12), carbon); bar.rotation.x = Math.PI / 2; bar.position.set(0, -R * 0.93, 0);
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.044, 30), new THREE.MeshStandardMaterial({ map: emblemTexture('star'), transparent: true, metalness: 0.5, roughness: 0.3 }));
    em.rotation.y = -Math.PI / 2; em.position.x = -0.048;
    const pods = [];
    for (const z of [-0.105, 0.105]) { const p = new THREE.Mesh(rbg(0.02, 0.06, 0.06, 0.012), gloss); p.position.set(-0.034, 0.0, z); pods.push(p); }
    steer.add(rim, hubM, spokeL, spokeR, bottom, bar, em, ...pods);
    // Lenkradkranz: oben Mittelmarkierung (türkis)
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.012), glowTeal); mark.position.set(-0.002, R + 0.0, 0); steer.add(mark);
    steer.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }
  g.add(steer);
  // Lenksäule + Verkleidung
  batch.add(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 14), matteBlack, mx(0.52, 1.0, DRV_Z, 0, 0, Math.PI / 2 - 0.5));

  batch.build(g);
  g.userData = { steer, cluster, cockpitEye: [-0.12, 1.62, DRV_Z], doorTrims };
  return g;
}
