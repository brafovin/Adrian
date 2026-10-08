// Straßenbauwerke: Brückendecks, Brüstungen, Pfeiler, Leitplanken, Autobahn-Mittelwand, Tunnel mit Portalen.
// Wird je Straßenabschnitt vom Chunk-Builder aufgerufen (der Abschnitt gehört dem Chunk seines Mittelpunkts).

import * as THREE from 'three';
import { col, mixCol, mulCol } from './geo.js';
import { clamp, lerp } from '../util.js';

const C = { concrete: col(0x9d9a94), concreteDark: col(0x6f6d68), rail: col(0xb4b8bc), tunnel: col(0x8a8782), tunnelDark: col(0x4a4945), post: col(0x6e7276) };

/**
 * Prisma entlang eines Abschnitts: Rechteckquerschnitt [l0,l1] (seitlich) x [z0,z1] (Höhe relativ zur Straße),
 * die Höhe folgt der Straße linear von ya nach yb. Flächen: oben, unten, links, rechts.
 */
export function prism(bucket, a, c, ya, yb, nx, nz, l0, l1, z0, z1, color, o = {}) {
  const P = (pt, y, l, h) => [pt[0] + nx * l, y + h, pt[1] + nz * l];
  const A0 = P(a, ya, l0, z0), A1 = P(a, ya, l1, z0), A2 = P(a, ya, l1, z1), A3 = P(a, ya, l0, z1);
  const B0 = P(c, yb, l0, z0), B1 = P(c, yb, l1, z0), B2 = P(c, yb, l1, z1), B3 = P(c, yb, l0, z1);
  const q = (p0, p1, p2, p3, cc) => bucket.quad(p0, p1, p2, p3, cc, undefined, false);
  // Die Seitenrichtung (nx,nz) ist links der Fahrtrichtung bzw. rechts – Winding wird anhand der Normalen geprüft
  const test = (p0, p1, p2, p3, want, cc) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const d = n[0] * want[0] + n[1] * want[1] + n[2] * want[2];
    bucket.quad(p0, p1, p2, p3, cc, undefined, d < 0);
  };
  const topC = o.top || color;
  test(A3, A2, B2, B3, [0, 1, 0], topC);
  if (o.bottom !== false) test(A0, A1, B1, B0, [0, -1, 0], mulCol(color, 0.7));
  test(A0, A3, B3, B0, [-nx, 0, -nz], mulCol(color, 0.92)); // Seite l0 (nach -n)
  test(A1, A2, B2, B1, [nx, 0, nz], mulCol(color, 0.92)); // Seite l1 (nach +n)
}

/** Tunnelröhre: Profil [(lat, h), ...] von links nach rechts über das Gewölbe, Flächen nach innen. */
function tube(bucket, a, b, ya, yb, nx, nz, prof, color) {
  for (let i = 0; i < prof.length - 1; i++) {
    const p = prof[i], q = prof[i + 1];
    const P = (pt, y, l, h) => [pt[0] + nx * l, y + h, pt[1] + nz * l];
    const A0 = P(a, ya, p[0], p[1]), A1 = P(a, ya, q[0], q[1]), B1 = P(b, yb, q[0], q[1]), B0 = P(b, yb, p[0], p[1]);
    const m = [(A0[0] + B1[0]) / 2, (A0[1] + B1[1]) / 2, (A0[2] + B1[2]) / 2];
    // innen = zur Achse (lat=0, h=3) hin
    const ax = [(a[0] + b[0]) / 2, (ya + yb) / 2 + 2.6, (a[1] + b[1]) / 2];
    const ux = A1[0] - A0[0], uy = A1[1] - A0[1], uz = A1[2] - A0[2], vx = B0[0] - A0[0], vy = B0[1] - A0[1], vz = B0[2] - A0[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const toAxis = [ax[0] - m[0], ax[1] - m[1], ax[2] - m[2]];
    const flip = n[0] * toAxis[0] + n[1] * toAxis[1] + n[2] * toAxis[2] < 0;
    bucket.quad(A0, A1, B1, B0, color, undefined, flip);
  }
}

/** Extrudierte Form (Portalwand) in einen Bucket schreiben. */
function addExtrusion(bucket, shape, depth, mat4, color) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.applyMatrix4(mat4);
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const idx = g.index ? g.index.array : null;
  const base = bucket.n;
  for (let i = 0; i < pos.count; i++) bucket.vert(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), 0.5, 0.5, color);
  if (idx) for (let i = 0; i < idx.length; i++) bucket.idx.push(base + idx[i]);
  else for (let i = 0; i < pos.count; i++) bucket.idx.push(base + i);
  g.dispose();
}

export function roadwork(ctx, road, k, terrainAt) {
  const { b } = ctx;
  const a = road.pts[k], c = road.pts[k + 1];
  const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux; // Querrichtung (wie im Ribbon: A = +n)
  const ya = road.y[k], yb = road.y[k + 1];
  const yaw = Math.atan2(-uz, ux);
  const w = road.w, hw = w / 2;
  const cx = (a[0] + c[0]) / 2, cz = (a[1] + c[1]) / 2;
  const kind = road.kind;
  const grid = kind === 'street' || kind === 'avenue';
  const midY = (ya + yb) / 2;
  const tunnelSeg = road.tunnel && k >= road.tunnel[0] && k < road.tunnel[1];

  // ---- Fahrbahnfläche für die Höhenabfrage (nicht für Raster-Straßen auf Bodenhöhe)
  const ground = Math.min(terrainAt(a[0], a[1]), terrainAt(cx, cz), terrainAt(c[0], c[1]));
  const elevated = !!road.elevated || road.canalSpan || (Math.min(ya, yb) - ground > 1.6);
  if (!grid || elevated) {
    ctx.strip({ cx, cz, hx: len / 2 + 0.05, hz: hw + (elevated ? 0.2 : 1.6), yaw, y0: ya, y1: yb });
  }

  // ---- Hochstraße/Brücke: Deck, Brüstungen, Pfeiler
  if (elevated) {
    const th = kind === 'freeway' ? 1.4 : 1.0;
    prism(b.solid, a, c, ya, yb, nx, nz, -hw - 0.6, hw + 0.6, -th, -0.02, C.concrete, { top: C.concreteDark });
    const rail = (l0, l1, h, color) => prism(b.solid, a, c, ya, yb, nx, nz, l0, l1, 0, h, color, { bottom: false });
    rail(hw - 0.2, hw + 0.55, 1.0, C.concrete);
    rail(-hw - 0.55, -hw + 0.2, 1.0, C.concrete);
    const lo = Math.min(ya, yb) - 1.6, hi = Math.max(ya, yb) + 1.4;
    for (const s of [-1, 1]) ctx.box(cx + nx * s * (hw + 0.1), cz + nz * s * (hw + 0.1), len / 2 + 0.1, 0.35, yaw, lo, hi);
    if (kind === 'freeway') { // Mittelwand
      prism(b.solid, a, c, ya, yb, nx, nz, -0.5, 0.5, 0, 0.95, C.concrete);
      ctx.box(cx, cz, len / 2 + 0.1, 0.5, yaw, lo, hi);
      // Lampen auf der Mittelwand
      ctx.lamps.push([a[0], ya + 9.5, a[1], 0]);
      b.solid.cyl(a[0], ya, a[1], 0.12, 0.09, 9, 6, C.post, { cap: true });
      b.lamp.box(a[0], ya + 9.0, a[1], 2.2, 0.15, 0.5, yaw, [1, 0.88, 0.62], { top: false });
    }
    // Pfeiler: am Anfang jedes Abschnitts (Autobahn, Rampen), Brücken alle ~26 m
    const needPier = kind === 'freeway' || ground < Math.min(ya, yb) - 2.2;
    if (needPier) {
      const step = kind === 'freeway' ? len : kind === 'ramp' ? len : 26;
      const count = Math.max(1, Math.round(len / step));
      for (let q = 0; q < count; q++) {
        const f = count === 1 ? 0 : q / count;
        const px = lerp(a[0], c[0], f), pz = lerp(a[1], c[1], f), py = lerp(ya, yb, f);
        const g0 = terrainAt(px, pz);
        const hgt = py - th - g0 - 0.7;
        if (hgt < 1) continue;
        const colW = kind === 'freeway' ? 2.6 : 1.6;
        b.solid.box(px, g0, pz, colW, hgt, colW, yaw, C.concreteDark, { top: true });
        b.solid.box(px, py - th - 0.8, pz, 2.0, 0.8, w + 2.4, yaw, C.concrete, { top: true });
        ctx.circle(px, pz, colW * 0.62, g0, py);
      }
    }
  }

  // ---- Leitplanken an Bergstraßen (nicht im Tunnel, nicht an den Enden)
  if (kind === 'hill' && !tunnelSeg && k > 1 && k < road.pts.length - 3) {
    for (const s of [-1, 1]) {
      const l0 = s > 0 ? hw + 0.45 : -hw - 0.7, l1 = s > 0 ? hw + 0.7 : -hw - 0.45;
      prism(b.solid, a, c, ya, yb, nx, nz, l0, l1, 0.45, 0.95, C.rail, { top: C.rail });
      // Pfosten alle ~4 m
      const np = Math.max(1, Math.round(len / 4));
      for (let q = 0; q < np; q++) {
        const f = (q + 0.5) / np;
        b.solid.box(lerp(a[0], c[0], f) + nx * s * (hw + 0.58), lerp(ya, yb, f), lerp(a[1], c[1], f) + nz * s * (hw + 0.58), 0.12, 0.6, 0.12, yaw, C.post, { top: false });
      }
      ctx.box(cx + nx * s * (hw + 0.58), cz + nz * s * (hw + 0.58), len / 2 + 0.1, 0.2, yaw, Math.min(ya, yb) - 1, Math.max(ya, yb) + 1.2);
    }
  }

  // ---- Tunnel: einmal je Tunnel (im Chunk des mittleren Abschnitts)
  if (road.tunnel) {
    const [t0, t1] = road.tunnel;
    if (k === Math.floor((t0 + t1) / 2)) buildTunnel(ctx, road, t0, t1);
  }
}

function buildTunnel(ctx, road, t0, t1) {
  const { b } = ctx;
  const a = road.pts[t0], c = road.pts[t1];
  const ya = road.y[t0], yb = road.y[t1];
  const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
  const yaw = Math.atan2(-uz, ux);
  // Querschnitt: Wände bis 4,0 m, Gewölbe bis 6,7 m
  const ordered = [[-6.2, 0], [-6.2, 4.0]];
  for (let i = 1; i < 8; i++) { const t = (i / 8) * Math.PI; ordered.push([-6.2 * Math.cos(t), 4.0 + 2.7 * Math.sin(t)]); }
  ordered.push([6.2, 4.0], [6.2, 0]);
  tube(b.solid, a, c, ya, yb, nx, nz, ordered, mixCol(C.tunnel, C.tunnelDark, 0.2));
  // Deckenleuchten (immer an) alle 11 m + Wandleuchten
  const n = Math.floor(len / 11);
  for (let i = 0; i <= n; i++) {
    const f = (i + 0.5) / (n + 1);
    const px = lerp(a[0], c[0], f), pz = lerp(a[1], c[1], f), py = lerp(ya, yb, f);
    b.tunLamp.box(px, py + 6.45, pz, 2.6, 0.12, 0.6, yaw, [1, 0.95, 0.8], { top: false });
    if (i % 2 === 0) ctx.lamps.push([px, py + 6.0, pz, 1]);
    for (const s of [-1, 1]) b.tunLamp.box(px + nx * s * 6.12, py + 1.1, pz + nz * s * 6.12, 0.1, 0.1, 1.4, yaw, [1, 0.62, 0.25], { top: false });
  }
  // Wandkollision
  for (const s of [-1, 1]) ctx.box((a[0] + c[0]) / 2 + nx * s * 6.55, (a[1] + c[1]) / 2 + nz * s * 6.55, len / 2 + 3, 0.5, yaw, Math.min(ya, yb) - 1, Math.max(ya, yb) + 8);
  // Portalwände
  const shape = new THREE.Shape();
  shape.moveTo(-15, -1); shape.lineTo(15, -1); shape.lineTo(15, 12); shape.lineTo(-15, 12); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-6.2, -1); hole.lineTo(-6.2, 4.0);
  for (let i = 1; i < 12; i++) { const t = (i / 12) * Math.PI; hole.lineTo(-6.2 * Math.cos(t), 4.0 + 2.7 * Math.sin(t)); }
  hole.lineTo(6.2, 4.0); hole.lineTo(6.2, -1); hole.closePath();
  shape.holes.push(hole);
  for (const end of [0, 1]) {
    const p = end ? c : a, y = end ? yb : ya;
    const dir = end ? 1 : -1; // Wand liegt außerhalb der Röhre
    // lokale Shape-x = lateral (n), Shape-y = oben; Extrusion (z) = entlang der Fahrtrichtung
    const m = new THREE.Matrix4();
    // Basis: x -> n, y -> up, z -> u (Fahrtrichtung)
    m.makeBasis(new THREE.Vector3(nx, 0, nz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz));
    const off = end ? 0 : -2.6; // Wand dicke 2,6: Eingang: von -2.6 bis 0; Ausgang: 0 bis +2.6
    m.setPosition(p[0] + ux * off, y, p[1] + uz * off);
    addExtrusion(b.solid, shape, 2.6, m, C.concrete);
    void dir;
    // Warnstreifen über dem Portal
    b.lamp.box(p[0] + ux * (end ? 2.7 : -2.7), y + 7.2, p[1] + uz * (end ? 2.7 : -2.7), 0.1, 0.35, 12, yaw, [1, 0.5, 0.15], { top: false });
  }
}
