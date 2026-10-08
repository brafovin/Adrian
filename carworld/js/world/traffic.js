// Verkehr (Fremdfahrzeuge auf dem Straßenraster) und Fußgänger (auf den Gehwegen).
// Fahrzeuge folgen Fahrspuren, halten Abstand, beachten Ampeln und biegen an Kreuzungen ab. Gerendert als InstancedMesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collideWithBody } from '../physics/collision.js';
import { rng, clamp, lerp, damp, smoothstep, hash2 } from '../util.js';
import { GX0, GX1, GZ0, GZ1, PITCH, ROAD, blockRect, zoneOfBlock } from './layout.js';

const LANES = { street: { n: 2, w: 3.4, med: 0.0 }, avenue: { n: 3, w: 3.4, med: 1.5 }, highway: { n: 3, w: 3.6, med: 1.0 }, freeway: { n: 3, w: 3.6, med: 0.5 } };
const COLORS = [0xf2f2ef, 0xd9dbdf, 0x9a9da4, 0x2b2e34, 0x0d0e11, 0x1f2f55, 0x6b1620, 0xc9b99a, 0x35503f, 0x8b8f96];

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
  }[kind];
  const y0 = 0.28;
  parts.push(boxGeo(P.L, P.H - 0.2, P.W, 0, y0 + (P.H - 0.2) / 2, 0, 0xffffff));
  const g = cabinGeo(P.cabL, P.W * 0.9, 0, P.cabH, P.cabX, y0 + P.H - 0.2, 0xffffff);
  parts.push(g);
  // Glasbänder
  parts.push(boxGeo(P.cabL * 0.62, P.cabH * 0.5, P.W * 0.93, P.cabX, y0 + P.H - 0.2 + P.cabH * 0.35, 0, 0x0a0f14));
  for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(wheelGeo((P.wb / 2) * sx, (P.W / 2 - 0.12) * sz, P.r));
  parts.push(boxGeo(P.L * 0.98, 0.12, P.W * 0.96, 0, y0 + 0.02, 0, 0x101012));
  const body = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  // Lichter: vorn weiß, hinten rot
  for (const sz of [1, -1]) {
    lights.push(boxGeo(0.06, 0.12, 0.32, P.L / 2 - 0.02, y0 + P.H * 0.55, sz * (P.W / 2 - 0.3), 0xfff4d8));
    lights.push(boxGeo(0.06, 0.12, 0.34, -P.L / 2 + 0.02, y0 + P.H * 0.55, sz * (P.W / 2 - 0.3), 0xff1a10));
  }
  const lg = mergeGeometries(lights.map((p) => (p.index ? p.toNonIndexed() : p)));
  return { body, lights: lg, dims: P };
}

// ------------------------------------------------------------------------------------------

export class Traffic {
  constructor(scene, world, { count = 40 } = {}) {
    this.scene = scene; this.world = world; this.layout = world.layout;
    this.max = count;
    this.cars = [];
    this.nextId = 1;
    this.rnd = rng(9913);
    this.segMap = new Map();
    for (const r of this.layout.roads) if (r.axis) this.segMap.set(`${r.axis}|${r.gi}|${r.gj}`, r);
    this.types = ['sedan', 'suv', 'van', 'sport'];
    this.meshes = {};
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.5, envMapIntensity: 1.3 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.3, 0.3, 0.3) });
    for (const t of this.types) {
      const g = buildCarType(t);
      const body = new THREE.InstancedMesh(g.body, bodyMat, 90);
      const lights = new THREE.InstancedMesh(g.lights, this.lightMat, 90);
      for (const m of [body, lights]) { m.frustumCulled = false; m.count = 0; m.castShadow = m === body; scene.add(m); }
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[t] = { body, lights, dims: g.dims };
    }
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3(); this.tmpS = new THREE.Vector3(1, 1, 1);
    this.tmpC = new THREE.Color(); this.axisY = new THREE.Vector3(0, 1, 0);
    this.sound = [];
    this.spawnTimer = 0;
  }

  setCount(n) { this.max = n; }

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
    out.x = sx + ux * s + -uz * off; out.z = sz + uz * s + ux * off;
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
      if (straight) out.push({ road: straight, dir, turn: 'straight', w: 0.6 });
      const east = get('h', i, j), west = get('h', i - 1, j);
      // Fahrtrichtung +z (Süden): rechts = Westen, links = Osten; -z (Norden): rechts = Osten, links = Westen
      if (dir > 0) { if (west) out.push({ road: west, dir: -1, turn: 'right', w: 0.2 }); if (east) out.push({ road: east, dir: 1, turn: 'left', w: 0.2 }); }
      else { if (east) out.push({ road: east, dir: 1, turn: 'right', w: 0.2 }); if (west) out.push({ road: west, dir: -1, turn: 'left', w: 0.2 }); }
    } else if (axis === 'h') {
      const i = dir > 0 ? gi + 1 : gi; // Kreuzungsspalte
      const j = gj;
      const straight = get('h', dir > 0 ? gi + 1 : gi - 1, j);
      if (straight) out.push({ road: straight, dir, turn: 'straight', w: 0.6 });
      const south = get('v', i, j), north = get('v', i, j - 1);
      // +x (Osten): rechts = Süden, links = Norden; -x (Westen): rechts = Norden, links = Süden
      if (dir > 0) { if (south) out.push({ road: south, dir: 1, turn: 'right', w: 0.2 }); if (north) out.push({ road: north, dir: -1, turn: 'left', w: 0.2 }); }
      else { if (north) out.push({ road: north, dir: -1, turn: 'right', w: 0.2 }); if (south) out.push({ road: south, dir: 1, turn: 'left', w: 0.2 }); }
    }
    return out;
  }

  /** Ampelzustand für ein Fahrzeug, das entlang von `road` in Richtung `dir` fährt. */
  signal(road, st) { return road.axis === 'h' ? st.E : st.N; }

  // ---------------------------------------------------------------- Erzeugen
  spawn(px, pz, pyaw) {
    const rnd = this.rnd;
    // zufälligen Abschnitt in 90..330 m Entfernung wählen, möglichst abseits des Sichtfeldes bevorzugt
    for (let tries = 0; tries < 12; tries++) {
      const ang = rnd() * Math.PI * 2, dist = 110 + rnd() * 230;
      const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
      const i = Math.floor(x / PITCH), j = Math.floor(z / PITCH);
      // dichteste Straße: wähle zufällig N–S oder O–W
      const axis = rnd() < 0.5 ? 'v' : 'h';
      let road = null;
      if (axis === 'v') {
        const ii = Math.round(x / PITCH);
        road = this.segMap.get(`v|${ii}|${Math.floor(z / PITCH)}`);
      } else {
        const jj = Math.round(z / PITCH);
        road = this.segMap.get(`h|${Math.floor(x / PITCH)}|${jj}`);
      }
      void i; void j;
      if (!road) continue;
      const dir = rnd() < 0.5 ? 1 : -1;
      const lane = Math.floor(rnd() * this.lanes(road));
      const len = Math.hypot(road.pts[1][0] - road.pts[0][0], road.pts[1][1] - road.pts[0][1]);
      const s = 12 + rnd() * Math.max(1, len - 40);
      const pt = this.lanePoint(road, dir, s, lane, {});
      // nicht nah am Spieler, nicht auf anderen Autos
      if (Math.hypot(pt.x - px, pt.z - pz) < 80) continue;
      if (this.cars.some((c) => Math.hypot(c.x - pt.x, c.z - pt.z) < 14)) continue;
      // Chunk muss geladen sein
      const cx = Math.floor(pt.x / 160), cz = Math.floor(pt.z / 160);
      if (!this.world.chunks.has(cx * 100003 + cz)) continue;
      const type = rnd() < 0.62 ? 'sedan' : rnd() < 0.55 ? 'suv' : rnd() < 0.5 ? 'van' : 'sport';
      const speedLimit = (ROAD[road.kind]?.speed ?? 14) * rnd.range(0.82, 1.05);
      const car = {
        id: this.nextId++, type, color: COLORS[Math.floor(rnd() * COLORS.length)], mode: 'lane', road, dir, lane, s,
        x: pt.x, z: pt.z, yaw: Math.atan2(-pt.uz, pt.ux), speed: speedLimit * 0.8, vmax: speedLimit, y: 0,
        vx: 0, vz: 0, w: 0, hull: { hl: this.meshes[type].dims.L / 2, hw: this.meshes[type].dims.W / 2, off: 0 }, m: type === 'van' ? 2400 : type === 'suv' ? 2100 : 1500, hitT: 0, conn: null,
      };
      this.cars.push(car);
      return car;
    }
    return null;
  }

  // ---------------------------------------------------------------- Aktualisieren
  update(dt, player, tod) {
    const st = this.world.trafficState();
    const px = player.vehicle.x, pz = player.vehicle.z;
    this.spawnTimer -= dt;
    if (this.cars.length < this.max && this.spawnTimer <= 0) { this.spawn(px, pz, player.vehicle.yaw); this.spawnTimer = 0.12; }
    const pf = player.vehicle.fwd;
    const pSpeed = Math.hypot(player.vehicle.u, player.vehicle.v);
    // Nachbarschaft: je Straße+Richtung+Spur sortierte Fahrzeuge
    const buckets = new Map();
    for (const c of this.cars) if (c.mode === 'lane') {
      const k = c.road.id * 8 + (c.dir > 0 ? 0 : 4) + c.lane;
      let a = buckets.get(k); if (!a) buckets.set(k, (a = [])); a.push(c);
    }
    for (const a of buckets.values()) a.sort((p, q) => p.s - q.s);

    for (let n = this.cars.length - 1; n >= 0; n--) {
      const c = this.cars[n];
      const dp = Math.hypot(c.x - px, c.z - pz);
      if (dp > 460 || c.dead) { this.cars.splice(n, 1); continue; }
      if (c.mode === 'free') {
        c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.w * dt;
        const k = Math.exp(-1.1 * dt); c.vx *= k; c.vz *= k; c.w *= Math.exp(-1.6 * dt);
        c.speed = Math.hypot(c.vx, c.vz); c.hitT += dt;
        if (c.hitT > 25 && dp > 90) c.dead = true;
        continue;
      }
      if (c.mode === 'lane') this.stepLane(c, dt, st, buckets, player, pSpeed, pf);
      else this.stepTurn(c, dt, st);
    }
    this.syncMeshes(tod);
    // Klangquellen: nächste Fahrzeuge
    const near = this.cars.filter((c) => Math.hypot(c.x - px, c.z - pz) < 90).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 5);
    const pv = player.vehicle.worldVelocity();
    this.sound = near.map((c) => {
      const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz) || 1;
      const cvx = Math.cos(c.yaw) * c.speed, cvz = -Math.sin(c.yaw) * c.speed;
      const closing = -(((cvx - pv[0]) * dx + (cvz - pv[1]) * dz) / d);
      return { id: c.id, x: c.x, z: c.z, speed: c.speed, closing };
    });
  }

  stepLane(c, dt, st, buckets, player, pSpeed, pf) {
    const road = c.road;
    const len = Math.hypot(road.pts[1][0] - road.pts[0][0], road.pts[1][1] - road.pts[0][1]);
    // Zielgeschwindigkeit
    let target = c.vmax;
    // Vordermann
    const arr = buckets.get(road.id * 8 + (c.dir > 0 ? 0 : 4) + c.lane);
    if (arr) {
      const i = arr.indexOf(c);
      const lead = arr[i + 1];
      if (lead) {
        const gap = lead.s - c.s - (lead.hull.hl + c.hull.hl);
        const safe = 3 + c.speed * 1.4;
        if (gap < safe) target = Math.min(target, Math.max(0, lead.speed * (gap / safe) - (gap < 2 ? 2 : 0)));
        if (gap < 1.2) target = 0;
      }
    }
    // Ampel am Ende des Abschnitts
    const stopS = len - 5.8 - c.hull.hl;
    const distStop = stopS - c.s;
    const sig = this.signal(road, st);
    const hasNext = this.nextSegments(road, c.dir).length > 0;
    if (!hasNext && distStop < 40) target = Math.min(target, Math.max(0, distStop - 2) * 0.5 + 0.5); // Sackgasse
    if (sig !== 'g' && distStop > -1 && distStop < 6 + c.speed * c.speed / 7) {
      if (!(sig === 'y' && distStop < c.speed * 0.5)) target = Math.min(target, Math.max(0, distStop) * 0.9);
    }
    // Spieler voraus
    const rx = player.vehicle.x - c.x, rz = player.vehicle.z - c.z;
    const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
    const df = rx * fx + rz * fz, dl = Math.abs(-rx * fz + rz * fx);
    if (df > 0 && df < 12 + c.speed * 1.2 && dl < 2.4) target = Math.min(target, Math.max(0, df - 7) * 0.6);
    // Beschleunigen / Bremsen
    const acc = target > c.speed ? 2.6 : -7.5;
    c.speed = clamp(c.speed + clamp((target - c.speed) * 1.6, -7.5, 2.6) * dt, 0, c.vmax * 1.1);
    void acc;
    c.s += c.speed * dt;
    if (c.s >= len - c.hull.hl - 0.2) {
      // Abschnittsende: abbiegen oder Sackgasse
      const opts = this.nextSegments(road, c.dir);
      if (!opts.length) { c.dead = true; return; }
      let r = this.rnd() * opts.reduce((s, o) => s + o.w, 0), pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
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
      c.conn = { p0: from, p1: [cxp, czp], p2: to, len: clen, t: 0, next: pick, lane: toLane };
      c.mode = 'turn';
      c.vmax = Math.min(c.vmax, (ROAD[pick.road.kind]?.speed ?? 14) * 0.95);
      this.stepTurn(c, 0, st);
      return;
    }
    const pt = this.lanePoint(road, c.dir, c.s, c.lane, {});
    c.x = pt.x; c.z = pt.z; c.yaw = Math.atan2(-pt.uz, pt.ux);
    const dir = Math.atan2(-pt.uz, pt.ux);
    c.yaw = dir;
  }

  stepTurn(c, dt, st) {
    const k = c.conn;
    const turning = k.next.turn !== 'straight';
    const target = Math.min(c.vmax, turning ? 6.5 : c.vmax);
    c.speed = clamp(c.speed + clamp((target - c.speed) * 2, -6, 2.6) * dt, 2, 30);
    k.t = Math.min(1, k.t + (c.speed * dt) / k.len);
    const t = k.t, u = 1 - t;
    const x = u * u * k.p0.x + 2 * u * t * k.p1[0] + t * t * k.p2.x, z = u * u * k.p0.z + 2 * u * t * k.p1[1] + t * t * k.p2.z;
    const dx = 2 * u * (k.p1[0] - k.p0.x) + 2 * t * (k.p2.x - k.p1[0]), dz = 2 * u * (k.p1[1] - k.p0.z) + 2 * t * (k.p2.z - k.p1[1]);
    c.x = x; c.z = z; c.yaw = Math.atan2(-dz, dx);
    if (k.t >= 1) {
      c.mode = 'lane'; c.road = k.next.road; c.dir = k.next.dir; c.lane = k.lane; c.s = 0.01;
      c.conn = null;
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
      if (i >= 90) continue;
      this.tmpQ.setFromAxisAngle(this.axisY, c.yaw);
      this.tmpV.set(c.x, c.y, c.z);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      M.body.setMatrixAt(i, this.tmpM); M.lights.setMatrixAt(i, this.tmpM);
      this.tmpC.setHex(c.color); M.body.setColorAt(i, this.tmpC);
    }
    for (const t of this.types) {
      const M = this.meshes[t];
      M.body.count = M.lights.count = idx[t];
      M.body.instanceMatrix.needsUpdate = true; M.lights.instanceMatrix.needsUpdate = true;
      if (M.body.instanceColor) M.body.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- Kollision mit dem Spieler
  collide(vehicle, hull, impacts) {
    for (const c of this.cars) {
      if (Math.abs(c.x - vehicle.x) > 9 || Math.abs(c.z - vehicle.z) > 9) continue;
      if (c.mode !== 'free') { c.vx = Math.cos(c.yaw) * c.speed; c.vz = -Math.sin(c.yaw) * c.speed; c.w = 0; }
      const r = collideWithBody(vehicle, hull, c);
      if (r && r.speed > 0.2) {
        if (c.mode !== 'free') { c.mode = 'free'; c.hitT = 0; }
        impacts.push({ speed: r.speed, px: r.px, pz: r.pz, nx: r.nx, nz: r.nz, tag: 'car' });
      } else if (c.mode !== 'free') { /* keine Berührung: AI behält die Kontrolle */ }
    }
  }

  dispose() {
    for (const t of this.types) { const M = this.meshes[t]; this.scene.remove(M.body, M.lights); M.body.dispose(); M.lights.dispose(); }
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
