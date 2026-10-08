// Geometrie-Sammler ("Bucket"): sammelt Quader, Zylinder, Flächen mit Vertexfarben/UVs und erzeugt daraus
// eine einzige BufferGeometry je Material. Damit bleibt die Anzahl der Draw-Calls pro Chunk klein.

import * as THREE from 'three';

export const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mulCol = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixCol = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Bucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  get empty() { return this.n === 0; }

  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    return this.n++;
  }

  /** Viereck, Eckpunkte gegen den Uhrzeigersinn von der Normalenseite gesehen. uv = [[u,v]*4]. */
  quad(p0, p1, p2, p3, c, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], flip = false) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, uv[0][0], uv[0][1], c);
    const b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, uv[1][0], uv[1][1], c);
    const cc = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, uv[2][0], uv[2][1], c);
    const d = this.vert(p3[0], p3[1], p3[2], nx, ny, nz, uv[3][0], uv[3][1], c);
    if (flip) this.idx.push(a, cc, b, a, d, cc); else this.idx.push(a, b, cc, a, cc, d);
  }

  /** Viereck mit vorgegebenen Normalen je Ecke (Gelände). */
  quadSmooth(P, N, UV, C) {
    const ids = [];
    for (let k = 0; k < 4; k++) ids.push(this.vert(P[k][0], P[k][1], P[k][2], N[k][0], N[k][1], N[k][2], UV[k][0], UV[k][1], C[k]));
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  /**
   * Quader (um Y gedreht). (x, y0, z) = Mittelpunkt der Grundfläche.
   * opts: { top, bottom, uv: 'facade'|'solid'|'planar', ws (Kachelbreite m), hs (Kachelhöhe m), uo, vo, topColor }
   */
  box(x, y0, z, sx, sy, sz, rot = 0, c = [0.5, 0.5, 0.5], o = {}) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const hx = sx / 2, hz = sz / 2;
    const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y0 + ly, z - lx * sn + lz * cs];
    const uvMode = o.uv || 'solid';
    const ws = o.ws || 19.2, hs = o.hs || 30.4, uo = o.uo || 0, vo = o.vo || 0;
    const sideUV = (len, h, off) => {
      if (uvMode === 'facade') return [[uo + off / ws, vo], [uo + (off + len) / ws, vo], [uo + (off + len) / ws, vo + h / hs], [uo + off / ws, vo + h / hs]];
      if (uvMode === 'planar') return [[off / ws, 0], [(off + len) / ws, 0], [(off + len) / ws, h / hs], [off / ws, h / hs]];
      return [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]];
    };
    // Seiten: -z, +x, +z, -x (Normalen nach außen)
    const faces = [
      [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, sy, -hz), P(-hx, sy, -hz), sx, 0],
      [P(hx, 0, -hz), P(hx, 0, hz), P(hx, sy, hz), P(hx, sy, -hz), sz, sx],
      [P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, hz), P(hx, sy, hz), sx, sx + sz],
      [P(-hx, 0, hz), P(-hx, 0, -hz), P(-hx, sy, -hz), P(-hx, sy, hz), sz, 2 * sx + sz],
    ];
    if (o.sides !== false) for (const f of faces) this.quad(f[0], f[1], f[2], f[3], c, sideUV(f[4], sy, f[5]), true);
    if (o.top !== false) {
      const tc = o.topColor || c;
      const u = uvMode === 'planar' ? (a, b) => [a / ws, b / ws] : () => [0.5, 0.5];
      this.quad(P(-hx, sy, -hz), P(-hx, sy, hz), P(hx, sy, hz), P(hx, sy, -hz), tc, [u(0, 0), u(0, sz), u(sx, sz), u(sx, 0)], false);
    }
    if (o.bottom) this.quad(P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), c, undefined, false);
  }

  /** Zylinder/Kegelstumpf, Mitte der Grundfläche (x,y0,z). */
  cyl(x, y0, z, r0, r1, h, seg = 8, c = [0.5, 0.5, 0.5], o = {}) {
    const rows = o.rows || 1;
    const base = this.n;
    for (let rr = 0; rr <= rows; rr++) {
      const t = rr / rows;
      const r = r0 + (r1 - r0) * t, y = y0 + h * t;
      const bx = (o.bendX || 0) * t * t, bz = (o.bendZ || 0) * t * t;
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        const cc = o.ring ? mixCol(c, o.ringColor || c, (rr % 2 ? 0.0 : 1.0) * 0.25) : c;
        this.vert(x + bx + nx * r, y, z + bz + nz * r, nx, 0.15, nz, k / seg, t, cc);
      }
    }
    const w = seg + 1;
    for (let rr = 0; rr < rows; rr++) for (let k = 0; k < seg; k++) {
      const a = base + rr * w + k, b = a + 1, cc = a + w, d = cc + 1;
      this.idx.push(a, cc, b, b, cc, d);
    }
    if (o.cap) {
      const cy = y0 + h;
      const ci = this.vert(x + (o.bendX || 0), cy, z + (o.bendZ || 0), 0, 1, 0, 0.5, 0.5, c);
      const top = base + rows * w;
      for (let k = 0; k < seg; k++) this.idx.push(ci, top + k + 1, top + k);
    }
  }

  /** Horizontale Fläche (Polygon als Viereck) mit Welt-UV (planar). */
  floor(x0, z0, x1, z1, y, c, uvScale = 1, uo = 0, vo = 0) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], c,
      [[x0 * uvScale + uo, z0 * uvScale + vo], [x0 * uvScale + uo, z1 * uvScale + vo], [x1 * uvScale + uo, z1 * uvScale + vo], [x1 * uvScale + uo, z0 * uvScale + vo]], false);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
