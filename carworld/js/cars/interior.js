// Innenraum: Armaturenbrett, Lenkrad, Sitze, Mittelkonsole. Für den G 63 komplett in Tiffany Blue (Leder mit Rautensteppung).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture, diamondQuilt, leatherGrain, carbonMaterial, matBlackGloss, matChrome, emblemTexture } from '../materials.js';
import { clamp } from '../util.js';

const rb = (w, h, d, r = 0.02, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

/** Tiffany-Blau (Referenz: Bild 3, ca. #0abab5 im Licht, Albedo etwas dunkler). */
export const TIFFANY = 0x13b9b0;

export function leatherMaterial({ color = 0x0b0b0c, quilt = false, thread = '#c9d2d8', rough = 0.52, repeat = [1, 1] } = {}) {
  const grain = leatherGrain(256);
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: 0, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).multiplyScalar(1.6),
    clearcoat: 0.15, clearcoatRoughness: 0.5, normalMap: grain, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.9,
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(repeat[0] * 6, repeat[1] * 6);
  if (quilt) {
    const q = diamondQuilt({ color: '#' + new THREE.Color(color).getHexString(), thread, cells: 5 });
    m.map = q.map; m.normalMap = q.normal; m.normalScale = new THREE.Vector2(1.1, 1.1); m.color = new THREE.Color(0xffffff);
    for (const t of [q.map, q.normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  }
  return m;
}

/** Instrumentenanzeige als kleine Canvas-Textur (wird im Cockpit live neu gezeichnet). */
export function makeCluster(accent = '#ff3a2a') {
  const c = canvas(512, 192), g = c.getContext('2d');
  const tex = canvasTexture(c);
  const draw = (speedKmh, rpmFrac, gearLabel, ev = false) => {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 192);
    const dial = (cx, frac, label, max, tick) => {
      g.strokeStyle = '#2a3340'; g.lineWidth = 8; g.beginPath(); g.arc(cx, 100, 70, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      g.strokeStyle = accent; g.lineWidth = 8; g.beginPath(); g.arc(cx, 100, 70, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * clamp(frac, 0, 1))); g.stroke();
      g.fillStyle = '#dfe6ee'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText(label, cx, 112);
      g.font = '16px Arial'; g.fillStyle = '#7f8b99'; g.fillText(tick, cx, 140);
    };
    dial(128, rpmFrac, ev ? Math.round(rpmFrac * 100) + '%' : String(Math.round(rpmFrac * 8)), 8, ev ? 'POWER' : 'x1000 rpm');
    dial(384, speedKmh / 320, String(Math.round(speedKmh)), 320, 'km/h');
    g.fillStyle = accent; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText(gearLabel, 256, 110);
    tex.needsUpdate = true;
  };
  draw(0, 0, 'P');
  return { texture: tex, draw };
}

/**
 * spec: {
 *   leather, accent (Hex), quilt (bool), thread, dash: { x, y, w, depth, h }, seat: { x, z, y },
 *   wheel: { x, y, z, r, tilt }, floorY, rear (bool), carbon (bool), emblem ('star'|'rings'|'roundel')
 * }
 */
export function buildInterior(spec) {
  const g = new THREE.Group();
  const lea = leatherMaterial({ color: spec.leather ?? 0x0c0c0d, quilt: false });
  const leaQ = leatherMaterial({ color: spec.leather ?? 0x0c0c0d, quilt: !!spec.quilt, thread: spec.thread, repeat: [1.2, 1.2] });
  const dashMat = leatherMaterial({ color: spec.dashColor ?? spec.leather ?? 0x0c0c0d, rough: 0.6 });
  const trim = spec.carbon ? carbonMaterial({ repeat: 3 }) : matBlackGloss();
  const metal = matChrome();
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent ?? 0xaa1111, roughness: 0.5, metalness: 0.0 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; g.add(m); return m;
  };

  const D = spec.dash;
  // Armaturenbrett: breiter, nach vorne abfallender Block + Oberkante
  add(rb(D.depth, D.h, D.w, 0.05), dashMat, D.x, D.y, 0, 0, 0, -0.15);
  add(rb(D.depth * 0.6, D.h * 0.55, D.w * 0.98, 0.03), trim, D.x - 0.04, D.y - D.h * 0.1 - 0.01, 0, 0, 0, -0.12);
  // Kombiinstrument-Hutze + Anzeige
  const cluster = makeCluster(spec.clusterColor ?? '#ff3a2a');
  const cl = add(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: cluster.texture, toneMapped: true }), spec.wheel.x - 0.1, D.y + D.h * 0.45, spec.wheel.z);
  cl.rotation.y = Math.PI / 2; cl.rotation.z = 0.0; cl.rotation.x = 0;
  cl.rotateZ(0.0);
  add(rb(0.12, 0.05, 0.4, 0.02), dashMat, spec.wheel.x - 0.12, D.y + D.h * 0.55, spec.wheel.z);
  // Mittelbildschirm
  const scr = canvas(256, 128); const sg = scr.getContext('2d');
  sg.fillStyle = '#04080c'; sg.fillRect(0, 0, 256, 128);
  sg.strokeStyle = spec.accent ? '#' + new THREE.Color(spec.accent).getHexString() : '#ff3a2a'; sg.lineWidth = 2; sg.strokeRect(6, 6, 244, 116);
  sg.fillStyle = '#9fb2c4'; sg.font = 'bold 22px Georgia'; sg.textAlign = 'center'; sg.fillText(spec.screenText || 'AMG', 128, 70);
  const sm = add(new THREE.PlaneGeometry(0.28, 0.14), new THREE.MeshBasicMaterial({ map: canvasTexture(scr) }), D.x + D.depth * 0.5 - 0.02, D.y + D.h * 0.55, 0);
  sm.rotation.y = -Math.PI / 2 + 0.02; sm.rotation.x = -0.12;
  // Lüftungsdüsen
  const vent = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 1, roughness: 0.25 });
  for (const z of [-0.5, -0.2, 0.2, 0.5]) {
    const v = add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20), spec.ventMat ?? vent, D.x + D.depth * 0.5 - 0.01, D.y + D.h * 0.1, z);
    v.rotation.z = Math.PI / 2;
  }

  // Lenkrad
  const W = spec.wheel;
  const steer = new THREE.Group();
  steer.position.set(W.x, W.y, W.z);
  steer.rotation.z = W.tilt ?? 0.38;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(W.r, 0.016, 12, 40), spec.wheelMat ?? lea);
  rim.rotation.y = Math.PI / 2;
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 20), trim); hubM.rotation.z = Math.PI / 2; hubM.position.x = -0.01;
  const spk = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.026, W.r * 1.9), spec.wheelMat ?? lea); spk.position.x = 0;
  const spk2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, W.r * 0.8, 0.03), spec.wheelMat ?? lea); spk2.position.set(0, -W.r * 0.4, 0);
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), new THREE.MeshStandardMaterial({ map: emblemTexture(spec.emblem || 'star'), transparent: true, metalness: 0.4, roughness: 0.3 }));
  em.rotation.y = -Math.PI / 2; em.position.x = 0.0 - 0.036;
  steer.add(rim, hubM, spk, spk2, em);
  g.add(steer);
  // Lenksäule
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), trim, W.x + 0.14, W.y - 0.06, W.z, 0, 0, Math.PI / 2 + 0.38);

  // Mittelkonsole
  const C = spec.console ?? { x: 0.12, y: 0.44, len: 1.0 };
  add(rb(C.len, 0.2, 0.24, 0.04), trim, C.x, C.y, 0);
  add(rb(C.len * 0.9, 0.04, 0.2, 0.02), dashMat, C.x, C.y + 0.1, 0);
  add(new THREE.CylinderGeometry(0.025, 0.03, 0.09, 14), metal, C.x + C.len * 0.2, C.y + 0.16, 0); // Wählhebel

  // Sitze
  const S = spec.seat;
  const mkSeat = (x, z, y, scale = 1, rear = false) => {
    const sg2 = new THREE.Group();
    sg2.position.set(x, y, z);
    const base = new THREE.Mesh(rb(0.52 * scale, 0.12, 0.5, 0.05), leaQ); base.position.set(0, 0, 0);
    const back = new THREE.Mesh(rb(0.12, 0.62, 0.5, 0.05), leaQ); back.position.set(-0.26, 0.3, 0); back.rotation.z = 0.16;
    const head = new THREE.Mesh(rb(0.09, 0.17, 0.26, 0.04), leaQ); head.position.set(-0.31, 0.7, 0); head.rotation.z = 0.12;
    const bolL = new THREE.Mesh(rb(0.1, 0.5, 0.07, 0.03), lea); bolL.position.set(-0.24, 0.28, 0.23); bolL.rotation.z = 0.16;
    const bolR = bolL.clone(); bolR.position.z = -0.23;
    sg2.add(base, back, head, bolL, bolR);
    sg2.traverse((m) => { m.castShadow = false; });
    g.add(sg2);
    return sg2;
  };
  mkSeat(S.x, -S.z, S.y); mkSeat(S.x, S.z, S.y);
  if (spec.rear !== false) {
    const R = spec.rearSeat ?? { x: S.x - 0.95, y: S.y + 0.02, z: 0.36 };
    mkSeat(R.x, -R.z, R.y); mkSeat(R.x, R.z, R.y);
  }
  // Boden / Teppich
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ color: spec.carpet ?? 0x070708, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0.0, spec.floorY ?? 0.3, 0);
  g.add(floor);

  g.userData = { steer, cluster, cockpitEye: spec.eye ?? [0.05, 1.12, -W.z] };
  return g;
}
