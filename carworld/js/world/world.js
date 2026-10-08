// Die Spielwelt: Materialien, Chunk-Streaming, Boden-/Hindernisabfragen, Tageszeit-Effekte (Lampen, Fenster, Ampeln).

import * as THREE from 'three';
import { SpatialGrid } from '../physics/collision.js';
import { makeLayout, CHUNK, SEA_Y, baseTerrain } from './layout.js';
import { ChunkBuilder } from './chunk.js';
import { buildStructures } from './structures.js';
import * as TX from './textures.js';
import { clamp, smoothstep, lerp } from '../util.js';

const lineAt = (width, m) => 0.5 + m / width;

function roadSet() {
  const mk = (width, lines, seed, lenM = 18) => TX.roadTextures({ widthM: width, lines, lenM, seed });
  const Y = '#e2b32a', Wt = '#e9e9e4';
  const out = {};
  // Straße 16 m: 2 Fahrspuren je Richtung
  out.street = mk(16, [
    { u: lineAt(16, -0.14), color: Y, w: 0.13 }, { u: lineAt(16, 0.14), color: Y, w: 0.13 },
    { u: lineAt(16, -3.6), color: Wt, w: 0.13, dash: [3, 6] }, { u: lineAt(16, 3.6), color: Wt, w: 0.13, dash: [3, 6] },
    { u: lineAt(16, -7.2), color: Wt, w: 0.16 }, { u: lineAt(16, 7.2), color: Wt, w: 0.16 },
  ], 11);
  // Allee 28 m: Mittelstreifen (3 m) wird separat gebaut; 3 Fahrspuren je Richtung
  out.avenue = mk(28, [
    { u: lineAt(28, -4.9), color: Wt, w: 0.13, dash: [3, 6] }, { u: lineAt(28, 4.9), color: Wt, w: 0.13, dash: [3, 6] },
    { u: lineAt(28, -8.3), color: Wt, w: 0.13, dash: [3, 6] }, { u: lineAt(28, 8.3), color: Wt, w: 0.13, dash: [3, 6] },
    { u: lineAt(28, -11.7), color: Wt, w: 0.18 }, { u: lineAt(28, 11.7), color: Wt, w: 0.18 },
    { u: lineAt(28, -1.55), color: Y, w: 0.13 }, { u: lineAt(28, 1.55), color: Y, w: 0.13 },
  ], 12);
  out.highway = mk(26, [
    { u: lineAt(26, -0.14), color: Y, w: 0.14 }, { u: lineAt(26, 0.14), color: Y, w: 0.14 },
    { u: lineAt(26, -4.8), color: Wt, w: 0.14, dash: [3, 9] }, { u: lineAt(26, 4.8), color: Wt, w: 0.14, dash: [3, 9] },
    { u: lineAt(26, -8.4), color: Wt, w: 0.14, dash: [3, 9] }, { u: lineAt(26, 8.4), color: Wt, w: 0.14, dash: [3, 9] },
    { u: lineAt(26, -11.7), color: Wt, w: 0.2 }, { u: lineAt(26, 11.7), color: Wt, w: 0.2 },
  ], 13, 24);
  out.freeway = mk(24, [
    { u: lineAt(24, -0.4), color: Y, w: 0.14 }, { u: lineAt(24, 0.4), color: Y, w: 0.14 },
    { u: lineAt(24, -4.1), color: Wt, w: 0.14, dash: [3, 9] }, { u: lineAt(24, 4.1), color: Wt, w: 0.14, dash: [3, 9] },
    { u: lineAt(24, -7.7), color: Wt, w: 0.14, dash: [3, 9] }, { u: lineAt(24, 7.7), color: Wt, w: 0.14, dash: [3, 9] },
    { u: lineAt(24, -11.2), color: Wt, w: 0.22 }, { u: lineAt(24, 11.2), color: Wt, w: 0.22 },
  ], 16, 24);
  out.hill = mk(10, [
    { u: lineAt(10, -0.12), color: Y, w: 0.12 }, { u: lineAt(10, 0.12), color: Y, w: 0.12 },
    { u: lineAt(10, -4.5), color: Wt, w: 0.14 }, { u: lineAt(10, 4.5), color: Wt, w: 0.14 },
  ], 14);
  out.plain = TX.roadTextures({ widthM: 18, lines: [], lenM: 18, seed: 15, plain: true });
  return out;
}

export function makeMaterials(opts = {}) {
  const roads = roadSet();
  const M = {};
  M.rStreet = TX.roadMaterial(roads.street); M.rAvenue = TX.roadMaterial(roads.avenue); M.rHighway = TX.roadMaterial(roads.highway);
  M.rHill = TX.roadMaterial(roads.hill); M.rPlain = TX.roadMaterial(roads.plain); M.rFreeway = TX.roadMaterial(roads.freeway);
  M.tunLamp = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.6, 2.3, 1.8) });
  M.roadLen = { street: 18, avenue: 18, highway: 24, hill: 18, freeway: 24, ramp: 18 };
  for (const k of ['rStreet', 'rAvenue', 'rHighway', 'rFreeway', 'rHill', 'rPlain']) { M[k].polygonOffset = true; M[k].polygonOffsetFactor = -1; M[k].polygonOffsetUnits = -1; }
  const det = TX.terrainDetail();
  M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: det.map, normalMap: det.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, metalness: 0, envMapIntensity: 0.6 });
  M.walk = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.concreteTexture({ tile: 4 }), roughness: 0.82, envMapIntensity: 0.7 });
  M.grass = new THREE.MeshStandardMaterial({ vertexColors: true, map: det.map, roughness: 0.95, envMapIntensity: 0.4 });
  M.marks = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexColors: true });
  M.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.8 });
  const frond = TX.palmFrondTexture();
  M.palm = new THREE.MeshStandardMaterial({ vertexColors: true, map: frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.5 });
  M.lamp = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1) });
  const fac = (style) => { const t = TX.facadeTextures({ style, cols: { glass: 6, office: 8, apartment: 6, villa: 4, industrial: 5 }[style], rows: { glass: 8, office: 8, apartment: 6, villa: 4, industrial: 3 }[style], seed: 3 + style.length }); const m = TX.facadeMaterial(t, { style }); m.userData.tex = t; return m; };
  M.glass = fac('glass'); M.office = fac('office'); M.apartment = fac('apartment'); M.villa = fac('villa'); M.industrial = fac('industrial');
  M.win = new THREE.MeshStandardMaterial({ color: 0x0c1a22, emissive: new THREE.Color(1.0, 0.72, 0.4), emissiveIntensity: 0, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.6 });
  M.pool = new THREE.MeshStandardMaterial({ color: 0x1f8fb0, emissive: new THREE.Color(0.1, 0.7, 0.9), emissiveIntensity: 0.0, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.5 });
  for (const ax of ['N', 'E']) for (const c of ['r', 'y', 'g']) M['tl' + ax + c] = new THREE.MeshBasicMaterial({ color: 0x000000 });
  M.waterNormal = TX.waterNormal();
  return M;
}

const TL = { r: [3.2, 0.25, 0.2], y: [3.2, 2.0, 0.2], g: [0.2, 3.0, 0.8], off: [0.05, 0.05, 0.05] };

export class World {
  constructor(scene, { seed = 7, quality = 'high' } = {}) {
    this.scene = scene;
    this.layout = makeLayout(seed);
    this.grid = new SpatialGrid(16);
    this.stripGrid = new SpatialGrid(16);
    this.mats = makeMaterials();
    this.builder = new ChunkBuilder(this);
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.radius = { low: 5, medium: 7, high: 9, ultra: 11 }[quality] || 8;
    this.lamps = []; // Positionen der aktuell geladenen Laternen
    this.time = 0;
    this.lightsLevel = 0;
    this.extras = buildStructures;
    this._scratch = [];
    this._buildStat = { n: 0, ms: 0 };

    // Meer: riesige Ebene, folgt der Kamera
    const wg = new THREE.PlaneGeometry(40000, 40000, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const nm = this.mats.waterNormal;
    nm.repeat.set(3000, 3000);
    this.water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: 0x0b3b4a, roughness: 0.06, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.6,
    }));
    this.water.position.y = SEA_Y;
    this.water.renderOrder = -1;
    scene.add(this.water);
  }

  setQuality(q) { this.radius = { low: 5, medium: 7, high: 9, ultra: 11 }[q] || 8; }

  // ------------------------------------------------------------------ Höhen
  terrainHeight(x, z) { return this.layout.terrain(x, z); }

  addStrip(s) {
    // Achsenparallel (x0,z0,x1,z1,y) oder gedreht/geneigt (cx,cz,hx,hz,yaw,y0,y1)
    if (s.x0 !== undefined) {
      const o = this.stripGrid.addBox((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, Math.abs(s.x1 - s.x0) / 2, Math.abs(s.z1 - s.z0) / 2, 0, -1e3, 1e3, { y0: s.y, y1: s.y });
      return o;
    }
    return this.stripGrid.addBox(s.cx, s.cz, s.hx, s.hz, s.yaw || 0, -1e3, 1e3, { y0: s.y0, y1: s.y1 });
  }

  /**
   * Höhe der befahrbaren Fläche bei (x,z): die höchste Fläche, die nicht mehr als `step` über `hint` liegt.
   * (Brücken über uns und Gelände über Tunneln werden so ignoriert.)
   */
  height(x, z, hint = Infinity, step = 0.7) {
    const lim = hint + step;
    let best = -Infinity, lowest = Infinity;
    const t = this.terrainHeight(x, z);
    if (t <= lim) best = t;
    lowest = t;
    const arr = this.stripGrid.query(x, z, 0.01, this._scratch);
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      const dx = x - o.cx, dz = z - o.cz;
      const lx = dx * o.cs - dz * o.sn, lz = -dx * o.sn - dz * o.cs; // lokale Koordinaten (f,l)
      if (Math.abs(lx) > o.hx || Math.abs(lz) > o.hz) continue;
      const tag = o.tag;
      const y = tag.y0 === tag.y1 ? tag.y0 : lerp(tag.y0, tag.y1, (lx + o.hx) / (2 * o.hx));
      if (y < lowest) lowest = y;
      if (y <= lim && y > best) best = y;
    }
    return best === -Infinity ? lowest : best;
  }

  // ------------------------------------------------------------------ Streaming
  _key(cx, cz) { return cx * 100003 + cz; }

  _load(cx, cz) {
    const t0 = performance.now();
    const ch = this.builder.build(cx, cz);
    this.group.add(ch.group);
    this.chunks.set(this._key(cx, cz), ch);
    for (const l of ch.lamps) this.lamps.push(l);
    this._buildStat.n++; this._buildStat.ms += performance.now() - t0;
    return ch;
  }

  _unload(ch) {
    this.group.remove(ch.group);
    ch.dispose();
    for (const o of ch.colliders) this.grid.remove(o);
    for (const o of ch.strips) this.stripGrid.remove(o);
    const set = new Set(ch.lamps);
    this.lamps = this.lamps.filter((l) => !set.has(l));
    this.chunks.delete(this._key(ch.cx, ch.cz));
  }

  /** Pro Frame aufrufen: lädt fehlende Chunks (zeitbegrenzt) und entfernt entfernte. */
  update(px, pz, budgetMs = 5) {
    const cx0 = Math.floor(px / CHUNK), cz0 = Math.floor(pz / CHUNK);
    const R = this.radius;
    const t0 = performance.now();
    // fehlende Chunks, nach Abstand sortiert
    const need = [];
    for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) {
      const d = Math.hypot(a, c);
      if (d > R + 0.01) continue;
      if (this.chunks.has(this._key(cx0 + a, cz0 + c))) continue;
      need.push([d, cx0 + a, cz0 + c]);
    }
    need.sort((p, q) => p[0] - q[0]);
    let built = 0;
    for (const [d, cx, cz] of need) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      this._load(cx, cz);
      built++;
    }
    // Entladen
    for (const ch of [...this.chunks.values()]) {
      if (Math.hypot(ch.cx - cx0, ch.cz - cz0) > R + 1.6) this._unload(ch);
    }
    return need.length - built;
  }

  /** Lädt synchron/asynchron alles rund um einen Punkt (Spielstart, Teleport). */
  async preload(px, pz, radiusChunks = 3, onProgress = null) {
    const cx0 = Math.floor(px / CHUNK), cz0 = Math.floor(pz / CHUNK);
    const list = [];
    for (let a = -radiusChunks; a <= radiusChunks; a++) for (let c = -radiusChunks; c <= radiusChunks; c++) {
      if (Math.hypot(a, c) <= radiusChunks + 0.01 && !this.chunks.has(this._key(cx0 + a, cz0 + c))) list.push([Math.hypot(a, c), cx0 + a, cz0 + c]);
    }
    list.sort((p, q) => p[0] - q[0]);
    let t = performance.now();
    for (let i = 0; i < list.length; i++) {
      this._load(list[i][1], list[i][2]);
      if (performance.now() - t > 14) { onProgress?.(i / list.length); await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
    }
    onProgress?.(1);
  }

  // ------------------------------------------------------------------ Tageszeit / Ampeln
  /** state der Ampeln für Nord-Süd ('N') und Ost-West ('E') zur Zeit t. */
  trafficState(t = this.time) {
    const p = ((t % 40) + 40) % 40;
    // N grün 0-14, gelb 14-17, rot ab 17; E grün 20-34, gelb 34-37, rot sonst
    const N = p < 14 ? 'g' : p < 17 ? 'y' : 'r';
    const E = p >= 20 && p < 34 ? 'g' : p >= 34 && p < 37 ? 'y' : 'r';
    return { N, E };
  }

  setTimeOfDay(params, dt, camPos) {
    this.time += dt;
    const L = params.lights;
    this.lightsLevel = L;
    const M = this.mats;
    const winI = 0.01 + L * L * 1.7; // Fenster leuchten erst zur Dämmerung kräftig
    for (const k of ['glass', 'office', 'apartment', 'villa', 'industrial']) M[k].emissiveIntensity = winI * (k === 'villa' ? 1.3 : 1.0);
    M.win.emissiveIntensity = 0.02 + L * L * 2.0;
    M.pool.emissiveIntensity = L * 1.6;
    const lamp = 0.12 + L * 1.8;
    M.lamp.color.setRGB(lamp * 1.6, lamp * 1.25, lamp * 0.8);
    const st = this.trafficState();
    for (const ax of ['N', 'E']) {
      const s = st[ax];
      for (const c of ['r', 'y', 'g']) {
        const on = s === c;
        const v = on ? TL[c] : TL.off;
        M['tl' + ax + c].color.setRGB(v[0], v[1], v[2]);
      }
    }
    if (camPos) this.water.position.set(camPos.x, SEA_Y, camPos.z);
    const wn = M.waterNormal;
    wn.offset.x = (this.time * 0.0009) % 1;
    wn.offset.y = (this.time * 0.0006) % 1;
  }

  /** Nächste Laternen (für Punktlichter bei Dämmerung). */
  nearestLamps(x, z, n = 8, out = []) {
    out.length = 0;
    const arr = this.lamps;
    for (let i = 0; i < arr.length; i++) {
      const dx = arr[i][0] - x, dz = arr[i][2] - z;
      const d = dx * dx + dz * dz;
      if (d > 120 * 120) continue;
      if (out.length < n) { out.push([d, arr[i]]); out.sort((a, b) => a[0] - b[0]); }
      else if (d < out[out.length - 1][0]) { out[out.length - 1] = [d, arr[i]]; out.sort((a, b) => a[0] - b[0]); }
    }
    return out;
  }
}
