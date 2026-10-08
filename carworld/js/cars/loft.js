// Karosserie-Generator: Querschnitte (Polygon mit Ausrundungen) werden entlang der Fahrzeuglänge
// aus Kurven interpoliert und zu einer glatten Fläche verbunden ("Loft").
//
// Fahrzeug-Koordinaten: +x = vorne, +y = oben, +z = rechts. Ursprung: Fahrzeugmitte am Boden.
// Ein Querschnitt besteht aus Punkten P0..PK von der Dachmitte (z = 0) nach unten zur Bodenmitte (z = 0)
// auf der rechten Seite; die linke Seite wird gespiegelt. An jedem Eckpunkt wird ein Radius eingerundet.
//
// Zusätzlich liefert die Klasse Projektionen (Strahl von außen auf die Fläche), mit denen Details wie
// Grill, Scheinwerfer, Kennzeichen oder Karosserieteile passgenau auf die Form gelegt werden.

import * as THREE from 'three';
import { clamp, lerp } from '../util.js';

const EPS = 1e-9;

export class Loft {
  /**
   * spec: {
   *   x0, x1            Heck-/Bugspitze (x0 < x1)
   *   pts: [{z, y}]     K+1 Punkte (Zahl oder Funktion von x); z des ersten und letzten Punktes = 0
   *   rad: [r]          Eckradius je Punkt (Zahl oder Funktion von x)
   *   endF, endR        {len, nz, nyT, nyB, cy}: Verrundung der Enden (Zusammenziehen auf cy)
   *   stations, arcN, segN
   * }
   */
  constructor(spec) {
    this.spec = spec;
    this.x0 = spec.x0;
    this.x1 = spec.x1;
    this.pts = spec.pts.map((p) => ({ z: typeof p.z === 'function' ? p.z : () => p.z, y: typeof p.y === 'function' ? p.y : () => p.y }));
    this.rad = spec.rad.map((r) => (typeof r === 'function' ? r : () => r));
    this.K = this.pts.length - 1;
    this.arcN = spec.arcN ?? 6;
    this.segN = spec.segN ?? 2;
    this.nSt = spec.stations ?? 160;
    this.endF = spec.endF;
    this.endR = spec.endR;
    this.M = 2 * this.K * (this.arcN + this.segN);
    this.xs = this._stations();
    this._ringCache = new Map();
  }

  _stations() {
    // Hauptbereich gleichmäßig, die Enden (Verrundung) nach Superellipsen-Parameter, damit die Fläche dort glatt bleibt
    const xs = [];
    const lenF = this.endF ? this.endF.len : 0, lenR = this.endR ? this.endR.len : 0;
    const nEnd = 34;
    const endPts = (len, n, dirSign, tip) => {
      const out = [];
      for (let i = 0; i < nEnd; i++) {
        const phi = ((i + 1) / nEnd) * (Math.PI / 2);
        const t = Math.pow(Math.sin(phi), 2 / n);
        out.push(tip - dirSign * len * (1 - t));
      }
      return out;
    };
    const mid0 = this.x0 + lenR, mid1 = this.x1 - lenF;
    const nMid = Math.max(20, this.nSt - 2 * nEnd);
    // Rückseite: vom Heckende nach innen (t wächst zum Ende hin) -> in aufsteigende x sortieren
    const rear = lenR ? endPts(lenR, this.endR.nz, -1, this.x0).reverse() : [];
    const front = lenF ? endPts(lenF, this.endF.nz, 1, this.x1) : [];
    xs.push(this.x0);
    xs.push(...rear);
    for (let i = 1; i < nMid; i++) xs.push(lerp(mid0, mid1, i / nMid));
    xs.push(...front.reverse());
    xs.push(this.x1);
    xs.sort((a, b) => a - b);
    // doppelte Werte entfernen
    return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-6);
  }

  /** Eckpunkte des geschlossenen Querschnitts bei x (vor Ausrundung). */
  _polygon(x) {
    const K = this.K;
    const P = this.pts.map((p) => [p.z(x), p.y(x)]);
    const R = this.rad.map((r) => r(x));
    P[0][0] = 0; P[K][0] = 0;
    const V = [], rr = [];
    for (let k = 0; k <= K; k++) { V.push(P[k]); rr.push(R[k]); }
    for (let k = K - 1; k >= 1; k--) { V.push([-P[k][0], P[k][1]]); rr.push(R[k]); }
    return { V, rr };
  }

  /** Ausgerundeter Querschnitt bei x als Float64Array [z0,y0,z1,y1,...] (M Punkte). */
  ring(x) {
    const key = Math.round(x * 100000);
    const hit = this._ringCache.get(key);
    if (hit) return hit;
    const { V, rr } = this._polygon(x);
    const n = V.length, arcN = this.arcN, segN = this.segN;
    const out = new Float64Array(this.M * 2);
    let o = 0;
    const T1 = [], T2 = [], C = [], A = [];
    for (let i = 0; i < n; i++) {
      const p = V[i], a = V[(i + n - 1) % n], b = V[(i + 1) % n];
      let d1x = a[0] - p[0], d1y = a[1] - p[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
      const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
      if (l1 < EPS || l2 < EPS) { T1.push(p); T2.push(p); C.push(null); A.push(null); continue; }
      d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
      const cosT = clamp(d1x * d2x + d1y * d2y, -1, 1);
      const th = Math.acos(cosT);
      if (th > Math.PI - 1e-3 || rr[i] <= 1e-6) { T1.push(p); T2.push(p); C.push(null); A.push(null); continue; }
      let t = rr[i] / Math.tan(th / 2);
      t = Math.min(t, 0.5 * Math.min(l1, l2));
      const rEff = t * Math.tan(th / 2);
      const bx = d1x + d2x, by = d1y + d2y, bl = Math.hypot(bx, by);
      const dist = rEff / Math.sin(th / 2);
      const cx = p[0] + (bx / bl) * dist, cy = p[1] + (by / bl) * dist;
      const t1 = [p[0] + d1x * t, p[1] + d1y * t];
      const t2 = [p[0] + d2x * t, p[1] + d2y * t];
      T1.push(t1); T2.push(t2); C.push([cx, cy, rEff]);
      let a1 = Math.atan2(t1[1] - cy, t1[0] - cx), a2 = Math.atan2(t2[1] - cy, t2[0] - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      A.push([a1, da]);
    }
    for (let i = 0; i < n; i++) {
      const c = C[i];
      for (let s = 0; s < arcN; s++) {
        const f = arcN === 1 ? 0 : s / (arcN - 1);
        if (!c) { out[o++] = T1[i][0]; out[o++] = T1[i][1]; continue; }
        const ang = A[i][0] + A[i][1] * f;
        out[o++] = c[0] + Math.cos(ang) * c[2];
        out[o++] = c[1] + Math.sin(ang) * c[2];
      }
      const nx = T1[(i + 1) % n], me = T2[i];
      for (let s = 1; s <= segN; s++) {
        const f = s / (segN + 1);
        out[o++] = lerp(me[0], nx[0], f);
        out[o++] = lerp(me[1], nx[1], f);
      }
    }
    // Enden zusammenziehen (blunt-rund)
    this._shrink(out, x);
    if (this._ringCache.size > 4000) this._ringCache.clear();
    this._ringCache.set(key, out);
    return out;
  }

  _shrink(out, x) {
    const apply = (e, t) => {
      if (!e || t <= 0) return;
      const tt = Math.min(1, t);
      const gz = Math.pow(Math.max(0, 1 - Math.pow(tt, e.nz)), 1 / e.nz);
      const gT = Math.pow(Math.max(0, 1 - Math.pow(tt, e.nyT)), 1 / e.nyT);
      const gB = Math.pow(Math.max(0, 1 - Math.pow(tt, e.nyB)), 1 / e.nyB);
      const cy = typeof e.cy === 'function' ? e.cy(x) : e.cy;
      for (let i = 0; i < out.length; i += 2) {
        out[i] *= gz;
        const dy = out[i + 1] - cy;
        out[i + 1] = cy + dy * (dy >= 0 ? gT : gB);
      }
    };
    if (this.endF) apply(this.endF, 1 - (this.x1 - x) / this.endF.len);
    if (this.endR) apply(this.endR, 1 - (x - this.x0) / this.endR.len);
  }

  /** Fertige Geometrie (Position, Normale, uv=(x, Umfang)). */
  build() {
    const N = this.xs.length, M = this.M;
    const pos = new Float32Array(N * M * 3);
    const uv = new Float32Array(N * M * 2);
    for (let i = 0; i < N; i++) {
      const x = this.xs[i];
      const r = this.ring(x);
      for (let j = 0; j < M; j++) {
        const o = (i * M + j) * 3;
        pos[o] = x; pos[o + 1] = r[j * 2 + 1]; pos[o + 2] = r[j * 2];
        const u = (i * M + j) * 2;
        uv[u] = x; uv[u + 1] = j / M;
      }
    }
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < M; j++) {
        const j2 = (j + 1) % M;
        const a = i * M + j, b = i * M + j2, c = (i + 1) * M + j, d = (i + 1) * M + j2;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Enden: Pol-Vertices bekommen sonst unsaubere Normalen -> in Achsrichtung zeigen lassen
    const nrm = g.attributes.normal;
    for (const [row, dir] of [[0, -1], [N - 1, 1]]) {
      for (let j = 0; j < M; j++) {
        const o = row * M + j;
        nrm.setXYZ(o, dir, 0, 0);
      }
    }
    // Zweite Reihe am Ende weicher: mit der Pol-Normale mischen
    for (const [row, dir, w] of [[1, -1, 0.5], [N - 2, 1, 0.5]]) {
      for (let j = 0; j < M; j++) {
        const o = row * M + j;
        const nx = nrm.getX(o), ny = nrm.getY(o), nz = nrm.getZ(o);
        const l = Math.hypot(nx * (1 - w) + dir * w, ny * (1 - w), nz * (1 - w));
        nrm.setXYZ(o, (nx * (1 - w) + dir * w) / l, (ny * (1 - w)) / l, (nz * (1 - w)) / l);
      }
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // ------------------------------------------------------------ Abfragen auf der Fläche

  /** z (rechts, >0) der Außenfläche in Höhe y bei x; null außerhalb. */
  sideZ(x, y) {
    const r = this.ringFast(x);
    let best = null;
    const M = this.M;
    for (let j = 0; j < M; j++) {
      const k = (j + 1) % M;
      const y0 = r[j * 2 + 1], y1 = r[k * 2 + 1];
      if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
      const t = (y - y0) / (y1 - y0);
      const z = lerp(r[j * 2], r[k * 2], t);
      if (best === null || z > best) best = z;
    }
    return best !== null && best > 0 ? best : null;
  }

  /** Höhe der oberen/unteren Fläche bei (x, |z|). */
  topY(x, z) { return this._vert(x, Math.abs(z), true); }
  botY(x, z) { return this._vert(x, Math.abs(z), false); }
  _vert(x, z, top) {
    const r = this.ringFast(x);
    let best = null;
    const M = this.M;
    for (let j = 0; j < M; j++) {
      const k = (j + 1) % M;
      const z0 = r[j * 2], z1 = r[k * 2];
      if ((z0 - z) * (z1 - z) > 0 || z0 === z1) continue;
      const t = (z - z0) / (z1 - z0);
      const y = lerp(r[j * 2 + 1], r[k * 2 + 1], t);
      if (best === null || (top ? y > best : y < best)) best = y;
    }
    return best;
  }

  /** Schnelle, interpolierte Querschnitte für Projektionsabfragen (480 gleichmäßige Stützstellen). */
  _fineTable() {
    if (this._fine) return this._fine;
    const n = 480, rings = [];
    for (let i = 0; i < n; i++) rings.push(this.ring(lerp(this.x0, this.x1, i / (n - 1))));
    this._fine = { n, rings, tmp: new Float64Array(this.M * 2) };
    return this._fine;
  }
  ringFast(x) {
    const f = this._fineTable();
    const t = clamp((x - this.x0) / (this.x1 - this.x0), 0, 1) * (f.n - 1);
    const i = Math.min(f.n - 2, Math.floor(t)), k = t - i;
    const a = f.rings[i], b = f.rings[i + 1], o = f.tmp;
    for (let j = 0; j < o.length; j++) o[j] = a[j] + (b[j] - a[j]) * k;
    return o;
  }

  /** Querschnitt enthält (|z|, y)? */
  _inside(x, z, y) {
    const w = this.sideZ(x, y);
    return w !== null && Math.abs(z) <= w;
  }

  /** Erstes x von vorne (dir=+1) bzw. hinten (dir=-1), an dem (z,y) in der Karosserie liegt. */
  endX(z, y, dir) {
    const a = dir > 0 ? this.x1 : this.x0, b = dir > 0 ? this.x0 : this.x1;
    const steps = 160;
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const x = lerp(a, b, i / steps);
      if (this._inside(x, z, y)) {
        let lo = prev, hi = x; // lo außerhalb, hi innen
        for (let k = 0; k < 22; k++) {
          const mid = (lo + hi) / 2;
          if (this._inside(mid, z, y)) hi = mid; else lo = mid;
        }
        return (lo + hi) / 2;
      }
      prev = x;
    }
    return null;
  }

  // Projektionen: liefern {p: THREE.Vector3, n: THREE.Vector3} oder null.
  _withNormal(fn, u, v) {
    const p = fn(u, v);
    if (!p) return null;
    const e = 0.01;
    const pu = fn(u + e, v) || fn(u - e, v);
    const pv = fn(u, v + e) || fn(u, v - e);
    if (!pu || !pv) return { p, n: new THREE.Vector3(0, 1, 0) };
    const a = pu.clone().sub(p), b = pv.clone().sub(p);
    const n = a.cross(b).normalize();
    return { p, n };
  }

  /** Von der Seite (sign=+1 rechts, -1 links): (x, y). */
  projSide(sign = 1) {
    const raw = (x, y) => { const z = this.sideZ(x, y); return z === null ? null : new THREE.Vector3(x, y, sign * z); };
    return (x, y) => {
      const r = this._withNormal(raw, x, y);
      if (!r) return null;
      if (r.n.z * sign < 0) r.n.negate();
      return r;
    };
  }
  /** Von oben: (x, z). */
  projTop() {
    const raw = (x, z) => { const y = this.topY(x, z); return y === null ? null : new THREE.Vector3(x, y, z); };
    return (x, z) => {
      const r = this._withNormal(raw, x, z);
      if (!r) return null;
      if (r.n.y < 0) r.n.negate();
      return r;
    };
  }
  /** Von vorne: (z, y). */
  projFront() {
    const raw = (z, y) => { const x = this.endX(z, y, +1); return x === null ? null : new THREE.Vector3(x, y, z); };
    return (z, y) => {
      const r = this._withNormal(raw, z, y);
      if (!r) return null;
      if (r.n.x < 0) r.n.negate();
      return r;
    };
  }
  /** Von hinten: (z, y). */
  projRear() {
    const raw = (z, y) => { const x = this.endX(z, y, -1); return x === null ? null : new THREE.Vector3(x, y, z); };
    return (z, y) => {
      const r = this._withNormal(raw, z, y);
      if (!r) return null;
      if (r.n.x > 0) r.n.negate();
      return r;
    };
  }

  /**
   * Passgenau aufgelegte Fläche (Decal): Gitter in (u,v), jeder Punkt wird auf die Karosserie projiziert
   * und um `off` entlang der Normalen angehoben. uvFn(u01, v01) -> [s,t] (optional; Standard: 0..1).
   */
  drape(proj, u0, u1, v0, v1, nu, nv, off = 0.003, flip = false) {
    const pos = [], nor = [], uvs = [], ok = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const fu = i / nu, fv = j / nv;
        const r = proj(lerp(u0, u1, fu), lerp(v0, v1, fv));
        if (!r) { pos.push(0, 0, 0); nor.push(0, 1, 0); ok.push(false); }
        else {
          pos.push(r.p.x + r.n.x * off, r.p.y + r.n.y * off, r.p.z + r.n.z * off);
          nor.push(r.n.x, r.n.y, r.n.z);
          ok.push(true);
        }
        uvs.push(fu, fv);
      }
    }
    const idx = [];
    const w = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
        // Drehsinn so wählen, dass die Fläche zur Außennormale zeigt
        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
        const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const dot = cx * nor[a * 3] + cy * nor[a * 3 + 1] + cz * nor[a * 3 + 2];
        const wantOut = !flip;
        if ((dot > 0) === wantOut) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Sweep: Profil entlang eines Pfades ziehen (für Lippen, Schweller, Kotflügelverbreiterungen, Rohre)

/**
 * path: [[x,y,z],...]; outs: Richtung "nach außen" je Punkt; ups: zweite Profilachse je Punkt.
 * profile: [[a,b],...] (a entlang out, b entlang up); closed = Profil geschlossen.
 */
export function sweep(path, outs, ups, profile, { closedProfile = false, capEnds = true } = {}) {
  const n = path.length, m = profile.length;
  const pos = new Float32Array(n * m * 3);
  for (let i = 0; i < n; i++) {
    const p = path[i], o = outs[i], u = ups[i];
    for (let j = 0; j < m; j++) {
      const [a, b] = profile[j];
      const k = (i * m + j) * 3;
      pos[k] = p[0] + o[0] * a + u[0] * b;
      pos[k + 1] = p[1] + o[1] * a + u[1] * b;
      pos[k + 2] = p[2] + o[2] * a + u[2] * b;
    }
  }
  const idx = [];
  const jm = closedProfile ? m : m - 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < jm; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j, b = i * m + j2, c = (i + 1) * m + j, d = (i + 1) * m + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capEnds && closedProfile) {
    for (let j = 1; j < m - 1; j++) idx.push(0, j + 1, j);
    const e = (n - 1) * m;
    for (let j = 1; j < m - 1; j++) idx.push(e, e + j, e + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Hilfsfunktion: Tangenten eines Pfades. */
export function pathTangents(path) {
  const n = path.length;
  return path.map((_, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...t) || 1;
    return [t[0] / l, t[1] / l, t[2] / l];
  });
}
