// Baut aus einer Fahrzeugdefinition (Loft, Masken, Räder, Zusatzteile) ein fahrbares 3D-Modell.

import * as THREE from 'three';
import { Loft } from './loft.js';
import { paintMaterial, glassMaterial, innerShellMaterial, matBlackMatte, paintTracker } from '../materials.js';
import { buildWheel, latheZ } from './parts.js';
import { clamp, lerp } from '../util.js';

export const PAINTS = {
  ref: { label: 'Referenz: Schwarz, rotes Perl', color: 0x0a0a0c, metal: 0.9, rough: 0.3, sheen: 0.35, sheenColor: 0x4d0905, flake: 0xff2210, flakeDensity: 0.06, sw: '#0b0b0d' },
  matte: { label: 'Mattschwarz', color: 0x0c0c0d, metal: 0.4, rough: 0.62, cc: 0.35, sheen: 0.1, sheenColor: 0x1a0a08, flake: 0x552211, flakeDensity: 0.0, sw: '#1a1a1c' },
  anthracite: { label: 'Anthrazit Metallic', color: 0x2b2e34, metal: 0.95, rough: 0.28, sheen: 0.2, sheenColor: 0x303a46, flake: 0x9fb4cc, flakeDensity: 0.1, sw: '#3a3d44' },
  navy: { label: 'Nachtblau Perl', color: 0x0a1230, metal: 0.9, rough: 0.28, sheen: 0.5, sheenColor: 0x1c3a8c, flake: 0x3a6cff, flakeDensity: 0.1, sw: '#12214f' },
  white: { label: 'Perlweiß', color: 0xdedbd2, metal: 0.55, rough: 0.28, sheen: 0.4, sheenColor: 0xfff4e0, flake: 0xfff0d0, flakeDensity: 0.08, sw: '#e6e2d8' },
  burgundy: { label: 'Burgund', color: 0x2a0509, metal: 0.9, rough: 0.28, sheen: 0.5, sheenColor: 0x8c1020, flake: 0xff4a3a, flakeDensity: 0.1, sw: '#3a0a10' },
};
export const RIMS = {
  ref: { label: 'Schwarz glänzend (Referenz)', color: 0x040405, metal: 0.9, rough: 0.22, sw: '#050506' },
  anthracite: { label: 'Anthrazit', color: 0x2a2c31, metal: 1.0, rough: 0.28, sw: '#3a3d44' },
  silver: { label: 'Silber', color: 0xb8bcc2, metal: 1.0, rough: 0.2, sw: '#b8bcc2' },
  bronze: { label: 'Bronze', color: 0x7a5a36, metal: 1.0, rough: 0.28, sw: '#7a5a36' },
  chrome: { label: 'Chrom', color: 0xe4e6ea, metal: 1.0, rough: 0.06, sw: '#e4e6ea' },
  gold: { label: 'Gold', color: 0xc9a24a, metal: 1.0, rough: 0.16, sw: '#c9a24a' },
};

/**
 * def: {
 *   id, name,
 *   dims: { wheelbase, trackF, trackR, length, width, height, cgX },
 *   loft: Loft-Spezifikation,
 *   masks: [...],                    Fenster / Öffnungen / Türen (siehe materials.js)
 *   wheels: { front: {...}, rear: {...}, archR, archY },
 *   extras(ctx)                      baut Zusatzteile (Grill, Lichter, Bodykit ...)
 * }
 */
export function assembleCar(def, opts = {}) {
  const root = new THREE.Group();
  root.name = def.id;
  const pivot = new THREE.Group();
  const body = new THREE.Group();
  root.add(pivot);
  pivot.add(body);

  const d = def.dims;
  const axF = d.wheelbase / 2, axR = -d.wheelbase / 2;
  const loft = new Loft(def.loft);
  const geo = loft.build();

  // ---- Masken: Fenster/Türen aus der Definition + automatisch Radhäuser
  const masks = [...(def.masks || [])];
  const wf = def.wheels.front, wr = def.wheels.rear;
  const archR = def.wheels.archR ?? wf.tireR + 0.07;
  const archs = [[axF, wf.tireR], [axR, wr.tireR]];
  for (const [ax, tr] of archs) {
    masks.push({ kind: 'hole', plane: 'side', circle: [ax, def.wheels.archY ?? tr, archR + (ax < 0 ? 0.01 : 0)], thr: 0.12 });
    masks.push({ kind: 'hole', plane: 'top', nsign: -1, thr: 0.25, pts: [ax - archR, 0.48, ax + archR, 0.48, ax + archR, 1.4, ax - archR, 1.4] });
  }
  const hasDoors = masks.some((m) => m.kind === 'door');
  const maskKey = def.id;

  // ---- Materialien (Lackmaterialien werden für die Garage gesammelt)
  const paints = [];
  paintTracker.list = paints;
  const mats = {
    paint: paintMaterial({ masks, doors: hasDoors, maskKey, color: def.paintColor }),
    glass: glassMaterial({ masks, doors: hasDoors, maskKey }),
    shell: innerShellMaterial({ masks, doors: hasDoors, maskKey, color: def.shellColor }),
  };
  const paint = new THREE.Mesh(geo, mats.paint);
  const glass = new THREE.Mesh(geo, mats.glass);
  const shell = new THREE.Mesh(geo, mats.shell);
  paint.castShadow = true; paint.receiveShadow = true;
  glass.renderOrder = 2;
  shell.castShadow = false;
  body.add(paint, shell, glass);

  // ---- Radhaus-Verkleidung (schwarz, matt) hinter den Rädern
  const linerMat = matBlackMatte();
  linerMat.side = THREE.DoubleSide;
  for (const [ax, w, tr] of [[axF, wf, wf.tireR], [axR, wr, wr.tireR]]) {
    for (const s of [1, -1]) {
      const tz = (ax > 0 ? d.trackF : d.trackR) / 2;
      const prof = [[archR - 0.012, tz - w.tireW / 2 - 0.26], [archR - 0.012, tz + w.tireW / 2 + 0.015]];
      const m = new THREE.Mesh(latheZ(prof, 40, Math.PI / 2 - 0.3, Math.PI + 0.6), linerMat);
      m.position.set(ax, def.wheels.archY ?? tr, 0);
      if (s < 0) m.scale.z = -1;
      body.add(m);
    }
  }
  // Unterboden
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(d.length * 0.92, d.width * 0.7), matBlackMatte());
  floor.rotation.x = Math.PI / 2; floor.position.set(0, 0.12, 0);
  body.add(floor);

  // ---- Räder (an der Wurzel, nicht an der Karosserie: bleiben beim Nicken/Wanken am Boden)
  const wheels = [];
  const wheelDefs = [
    { x: axF, z: d.trackF / 2, o: wf, front: true, side: -1 }, // vorne links (z negativ = links im Modell? siehe unten)
    { x: axF, z: -d.trackF / 2, o: wf, front: true, side: 1 },
    { x: axR, z: d.trackR / 2, o: wr, front: false, side: -1 },
    { x: axR, z: -d.trackR / 2, o: wr, front: false, side: 1 },
  ];
  // Modell: +z = rechts. Reihenfolge der Physik: 0 VL, 1 VR, 2 HL, 3 HR.
  const order = [
    { x: axF, z: -d.trackF / 2, o: wf, front: true, left: true },
    { x: axF, z: d.trackF / 2, o: wf, front: true, left: false },
    { x: axR, z: -d.trackR / 2, o: wr, front: false, left: true },
    { x: axR, z: d.trackR / 2, o: wr, front: false, left: false },
  ];
  void wheelDefs;
  for (const wd of order) {
    const steer = new THREE.Group();
    steer.position.set(wd.x, wd.o.tireR, wd.z);
    const wheel = buildWheel({ ...wd.o, caliper: wd.o.caliper && { ...wd.o.caliper, angle: (wd.o.caliper.angle ?? -0.5) } });
    if (wd.left) wheel.rotation.y = Math.PI; // Schauseite nach außen (-z)
    steer.add(wheel);
    root.add(steer);
    wheels.push({ steer, wheel, spin: wheel.userData.spin, blur: wheel.userData.blur, left: wd.left, front: wd.front, baseY: wd.o.tireR, spokes: wheel.userData.spokes });
  }

  // ---- Lichter (vom Auto selbst gefüllt)
  const lights = { head: [], tail: [], brake: [], reverse: [], extra: [] };
  const spots = [];

  const kitSet = new Set();
  const ctx = { root, body, pivot, loft, def, mats, THREE, lights, spots, wheels, masks, dims: d,
    proj: { side: (s) => loft.projSide(s), top: () => loft.projTop(), front: () => loft.projFront(), rear: () => loft.projRear() },
    add: (obj, o = {}) => {
      body.add(obj);
      obj.traverse?.((m) => { if (m.isMesh) { m.castShadow = o.shadow ?? true; m.receiveShadow = o.receive ?? false; } });
      if (o.kit) { obj.userData.kit = o.kit; kitSet.add(o.kit); }
      return obj;
    } };
  ctx.interior = null;
  def.extras?.(ctx);
  paintTracker.list = null;
  if (ctx.interior) body.add(ctx.interior);

  // Scheinwerfer-Lichtkegel (nachts)
  const hs = def.headlightPos || { x: d.length / 2 - 0.3, y: 0.62, z: 0.62 };
  for (const s of [-1, 1]) {
    const sp = new THREE.SpotLight(0xfff0d8, 0, 70, 0.5, 0.65, 1.4);
    sp.position.set(hs.x, hs.y, s * hs.z);
    sp.target.position.set(hs.x + 20, 0.2, s * hs.z * 0.9);
    root.add(sp, sp.target);
    spots.push(sp);
  }

  const model = {
    paints, kitSet,
    id: def.id, name: def.name, root, body, pivot, loft, wheels, mats, lights, spots, dims: d, def, ctx,
    cgX: d.cgX ?? 0,
    get interior() { return ctx.interior; },
    /** Zustand der Physik -> Optik */
    update(v, dt = 0.016) {
      const maxSteer = v.steerAngle;
      for (let i = 0; i < 4; i++) {
        const w = wheels[i];
        if (w.front) w.steer.rotation.y = i === 0 ? v._steerL ?? maxSteer : v._steerR ?? maxSteer;
        const ang = v.spin[i];
        w.spin.rotation.z = w.left ? ang : -ang;
        w.steer.position.y = w.baseY + clamp(-v.travel[i], -0.08, 0.08) * 0.0;
        // Unschärfe: ab ca. 25 rad/s blendet die Scheibe ein, Speichen verschwinden
        const om = Math.abs(v.omega[i]);
        const k = clamp((om - 22) / 26, 0, 1);
        w.blur.visible = k > 0.02;
        w.blur.material.opacity = k * 0.92;
        if (w.spokes) w.spokes.visible = k < 0.98;
      }
      if (ctx.interior) ctx.interior.userData.steer.rotation.x = -v.steerAngle * 9;
      const heave = clamp((v.travel[0] + v.travel[1] + v.travel[2] + v.travel[3]) / 4, -0.05, 0.05);
      pivot.position.set(d.cgX ?? 0, 0.45, 0);
      body.position.set(-(d.cgX ?? 0), -0.45 - heave, 0);
      pivot.rotation.z = clamp(v.pitch, -0.12, 0.12);
      pivot.rotation.x = clamp(v.roll, -0.16, 0.16);
    },
    setLights({ head = 0, brake = 0, reverse = 0 } = {}) {
      for (const m of lights.head) m.userData.setLevel(1.1 + head * 2.4); // Tagfahrlicht immer an, Abblendlicht nachts heller
      for (const m of lights.tail) m.userData.setLevel(0.25 + head * 0.9 + brake * 1.6);
      for (const m of lights.reverse) m.userData.setLevel(reverse * 2);
      for (const s of spots) s.intensity = head * 55;
    },
  };
  /** Garage: Lack ändern (Standard 'ref' = Referenzlack mit rotem Perleffekt). */
  model.setPaint = (id) => {
    const P = PAINTS[id] || PAINTS.ref;
    for (const m of paints) {
      m.color.set(P.color); m.metalness = P.metal; m.roughness = P.rough; m.clearcoatRoughness = P.cc ?? 0.025;
      m.sheen = P.sheen; m.sheenColor.set(P.sheenColor);
      if (m.userData.flakeU) { m.userData.flakeU.uFlakeColor.value.set(P.flake); m.userData.flakeU.uFlakeDensity.value = P.flakeDensity; }
    }
    model.paintId = id;
  };
  model.setRim = (id) => {
    const R = RIMS[id] || RIMS.ref;
    for (const w of wheels) {
      const m = w.spokes?.material;
      if (!m) continue;
      m.color.set(R.color); m.metalness = R.metal; m.roughness = R.rough;
    }
    model.rimId = id;
  };
  model.setKit = (name, on) => body.traverse((o) => { if (o.userData.kit === name) o.visible = on; });
  model.paintId = 'ref'; model.rimId = 'ref';
  model.setLights({});
  return model;
}
