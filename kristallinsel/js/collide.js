// Kollisionskörper der Welt: Kreise (Stämme, Säulen, Felsen) und gedrehte Quader (Häuser, Stufen, Stege).
// Jeder Körper hat eine Unterkante y0 und Oberkante y1. Was niedrig genug ist, dient als Boden.
// Drehung wie three.js (rotation.y): Welt = R(rot) * lokal.

export class Colliders {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
    this.list = [];
    this._stamp = 0;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _insert(c, minX, minZ, maxX, maxZ) {
    const s = this.cell;
    for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++)
      for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++) {
        const k = this._key(ix, iz);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(c);
      }
  }

  addCircle({ x, z, r, y0, y1, mat = 'stone', tag }) {
    const c = { t: 'c', x, z, r, y0, y1, mat, tag, _s: 0 };
    this.list.push(c);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  addBox({ x, z, hx, hz, rot = 0, y0, y1, mat = 'wood', tag }) {
    const c = { t: 'b', x, z, hx, hz, rot, y0, y1, mat, tag, cs: Math.cos(rot), sn: Math.sin(rot), _s: 0 };
    this.list.push(c);
    const ex = Math.abs(hx * c.cs) + Math.abs(hz * c.sn), ez = Math.abs(hx * c.sn) + Math.abs(hz * c.cs);
    this._insert(c, x - ex, z - ez, x + ex, z + ez);
    return c;
  }

  /** Alle Körper, deren Zellen den Kreis (x, z, r) berühren (ohne Duplikate). */
  query(x, z, r, out = []) {
    out.length = 0;
    const s = this.cell, st = ++this._stamp;
    for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++)
      for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
        const a = this.map.get(this._key(ix, iz));
        if (!a) continue;
        for (const c of a) if (c._s !== st) { c._s = st; out.push(c); }
      }
    return out;
  }

  /** Abstandsvektor vom Körper zum Punkt (2D). Liefert {dx, dz, d, inside}. */
  static delta(c, px, pz) {
    if (c.t === 'c') {
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
      return { dx, dz, d: d - c.r, len: d, inside: d < c.r };
    }
    const wx = px - c.x, wz = pz - c.z;
    const lx = wx * c.cs - wz * c.sn, lz = wx * c.sn + wz * c.cs;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    const ox = lx - qx, oz = lz - qz;
    const inside = ox === 0 && oz === 0;
    return { lx, lz, ox, oz, d: inside ? -Math.min(c.hx - Math.abs(lx), c.hz - Math.abs(lz)) : Math.hypot(ox, oz), inside };
  }

  /** Höchste Oberkante unter dem Fußkreis, die höchstens maxTop hoch liegt (sonst -Infinity). */
  floorAt(x, z, r, maxTop) {
    let best = -Infinity, hit = null;
    for (const c of this.query(x, z, r + 0.5, this._q || (this._q = []))) {
      if (c.y1 > maxTop || c.y1 <= best) continue;
      if (Colliders.delta(c, x, z).d < r) { best = c.y1; hit = c; }
    }
    this.lastFloor = hit;
    return best;
  }

  /** Niedrigste Unterkante über dem Kopf zwischen fromY und toY (sonst Infinity). */
  ceilingAt(x, z, r, fromY, toY) {
    let best = Infinity;
    for (const c of this.query(x, z, r + 0.5, this._q || (this._q = []))) {
      if (c.y0 < fromY || c.y0 > toY || c.y0 >= best) continue;
      if (Colliders.delta(c, x, z).d < r) best = c.y0;
    }
    return best;
  }

  /** Schiebt den Kreis aus allen Körpern, die den Höhenbereich [yLow, yHigh] schneiden. */
  pushOut(pos, r, yLow, yHigh) {
    let hit = false;
    const q = this._p || (this._p = []);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.query(pos.x, pos.z, r + 0.5, q)) {
        if (c.y1 <= yLow || c.y0 >= yHigh) continue;
        if (c.t === 'c') {
          const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
          if (d >= min) continue;
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          pos.x = c.x + nx * min; pos.z = c.z + nz * min;
        } else {
          const D = Colliders.delta(c, pos.x, pos.z);
          if (D.d >= r) continue;
          let lx = D.lx, lz = D.lz;
          if (D.inside) {
            // Kürzester Weg nach draußen.
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) lx = Math.sign(lx || 1) * (c.hx + r); else lz = Math.sign(lz || 1) * (c.hz + r);
          } else {
            const k = r / D.d;
            lx = lx - D.ox + D.ox * k; lz = lz - D.oz + D.oz * k;
          }
          pos.x = c.x + lx * c.cs + lz * c.sn;
          pos.z = c.z - lx * c.sn + lz * c.cs;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Liegt der Punkt in einem Körper? (z. B. Kamera in einer Wand) */
  solidAt(x, y, z, pad = 0) {
    for (const c of this.query(x, z, 0.5 + pad, this._q || (this._q = []))) {
      if (y < c.y0 - pad || y > c.y1 + pad) continue;
      if (Colliders.delta(c, x, z).d < pad) return true;
    }
    return false;
  }
}
