// Prozedurale Texturen für die Welt (Asphalt, Markierungen, Fassaden, Gelände, Wasser, Palmwedel).

import * as THREE from 'three';
import { canvas, canvasTexture, heightToNormal } from '../materials.js';
import { rng, clamp } from '../util.js';

function noiseFill(g, w, h, base, amp, seed = 1, grain = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * amp + (r() - 0.5) * amp * 0.5;
    img.data[i * 4] = clamp(base[0] + n, 0, 255);
    img.data[i * 4 + 1] = clamp(base[1] + n, 0, 255);
    img.data[i * 4 + 2] = clamp(base[2] + n, 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/**
 * Straßentextur: Quer (u) = Straßenbreite, Länge (v) = `lenM` Meter pro Wiederholung.
 * layout: Liste von Linien { u: Anteil der Breite 0..1, color, w (Breite m), dash: [an, aus] in m oder null }
 */
export function roadTextures({ widthM, lines = [], lenM = 18, wet = 0.12, seed = 1, plain = false }) {
  const pxW = 512, pxL = 512;
  const ppmX = pxW / widthM, ppmY = pxL / lenM;
  const c = canvas(pxW, pxL), g = c.getContext('2d');
  noiseFill(g, pxW, pxL, [44, 44, 47], 22, seed);
  // Asphalt-Flecken (Reparaturen, Reifenspuren): sehr subtil
  const r = rng(seed + 9);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 20 : 70},${r() < 0.5 ? 20 : 70},${r() < 0.5 ? 22 : 74},${0.05 + r() * 0.08})`;
    const w = 20 + r() * 120, h = 30 + r() * 160;
    g.fillRect(r() * pxW, r() * pxL, w, h);
  }
  // Reifenspuren in den Fahrspuren
  for (const lane of lines.filter((l) => l.lane)) {
    for (const off of [-0.22, 0.22]) {
      const x = (lane.u + off * (lane.laneW / widthM)) * pxW;
      const gr = g.createLinearGradient(x - 18, 0, x + 18, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - 18, 0, 36, pxL);
    }
  }
  // Markierungen
  if (!plain) {
    for (const ln of lines) {
      if (ln.lane) continue;
      const x = ln.u * pxW, lw = (ln.w ?? 0.15) * ppmX;
      g.fillStyle = ln.color || '#e8e8e8';
      if (ln.dash) {
        const per = (ln.dash[0] + ln.dash[1]) * ppmY;
        for (let y = 0; y < pxL; y += per) g.fillRect(x - lw / 2, y, lw, ln.dash[0] * ppmY);
      } else g.fillRect(x - lw / 2, 0, lw, pxL);
      // abgenutzte Farbe: Rauschen über die Markierung
      const img = g.getImageData(Math.max(0, x - lw), 0, Math.min(pxW, lw * 2 + 2), pxL);
      for (let i = 0; i < img.data.length; i += 4) { if (r() < 0.14) { img.data[i] *= 0.55; img.data[i + 1] *= 0.55; img.data[i + 2] *= 0.55; } }
      g.putImageData(img, Math.max(0, x - lw), 0);
    }
  }
  const map = canvasTexture(c, { aniso: 8 });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  // Rauheit: Grundrauheit + nasse Stellen (niedrige Rauheit) -> Spiegelungen des Himmels
  const rc = canvas(256, 256), rg = rc.getContext('2d');
  noiseFill(rg, 256, 256, [150, 150, 150], 40, seed + 3);
  for (let i = 0; i < 18; i++) {
    const cx = r() * 256, cy = r() * 256, rad = 12 + r() * 40;
    const gr = rg.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const dark = 30 + r() * 40;
    gr.addColorStop(0, `rgba(${dark},${dark},${dark},${0.9 * wet * 6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = gr;
    rg.save(); rg.translate(cx, cy); rg.scale(1, 0.5 + r()); rg.translate(-cx, -cy);
    rg.beginPath(); rg.arc(cx, cy, rad, 0, 7); rg.fill(); rg.restore();
  }
  const rough = canvasTexture(rc, { srgb: false });
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  const hc = canvas(256, 256), hg = hc.getContext('2d');
  noiseFill(hg, 256, 256, [128, 128, 128], 90, seed + 5);
  const normal = canvasTexture(heightToNormal(hc, 0.9), { srgb: false });
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  return { map, rough, normal, lenM, widthM };
}

export function roadMaterial(t, { wetness = 0.6 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: t.map, roughnessMap: t.rough, normalMap: t.normal, normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 1.0, metalness: 0.0, envMapIntensity: 1.1 + wetness * 0.5,
  });
  t.rough.repeat.set(1, 1); t.normal.repeat.set(1, 1);
  return m;
}

/** Gehweg / Beton: Fliesenraster. */
export function concreteTexture({ size = 512, tile = 4, tone = [150, 148, 144], seed = 4, joint = 0.35 } = {}) {
  const c = canvas(size, size), g = c.getContext('2d');
  noiseFill(g, size, size, tone, 26, seed);
  const r = rng(seed);
  const n = tile;
  const ts = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = (r() - 0.5) * 26;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    g.fillRect(x * ts, y * ts, ts, ts);
  }
  g.strokeStyle = `rgba(30,30,32,${joint})`; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, size); g.stroke(); g.beginPath(); g.moveTo(0, i * ts); g.lineTo(size, i * ts); g.stroke(); }
  const map = canvasTexture(c, { aniso: 8 });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

/**
 * Fassade: `cols` x `rows` Fenster je Kachel. Liefert Farbe, Leuchtkarte (nachts beleuchtete Fenster) und Rauheit.
 * style: 'glass' | 'office' | 'apartment' | 'villa' | 'industrial'
 */
export function facadeTextures({ style = 'glass', cols = 6, rows = 8, seed = 2 } = {}) {
  const W = 512, H = 512;
  const c = canvas(W, H), g = c.getContext('2d');
  const e = canvas(W, H), eg = e.getContext('2d');
  const m = canvas(W, H), mg = m.getContext('2d'); // Metall/Rauheit (R = Rauheit, B = Metall)
  const r = rng(seed);
  const cw = W / cols, ch = H / rows;
  // Wand
  const wall = { glass: '#10171d', office: '#6c6e70', apartment: '#a8a29a', villa: '#e6e1d8', industrial: '#7d8286' }[style];
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  mg.fillStyle = style === 'glass' ? '#0a0a80' : '#d00040'; mg.fillRect(0, 0, W, H);
  if (style !== 'glass') { // leichte Putz-/Betonstruktur
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) { const n = (r() - 0.5) * 18; img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n; }
    g.putImageData(img, 0, 0);
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw, py = y * ch;
      let wx = px + cw * 0.12, wy = py + ch * 0.14, ww = cw * 0.76, wh = ch * 0.7;
      if (style === 'glass') { wx = px + 2; wy = py + 2; ww = cw - 4; wh = ch - 4; }
      if (style === 'villa') { wx = px + cw * 0.08; wy = py + ch * 0.1; ww = cw * 0.84; wh = ch * 0.78; }
      if (style === 'industrial') { wx = px + cw * 0.2; wy = py + ch * 0.35; ww = cw * 0.6; wh = ch * 0.28; }
      const lit = r() < 0.38;
      const tint = r();
      let base;
      if (style === 'glass') base = tint < 0.5 ? [58, 98, 122] : tint < 0.8 ? [70, 112, 134] : [44, 72, 92];
      else base = [42, 52, 62];
      const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      gr.addColorStop(0, `rgb(${base[0] + 26},${base[1] + 30},${base[2] + 34})`); gr.addColorStop(1, `rgb(${base[0]},${base[1]},${base[2]})`);
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      mg.fillStyle = '#0a00f0'; mg.fillRect(wx, wy, ww, wh); // Glas: glatt + metallisch (reflektiert)
      if (lit) {
        const warm = r() < 0.75;
        eg.fillStyle = warm ? `rgb(${230 + r() * 25},${170 + r() * 40},${90 + r() * 40})` : `rgb(${170 + r() * 40},${210 + r() * 30},${255})`;
        const inset = style === 'glass' ? 3 : cw * 0.06;
        eg.fillRect(wx + inset, wy + inset, ww - inset * 2, wh - inset * 2);
      }
      if (style === 'office' || style === 'apartment') { // Fensterbank/Sturz
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 2, wy + wh, ww + 4, 3);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(wx - 2, wy - 3, ww + 4, 2);
      }
      if (style === 'apartment' && r() < 0.35) { g.fillStyle = 'rgba(30,30,32,0.9)'; g.fillRect(wx - 3, wy + wh - 6, ww + 6, 7); } // Balkon
    }
  }
  if (style === 'glass') { // Fensterstege
    g.strokeStyle = 'rgba(8,10,12,0.9)'; g.lineWidth = 3;
    for (let x = 0; x <= cols; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, H); g.stroke(); }
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * ch); g.lineTo(W, y * ch); g.stroke(); }
  }
  const map = canvasTexture(c, { aniso: 8 }), emissive = canvasTexture(e, { aniso: 4 }), rm = canvasTexture(m, { srgb: false });
  for (const t of [map, emissive, rm]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emissive, rm, cols, rows };
}

export function facadeMaterial(tex, { style = 'glass', metal = 0.0 } = {}) {
  const glass = style === 'glass';
  return new THREE.MeshStandardMaterial({
    map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0,
    metalnessMap: tex.rm, roughnessMap: tex.rm, metalness: glass ? 1 : 0.0, roughness: 1,
    envMapIntensity: glass ? 1.3 : 0.7, vertexColors: true,
  });
}

/** Gelände: kachelbares Gras/Erde/Sand-Detail (Farbe kommt aus Vertexfarben). */
export function terrainDetail() {
  const c = canvas(512, 512), g = c.getContext('2d');
  noiseFill(g, 512, 512, [176, 176, 176], 34, 31);
  const r = rng(32);
  for (let i = 0; i < 400; i++) {
    const gv = r() < 0.5 ? 120 : 235;   // nur Helligkeit, keine Farbflecken (Farbe kommt aus den Vertexfarben)
    g.fillStyle = `rgba(${gv},${gv},${gv},0.05)`;
    g.beginPath(); g.arc(r() * 512, r() * 512, 6 + r() * 40, 0, 7); g.fill();
  }
  const t = canvasTexture(c, { aniso: 8 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const hc = canvas(256, 256), hg = hc.getContext('2d');
  noiseFill(hg, 256, 256, [128, 128, 128], 110, 33);
  const n = canvasTexture(heightToNormal(hc, 1.2), { srgb: false });
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  return { map: t, normal: n };
}

/** Wasser-Normalmap (Wellen), kachelbar. */
export function waterNormal() {
  const S = 512;
  const hc = canvas(S, S), g = hc.getContext('2d');
  const img = g.getImageData(0, 0, S, S);
  const r = rng(77);
  // Summe aus Sinus-Wellen mit zufälligen Richtungen (kachelbar durch ganzzahlige Frequenzen)
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push({ kx: Math.round((r() - 0.5) * 14) || 1, ky: Math.round((r() - 0.5) * 14) || 1, a: 0.5 + r() * 0.5, p: r() * 6.28 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p);
    const c = clamp(128 + v * 10, 0, 255);
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(heightToNormal(hc, 2.0), { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Palmwedel (Alpha-Textur): gefüllte, leicht gezackte Fiederblätter, damit sie auch aus der Ferne (Mipmaps) noch Fläche haben. */
export function palmFrondTexture() {
  const W = 128, H = 256;
  const c = canvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  // Blattspreite: breite Kontur mit Zacken
  const left = [], right = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, y = H - 6 - t * (H - 14);
    const w = (W / 2 - 3) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)), 0.55) * (1 - 0.15 * t);
    const zig = (i % 2 ? 1 : 0.62);
    left.push([W / 2 - w * zig, y]); right.push([W / 2 + w * zig, y]);
  }
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#2f5018'); gr.addColorStop(0.5, '#4d7a2a'); gr.addColorStop(1, '#6f9a3a');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) g.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath(); g.fill();
  // Mittelrippe und Fiederlinien
  g.strokeStyle = '#1f3a10'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H - 4); g.lineTo(W / 2, 4); g.stroke();
  g.strokeStyle = 'rgba(25,50,12,0.55)'; g.lineWidth = 1.5;
  for (let i = 3; i < 40; i += 2) {
    const t = i / 40, y = H - 6 - t * (H - 14);
    g.beginPath(); g.moveTo(W / 2, y); g.lineTo(left[i][0], left[i][1] + 10); g.moveTo(W / 2, y); g.lineTo(right[i][0], right[i][1] + 10); g.stroke();
  }
  const t = canvasTexture(c);
  return t;
}

/** Straßenschild-/Werbetafel-Textur (Text auf Fläche). */
export function signTexture(lines, { bg = '#0e5a35', fg = '#fff', w = 512, h = 128, font = 'bold 56px Arial' } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (lines.length === 1) g.fillText(lines[0], w / 2, h / 2 + 2);
  else { g.fillText(lines[0], w / 2, h * 0.34); g.font = font.replace(/\d+px/, (m) => parseInt(m) * 0.6 + 'px'); g.fillText(lines[1], w / 2, h * 0.74); }
  return canvasTexture(c);
}

/** Leuchtreklame mit Glow. */
export function neonTexture(text, color = '#ff3a8a', { w = 512, h = 128 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = 'bold 74px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 8; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2);
  return canvasTexture(c);
}
