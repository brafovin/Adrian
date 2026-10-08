// Verkehr (Fremdfahrzeuge: Pkw, SUV, Transporter, Sportwagen, Lkw, Busse) und Fußgänger (auf den Gehwegen).
// Auf dem Straßenraster folgen Fahrzeuge Fahrspuren, halten Abstand, beachten Ampeln und Vorfahrt und biegen an Kreuzungen ab;
// auf Küstenstraße, Autobahn und Bergstraßen fahren sie Polylinien-Spuren (Kurventempo nach Krümmung). Gerendert als InstancedMesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collideWithBody } from '../physics/collision.js';
import { rng, clamp, lerp, damp, smoothstep, hash2, wrapPi } from '../util.js';
import { GX0, GX1, GZ0, GZ1, PITCH, ROAD, blockRect, zoneOfBlock } from './layout.js';

const LANES = { street: { n: 2, w: 3.4, med: 0.0 }, avenue: { n: 3, w: 3.4, med: 1.5 }, highway: { n: 3, w: 3.6, med: 1.0 }, freeway: { n: 3, w: 3.6, med: 0.5 }, hill: { n: 1, w: 3.6, med: 0.3 } };
const COLORS = [0xf2f2ef, 0xd9dbdf, 0x9a9da4, 0x2b2e34, 0x0d0e11, 0x1f2f55, 0x6b1620, 0xc9b99a, 0x35503f, 0x8b8f96, 0xf2f2ef, 0x2b2e34, 0xe3b012, 0x8a2a2a, 0x3b5b7a];

// ------------------------------------------------------------------------------------------
// Fahrzeug-Geometrie (niedrig aufgelöst, Farben in Vertexfarben: Weiß = Lack)

function boxGeo(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function cabinGeo(len, w, hBase, hTop, x, y, color) {
  // Kabine: Trapez-Prisma (Dachlinie schmaler)
  const g = new THREE.BufferGeometry();
  const l0 = len / 2, l1 = len * 0.34, w0 = w / 2, w1 = w * 0.42;
  const v = [
    [-l0, 0, -w0], [l0, 0, -w0], [l0, 0, w0], [-l0, 0, w0],
    [-l1, hTop - hBase, -w1], [l1, hTop - hBase, -w1], [l1, hTop - hBase, w1], [-l1, hTop - hBase, w1],
  ].map(([a, b, c]) => [a + x, b + y, c]);
  const faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
  const pos = [], idx = [];
  for (const f of faces) { const b = pos.length / 3; for (const k of f) pos.push(...v[k]); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const n = pos.length / 3, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function wheelGeo(x, z, r) {
  const g = new THREE.CylinderGeometry(r, r, 0.24, 10);
  g.rotateX(Math.PI / 2); g.translate(x, r, z);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.04; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
  return g;
}

function buildCarType(kind) {
  const parts = [], lights = [];
  const P = {
    sedan: { L: 4.6, W: 1.82, H: 0.7, cabL: 2.5, cabH: 0.55, cabX: -0.15, wb: 2.75, r: 0.33 },
    suv: { L: 4.7, W: 1.95, H: 0.95, cabL: 3.0, cabH: 0.65, cabX: -0.2, wb: 2.8, r: 0.38 },
    van: { L: 5.2, W: 2.0, H: 1.35, cabL: 3.9, cabH: 0.7, cabX: -0.4, wb: 3.3, r: 0.36 },
    sport: { L: 4.5, W: 1.9, H: 0.55, cabL: 2.0, cabH: 0.5, cabX: -0.1, wb: 2.6, r: 0.32 },
    truck: { L: 7.6, W: 2.4, H: 2.9, wb: 4.6, r: 0.5 },
    bus: { L: 11.8, W: 2.55, H: 3.0, wb: 6.2, r: 0.52 },
    police: { L: 4.95, W: 1.92, H: 0.78, cabL: 2.6, cabH: 0.58, cabX: -0.2, wb: 2.9, r: 0.35 },
  }[kind];
  const y0 = 0.28;
  const glass = 0x0a0f14;
  if (kind === 'bus') {
    parts.push(boxGeo(P.L, P.H - 0.55, P.W, 0, y0 + 0.27 + (P.H - 0.55) / 2, 0, 0xffffff));      // Aufbau (Lack)
    parts.push(boxGeo(P.L * 0.92, 1.0, P.W * 1.008, -0.1, y0 + 1.55, 0, glass));                  // Fensterband
    parts.push(boxGeo(0.05, 1.3, P.W * 0.92, P.L / 2 + 0.005, y0 + 1.6, 0, glass));               // Frontscheibe
    parts.push(boxGeo(P.L * 0.3, 0.2, P.W * 0.6, -1.5, y0 + P.H - 0.28 + 0.12, 0, 0x9a9da4));      // Dachaufbau (Klima)
  } else if (kind === 'truck') {
    parts.push(boxGeo(2.3, 2.2, P.W, P.L / 2 - 1.15, y0 + 0.3 + 1.1, 0, 0xffffff));                // Fahrerhaus (Lack)
    parts.push(boxGeo(0.06, 0.9, P.W * 0.9, P.L / 2 + 0.005, y0 + 0.3 + 1.55, 0, glass));          // Frontscheibe
    parts.push(boxGeo(P.L - 2.5, 2.7, P.W * 0.98, -1.25, y0 + 0.3 + 1.35, 0, 0xe4e6e8));           // Koffer
    parts.push(boxGeo(P.L, 0.35, P.W * 0.9, 0, y0 + 0.28, 0, 0x101012));                          // Rahmen
  } else {
    // Streifenwagen: schwarz mit weißen Türen (Lack ist hier fest, Instanzfarbe bleibt weiß)
    const base = kind === 'police' ? 0x101114 : 0xffffff;
    parts.push(boxGeo(P.L, P.H - 0.2, P.W, 0, y0 + (P.H - 0.2) / 2, 0, base));
    parts.push(cabinGeo(P.cabL, P.W * 0.9, 0, P.cabH, P.cabX, y0 + P.H - 0.2, base));
    if (kind === 'police') {
      parts.push(boxGeo(2.35, 0.4, P.W * 1.004, -0.15, y0 + 0.36, 0, 0xeeeeee));      // weiße Türen
      parts.push(boxGeo(0.12, 0.3, P.W * 0.7, P.L / 2 + 0.02, y0 + 0.2, 0, 0x08090a)); // Rammschutz vorn
      parts.push(boxGeo(1.0, 0.07, 0.95, P.cabX, y0 + P.H - 0.2 + P.cabH + 0.01, 0, 0x16171a)); // Sockel der Lichtleiste
    }
    // Glasbänder
    parts.push(boxGeo(P.cabL * 0.62, P.cabH * 0.5, P.W * 0.93, P.cabX, y0 + P.H - 0.2 + P.cabH * 0.35, 0, glass));
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(wheelGeo((P.wb / 2) * sx, (P.W / 2 - 0.12) * sz, P.r));
  parts.push(boxGeo(P.L * 0.98, 0.12, P.W * 0.96, 0, y0 + 0.02, 0, 0x101012));
  const body = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  // Lichter: vorn weiß, hinten rot
  for (const sz of [1, -1]) {
    lights.push(boxGeo(0.06, 0.12, 0.32, P.L / 2 - 0.02, y0 + P.H * 0.4, sz * (P.W / 2 - 0.3), 0xfff4d8));
    lights.push(boxGeo(0.06, 0.12, 0.34, -P.L / 2 + 0.02, y0 + P.H * 0.4, sz * (P.W / 2 - 0.3), 0xff1a10));
  }
  const lg = mergeGeometries(lights.map((p) => (p.index ? p.toNonIndexed() : p)));
  return { body, lights: lg, dims: P };
}

// ------------------------------------------------------------------------------------------

const MAXI = 170; // Instanzen je Fahrzeugtyp
const roadLen = (r) => Math.hypot(r.pts[1][0] - r.pts[0][0], r.pts[1][1] - r.pts[0][1]);

/** Fahrzeugmix je Straßentyp: [Typ, Gewicht]. */
const MIX = {
  street: [['sedan', 0.5], ['suv', 0.2], ['van', 0.12], ['sport', 0.08], ['truck', 0.06], ['police', 0.04]],
  avenue: [['sedan', 0.4], ['suv', 0.2], ['van', 0.08], ['sport', 0.1], ['truck', 0.08], ['bus', 0.1], ['police', 0.05]],
  highway: [['sedan', 0.4], ['suv', 0.2], ['van', 0.08], ['sport', 0.12], ['truck', 0.12], ['bus', 0.04], ['police', 0.07]],
  freeway: [['sedan', 0.34], ['suv', 0.2], ['van', 0.06], ['sport', 0.12], ['truck', 0.22], ['police', 0.06]],
  hill: [['sedan', 0.45], ['suv', 0.3], ['van', 0.05], ['sport', 0.17], ['police', 0.03]],
};
const MASS = { sedan: 1500, suv: 2100, van: 2400, sport: 1600, truck: 7500, bus: 12500, police: 1900 };
const BUS_COLORS = [0xe8e8e4, 0x2d6aa8, 0xb02a2a, 0x2f7d55];
const TRUCK_COLORS = [0xf2f2ef, 0xd9dbdf, 0x2b4a78, 0x8b8f96, 0xb02a2a];

export class Traffic {
  constructor(scene, world, { count = 40 } = {}) {
    this.scene = scene; this.world = world; this.layout = world.layout;
    this.max = count;
    this.cars = [];
    this.nextId = 1;
    this.rnd = rng(9913);
    this.segMap = new Map();
    for (const r of this.layout.roads) if (r.axis) this.segMap.set(`${r.axis}|${r.gi}|${r.gj}`, r);
    this.initPaths();
    this.types = ['sedan', 'suv', 'van', 'sport', 'truck', 'bus', 'police'];
    this.meshes = {};
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.5, envMapIntensity: 1.3 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.3, 0.3, 0.3) });
    for (const t of this.types) {
      const g = buildCarType(t);
      const body = new THREE.InstancedMesh(g.body, bodyMat, MAXI);
      const lights = new THREE.InstancedMesh(g.lights, this.lightMat, MAXI);
      for (const m of [body, lights]) { m.frustumCulled = false; m.count = 0; m.castShadow = m === body; scene.add(m); }
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[t] = { body, lights, dims: g.dims };
    }
    // Blaulicht der Streifenwagen: zwei Hälften der Lichtleiste (rot / blau), Farbe je Instanz wird im Takt umgeschaltet
    this.bars = [];
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    for (const side of [1, -1]) {
      const g = new THREE.BoxGeometry(0.34, 0.1, 0.46);
      g.translate(this.meshes.police.dims.cabX, 0.28 + this.meshes.police.dims.H - 0.2 + this.meshes.police.dims.cabH + 0.1, side * 0.25);
      const m = new THREE.InstancedMesh(g, barMat, 60);
      m.frustumCulled = false; m.count = 0; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m); this.bars.push({ mesh: m, side });
    }
    this.clock = 0;
    this.sirens = [];
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3(); this.tmpS = new THREE.Vector3(1, 1, 1);
    this.tmpC = new THREE.Color(); this.axisY = new THREE.Vector3(0, 1, 0);
    this.sound = [];
    this.spawnTimer = 0;
    this.occ = new Map();   // Kreuzung -> Fahrzeuge, die gerade abbiegen/queren
  }

  setCount(n) { this.max = n; }

  // ---------------------------------------------------------------- Pfadstraßen (Küstenstraße, Autobahn, Bergstraßen)
  /** Polylinien-Straßen vorbereiten: Bogenlänge, geglättete Tangenten, Krümmung. */
  initPaths() {
    this.paths = []; this.pathOf = new Map();
    for (const r of this.layout.roads) {
      if (r.axis || !(r.kind === 'highway' || r.kind === 'freeway' || r.kind === 'hill')) continue;
      const n = r.pts.length, cum = new Float64Array(n), tan = [], curv = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
      const seg = (i) => { const dx = r.pts[i + 1][0] - r.pts[i][0], dz = r.pts[i + 1][1] - r.pts[i][1]; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
      for (let i = 0; i < n; i++) {
        const a = seg(Math.max(0, i - 1)), b = seg(Math.min(n - 2, i));
        const tx = a[0] + b[0], tz = a[1] + b[1], l = Math.hypot(tx, tz) || 1;
        tan.push([tx / l, tz / l]);
      }
      for (let i = 1; i < n - 1; i++) {
        const a = seg(i - 1), b = seg(i);
        curv[i] = Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1)) / Math.max(1, (cum[i + 1] - cum[i - 1]) / 2);
      }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of r.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      const P = { road: r, n, cum, len: cum[n - 1], tan, curv, bbox: [x0, x1, z0, z1] };
      this.paths.push(P); this.pathOf.set(r.id, P);
    }
  }

  /** Punkt auf einer Spur einer Pfadstraße: dir (+1 in Polylinienrichtung), s = m ab dem Start in Fahrtrichtung. */
  pathPoint(P, dir, s, lane, out) {
    const r = P.road;
    const ss = clamp(dir > 0 ? s : P.len - s, 0, P.len - 1e-3);
    const cum = P.cum;
    let lo = 0, hi = P.n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= ss) lo = mid; else hi = mid; }
    const t = (ss - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    const a = r.pts[lo], b = r.pts[lo + 1];
    let ux = lerp(P.tan[lo][0], P.tan[lo + 1][0], t), uz = lerp(P.tan[lo][1], P.tan[lo + 1][1], t);
    const l = Math.hypot(ux, uz) || 1; ux = (ux / l) * dir; uz = (uz / l) * dir;
    const off = this.laneOffset(r, lane);
    out.x = lerp(a[0], b[0], t) - uz * off; out.z = lerp(a[1], b[1], t) + ux * off;
    out.y = lerp(r.y[lo], r.y[lo + 1], t);
    out.ux = ux; out.uz = uz; out.i = lo;
    return out;
  }

  // ---------------------------------------------------------------- Spurgeometrie
  laneOffset(road, lane) {
    const L = LANES[road.kind] || LANES.street;
    return L.med + (lane + 0.5) * L.w;
  }
  lanes(road) { return (LANES[road.kind] || LANES.street).n; }

  /** Position/Richtung auf einer Spur: seg (Straße), dir (+1 a->c, -1 c->a), s (m ab Start in Fahrtrichtung). */
  lanePoint(road, dir, s, lane, out) {
    const a = road.pts[0], c = road.pts[1];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const ux = (dx / len) * dir, uz = (dz / len) * dir;
    const sx = dir > 0 ? a[0] : c[0], sz = dir > 0 ? a[1] : c[1];
    const off = this.laneOffset(road, lane);
    out.x = sx + ux * s + -uz * off; out.z = sz + uz * s + ux * off; out.y = 0;
    out.ux = ux; out.uz = uz; out.len = len;
    return out;
  }

  /** Nachfolge-Abschnitt am Ende von (road, dir): gibt {road, dir, kind} zurück oder null. */
  nextSegments(road, dir) {
    const { axis, gi, gj } = road;
    const get = (ax, i, j) => this.segMap.get(`${ax}|${i}|${j}`) || null;
    const out = [];
    if (axis === 'v') {
      const j = dir > 0 ? gj + 1 : gj; // Kreuzungszeile
      const i = gi;
      const straight = get('v', i, dir > 0 ? gj + 1 : gj - 1);
      if (straight) out.push({ road: straight, dir, turn: 'straight', w: 0.5 });
      const east = get('h', i, j), west = get('h', i - 1, j);
      // Fahrtrichtung +z (Süden): rechts = Westen, links = Osten; -z (Norden): rechts = Osten, links = Westen
      if (dir > 0) { if (west) out.push({ road: west, dir: -1, turn: 'right', w: 0.25 }); if (east) out.push({ road: east, dir: 1, turn: 'left', w: 0.25 }); }
      else { if (east) out.push({ road: east, dir: 1, turn: 'right', w: 0.25 }); if (west) out.push({ road: west, dir: -1, turn: 'left', w: 0.25 }); }
    } else if (axis === 'h') {
      const i = dir > 0 ? gi + 1 : gi; // Kreuzungsspalte
      const j = gj;
      const straight = get('h', dir > 0 ? gi + 1 : gi - 1, j);
      if (straight) out.push({ road: straight, dir, turn: 'straight', w: 0.5 });
      const south = get('v', i, j), north = get('v', i, j - 1);
      // +x (Osten): rechts = Süden, links = Norden; -x (Westen): rechts = Norden, links = Süden
      if (dir > 0) { if (south) out.push({ road: south, dir: 1, turn: 'right', w: 0.25 }); if (north) out.push({ road: north, dir: -1, turn: 'left', w: 0.25 }); }
      else { if (north) out.push({ road: north, dir: -1, turn: 'right', w: 0.25 }); if (south) out.push({ road: south, dir: 1, turn: 'left', w: 0.25 }); }
    }
    return out;
  }

  /** Zufällige Weiterfahrt am Abschnittsende (null = Sackgasse). Spurdisziplin: links nur von der linken, rechts nur von der rechten Spur. */
  pickNext(road, dir, lane) {
    const n = this.lanes(road);
    const opts = this.nextSegments(road, dir).filter((o) => o.turn === 'straight' || (o.turn === 'left' ? lane === 0 : lane === n - 1));
    if (!opts.length) return null;
    let r = this.rnd() * opts.reduce((s, o) => s + o.w, 0), pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    return pick;
  }

  /** Schlüssel der Kreuzung am Ende von (road, dir). */
  crossKey(road, dir) {
    const { axis, gi, gj } = road;
    return axis === 'v' ? `${gi},${dir > 0 ? gj + 1 : gj}` : `${dir > 0 ? gi + 1 : gi},${gj}`;
  }

  /** Ampelzustand für ein Fahrzeug, das entlang von `road` in Richtung `dir` fährt. */
  signal(road, st) { return road.axis === 'h' ? st.E : st.N; }

  pickType(road) {
    const mix = MIX[road.kind] || MIX.street;
    let r = this.rnd() * mix.reduce((s, m) => s + m[1], 0);
    for (const [t, w] of mix) { r -= w; if (r <= 0) return t; }
    return 'sedan';
  }

  // ---------------------------------------------------------------- Erzeugen
  /** Fahrzeug anlegen, wenn die Stelle passt (Abstand zum Spieler, nicht im Blickfeld, frei, Chunk geladen). */
  makeCar(road, dir, lane, s, pt, mode, view) {
    const { px, pz, pf, force } = view;
    const d = Math.hypot(pt.x - px, pt.z - pz);
    if (d < (force ? 28 : 70) || d > 390) return null;
    if (!force && d < 260 && ((pt.x - px) * pf[0] + (pt.z - pz) * pf[1]) / d > 0.72) return null; // nicht sichtbar einblenden
    const cx = Math.floor(pt.x / 160), cz = Math.floor(pt.z / 160);
    if (!this.world.chunks.has(cx * 100003 + cz)) return null;
    const type = this.pickType(road);
    const dims = this.meshes[type].dims, hl = dims.L / 2;
    const py = pt.y ?? 0;
    for (const o of this.cars) {
      if (Math.abs(o.y - py) > 3) continue;
      if (Math.hypot(o.x - pt.x, o.z - pt.z) < o.hull.hl + hl + 6) return null;
    }
    // Nicht in eine Schlange/vor einen schnellen Hintermann setzen: Abstand zu den Nachbarn in derselben Spur prüfen
    let startSpeedCap = Infinity;
    for (const o of this.cars) {
      if (o.road !== road || o.dir !== dir || o.lane !== lane || (o.mode !== 'lane' && o.mode !== 'path')) continue;
      if (o.s > s) startSpeedCap = Math.min(startSpeedCap, o.speed + Math.sqrt(8 * Math.max(0, o.s - s - o.hull.hl - hl - 2)));  // Vordermann: Anhalteweg
      else if (s - o.s - hl - o.hull.hl < 6 + o.speed * 1.6) return null;                                                       // Hintermann zu dicht/schnell
    }
    const big = type === 'bus' || type === 'truck';
    const siren = type === 'police' && this.rnd() < 0.45;      // Einsatzfahrt: Blaulicht, Sirene, schneller
    const speedLimit = (ROAD[road.kind]?.speed ?? 14) * this.rnd.range(0.82, 1.05) * (big ? 0.88 : siren ? 1.25 : 1);
    const pal = type === 'bus' ? BUS_COLORS : type === 'truck' ? TRUCK_COLORS : type === 'police' ? [0xffffff] : COLORS;
    const car = {
      id: this.nextId++, type, color: pal[Math.floor(this.rnd() * pal.length)], mode, road, dir, lane, s,
      x: pt.x, z: pt.z, y: py, yaw: Math.atan2(-pt.uz, pt.ux), speed: Math.min(speedLimit * 0.8, startSpeedCap), vmax: speedLimit,
      vx: 0, vz: 0, w: 0, hull: { hl, hw: dims.W / 2, off: 0 }, m: MASS[type], hitT: 0, conn: null, plan: null, pi: pt.i ?? 0, blockT: 0, siren,
    };
    if (mode === 'lane') car.plan = this.pickNext(road, dir, lane);
    this.cars.push(car);
    return car;
  }

  /** Küstenstraße/Autobahn/Bergstraße nahe am Zufallspunkt (x, z). */
  spawnPath(x, z, view) {
    let best = null, bd = 140;
    for (const P of this.paths) {
      const b = P.bbox;
      if (x < b[0] - bd || x > b[1] + bd || z < b[2] - bd || z > b[3] + bd) continue;
      for (let k = 0; k < P.n; k++) {
        const d = Math.hypot(P.road.pts[k][0] - x, P.road.pts[k][1] - z);
        if (d < bd) { bd = d; best = { P, k }; }
      }
    }
    if (!best) return null;
    const { P, k } = best, road = P.road;
    const dir = this.rnd() < 0.5 ? 1 : -1;
    const lane = Math.floor(this.rnd() * this.lanes(road));
    const s = dir > 0 ? P.cum[k] : P.len - P.cum[k];
    if (s < 8 || s > P.len - 40) return null;
    const pt = this.pathPoint(P, dir, s, lane, {});
    // Dichte je Straßentyp begrenzen (Bergstraße spärlich, Autobahn dichter): Fahrzeuge dieser Straße im Umkreis zählen
    const cap = { hill: 6, highway: 14, freeway: 18 }[road.kind] ?? 10;
    let near = 0; for (const o of this.cars) if (o.road === road && Math.abs(o.x - pt.x) < 250 && Math.abs(o.z - pt.z) < 250) near++;
    if (near >= cap) return null;
    return this.makeCar(road, dir, lane, s, pt, 'path', view);
  }

  spawn(px, pz, pf, force = false) {
    const rnd = this.rnd;
    const view = { px, pz, pf, force };
    for (let tries = 0; tries < 14; tries++) {
      const ang = rnd() * Math.PI * 2, dist = (force ? 35 : 80) + rnd() * (force ? 300 : 280);
      const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
      if (this.paths.length && rnd() < (this.onPath ? 0.75 : 0.4)) { const c = this.spawnPath(x, z, view); if (c) return c; }
      // Raster: zufällig N–S oder O–W; Position entlang der Straße am Zufallspunkt
      const axis = rnd() < 0.5 ? 'v' : 'h';
      const road = axis === 'v'
        ? this.segMap.get(`v|${Math.round(x / PITCH)}|${Math.floor(z / PITCH)}`)
        : this.segMap.get(`h|${Math.floor(x / PITCH)}|${Math.round(z / PITCH)}`);
      if (!road) continue;
      const dir = rnd() < 0.5 ? 1 : -1;
      const lane = Math.floor(rnd() * this.lanes(road));
      const a = road.pts[0], c2 = road.pts[1], len = roadLen(road);
      const along = ((x - a[0]) * (c2[0] - a[0]) + (z - a[1]) * (c2[1] - a[1])) / len;
      const s = clamp(dir > 0 ? along : len - along, 12, Math.max(13, len - 28));
      const c = this.makeCar(road, dir, lane, s, this.lanePoint(road, dir, s, lane, {}), 'lane', view);
      if (c) return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- Aktualisieren
  update(dt, player, tod) {
    const st = this.world.trafficState();
    const px = player.vehicle.x, pz = player.vehicle.z;
    const pf = player.vehicle.fwd;
    // Auffüllen: anfangs/bei großer Lücke mehrere pro Bild, sonst gleichmäßig nachrücken
    // Fährt der Spieler auf Küstenstraße/Autobahn/Bergstraße (oder nahe daran), dort bevorzugt Verkehr erzeugen
    if (((this.frame || 0) & 15) === 0) {
      let near = false;
      for (const P of this.paths) {
        const b = P.bbox;
        if (px < b[0] - 90 || px > b[1] + 90 || pz < b[2] - 90 || pz > b[3] + 90) continue;
        for (let k = 0; k < P.n && !near; k += 2) near = Math.hypot(P.road.pts[k][0] - px, P.road.pts[k][1] - pz) < 90;
        if (near) break;
      }
      this.onPath = near;
    }
    const fill = this.cars.length < this.max * 0.6;
    this.spawnTimer -= dt;
    let n = fill ? 8 : this.spawnTimer <= 0 ? 1 : 0;
    if (!fill && n) this.spawnTimer = 0.15;
    while (n-- > 0 && this.cars.length < this.max) this.spawn(px, pz, pf, this.cars.length < this.max * 0.3);
    const pSpeed = Math.hypot(player.vehicle.u, player.vehicle.v);
    // Nachbarschaft: je Straße+Richtung+Spur sortierte Fahrzeuge
    const buckets = new Map();
    this.occ.clear(); this.frame = (this.frame || 0) + 1;
    for (const c of this.cars) {
      if (c.mode === 'lane' || c.mode === 'path') {
        const k = c.road.id * 8 + (c.dir > 0 ? 0 : 4) + c.lane;
        let a = buckets.get(k); if (!a) buckets.set(k, (a = [])); a.push(c);
        // Fahrzeuge hinter der Haltelinie sind „unterwegs in die Kreuzung“: für den Querverkehr schon als Belegung zählen
        c.cc = null;
        if (c.mode === 'lane' && c.plan) {
          // „Unterwegs in die Kreuzung“: Anspruch angemeldet, oder hinter der Haltelinie in Bewegung / direkt vor der Kreuzungskante.
          // Wer an der Haltelinie wartet (Rot, Vordermann), zählt nicht – sonst blockieren sich wartende Fahrzeuge gegenseitig.
          const past = c.s - (roadLen(c.road) - 5.8 - c.hull.hl);
          if (c.claim || (past > 0.8 && (c.speed > 1 || past > 4.3))) this.claim(c);
        }
      } else if (c.mode === 'turn') this.enter(c);
    }
    for (const a of buckets.values()) a.sort((p, q) => p.s - q.s);

    for (let n2 = this.cars.length - 1; n2 >= 0; n2--) {
      const c = this.cars[n2];
      const dp = Math.hypot(c.x - px, c.z - pz);
      if (dp > 470 || c.dead) { this.cars.splice(n2, 1); continue; }
      if (c.mode === 'free') {
        c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.w * dt;
        const k = Math.exp(-1.1 * dt); c.vx *= k; c.vz *= k; c.w *= Math.exp(-1.6 * dt);
        c.speed = Math.hypot(c.vx, c.vz); c.hitT += dt;
        if (c.hitT > 25 && dp > 90) c.dead = true;
        continue;
      }
      if (c.mode === 'lane') this.stepLane(c, dt, st, buckets, player, pSpeed);
      else if (c.mode === 'path') this.stepPath(c, dt, buckets, player);
      else this.stepTurn(c, dt, st, buckets);
    }
    this.clock += dt;
    this.syncMeshes(tod);
    // Klangquellen: nächste Fahrzeuge
    const near = this.cars.filter((c) => Math.hypot(c.x - px, c.z - pz) < 90).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 5);
    const pv = player.vehicle.worldVelocity();
    this.sirens = this.cars.filter((c) => c.siren && c.mode !== 'free' && Math.hypot(c.x - px, c.z - pz) < 300)
      .sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 2)
      .map((c) => {
        const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz) || 1;
        const cvx = Math.cos(c.yaw) * c.speed, cvz = -Math.sin(c.yaw) * c.speed;
        return { id: c.id, x: c.x, z: c.z, dist: d, closing: -(((cvx - pv[0]) * dx + (cvz - pv[1]) * dz) / d) };
      });
    this.sound = near.map((c) => {
      const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz) || 1;
      const cvx = Math.cos(c.yaw) * c.speed, cvz = -Math.sin(c.yaw) * c.speed;
      const closing = -(((cvx - pv[0]) * dx + (cvz - pv[1]) * dz) / d);
      return { id: c.id, x: c.x, z: c.z, speed: c.speed, closing };
    });
  }

  /** Fahrzeug als „in der Kreuzung“ eintragen (einmal pro Bild). */
  enter(c) {
    if (c.occF === this.frame) return;
    c.occF = this.frame;
    let a = this.occ.get(c.xk); if (!a) this.occ.set(c.xk, (a = [])); a.push(c);
  }

  /** Anspruch auf die Kreuzung anmelden: wer zuerst anmeldet, hat Vorrang vor kollidierenden Bewegungen. */
  claim(c) {
    c.xk = this.crossKey(c.road, c.dir);
    c.cc = { ax: c.road.axis, d: c.dir, turn: c.plan.turn };
    this.enter(c);
  }

  /** Zielgeschwindigkeit wegen Vordermann (gleiche Straße, Richtung, Spur). */
  followLimit(c, buckets, target) {
    const arr = buckets.get(c.road.id * 8 + (c.dir > 0 ? 0 : 4) + c.lane);
    if (!arr) return target;
    const lead = arr[arr.indexOf(c) + 1];
    if (!lead) return target;
    const gap = lead.s - c.s - (lead.hull.hl + c.hull.hl);
    const safe = 3 + c.speed * 1.4;
    if (gap < safe) target = Math.min(target, Math.max(0, lead.speed * (gap / safe) - (gap < 2 ? 2 : 0)));
    if (gap < 1.2) target = 0;
    return target;
  }

  /** Vorfahrt: darf c an der Haltelinie in die Kreuzung einfahren? */
  mustYield(c, plan, buckets) {
    const road = c.road, turn = plan.turn, patient = c.waitT > 9;
    // 1) Kreuzung belegt (Querverkehr, bzw. Gegenverkehr bei Linksabbiegen)
    const occ = this.occ.get(this.crossKey(road, c.dir));
    if (occ) for (const b of occ) {
      if (b === c) continue;
      const bc = b.conn || b.cc;
      if (!bc) continue;
      if (bc.ax !== road.axis) return true;
      // Geduld: wer lange wartet, ignoriert bloße Ansprüche des Gegenverkehrs (nicht aber Fahrzeuge in der Kreuzung)
      if (bc.d !== c.dir && (turn === 'left' || bc.turn === 'left') && !(patient && !b.conn)) return true;
    }
    // 2) Linksabbieger lassen anrollenden Gegenverkehr durch
    if (turn === 'left' && !patient) {
      const opp = this.nextSegments(road, c.dir).find((o) => o.turn === 'straight');
      if (opp) {
        const R = opp.road, dirO = -c.dir, lenO = roadLen(R);
        for (let ln = 0; ln < this.lanes(R); ln++) {
          const arr = buckets.get(R.id * 8 + (dirO > 0 ? 0 : 4) + ln);
          if (arr) for (const o of arr) if (o.speed > 1 && lenO - o.s < 22 + o.speed * 1.8) return true;
        }
      }
    }
    // 3) Kreuzung nicht blockieren: auf der Zielspur muss Platz sein
    const R2 = plan.road;
    const toLane = turn === 'right' ? this.lanes(R2) - 1 : turn === 'left' ? 0 : Math.min(c.lane, this.lanes(R2) - 1);
    const arr = buckets.get(R2.id * 8 + (plan.dir > 0 ? 0 : 4) + toLane);
    if (arr && arr.length) { const f = arr[0]; if (f.s - f.hull.hl - c.hull.hl < 4) return true; }
    return false;
  }

  /** Geschwindigkeit zum Ziel führen: sanft beschleunigen (≤ 2,6 m/s²), kräftig bremsen (Regler 4,5/s, ≤ 7,5 m/s²). */
  accelerate(c, target, dt) {
    const dv = target - c.speed;
    return clamp(c.speed + clamp(dv * (dv < 0 ? 4.5 : 1.6), -7.5, 2.6) * dt, 0, c.vmax * 1.1);
  }

  stepLane(c, dt, st, buckets, player, pSpeed) {
    const road = c.road;
    const len = roadLen(road);
    // Zielgeschwindigkeit
    let target = this.followLimit(c, buckets, c.vmax);
    // Vordermann, der schon in die Kreuzung abgebogen ist (gleiche Spur): als Vordermann weiterverfolgen
    const occ = this.occ.get(this.crossKey(road, c.dir));
    if (occ) for (const b of occ) {
      if (!b.conn || b.conn.fr !== road.id || b.conn.d !== c.dir || b.conn.fl !== c.lane) continue;
      const gap = len + b.conn.t * b.conn.len - c.s - (b.hull.hl + c.hull.hl), safe = 3 + c.speed * 1.4;
      if (gap < safe) target = Math.min(target, Math.max(0, b.speed * (gap / safe) - (gap < 2 ? 2 : 0)));
      if (gap < 1.2) target = 0;
    }
    // Ampel / Haltelinie am Ende des Abschnitts
    const stopS = len - 5.8 - c.hull.hl;
    const distStop = stopS - c.s;
    const sig = this.signal(road, st);
    // Bremsprofil: v = sqrt(2·a·d) mit a ≈ 4 m/s², vor dem Stillstand linear auslaufen (das Auto kann dem Profil folgen, ohne zu überschießen)
    const stopV = (d) => Math.min(Math.sqrt(8 * Math.max(0, d)), 1.5 * Math.max(0, d));
    if (!c.plan && distStop < 60) target = Math.min(target, Math.max(0.8, stopV(distStop - 2))); // Sackgasse
    c.claim = false;
    // Wer hinter der Haltelinie (auf dem Zebrastreifen) zum Stehen gekommen ist, bleibt bei Rot/Gelb stehen
    if (sig !== 'g' && distStop <= -1 && distStop > -8 && c.speed < 1.5) target = 0;
    const inZone = c.plan && distStop > -1 && distStop < 3 + c.speed * c.speed / 6;
    c.waitT = sig === 'g' && inZone && c.speed < 0.5 ? (c.waitT || 0) + dt : c.speed > 2 ? 0 : c.waitT || 0;
    if (sig !== 'g' && distStop > -1 && distStop < 8 + c.speed * c.speed / 6) {
      // Schafft das Fahrzeug es noch zu halten (max. 7,5 m/s²)? Sonst fährt es durch und meldet seinen Anspruch an.
      if (distStop > (c.speed * c.speed) / 15 - 0.5) target = Math.min(target, stopV(distStop));
      else if (inZone) { c.claim = true; this.claim(c); }
    } else if (inZone) {
      if (this.mustYield(c, c.plan, buckets)) target = Math.min(target, stopV(distStop));
      else if (distStop < 4 + c.speed * 1.5) { c.claim = true; this.claim(c); }
    }
    // Spieler voraus (nur auf gleicher Höhe)
    const rx = player.vehicle.x - c.x, rz = player.vehicle.z - c.z;
    const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
    const df = rx * fx + rz * fz, dl = Math.abs(-rx * fz + rz * fx);
    if (df > 0 && df < 12 + c.speed * 1.2 && dl < 2.4 && Math.abs(player.y - c.y) < 3) target = Math.min(target, Math.max(0, df - 7) * 0.6);
    // Beschleunigen / Bremsen
    c.speed = this.accelerate(c, target, dt);
    c.s += c.speed * dt;
    if (c.s >= len - c.hull.hl - 0.2) {
      // Abschnittsende: abbiegen oder Sackgasse
      const pick = c.plan;
      if (!pick) { c.dead = true; return; }
      const toLane = pick.turn === 'right' ? this.lanes(pick.road) - 1 : pick.turn === 'left' ? 0 : Math.min(c.lane, this.lanes(pick.road) - 1);
      const from = this.lanePoint(road, c.dir, c.s, c.lane, {});
      const to = this.lanePoint(pick.road, pick.dir, 0, toLane, {});
      // Steuerpunkt: Schnittpunkt der Spurgeraden (bei Geradeaus Mittelpunkt)
      const cr = from.ux * to.uz - from.uz * to.ux;
      let cxp, czp;
      if (Math.abs(cr) < 0.05) { cxp = (from.x + to.x) / 2; czp = (from.z + to.z) / 2; }
      else {
        const t = ((to.x - from.x) * to.uz - (to.z - from.z) * to.ux) / cr;
        cxp = from.x + from.ux * t; czp = from.z + from.uz * t;
      }
      const clen = Math.max(4, Math.hypot(cxp - from.x, czp - from.z) + Math.hypot(to.x - cxp, to.z - czp)) * 0.95;
      c.xk = this.crossKey(road, c.dir);
      c.conn = { p0: from, p1: [cxp, czp], p2: to, len: clen, t: 0, next: pick, lane: toLane, ax: road.axis, d: c.dir, turn: pick.turn, fr: road.id, fl: c.lane };
      c.mode = 'turn'; c.plan = null;
      this.enter(c);
      c.vmax = Math.min(c.vmax, (ROAD[pick.road.kind]?.speed ?? 14) * 0.95);
      this.stepTurn(c, 0, st, buckets);
      return;
    }
    const pt = this.lanePoint(road, c.dir, c.s, c.lane, {});
    c.x = pt.x; c.z = pt.z; c.yaw = Math.atan2(-pt.uz, pt.ux);
  }

  /** Fahrt auf Küstenstraße, Autobahn oder Bergstraße (Polylinie, keine Kreuzungen; am Ende verschwindet das Fahrzeug). */
  stepPath(c, dt, buckets, player) {
    const P = this.pathOf.get(c.road.id);
    let target = c.vmax;
    // Kurven: Geschwindigkeit nach der engsten Stelle der nächsten ~40 m
    let j = c.pi, maxK = 0;
    for (let q = 0; q < 8; q++) {
      j += c.dir;
      if (j < 1 || j > P.n - 2) break;
      if (Math.abs(P.cum[j] - P.cum[c.pi]) > 42) break;
      maxK = Math.max(maxK, P.curv[j]);
    }
    if (maxK > 1e-4) target = Math.min(target, Math.max(4, Math.sqrt(2.6 / maxK)));
    target = this.followLimit(c, buckets, target);
    const rx = player.vehicle.x - c.x, rz = player.vehicle.z - c.z;
    const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
    const df = rx * fx + rz * fz, dl = Math.abs(-rx * fz + rz * fx);
    if (df > 0 && df < 12 + c.speed * 1.2 && dl < 2.4 && Math.abs(player.y - c.y) < 3) target = Math.min(target, Math.max(0, df - 7) * 0.6);
    c.speed = this.accelerate(c, target, dt);
    c.s += c.speed * dt;
    if (c.s >= P.len - 25) { c.dead = true; return; }
    const pt = this.pathPoint(P, c.dir, c.s, c.lane, this._pt || (this._pt = {}));
    c.x = pt.x; c.z = pt.z; c.y = pt.y; c.pi = pt.i;
    c.yaw += wrapPi(Math.atan2(-pt.uz, pt.ux) - c.yaw) * (1 - Math.exp(-14 * dt));
  }

  stepTurn(c, dt, st, buckets) {
    const k = c.conn;
    const turning = k.next.turn !== 'straight';
    let target = Math.min(c.vmax, turning ? (c.type === 'bus' || c.type === 'truck' ? 4.5 : 6.5) : c.vmax);
    // Hindernis voraus in der Kreuzung (Fahrzeug in gleicher Richtung) oder am Anfang der Zielspur
    let blocked = false;
    if (dt > 0 && c.blockT < 3) {
      const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
      const list = this.occ.get(c.xk);
      if (list) for (const b of list) {
        if (b === c || !b.conn) continue;
        const dx = b.x - c.x, dz = b.z - c.z;
        if (dx * dx + dz * dz > 400) continue;
        if (Math.cos(b.yaw) * fx - Math.sin(b.yaw) * fz < -0.3) continue; // Gegenverkehr: Spuren kreuzen sich nicht
        const df = dx * fx + dz * fz, dl = Math.abs(-dx * fz + dz * fx);
        if (df > 0 && df < c.hull.hl + b.hull.hl + 3 + c.speed * 0.9 && dl < (c.hull.hw + b.hull.hw) * 0.95 + 0.6) { blocked = true; break; }
      }
      const arr = !blocked && buckets && buckets.get(k.next.road.id * 8 + (k.next.dir > 0 ? 0 : 4) + k.lane);
      if (arr && arr.length) { const f = arr[0]; if (f.s + (1 - k.t) * k.len - f.hull.hl - c.hull.hl < 2 + c.speed * 0.8) blocked = true; }
    }
    if (dt > 0) c.blockT = blocked ? c.blockT + dt : Math.max(0, c.blockT - dt * 2);
    if (blocked) target = 0;
    c.speed = clamp(c.speed + clamp((target - c.speed) * 2, blocked ? -9 : -6, 2.6) * dt, blocked ? 0 : 2, 30);
    k.t = Math.min(1, k.t + (c.speed * dt) / k.len);
    const t = k.t, u = 1 - t;
    const x = u * u * k.p0.x + 2 * u * t * k.p1[0] + t * t * k.p2.x, z = u * u * k.p0.z + 2 * u * t * k.p1[1] + t * t * k.p2.z;
    const dx = 2 * u * (k.p1[0] - k.p0.x) + 2 * t * (k.p2.x - k.p1[0]), dz = 2 * u * (k.p1[1] - k.p0.z) + 2 * t * (k.p2.z - k.p1[1]);
    c.x = x; c.z = z; c.yaw = Math.atan2(-dz, dx);
    if (k.t >= 1) {
      c.mode = 'lane'; c.road = k.next.road; c.dir = k.next.dir; c.lane = k.lane; c.s = 0.01;
      c.conn = null; c.xk = null;
      c.plan = this.pickNext(c.road, c.dir, c.lane);
    }
  }

  // ---------------------------------------------------------------- Darstellung
  syncMeshes(tod) {
    const idx = {}; for (const t of this.types) idx[t] = 0;
    const lamp = 0.25 + (tod?.lights ?? 0) * 3.0;
    this.lightMat.color.setRGB(lamp, lamp, lamp);
    for (const c of this.cars) {
      const M = this.meshes[c.type];
      const i = idx[c.type]++;
      if (i >= MAXI) continue;
      this.tmpQ.setFromAxisAngle(this.axisY, c.yaw);
      this.tmpV.set(c.x, c.y, c.z);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      M.body.setMatrixAt(i, this.tmpM); M.lights.setMatrixAt(i, this.tmpM);
      this.tmpC.setHex(c.color); M.body.setColorAt(i, this.tmpC);
    }
    // Blaulicht: Einsatzfahrzeuge blitzen abwechselnd rot/blau (Doppelblitz), Streifenwagen im Streifendienst bleiben dunkel
    const lit = [new THREE.Color(7, 0.35, 0.3), new THREE.Color(0.5, 1.2, 8)], dark = new THREE.Color(0.04, 0.04, 0.05);
    let nb = 0;
    for (const c of this.cars) {
      if (c.type !== 'police' || nb >= 60) continue;
      this.tmpQ.setFromAxisAngle(this.axisY, c.yaw); this.tmpV.set(c.x, c.y, c.z); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      const k = Math.floor((this.clock + c.id * 0.13) * 8) % 8;
      for (const b of this.bars) {
        b.mesh.setMatrixAt(nb, this.tmpM);
        const on = c.siren && (b.side > 0 ? k === 0 || k === 2 : k === 4 || k === 6);
        b.mesh.setColorAt(nb, on ? lit[b.side > 0 ? 0 : 1] : dark);
      }
      nb++;
    }
    for (const b of this.bars) { b.mesh.count = nb; b.mesh.instanceMatrix.needsUpdate = true; if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true; }
    for (const t of this.types) {
      const M = this.meshes[t];
      M.body.count = M.lights.count = Math.min(idx[t], MAXI);
      M.body.instanceMatrix.needsUpdate = true; M.lights.instanceMatrix.needsUpdate = true;
      if (M.body.instanceColor) M.body.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- Kollision mit dem Spieler
  /** y = Höhe des Spielerfahrzeugs: Fahrzeuge auf anderer Ebene (Autobahn über der Unterführung) zählen nicht. */
  collide(vehicle, hull, impacts, y) {
    for (const c of this.cars) {
      if (Math.abs(c.x - vehicle.x) > 12 || Math.abs(c.z - vehicle.z) > 12) continue;
      if (y !== undefined && Math.abs(c.y - y) > 2.6) continue;
      if (c.mode !== 'free') { c.vx = Math.cos(c.yaw) * c.speed; c.vz = -Math.sin(c.yaw) * c.speed; c.w = 0; }
      const r = collideWithBody(vehicle, hull, c);
      if (r && r.speed > 0.2) {
        if (c.mode !== 'free') { c.mode = 'free'; c.hitT = 0; }
        impacts.push({ speed: r.speed, px: r.px, pz: r.pz, nx: r.nx, nz: r.nz, tag: 'car' });
      }
    }
  }

  dispose() {
    for (const t of this.types) { const M = this.meshes[t]; this.scene.remove(M.body, M.lights); M.body.dispose(); M.lights.dispose(); }
    for (const b of this.bars) { this.scene.remove(b.mesh); b.mesh.dispose(); }
  }
}

// ------------------------------------------------------------------------------------------
// Fußgänger

export class Pedestrians {
  constructor(scene, world, { count = 90 } = {}) {
    this.scene = scene; this.world = world; this.max = count;
    this.list = [];
    this.rnd = rng(4217);
    const body = new THREE.CapsuleGeometry(0.2, 0.85, 3, 6); body.translate(0, 0.95, 0);
    const head = new THREE.SphereGeometry(0.13, 7, 5); head.translate(0, 1.72, 0);
    const colorize = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    const legs = new THREE.CylinderGeometry(0.11, 0.09, 0.55, 6); legs.translate(0, 0.28, 0);
    const geo = mergeGeometries([colorize(body, 0xffffff), colorize(head, 0xc59a7a), colorize(legs, 0x1a1c22)].map((g) => g.toNonIndexed()));
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 220);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1); this.c = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
    this.t = 0;
  }

  setCount(n) { this.max = n; }

  spawnOne(px, pz) {
    const rnd = this.rnd;
    for (let tries = 0; tries < 10; tries++) {
      const ang = rnd() * Math.PI * 2, dist = 15 + rnd() * 140;
      const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
      const i = Math.floor(x / PITCH), j = Math.floor(z / PITCH);
      if (i < GX0 || i >= GX1 || j < GZ0 || j >= GZ1) continue;
      const zone = zoneOfBlock(i, j, this.world.layout.seed);
      if (zone === 'canal' || zone === 'industrial') continue;
      const dens = zone === 'core' ? 1 : zone === 'mid' ? 0.8 : zone === 'park' ? 0.7 : 0.4;
      if (rnd() > dens) continue;
      const r = blockRect(i, j);
      const off = 1.8 + rnd() * 2.0;
      const w = r.w + off * 2, d = r.d + off * 2, per = 2 * (w + d);
      this.list.push({ i, j, r, off, per, u: rnd() * per, dir: rnd() < 0.5 ? 1 : -1, v: 1.1 + rnd() * 0.6, color: [0xd8d2c8, 0x2f4f7a, 0x8a2f2f, 0x333333, 0xc9a24a, 0x3a6b5a, 0xe8e8e8][Math.floor(rnd() * 7)], phase: rnd() * 6.28, flee: 0, x: 0, z: 0, yaw: 0 });
      return;
    }
  }

  pos(p) {
    // Rechteckumlauf (im Uhrzeigersinn, Start oben links)
    const { r, off } = p, w = r.w + off * 2, d = r.d + off * 2;
    let u = ((p.u % p.per) + p.per) % p.per;
    const x0 = r.x0 - off, z0 = r.z0 - off;
    if (u < w) return [x0 + u, z0, 1, 0];
    u -= w; if (u < d) return [x0 + w, z0 + u, 0, 1];
    u -= d; if (u < w) return [x0 + w - u, z0 + d, -1, 0];
    u -= w; return [x0, z0 + d - u, 0, -1];
  }

  update(dt, player, todLights) {
    this.t += dt;
    const px = player.vehicle.x, pz = player.vehicle.z;
    const pv = player.vehicle.worldVelocity();
    const pSpeed = Math.hypot(pv[0], pv[1]);
    const target = Math.round(this.max * (1 - 0.7 * smoothstep(0.3, 1.0, todLights)));
    if (this.list.length < target) for (let k = 0; k < 2; k++) this.spawnOne(px, pz);
    let n = 0;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const p = this.list[k];
      p.u += p.dir * p.v * dt * (1 + p.flee * 1.6);
      const [x, z, tx, tz] = this.pos(p);
      const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
      if (d > 210 || this.list.length > target + 20) { this.list.splice(k, 1); continue; }
      // vor schnellen Autos zurückweichen
      let flee = 0;
      if (d < 9 && pSpeed > 3) flee = clamp(1 - d / 9, 0, 1);
      p.flee = damp(p.flee, flee, 6, dt);
      // seitlich weg von der Straße (zum Gebäude) ausweichen
      const side = p.off + (flee > 0.2 ? 1.5 : 0);
      p.off = lerp(p.off, side, Math.min(1, dt * 3));
      p.x = x; p.z = z; p.yaw = Math.atan2(-(tz * p.dir), tx * p.dir);
      if (n >= 220) continue;
      const bob = Math.abs(Math.sin(this.t * 6 * p.v + p.phase)) * 0.045;
      this.q.setFromAxisAngle(this.up, p.yaw);
      this.v.set(x, 0.12 + bob, z);
      this.m.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(n, this.m); this.c.setHex(p.color); this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
