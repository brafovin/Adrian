// Bildschirmanzeige: Kristalle, Ziel, Uhr, Minikarte, große Karte, Ausdauer, Hinweise, Ortsbanner, Dialoge.
import { HALF, SIZE, SEG, WATER } from './terrain.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(world, terrainMesh) {
    this.world = world;
    this.el = {
      hud: $('hud'), count: $('hc-count'), countBox: $('hc-box'), objective: $('objective'), clock: $('clock'),
      stamina: $('stamina'), arc: $('stamina-arc'), prompt: $('prompt'), promptText: $('prompt-text'), promptKey: $('prompt-key'),
      toasts: $('toasts'), banner: $('banner'), bannerName: $('banner-name'), bannerSmall: $('banner-small'),
      dialog: $('dialog'), dName: $('d-name'), dTitle: $('d-title'), dText: $('d-text'), mini: $('minimap'), big: $('bigmap'),
      fps: $('fps'), fade: $('fade'), mapInfo: $('map-info'),
    };
    this.mapImg = this._buildMapImage(terrainMesh);
    this.miniCtx = this.el.mini.getContext('2d');
    this.dialogQueue = null;
    this.bannerTimer = 0;
  }

  _buildMapImage(mesh) {
    const N = SEG + 1;
    const col = mesh.geometry.attributes.color.array;
    const nor = mesh.geometry.attributes.normal.array;
    const H = this.world.terrain.heights;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const toS = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    for (let k = 0; k < N * N; k++) {
      const h = H[k];
      let r = col[k * 3], g = col[k * 3 + 1], b = col[k * 3 + 2];
      const shade = Math.max(0.45, Math.min(1.25, 0.6 + 0.6 * (nor[k * 3 + 1] * 0.5 - nor[k * 3] * 0.45 - nor[k * 3 + 2] * 0.55)));
      r *= shade; g *= shade; b *= shade;
      if (h < WATER) {
        const d = Math.min(1, (WATER - h) / 9);
        const sh = [0.18, 0.55, 0.62], dp = [0.04, 0.16, 0.34];
        r = sh[0] + (dp[0] - sh[0]) * d; g = sh[1] + (dp[1] - sh[1]) * d; b = sh[2] + (dp[2] - sh[2]) * d;
      }
      img.data[k * 4] = toS(r); img.data[k * 4 + 1] = toS(g); img.data[k * 4 + 2] = toS(b); img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  setCount(n, total, pulse) {
    this.el.count.textContent = n;
    if (pulse) { this.el.countBox.classList.remove('pulse'); void this.el.countBox.offsetWidth; this.el.countBox.classList.add('pulse'); }
  }
  setObjective(t) { if (this.el.objective.textContent !== t) this.el.objective.textContent = t; }
  setClock(t) { if (this.el.clock.textContent !== t) this.el.clock.textContent = t; }

  stamina(v, exhausted, show) {
    this.el.stamina.classList.toggle('visible', show);
    this.el.stamina.classList.toggle('exhausted', exhausted);
    this.el.arc.style.strokeDashoffset = String(100 - v * 100);
  }

  prompt(text, key = 'E') {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.classList.remove('hidden');
    this.el.promptText.textContent = text;
    this.el.promptKey.textContent = key;
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2800);
    setTimeout(() => d.remove(), 3400);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  banner(name, discovered) {
    this.el.bannerName.textContent = name;
    this.el.bannerSmall.textContent = discovered ? 'Neu entdeckt' : '';
    this.el.banner.classList.remove('show'); void this.el.banner.offsetWidth;
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 3200);
  }

  /** Zeigt Dialogzeilen nacheinander. Liefert ein Promise, das nach der letzten Zeile erfüllt wird. */
  dialog(name, title, lines, onLine) {
    return new Promise((resolve) => {
      this.dialogQueue = { lines: [...lines], resolve, onLine };
      this.el.dName.textContent = name;
      this.el.dTitle.textContent = title || '';
      this.el.dialog.classList.remove('hidden');
      this._nextLine();
    });
  }
  _nextLine() {
    const q = this.dialogQueue;
    if (!q) return;
    if (!q.lines.length) {
      this.el.dialog.classList.add('hidden');
      this.dialogQueue = null;
      q.resolve();
      return;
    }
    const line = q.lines.shift();
    this.el.dText.textContent = '';
    this.typing = { text: line, i: 0 };
    q.onLine?.(line);
  }
  /** Weiter: erst Text fertig tippen, dann nächste Zeile. */
  advance() {
    if (!this.dialogQueue) return;
    if (this.typing && this.typing.i < this.typing.text.length) { this.typing.i = this.typing.text.length; this.el.dText.textContent = this.typing.text; return; }
    this._nextLine();
  }
  get inDialog() { return !!this.dialogQueue; }

  update(dt) {
    if (this.typing && this.typing.i < this.typing.text.length) {
      this.typing.i = Math.min(this.typing.text.length, this.typing.i + dt * 55);
      this.el.dText.textContent = this.typing.text.slice(0, Math.floor(this.typing.i));
    }
  }

  fade(on) { this.el.fade.classList.toggle('on', on); }

  // ------------------------------------------------------------ Karten
  _w2m(x, z, cx, cz, scale, size) { return [size / 2 + (x - cx) * scale, size / 2 + (z - cz) * scale]; }

  drawMini(p, camYaw, state, pois, crystals) {
    const ctx = this.miniCtx, S = this.el.mini.width;
    const range = 110;                        // Meter vom Rand zur Mitte
    const scale = S / 2 / range;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0f4a6b'; ctx.fillRect(0, 0, S, S);
    const ppm = (SEG + 1) / SIZE;             // Kartenpixel pro Meter
    const sx = (p.x - range + HALF) * ppm, sz = (p.z - range + HALF) * ppm;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, sx, sz, range * 2 * ppm, range * 2 * ppm, 0, 0, S, S);
    this._drawMarks(ctx, p.x, p.z, scale, S, state, pois, crystals, false);
    ctx.restore();
    // Spielerpfeil + Blickkegel
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    const ca = Math.atan2(-Math.cos(camYaw), -Math.sin(camYaw)); // Blickrichtung der Kamera auf der Karte
    ctx.arc(0, 0, S * 0.3, ca - 0.5, ca + 0.5); ctx.closePath(); ctx.fill();
    ctx.rotate(-p.yaw + Math.PI);
    this._arrow(ctx, 7);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 13);
  }

  _arrow(ctx, r) {
    ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, r); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r, r); ctx.closePath();
    ctx.stroke(); ctx.fill();
  }

  _drawMarks(ctx, cx, cz, scale, S, state, pois, crystals, big) {
    for (const poi of pois) {
      const [x, y] = this._w2m(poi.x, poi.z, cx, cz, scale, S);
      const known = state.discovered.has(poi.id);
      ctx.beginPath(); ctx.arc(x, y, big ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = known ? '#ffd166' : 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = '#2a2014'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      if (big) {
        ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,20,30,0.85)'; ctx.fillStyle = known ? '#fff' : 'rgba(255,255,255,0.6)';
        const label = known ? poi.name : '???';
        ctx.strokeText(label, x, y - 11); ctx.fillText(label, x, y - 11);
      }
    }
    if (state.flags.map) {
      for (const c of crystals) {
        if (state.crystals.has(c.id)) continue;
        const [x, y] = this._w2m(c.x, c.z, cx, cz, scale, S);
        this._diamond(ctx, x, y, big ? 5 : 3.5, '#5ee7ff');
      }
    }
    if (big) for (const c of crystals) {
      if (!state.crystals.has(c.id)) continue;
      const [x, y] = this._w2m(c.x, c.z, cx, cz, scale, S);
      this._diamond(ctx, x, y, 3, 'rgba(255,255,255,0.45)');
    }
  }

  _diamond(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.4); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.strokeStyle = 'rgba(0,30,40,0.8)'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
  }

  drawBig(p, state, pois, crystals) {
    const c = this.el.big;
    const S = Math.min(innerWidth - 32, innerHeight - 140, 760);
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.style.width = c.style.height = `${S}px`;
    c.width = c.height = Math.round(S * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Ausschnitt: nur die Insel (±420 m)
    const R = 430, scale = S / (R * 2);
    ctx.fillStyle = '#0f4a6b'; ctx.fillRect(0, 0, S, S);
    const ppm = (SEG + 1) / SIZE;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, (-R + HALF) * ppm, (-R + HALF) * ppm, R * 2 * ppm, R * 2 * ppm, 0, 0, S, S);
    this._drawMarks(ctx, 0, 0, scale, S, state, pois, crystals, true);
    const [x, y] = this._w2m(p.x, p.z, 0, 0, scale, S);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-p.yaw + Math.PI); this._arrow(ctx, 9); ctx.restore();
    const known = pois.filter((q) => state.discovered.has(q.id)).length;
    this.el.mapInfo.textContent = `Kristalle ${state.crystals.size}/40 · Orte ${known}/${pois.length}` + (state.flags.map ? ' · Kristalle eingezeichnet' : '');
  }
}
