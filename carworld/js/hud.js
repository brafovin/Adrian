// HUD: Tempo, Gang, Drehzahl, Minimap (kopfüber gedreht = Fahrtrichtung oben), Navigationsziel, Meldungen, Uhr.

import { clamp, lerp } from './util.js';
import { coastX, ROAD, PITCH, zoneOfBlock, GX0, GX1, GZ0, GZ1 } from './world/layout.js';

const MAP = { x0: -1700, x1: 1700, z0: -2700, z1: 1900, s: 3 }; // Weltausschnitt der Vorabgrafik, Meter je Pixel

const ZONE_COL = { core: '#353a44', mid: '#2b3039', resi: '#25302a', hills: '#2a3326', park: '#1f3a28', industrial: '#35302b', canal: '#16303a' };

export class Hud {
  constructor(layout) {
    this.layout = layout;
    this.el = (id) => document.getElementById(id);
    this.speed = this.el('speed'); this.gear = this.el('gear'); this.rpm = this.el('rpmbar'); this.rpmlim = this.el('rpmlim');
    this.fABS = this.el('fABS'); this.fESC = this.el('fESC'); this.fMAN = this.el('fMAN'); this.fLIGHT = this.el('fLIGHT');
    this.toastEl = this.el('toast'); this.clock = this.el('clock');
    this.map = this.el('minimap'); this.mctx = this.map.getContext('2d');
    this.navName = this.el('navName'); this.navDist = this.el('navDist'); this.navArrow = this.el('navArrow');
    this.toastT = 0;
    this._buildMap();
  }

  _buildMap() {
    const { x0, x1, z0, z1, s } = MAP;
    const W = Math.ceil((x1 - x0) / s), H = Math.ceil((z1 - z0) / s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const px = (x) => (x - x0) / s, pz = (z) => (z - z0) / s;
    g.fillStyle = '#0d1d26'; g.fillRect(0, 0, W, H); // Meer
    // Land
    g.fillStyle = '#1a1d23'; g.beginPath(); g.moveTo(px(coastX(z0)), pz(z0));
    for (let z = z0; z <= z1; z += 40) g.lineTo(px(coastX(z)), pz(z));
    g.lineTo(W, H); g.lineTo(W, 0); g.lineTo(px(coastX(z0)), 0); g.closePath(); g.fill();
    // Hügel im Norden: leichte Tönung
    const grad = g.createLinearGradient(0, pz(-1230), 0, pz(-2300)); grad.addColorStop(0, 'rgba(70,64,40,0)'); grad.addColorStop(1, 'rgba(90,80,50,.55)');
    g.fillStyle = grad; g.fillRect(0, pz(-2700), W, pz(-1230) - pz(-2700));
    // Blöcke nach Bezirk
    for (let i = GX0; i < GX1; i++) for (let j = GZ0; j < GZ1; j++) {
      g.fillStyle = ZONE_COL[zoneOfBlock(i, j, this.layout.seed)] || '#222';
      g.fillRect(px(i * PITCH + 8), pz(j * PITCH + 8), (PITCH - 16) / s, (PITCH - 16) / s);
    }
    // Kanal
    g.fillStyle = '#10303c'; g.fillRect(px(-1340), pz(625), (1340 - 250) / s, 70 / s);
    // Straßen
    const col = { street: '#58606e', avenue: '#7c8596', highway: '#9a8f78', freeway: '#b79a5b', ramp: '#8a7a55', hill: '#7a7466' };
    for (const r of this.layout.roads) {
      g.strokeStyle = col[r.kind] || '#666'; g.lineWidth = Math.max(1.4, r.w / s * (r.kind === 'avenue' ? 0.9 : 1.1));
      g.beginPath(); r.pts.forEach(([x, z], k) => (k ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z)))); g.stroke();
    }
    this.cache = c;
  }

  toast(msg, secs = 2.2) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on'); this.toastT = secs;
  }

  setNav(poi) { this.poi = poi; }

  /** Zeit (t = 0..3) in eine Uhrzeit abbilden. */
  static clockText(t) {
    const stops = [[0, 17.5], [1, 19.75], [2, 20.6], [3, 22.8]];
    let h = 17.5;
    for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) h = lerp(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]));
    const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  update(dt, o) {
    const i = o.info, v = o.vehicle;
    this.speed.textContent = Math.round(i.kmh);
    this.gear.textContent = o.gearLabel;
    this.rpm.style.width = (clamp(i.rpmFrac, 0, 1.05) * 100).toFixed(1) + '%';
    this.rpmlim.style.display = i.ev ? 'none' : 'block';
    this.fABS.classList.toggle('on', i.abs); this.fESC.classList.toggle('on', i.esc);
    this.fMAN.classList.toggle('on', o.manual); this.fLIGHT.classList.toggle('on', o.lightsOn);
    this.fMAN.style.display = o.manual ? '' : 'none';
    this.clock.textContent = Hud.clockText(o.tod);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
    this._drawMap(v, o.nav);
    // Navigation
    if (o.nav) {
      const dx = o.nav.x - v.x, dz = o.nav.z - v.z;
      const f = v.fwd, d = Math.hypot(dx, dz);
      const a = dx * f[0] + dz * f[1], b = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
      this.navArrow.style.transform = `rotate(${(Math.atan2(b, a) * 180) / Math.PI}deg)`;
      this.navName.textContent = o.nav.name;
      this.navDist.textContent = d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m';
      this.el('navhud').style.display = '';
    } else this.el('navhud').style.display = 'none';
  }

  _drawMap(v, nav) {
    const g = this.mctx, W = this.map.width, H = this.map.height;
    const range = 300; // sichtbare Meter bis zum Rand
    const ppm = (W / 2) / range; // Pixel je Meter
    g.save();
    g.fillStyle = '#0c0f14'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(v.yaw - Math.PI / 2);
    const sc = ppm * MAP.s; // Skalierung der Vorabgrafik
    g.scale(sc, sc);
    g.translate(-(v.x - MAP.x0) / MAP.s, -(v.z - MAP.z0) / MAP.s);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.cache, 0, 0);
    // Navigationsziel
    if (nav) {
      const nx = (nav.x - MAP.x0) / MAP.s, nz = (nav.z - MAP.z0) / MAP.s;
      g.fillStyle = '#ffb36b'; g.beginPath(); g.arc(nx, nz, 7 / sc * 2.2, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,179,107,.5)'; g.lineWidth = 1 / sc * 2; g.beginPath(); g.arc(nx, nz, 16 / sc * 2.2, 0, 7); g.stroke();
    }
    g.restore();
    // Spieler (Pfeil, immer oben)
    g.save(); g.translate(W / 2, H / 2);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
