// Materialien und prozedurale Texturen (alles zur Laufzeit per Canvas erzeugt, keine Bilddateien nötig).

import * as THREE from 'three';
import { clamp, rng } from './util.js';

// ------------------------------------------------------------------------------------------
// Canvas-Helfer

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

/** Höhenkarte (Graustufen-Canvas) -> Normalmap-Canvas. */
export function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const d = sctx.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const o = octx.createImageData(w, h);
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      o.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      o.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      o.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      o.data[i + 3] = 255;
    }
  }
  octx.putImageData(o, 0, 0);
  return out;
}

// ------------------------------------------------------------------------------------------
// Texturen

/** Carbon-Köper 2x2 (Farbe + Höhenkarte für Relief). */
export function carbonTextures(size = 256) {
  const cells = 8;
  const c = canvas(size, size), g = c.getContext('2d');
  const hc = canvas(size, size), hg = hc.getContext('2d');
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, size, size);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size);
  const cs = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // 2/2-Köper: Faden-Orientierung wechselt diagonal
      const horiz = ((x + y) >> 1) % 2 === 0;
      const x0 = x * cs, y0 = y * cs;
      const gr = horiz ? g.createLinearGradient(x0, y0, x0, y0 + cs) : g.createLinearGradient(x0, y0, x0 + cs, y0);
      gr.addColorStop(0, '#2c2c30'); gr.addColorStop(0.5, '#0d0d0f'); gr.addColorStop(1, '#262629');
      g.fillStyle = gr; g.fillRect(x0 + 0.5, y0 + 0.5, cs - 1, cs - 1);
      const hgr = horiz ? hg.createLinearGradient(x0, y0, x0, y0 + cs) : hg.createLinearGradient(x0, y0, x0 + cs, y0);
      hgr.addColorStop(0, '#9a9a9a'); hgr.addColorStop(0.5, '#e0e0e0'); hgr.addColorStop(1, '#9a9a9a');
      hg.fillStyle = hgr; hg.fillRect(x0 + 0.5, y0 + 0.5, cs - 1, cs - 1);
    }
  }
  return { map: canvasTexture(c), normal: canvasTexture(heightToNormal(hc, 1.6), { srgb: false }) };
}

/** Feines Narbenleder-Korn als Normalmap. */
export function leatherGrain(size = 256, seed = 7) {
  const r = rng(seed);
  const hc = canvas(size, size), g = hc.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.09; i++) {
    const x = r() * size, y = r() * size, rad = 1.2 + r() * 2.2;
    const v = 120 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.9)`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    // Wrap-around, damit die Textur kachelbar bleibt
    if (x < rad) { g.beginPath(); g.arc(x + size, y, rad, 0, 7); g.fill(); }
    if (y < rad) { g.beginPath(); g.arc(x, y + size, rad, 0, 7); g.fill(); }
  }
  return canvasTexture(heightToNormal(hc, 1.1), { srgb: false, repeat: [1, 1] });
}

/**
 * Rautensteppung (Diamond Quilting) für Sitze: liefert Farbe + Normalmap.
 * color: Basis-Hex, thread: Nahtfarbe.
 */
export function diamondQuilt({ color = '#19b3ab', thread = '#b8f2ee', size = 512, cells = 4, seed = 3 } = {}) {
  const r = rng(seed);
  const hc = canvas(size, size), hg = hc.getContext('2d');
  const cc = canvas(size, size), cg = cc.getContext('2d');
  cg.fillStyle = color; cg.fillRect(0, 0, size, size);
  const hi = hg.createImageData(size, size);
  const cs = size / cells; // Diagonalraster: Raute mit Breite cs
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rautenkoordinaten
      const u = ((x / cs) % 1 + 1) % 1, v = ((y / cs) % 1 + 1) % 1;
      // Diamant: Abstand zur nächsten Naht (Diagonalen)
      const a = Math.abs(u - v), b = Math.abs(u + v - 1);
      const a2 = Math.min(a, 1 - a), b2 = Math.min(b, 1 - b);
      const dEdge = Math.min(a2, b2); // 0 an der Naht
      const pillow = Math.pow(clamp(dEdge * 3.2, 0, 1), 0.7);
      const val = 40 + pillow * 190 + (r() - 0.5) * 6;
      const i = (y * size + x) * 4;
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = val; hi.data[i + 3] = 255;
    }
  }
  hg.putImageData(hi, 0, 0);
  // Nähte
  cg.strokeStyle = thread; cg.lineWidth = 2.2; cg.setLineDash([7, 4]);
  for (let i = -cells; i <= cells * 2; i++) {
    cg.beginPath(); cg.moveTo(i * cs, 0); cg.lineTo(i * cs + size, size); cg.stroke();
    cg.beginPath(); cg.moveTo(i * cs, 0); cg.lineTo(i * cs - size, size); cg.stroke();
  }
  // Schattierung entlang der Nähte (Vertiefung)
  const sh = cg.createImageData(size, size);
  const cd = cg.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const hv = hi.data[i * 4] / 255;
    const k = 0.55 + 0.45 * hv;
    cd.data[i * 4] *= k; cd.data[i * 4 + 1] *= k; cd.data[i * 4 + 2] *= k;
  }
  cg.putImageData(cd, 0, 0);
  void sh;
  return { map: canvasTexture(cc), normal: canvasTexture(heightToNormal(hc, 3.2), { srgb: false }) };
}

/** Wabengitter (RS7-Grill): Alpha-Maske + Normalmap. */
export function honeycombTextures({ size = 512, cells = 18, bar = 0.2 } = {}) {
  const hc = canvas(size, size), g = hc.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  const w = size / cells, h = w * Math.sqrt(3) / 2 * 1.0;
  g.fillStyle = '#000000';
  const hexR = w * 0.5 * (1 - bar);
  for (let row = -1; row < size / h + 1; row++) {
    for (let col = -1; col < cells + 1; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * h;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 3 * k + Math.PI / 6;
        const px = cx + Math.cos(a) * hexR / Math.cos(Math.PI / 6) * 0.93, py = cy + Math.sin(a) * hexR / Math.cos(Math.PI / 6) * 0.93;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    }
  }
  return { height: hc, normal: canvasTexture(heightToNormal(hc, 2.4), { srgb: false }) };
}

/** Plakettenfeld (Kennzeichen o. ä.): Text auf Fläche. */
export function plateTexture(lines, { bg = '#f4f4f1', fg = '#101010', w = 512, h = 128, font = 'bold 54px "Arial Narrow", Arial, sans-serif', border = '#222' } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font;
  if (lines.length === 1) g.fillText(lines[0], w / 2, h / 2 + 3);
  else { g.fillText(lines[0], w / 2, h * 0.34); g.font = font.replace(/\d+px/, (m) => parseInt(m) * 0.62 + 'px'); g.fillText(lines[1], w / 2, h * 0.76); }
  return canvasTexture(c);
}

/** Embleme als Rundscheibe (Stern, Ringe, Roundel, M). */
export function emblemTexture(type, size = 256) {
  const c = canvas(size, size), g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  g.clearRect(0, 0, size, size);
  const ring = (r, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); };
  if (type === 'star') {
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#f4f4f4'); grad.addColorStop(0.5, '#9a9a9c'); grad.addColorStop(1, '#e8e8e8');
    ring(size * 0.46, grad, size * 0.05);
    g.fillStyle = grad;
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      g.save(); g.translate(cx, cy); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.moveTo(0, -size * 0.43); g.lineTo(size * 0.045, -size * 0.02); g.lineTo(-size * 0.045, -size * 0.02); g.closePath(); g.fill();
      g.restore();
    }
  } else if (type === 'rings') {
    const grad = g.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#d8d8da'); grad.addColorStop(0.5, '#8d8d90'); grad.addColorStop(1, '#e0e0e2');
    const r = size * 0.19, step = size * 0.205;
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = grad; g.lineWidth = size * 0.04; g.beginPath(); g.arc(cx + (k - 1.5) * step, cy, r, 0, 7); g.stroke();
    }
  } else if (type === 'roundel') {
    g.fillStyle = '#101214'; g.beginPath(); g.arc(cx, cy, size * 0.48, 0, 7); g.fill();
    ring(size * 0.46, '#c9c9cb', size * 0.03);
    const r = size * 0.36;
    const quad = (a0, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a0, a0 + Math.PI / 2); g.closePath(); g.fill(); };
    // BMW: oben links und unten rechts blau, oben rechts und unten links weiß
    quad(-Math.PI / 2, '#f5f5f5'); quad(0, '#1e6fd0'); quad(Math.PI / 2, '#f5f5f5'); quad(Math.PI, '#1e6fd0');
    ring(r, '#101214', size * 0.012);
  } else if (type === 'm') {
    g.fillStyle = '#0b0b0c'; g.beginPath(); g.arc(cx, cy, size * 0.47, 0, 7); g.fill();
    ring(size * 0.44, '#c8c8ca', size * 0.03);
    g.fillStyle = '#e6e6e6'; g.font = `600 ${size * 0.5}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('M', cx, cy + size * 0.03);
  }
  return canvasTexture(c);
}

// ------------------------------------------------------------------------------------------
// Shader-Erweiterung: Masken (Fenster, Radhäuser, Türen, Öffnungen) und Metallic-Flakes

const MASK_GLSL_HEAD = /* glsl */ `
varying vec3 vOP;
varying vec3 vON;
#if MASK_COUNT > 0
uniform vec4 uMA[MASK_COUNT];
uniform vec4 uMB[MASK_COUNT];
uniform vec2 uMV[MASK_VERTS];
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}
// positiv innerhalb
float sdPoly(vec2 p, int st, int n) {
  float d = 1e5;
  bool inside = false;
  for (int i = 0; i < 24; i++) {
    if (i >= n) break;
    int j = (i == 0) ? n - 1 : i - 1;
    vec2 a = uMV[st + i];
    vec2 b = uMV[st + j];
    d = min(d, sdSeg(p, a, b));
    if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside ? d : -d;
}
#endif
uniform float uDoorSide;
uniform float uDoorIdx;
`;

const FLAKE_GLSL_HEAD = /* glsl */ `
uniform vec3 uFlakeColor;
uniform float uFlakeScale;
uniform float uFlakeDensity;
uniform float uFlakeGain;
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`;

function maskUniforms(spec) {
  const A = [], B = [], V = [];
  for (const m of spec || []) {
    const kind = m.kind === 'window' ? 0 : m.kind === 'hole' ? 1 : 2 + (m.door ?? 0);
    const plane = m.plane === 'side' ? 0 : m.plane === 'front' ? 1 : 2;
    const start = V.length;
    let n = 0;
    if (m.circle) {
      V.push(new THREE.Vector2(m.circle[0], m.circle[1]), new THREE.Vector2(m.circle[2], 0));
      n = 0;
    } else {
      for (let i = 0; i < m.pts.length; i += 2) V.push(new THREE.Vector2(m.pts[i], m.pts[i + 1]));
      n = m.pts.length / 2;
    }
    A.push(new THREE.Vector4(kind, plane, n, start));
    B.push(new THREE.Vector4(m.nsign ?? 1, m.thr ?? 0.25, 0, 0));
  }
  return { A, B, V };
}

/** Während ein Auto gebaut wird, sammelt der Tracker alle Lackmaterialien (für die Garage: Lackfarbe ändern). */
export const paintTracker = { list: null };

export const MASK_MODE = { PAINT: 0, GLASS: 1, DOOR_PAINT: 2, DOOR_GLASS: 3, NONE: 4 };

/**
 * Erweitert ein MeshStandard/Physical-Material um Karosserie-Masken und/oder Lackflocken.
 * opts: { masks: [...], mode, doors (bool), doorIdx, doorSide, flake: {color, scale, density, gain} }
 */
export function patchBodyMaterial(mat, opts = {}) {
  const mode = opts.mode ?? MASK_MODE.NONE;
  const { A, B, V } = maskUniforms(opts.masks);
  const hasMask = mode !== MASK_MODE.NONE;
  const mc = hasMask ? A.length : 0;
  const mv = hasMask ? Math.max(V.length, 1) : 0;
  const flake = opts.flake;
  mat.userData.maskUniforms = { uDoorSide: { value: opts.doorSide ?? 0 }, uDoorIdx: { value: opts.doorIdx ?? 0 } };
  mat.customProgramCacheKey = () => `body|${mode}|${mc}|${mv}|${opts.doors ? 1 : 0}|${flake ? 1 : 0}|${opts.maskKey || ''}`;
  mat.onBeforeCompile = (shader) => {
    shader.defines = shader.defines || {};
    shader.defines.MASK_COUNT = mc;
    shader.defines.MASK_VERTS = mv;
    shader.defines.MASK_MODE = mode;
    shader.defines.DOORS_ON = opts.doors ? 1 : 0;
    if (flake) shader.defines.USE_FLAKE = 1;
    if (hasMask && mc > 0) {
      shader.uniforms.uMA = { value: A };
      shader.uniforms.uMB = { value: B };
      shader.uniforms.uMV = { value: V };
    }
    shader.uniforms.uDoorSide = mat.userData.maskUniforms.uDoorSide;
    shader.uniforms.uDoorIdx = mat.userData.maskUniforms.uDoorIdx;
    if (flake) {
      const fu = mat.userData.flakeU || (mat.userData.flakeU = {
        uFlakeColor: { value: new THREE.Color(flake.color ?? 0xff2a18) }, uFlakeScale: { value: flake.scale ?? 700 },
        uFlakeDensity: { value: flake.density ?? 0.05 }, uFlakeGain: { value: flake.gain ?? 6 },
      });
      Object.assign(shader.uniforms, fu);
    }
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vOP;\nvarying vec3 vON;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOP = position;\n  vON = normal;');

    let frag = shader.fragmentShader.replace('void main() {', MASK_GLSL_HEAD + (flake ? FLAKE_GLSL_HEAD : '') + '\nvoid main() {');

    if (hasMask) {
      const maskCode = /* glsl */ `
      #if MASK_COUNT > 0
      float winSd = -1e3, holeSd = -1e3, doorSd = -1e3, anyDoorSd = -1e3;
      {
        vec3 on = normalize(vON);
        for (int i = 0; i < MASK_COUNT; i++) {
          vec4 a = uMA[i];
          vec4 b = uMB[i];
          int plane = int(a.y + 0.5);
          vec2 p; float nd;
          if (plane == 0) { p = vec2(vOP.x, vOP.y); nd = abs(on.z); }
          else if (plane == 1) { p = vec2(abs(vOP.z), vOP.y); nd = on.x * b.x; }
          else { p = vec2(vOP.x, abs(vOP.z)); nd = on.y * b.x; }
          int n = int(a.z + 0.5);
          int st = int(a.w + 0.5);
          float sd = (n == 0) ? (uMV[st + 1].x - distance(p, uMV[st])) : sdPoly(p, st, n);
          sd = (nd >= b.y) ? sd : -1e3;
          int kind = int(a.x + 0.5);
          if (kind == 0) winSd = max(winSd, sd);
          else if (kind == 1) holeSd = max(holeSd, sd);
          else {
            anyDoorSd = max(anyDoorSd, sd);
            if (kind - 2 == int(uDoorIdx + 0.5)) doorSd = max(doorSd, sd);
          }
        }
      }
      // Abdeckung (0..1) des Bereichs AUSSERHALB der jeweiligen Maske, kantengeglättet
      float outWin = clamp(0.5 - winSd / clamp(fwidth(winSd), 1e-4, 0.03), 0.0, 1.0);
      float outHole = clamp(0.5 - holeSd / clamp(fwidth(holeSd), 1e-4, 0.03), 0.0, 1.0);
      float inWinF = 1.0 - outWin;
      float inDoorF = 1.0 - clamp(0.5 - doorSd / clamp(fwidth(doorSd), 1e-4, 0.03), 0.0, 1.0);
      float anyDoorIn = 1.0 - clamp(0.5 - anyDoorSd / clamp(fwidth(anyDoorSd), 1e-4, 0.03), 0.0, 1.0);
      #if DOORS_ON == 0
      anyDoorIn = 0.0;
      #endif
      float sideOK = (vOP.z * uDoorSide > 0.0) ? 1.0 : 0.0;
      float vis = 1.0;
      #if MASK_MODE == 0
        vis = outWin * outHole * (1.0 - anyDoorIn);
      #elif MASK_MODE == 1
        vis = inWinF * outHole * (1.0 - anyDoorIn);
      #elif MASK_MODE == 2
        vis = inDoorF * sideOK * outWin * outHole;
      #elif MASK_MODE == 3
        vis = inDoorF * sideOK * inWinF * outHole;
      #endif
      #else
      float vis = 1.0;
      #endif
      `;
      frag = frag.replace('#include <alphatest_fragment>', `${maskCode}\n diffuseColor.a *= vis;\n#include <alphatest_fragment>`);
    }

    if (flake) {
      const flakeCode = /* glsl */ `
      #ifdef USE_FLAKE
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 fp = vOP * uFlakeScale;
        vec3 cell = floor(fp);
        float h = hash13(cell);
        float fw = length(fwidth(fp));
        float vis2 = 1.0 - smoothstep(0.35, 1.1, fw);
        if (h > 1.0 - uFlakeDensity) {
          vec3 rnd = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) * 2.0 - 1.0;
          vec3 nf = normalize(normal + rnd * 0.7);
          vec3 Lf = directionalLights[0].direction;
          vec3 Hf = normalize(Lf + geometryViewDir);
          float sp = pow(max(dot(nf, Hf), 0.0), 140.0);
          float fres = 0.35 + 0.65 * pow(1.0 - max(dot(normal, geometryViewDir), 0.0), 2.0);
          reflectedLight.directSpecular += directionalLights[0].color * uFlakeColor * sp * vis2 * fres * uFlakeGain * (0.4 + 0.6 * hash13(cell + 3.3));
        }
      }
      #endif
      #endif
      `;
      frag = frag.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${flakeCode}`);
    }
    shader.fragmentShader = frag;
  };
  return mat;
}

// ------------------------------------------------------------------------------------------
// Fertige Materialien

/**
 * Autolack: sehr dunkles Basisschwarz, Klarlack, rote Perl-Schimmer (Sheen) nur bei streifendem Licht,
 * sehr dezente rote Metallic-Flakes, die nur bei bestimmtem Lichtwinkel aufblitzen.
 */
export function paintMaterial({ masks, mode = MASK_MODE.PAINT, doors = false, doorIdx = 0, doorSide = 0, side = THREE.FrontSide, flakes = true, color = 0x0a0a0c, maskKey = '' } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0x4d0905),
    envMapIntensity: 3.2,
    side,
  });
  m.alphaToCoverage = !!masks;
  m.alphaTest = masks ? 0.5 : 0;
  patchBodyMaterial(m, { masks, mode, doors, doorIdx, doorSide, maskKey, flake: flakes ? { color: 0xff2210, scale: 650, density: 0.06, gain: 5 } : null });
  if (flakes) m.userData.flakeU = { uFlakeColor: { value: new THREE.Color(0xff2210) }, uFlakeScale: { value: 650 }, uFlakeDensity: { value: 0.06 }, uFlakeGain: { value: 5 } };
  if (paintTracker.list) paintTracker.list.push(m);
  return m;
}

export function glassMaterial({ masks, doors = false, doorIdx = 0, doorSide = 0, mode = MASK_MODE.GLASS, maskKey = '', opacity = 0.5 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x05080b,
    metalness: 0.0,
    roughness: 0.04,
    transparent: true,
    opacity,
    envMapIntensity: 1.4,
    clearcoat: 0.0,
    specularIntensity: 1,
    depthWrite: false,
  });
  return patchBodyMaterial(m, { masks, mode, doors, doorIdx, doorSide, maskKey });
}

/** Innenseite der Karosserie (Dachhimmel, Säulen): sichtbar durch Fenster/Öffnungen. */
export function innerShellMaterial({ masks, color = 0x0a0a0b, doors = false, maskKey = '' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, side: THREE.BackSide });
  m.alphaToCoverage = true; m.alphaTest = 0.5;
  return patchBodyMaterial(m, { masks, mode: MASK_MODE.PAINT, doors, maskKey });
}

let _carbon;
export function carbonMaterial({ repeat = 1, color = 0xffffff } = {}) {
  _carbon = _carbon || carbonTextures(256);
  const map = _carbon.map.clone(), nrm = _carbon.normal.clone();
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.needsUpdate = true; }
  return new THREE.MeshPhysicalMaterial({
    color, map, normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7),
    metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1,
  });
}

export const matBlackGloss = () => new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
export const matBlackMatte = () => new THREE.MeshStandardMaterial({ color: 0x060606, metalness: 0.1, roughness: 0.75, envMapIntensity: 0.6 });
export const matRubber = () => new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.0, roughness: 0.82, envMapIntensity: 0.4 });
export const matChrome = () => new THREE.MeshStandardMaterial({ color: 0xcfcfd2, metalness: 1.0, roughness: 0.12, envMapIntensity: 1.6 });
export const matDarkChrome = () => new THREE.MeshStandardMaterial({ color: 0x35363a, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.4 });
export const matAlu = () => new THREE.MeshStandardMaterial({ color: 0x8a8c90, metalness: 1.0, roughness: 0.35 });
export const matRimBlack = () => new THREE.MeshPhysicalMaterial({ color: 0x040405, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5 });

export const matLightRed = (intensity = 0.0) => new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1208, emissiveIntensity: intensity, roughness: 0.2, metalness: 0 });
