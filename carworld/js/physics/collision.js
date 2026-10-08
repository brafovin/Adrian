// Kollisionen in der Ebene: Fahrzeug (orientiertes Rechteck) gegen statische Hindernisse (Rechtecke, Kreise)
// und gegen andere Fahrzeuge. Reines JS (keine Abhängigkeit von Three.js), daher testbar.

import { clamp } from '../util.js';

/** Räumliches Raster für statische Hindernisse. */
export class SpatialGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
    this.count = 0;
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _cells(minx, minz, maxx, maxz, fn) {
    const c = this.cell;
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c), z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(this._key(ix, iz));
  }
  /** Rechteck: Mitte, Halbmaße, Drehwinkel (Fahrtrichtung-Konvention wie Fahrzeuge: f = (cos a, -sin a)). */
  addBox(cx, cz, hx, hz, yaw = 0, y0 = -1e3, y1 = 1e3, tag = null) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    const o = { type: 0, cx, cz, hx, hz, yaw, cs, sn, y0, y1, tag };
    this._insert(o, cx - ex, cz - ez, cx + ex, cz + ez);
    return o;
  }
  addCircle(cx, cz, r, y0 = -1e3, y1 = 1e3, tag = null) {
    const o = { type: 1, cx, cz, r, y0, y1, tag };
    this._insert(o, cx - r, cz - r, cx + r, cz + r);
    return o;
  }
  _insert(o, minx, minz, maxx, maxz) {
    this._cells(minx, minz, maxx, maxz, (k) => {
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(o);
    });
    this.count++;
  }
  remove(o) {
    const r = o.type === 1 ? o.r : Math.hypot(o.hx, o.hz);
    this._cells(o.cx - r, o.cz - r, o.cx + r, o.cz + r, (k) => {
      const a = this.map.get(k);
      if (!a) return;
      const i = a.indexOf(o);
      if (i >= 0) a.splice(i, 1);
      if (!a.length) this.map.delete(k);
    });
  }
  /** Alle Hindernisse im Umkreis (doppelte werden entfernt). */
  query(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    this._cells(x - r, z - r, x + r, z + r, (k) => {
      const a = this.map.get(k);
      if (!a) return;
      for (let i = 0; i < a.length; i++) { const o = a[i]; if (!seen.has(o)) { seen.add(o); out.push(o); } }
    });
    return out;
  }
}

/** Orientierte Hülle des Fahrzeugs (Eckpunkte in Weltkoordinaten). */
export function hullOf(v, hull) {
  const f = v.fwd, l = v.left;
  const cx = v.x + f[0] * hull.off, cz = v.z + f[1] * hull.off;
  return { cx, cz, fx: f[0], fz: f[1], lx: l[0], lz: l[1], hl: hull.hl, hw: hull.hw };
}

/**
 * SAT: Fahrzeug-Rechteck H gegen Rechteck B. Gibt {nx, nz, depth, px, pz} zurück (n zeigt von B zum Fahrzeug) oder null.
 */
function satBoxBox(H, B) {
  const bx = [B.cs, -B.sn], bz = [B.sn, B.cs]; // Achsen von B (f=(cos,-sin), l=(-sin,-cos)); hier: erste Achse f, zweite l
  const axB1 = [B.cs, -B.sn], axB2 = [-B.sn, -B.cs];
  void bx; void bz;
  const axes = [[H.fx, H.fz], [H.lx, H.lz], axB1, axB2];
  const dx = H.cx - B.cx, dz = H.cz - B.cz;
  let best = Infinity, bn = null;
  for (const a of axes) {
    const rH = Math.abs(H.fx * a[0] + H.fz * a[1]) * H.hl + Math.abs(H.lx * a[0] + H.lz * a[1]) * H.hw;
    const rB = Math.abs(axB1[0] * a[0] + axB1[1] * a[1]) * B.hx + Math.abs(axB2[0] * a[0] + axB2[1] * a[1]) * B.hz;
    const dist = dx * a[0] + dz * a[1];
    const ov = rH + rB - Math.abs(dist);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; bn = dist >= 0 ? [a[0], a[1]] : [-a[0], -a[1]]; }
  }
  // Kontaktpunkt: Mitte der Überlappung (entlang der Normalen auf halber Eindringtiefe, seitlich in der Mitte des
  // gemeinsamen Bereichs). Bei einer frontalen Wand liegt er mittig -> kein Drehmoment.
  const n0 = bn[0], n1 = bn[1], t0 = -n1, t1 = n0;
  const projR = (ax, ay, hx, hz, fx, fz, lx, lz) => Math.abs(fx * ax + fz * ay) * hx + Math.abs(lx * ax + lz * ay) * hz;
  const rHn = projR(n0, n1, H.hl, H.hw, H.fx, H.fz, H.lx, H.lz), rBn = projR(n0, n1, B.hx, B.hz, axB1[0], axB1[1], axB2[0], axB2[1]);
  const rHt = projR(t0, t1, H.hl, H.hw, H.fx, H.fz, H.lx, H.lz), rBt = projR(t0, t1, B.hx, B.hz, axB1[0], axB1[1], axB2[0], axB2[1]);
  const distN = dx * n0 + dz * n1, distT = dx * t0 + dz * t1; // Fahrzeugmitte relativ zu B
  const mN = (distN - rHn + rBn) / 2;
  const lo = Math.max(distT - rHt, -rBt), hi = Math.min(distT + rHt, rBt);
  const mT = hi > lo ? (lo + hi) / 2 : distT;
  // Berühren nur eine oder zwei Fahrzeugecken (schräger Aufprall), ist deren Mittelwert der Kontakt (Dreh-Effekt wie in echt).
  // Liegt keine Fahrzeugecke im Bereich des Hindernisses (z. B. Pfosten sticht in die Seite), gilt der Überlappungsmittelpunkt.
  const cs = [];
  let cmin = Infinity;
  for (const sf of [-1, 1]) for (const sl of [-1, 1]) {
    const cx = H.cx + H.fx * H.hl * sf + H.lx * H.hw * sl, cz = H.cz + H.fz * H.hl * sf + H.lz * H.hw * sl;
    const d = (cx - B.cx) * n0 + (cz - B.cz) * n1;
    cs.push([cx, cz, d]); cmin = Math.min(cmin, d);
  }
  let ax = 0, az = 0, cnt = 0;
  for (const c of cs) if (c[2] < cmin + 0.1) { ax += c[0]; az += c[1]; cnt++; }
  ax /= cnt; az /= cnt;
  const lat = (ax - B.cx) * t0 + (az - B.cz) * t1;
  if (Math.abs(lat) <= rBt + 0.05) return { nx: n0, nz: n1, depth: best, px: ax, pz: az };
  return { nx: n0, nz: n1, depth: best, px: B.cx + n0 * mN + t0 * mT, pz: B.cz + n1 * mN + t1 * mT };
}

function satBoxCircle(H, C) {
  // Kreismittelpunkt in Fahrzeugkoordinaten
  const dx = C.cx - H.cx, dz = C.cz - H.cz;
  const lf = dx * H.fx + dz * H.fz, ll = dx * H.lx + dz * H.lz;
  const qf = clamp(lf, -H.hl, H.hl), ql = clamp(ll, -H.hw, H.hw);
  const ex = lf - qf, el = ll - ql;
  const d = Math.hypot(ex, el);
  if (d >= C.r) return null;
  let nxl, nzl, depth;
  if (d > 1e-6) { // Kreis außerhalb des Rechtecks
    nxl = -ex / d; nzl = -el / d; depth = C.r - d; // Richtung vom Kreis zum Fahrzeug (in f,l)
  } else { // Mittelpunkt im Rechteck: kürzesten Austritt wählen
    const gf = H.hl - Math.abs(lf), gl = H.hw - Math.abs(ll);
    if (gf < gl) { nxl = -Math.sign(lf || 1); nzl = 0; depth = gf + C.r; }
    else { nxl = 0; nzl = -Math.sign(ll || 1); depth = gl + C.r; }
  }
  const nx = H.fx * nxl + H.lx * nzl, nz = H.fz * nxl + H.lz * nzl;
  const px = H.cx + H.fx * qf + H.lx * ql, pz = H.cz + H.fz * qf + H.lz * ql;
  return { nx, nz, depth, px, pz };
}

/**
 * Löst Kollisionen des Fahrzeugs `v` (Vehicle) mit Hindernissen aus `grid`.
 * hull = {hl, hw, off}; opts: {e (Rückprall), mu (Reibung), yCar}. Gibt Liste der Einschläge [{speed, px, pz, nx, nz, tag}] zurück.
 */
export function collideStatic(v, hull, grid, { e = 0.14, mu = 0.35, yCar = 0, scratch = [] } = {}) {
  const hits = [];
  for (let pass = 0; pass < 3; pass++) {
    const H = hullOf(v, hull);
    const near = grid.query(H.cx, H.cz, hull.hl + hull.hw + 1.5, scratch);
    let any = false;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (yCar + 1.6 < o.y0 || yCar > o.y1) continue; // anderes Stockwerk / unterhalb
      const c = o.type === 1 ? satBoxCircle(H, o) : satBoxBox(H, o);
      if (!c) continue;
      any = true;
      // Lageberichtigung
      const corr = c.depth + 0.002;
      v.x += c.nx * corr; v.z += c.nz * corr;
      H.cx += c.nx * corr; H.cz += c.nz * corr;
      // Impuls
      const rx = c.px - v.x, rz = c.pz - v.z;
      const [vx, vz] = v.worldVelocity();
      const vpx = vx + v.w * rz, vpz = vz - v.w * rx;
      const vn = vpx * c.nx + vpz * c.nz;
      if (vn < 0) {
        const tn = rz * c.nx - rx * c.nz;
        const invM = 1 / v.m + (tn * tn) / v.Iz;
        const j = (-(1 + e) * vn) / invM;
        let dvx = (j * c.nx) / v.m, dvz = (j * c.nz) / v.m, dw = (j * tn) / v.Iz;
        // Coulomb-Reibung tangential
        const tx = -c.nz, tz = c.nx;
        const vt = vpx * tx + vpz * tz;
        const tt = rz * tx - rx * tz;
        const invMt = 1 / v.m + (tt * tt) / v.Iz;
        const jt = clamp(-vt / invMt, -mu * j, mu * j);
        dvx += (jt * tx) / v.m; dvz += (jt * tz) / v.m; dw += (jt * tt) / v.Iz;
        const uOld = v.u;
        v.setWorldVelocity(vx + dvx, vz + dvz);
        v.w += dw;
        // Räder an die neue Geschwindigkeit anpassen (sonst treiben sie das Auto wieder in das Hindernis)
        if (Math.abs(uOld) > 0.5) { const k = clamp(v.u / uOld, -1, 1); for (let n = 0; n < 4; n++) v.omega[n] *= Math.max(0, k); }
        hits.push({ speed: -vn, px: c.px, pz: c.pz, nx: c.nx, nz: c.nz, tag: o.tag });
      }
    }
    if (!any) break;
  }
  return hits;
}

/** Zwei Fahrzeuge (Spieler `a` mit Physik, `b` einfaches Objekt {x,z,yaw,vx,vz,m,hull}) kollidieren lassen. */
export function collideWithBody(a, hullA, b, { e = 0.2 } = {}) {
  const HA = hullOf(a, hullA);
  const cb = Math.cos(b.yaw), sb = Math.sin(b.yaw);
  const B = { cx: b.x + cb * (b.hull.off || 0), cz: b.z - sb * (b.hull.off || 0), hx: b.hull.hl, hz: b.hull.hw, cs: cb, sn: sb };
  const c = satBoxBox(HA, B);
  if (!c) return null;
  // positionskorrektur aufteilen nach Masse
  const ma = a.m, mb = b.m;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x += c.nx * (c.depth + 0.002) * wa; a.z += c.nz * (c.depth + 0.002) * wa;
  b.x -= c.nx * (c.depth + 0.002) * wb; b.z -= c.nz * (c.depth + 0.002) * wb;
  const rx = c.px - a.x, rz = c.pz - a.z;
  const [vax, vaz] = a.worldVelocity();
  const vpax = vax + a.w * rz, vpaz = vaz - a.w * rx;
  const vrx = vpax - b.vx, vrz = vpaz - b.vz;
  const vn = vrx * c.nx + vrz * c.nz;
  if (vn >= 0) return { speed: 0 };
  const tn = rz * c.nx - rx * c.nz;
  const invM = 1 / ma + 1 / mb + (tn * tn) / a.Iz;
  const j = (-(1 + e) * vn) / invM;
  const uOld = a.u;
  a.setWorldVelocity(vax + (j * c.nx) / ma, vaz + (j * c.nz) / ma);
  a.w += (j * tn) / a.Iz;
  b.vx -= (j * c.nx) / mb; b.vz -= (j * c.nz) / mb;
  b.w = (b.w || 0) - (j * 0.4) / mb * Math.sign(rx * c.nz - rz * c.nx || 1);
  if (Math.abs(uOld) > 0.5) { const k = clamp(a.u / uOld, -1, 1); for (let n = 0; n < 4; n++) a.omega[n] *= Math.max(0, k); }
  return { speed: -vn, px: c.px, pz: c.pz, nx: c.nx, nz: c.nz };
}
