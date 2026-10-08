// Wiederverwendbare Fahrzeugteile: Räder, Bremsen, Auspuffendrohre, Lichter-Decals, Linien auf der Karosserie.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture, matRimBlack, matRubber, emblemTexture } from '../materials.js';
import { clamp, lerp, smoothstep } from '../util.js';

// ---------------------------------------------------------------------------------------------
// Allgemeine Geometrie-Helfer

/** Lathe um die Z-Achse (Rotationsachse = Radachse). profile: [[r, a], ...] (a = axial). */
export function latheZ(profile, segs = 64, phiStart = 0, phiLen = Math.PI * 2) {
  const pts = profile.map(([r, a]) => new THREE.Vector2(r, a));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLen);
  g.rotateX(Math.PI / 2); // Lathe-Achse Y -> Z
  return g;
}

function translated(g, x, y, z) { g.translate(x, y, z); return g; }

// ---------------------------------------------------------------------------------------------
// Rad

/**
 * Baut ein Rad. Die Radachse ist die Z-Achse, die Schauseite zeigt nach +z.
 * o: {tireR, tireW, rimR, rimW, spokes, pairs, hubR, dish, spokeW0, spokeW1, thick, twist, emblem, caliper: {color, angle}, discR}
 */
export function buildWheel(o) {
  const g = new THREE.Group();
  const spin = new THREE.Group(); // dreht sich
  const fixed = new THREE.Group(); // Bremssattel etc. dreht nicht
  g.add(spin, fixed);

  const { tireR, tireW, rimR } = o;
  const sh = tireR - rimR; // Flankenhöhe
  const half = tireW / 2;

  // ---- Reifen: Querschnitt mit leicht bauchiger Flanke und ebener Lauffläche
  const prof = [];
  const add = (r, a) => prof.push([r, a]);
  const rimLip = rimR + 0.004;
  add(rimLip - 0.01, -half * 0.86);
  add(rimLip + sh * 0.18, -half * 0.97);
  add(rimLip + sh * 0.55, -half * 1.0);
  add(tireR - sh * 0.12, -half * 0.95);
  add(tireR - 0.004, -half * 0.74);
  add(tireR, -half * 0.55);
  // Lauffläche mit drei Längsrillen
  const flat = half * 0.55;
  for (let k = -1; k <= 1; k++) {
    const c = k * flat * 0.5;
    add(tireR, c - flat * 0.12 - flat * 0.18); add(tireR - 0.004, c - flat * 0.12); add(tireR - 0.004, c + flat * 0.12); add(tireR, c + flat * 0.12 + flat * 0.18);
  }
  add(tireR, half * 0.55);
  add(tireR - 0.004, half * 0.74);
  add(tireR - sh * 0.12, half * 0.95);
  add(rimLip + sh * 0.55, half * 1.0);
  add(rimLip + sh * 0.18, half * 0.97);
  add(rimLip - 0.01, half * 0.86);
  // Rillen-Punkte können sich überlappen: nach a sortieren (Profil muss monoton in a sein)
  prof.sort((p, q) => p[1] - q[1]);
  const tire = new THREE.Mesh(latheZ(prof, 72), matRubber());
  tire.castShadow = true;
  spin.add(tire);

  // ---- Felgenbett (von außen sichtbar zwischen den Speichen) und Horn
  const rw = o.rimW;
  const barrel = latheZ([
    [rimR + 0.004, rw * 0.5], [rimR - 0.006, rw * 0.5 - 0.006], [rimR - 0.018, rw * 0.5 - 0.03], [rimR - 0.02, rw * 0.15],
    [rimR - 0.035, -rw * 0.05], [rimR - 0.02, -rw * 0.4], [rimR + 0.002, -rw * 0.5],
  ], 64);
  const rimMat = o.rimMat || matRimBlack();
  const barrelMesh = new THREE.Mesh(barrel, rimMat);
  barrelMesh.material.side = THREE.DoubleSide;
  spin.add(barrelMesh);

  // ---- Speichen
  const spokeGeos = [];
  const hubA = rw * 0.5 - (o.dish ?? 0.05); // axiale Lage der Nabe
  const hubR = o.hubR ?? 0.055;
  const nSlots = o.spokes;
  const pairs = o.pairs ?? false;
  const mkSpoke = (ang, twist, w0, w1, th) => {
    const N = 16;
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = lerp(hubR * 0.9, rimR - 0.012, t);
      const a = lerp(hubA, rw * 0.5 - 0.016, smoothstep(0.0, 1.0, Math.pow(t, 1.5)));
      const w = lerp(w0, w1, Math.pow(t, 0.8));
      const th2 = th * lerp(1.15, 0.8, t);
      const phi = ang + twist * t;
      const cx = Math.cos(phi), sx = Math.sin(phi);
      // Tangentialrichtung
      const tx = -sx, ty = cx;
      for (const [sw, sa] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        pos.push(cx * r + tx * w * 0.5 * sw, sx * r + ty * w * 0.5 * sw, a + th2 * 0.5 * sa);
      }
    }
    for (let i = 0; i < N; i++) {
      const b = i * 4, c = (i + 1) * 4;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        idx.push(b + k, b + k2, c + k, b + k2, c + k2, c + k);
      }
    }
    // Endkappen
    idx.push(0, 2, 1, 0, 3, 2);
    const e = N * 4;
    idx.push(e, e + 1, e + 2, e, e + 2, e + 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    return sg;
  };
  for (let k = 0; k < nSlots; k++) {
    const base = (k / nSlots) * Math.PI * 2;
    if (pairs) {
      const spread = (Math.PI * 2 / nSlots) * 0.17;
      spokeGeos.push(mkSpoke(base - spread * 0.2, -(o.twist ?? 0.35) * 0.5 - spread, o.spokeW0, o.spokeW1, o.thick));
      spokeGeos.push(mkSpoke(base + spread * 0.2, -(o.twist ?? 0.35) * 0.5 + spread, o.spokeW0, o.spokeW1, o.thick));
    } else {
      spokeGeos.push(mkSpoke(base, o.twist ?? 0.25, o.spokeW0, o.spokeW1, o.thick));
    }
  }
  const spokes = new THREE.Mesh(mergeGeometries(spokeGeos), rimMat);
  spokes.castShadow = true;
  spin.add(spokes);

  // ---- Nabe + Emblem
  const hub = new THREE.Mesh(latheZ([[0, hubA + 0.012], [hubR * 0.95, hubA + 0.01], [hubR * 1.15, hubA - 0.01], [hubR * 1.2, hubA - 0.04]], 40), rimMat);
  spin.add(hub);
  if (o.emblem) {
    const em = new THREE.Mesh(new THREE.CircleGeometry(hubR * 0.78, 32), new THREE.MeshStandardMaterial({ map: emblemTexture(o.emblem), transparent: true, roughness: 0.3, metalness: 0.4 }));
    em.position.z = hubA + 0.0135;
    spin.add(em);
  }

  // ---- Bremsscheibe (innen) und Sattel (fix)
  const discR = o.discR ?? rimR * 0.78;
  const discA = rw * 0.5 - (o.discDepth ?? rw * 0.62);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x4a4b4f, metalness: 1.0, roughness: 0.42, envMapIntensity: 0.8 });
  const disc = new THREE.Mesh(latheZ([[discR, discA - 0.015], [discR, discA + 0.015], [discR * 0.52, discA + 0.015], [discR * 0.5, discA + 0.045], [hubR * 0.9, discA + 0.045], [hubR * 0.9, discA - 0.015], [discR * 0.52, discA - 0.015]], 56), discMat);
  disc.material.side = THREE.DoubleSide;
  spin.add(disc);

  if (o.caliper) {
    const col = new THREE.Color(o.caliper.color);
    const calMat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 });
    const ang = o.caliper.angle ?? -0.5; // Lage am Rad (rad, 0 = oben/+y? hier: von +x aus)
    const span = o.caliper.span ?? 0.9;
    // Sattelbogen: Kreisringsektor, außen leicht überstehend
    const sector = new THREE.Shape();
    const r0 = discR * 0.78, r1 = discR * 1.05;
    sector.absarc(0, 0, r1, -span / 2, span / 2, false);
    sector.absarc(0, 0, r0, span / 2, -span / 2, true);
    const cg = new THREE.ExtrudeGeometry(sector, { depth: 0.07, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 10 });
    cg.translate(0, 0, discA - 0.035);
    const cal = new THREE.Mesh(cg, calMat);
    cal.rotation.z = ang;
    fixed.add(cal);
  }

  // ---- Unschärfe-Scheibe bei hoher Drehzahl (Speichen würden sonst flimmern)
  const blurMat = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 1.2 });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(rimR - 0.008, 48), blurMat);
  blur.position.z = rw * 0.5 - 0.018;
  blur.visible = false;
  g.add(blur);

  g.userData = { spin, fixed, blur, spokes, hubA, rimR, tireR, tireW, rimW: rw };
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------------------------
// Auspuffendrohr (Schwarz-Chrom): kurzes Rohr, leicht abgeschrägt, innen dunkel

export function exhaustTip({ r = 0.045, len = 0.12, shape = 'round', w = 0.1, h = 0.06, mat }) {
  const g = new THREE.Group();
  const m = mat || new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });
  const innerM = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.9, metalness: 0 });
  if (shape === 'round') {
    const outer = new THREE.CylinderGeometry(r, r * 0.92, len, 28, 1, true);
    outer.rotateZ(Math.PI / 2); // Achse -> x
    const rim = new THREE.TorusGeometry(r * 0.96, r * 0.07, 8, 28);
    rim.rotateY(Math.PI / 2); rim.translate(-len / 2, 0, 0);
    const inner = new THREE.CylinderGeometry(r * 0.86, r * 0.86, len * 0.98, 24, 1, true);
    inner.rotateZ(Math.PI / 2);
    const dark = new THREE.CircleGeometry(r * 0.86, 24);
    dark.rotateY(-Math.PI / 2); dark.translate(len * 0.4, 0, 0);
    g.add(new THREE.Mesh(outer, m), new THREE.Mesh(rim, m), new THREE.Mesh(inner, innerM), new THREE.Mesh(dark, innerM));
    // Abschlussring
    const rim2 = new THREE.TorusGeometry(r * 0.9, r * 0.05, 6, 24); rim2.rotateY(Math.PI / 2); rim2.translate(len / 2, 0, 0);
    g.add(new THREE.Mesh(rim2, m));
  } else {
    // abgerundetes Rechteck (G63 / i7)
    const s = new THREE.Shape();
    const rr = Math.min(w, h) * 0.3, x = w / 2, y = h / 2;
    s.moveTo(-x + rr, -y); s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr); s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y);
    s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr); s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
    const hole = new THREE.Path();
    const k = 0.82;
    hole.moveTo(-x * k + rr, -y * k); hole.lineTo(x * k - rr, -y * k); hole.quadraticCurveTo(x * k, -y * k, x * k, -y * k + rr); hole.lineTo(x * k, y * k - rr);
    hole.quadraticCurveTo(x * k, y * k, x * k - rr, y * k); hole.lineTo(-x * k + rr, y * k); hole.quadraticCurveTo(-x * k, y * k, -x * k, y * k - rr);
    hole.lineTo(-x * k, -y * k + rr); hole.quadraticCurveTo(-x * k, -y * k, -x * k + rr, -y * k);
    s.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    eg.rotateY(-Math.PI / 2); // Extrusion entlang -x -> +x
    eg.translate(len / 2, 0, 0);
    g.add(new THREE.Mesh(eg, m));
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), innerM);
    dark.rotation.y = -Math.PI / 2; dark.position.x = len * 0.45;
    g.add(dark);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------------------------
// Linien auf der Karosserie (Spaltmaße, Zierleisten)

/**
 * Dünnes Band entlang einer auf die Karosserie projizierten Kurve.
 * proj: Projektionsfunktion (u,v)->{p,n}; pts: [[u,v],...]; width in m, off = Abstand von der Fläche.
 */
export function surfaceLine(proj, pts, width = 0.003, off = 0.0007, closed = false) {
  const P = [];
  for (const [u, v] of pts) { const r = proj(u, v); if (r) P.push(r); }
  if (closed && P.length) P.push(P[0]);
  if (P.length < 2) return null;
  const pos = [], idx = [], nor = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)].p, b = P[Math.min(P.length - 1, i + 1)].p;
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    const n = P[i].n;
    const s = new THREE.Vector3().crossVectors(n, t).normalize().multiplyScalar(width / 2);
    const c = P[i].p.clone().addScaledVector(n, off);
    pos.push(c.x - s.x, c.y - s.y, c.z - s.z, c.x + s.x, c.y + s.y, c.z + s.z);
    nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
  }
  for (let i = 0; i < P.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export const lineMat = () => new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

// ---------------------------------------------------------------------------------------------
// Decals (Lichter, Grills, Plaketten): Texturen per Canvas, auf die Karosserie projiziert

/**
 * Material für ein Licht-Decal. `draw(g, w, h, emissive)` malt in einen Canvas; wird zweimal aufgerufen
 * (Farbe und Leuchtanteil). Helligkeit des Leuchtanteils: setLevel(x).
 */
export function lightDecal(draw, w = 512, h = 256, { emissiveColor = 0xffffff } = {}) {
  const c1 = canvas(w, h), c2 = canvas(w, h);
  draw(c1.getContext('2d'), w, h, false);
  const g2 = c2.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, w, h);
  draw(g2, w, h, true);
  const mat = new THREE.MeshStandardMaterial({
    map: canvasTexture(c1), emissiveMap: canvasTexture(c2), emissive: new THREE.Color(emissiveColor), emissiveIntensity: 0,
    transparent: true, alphaTest: 0.02, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.userData.setLevel = (v) => { mat.emissiveIntensity = v; };
  return mat;
}

/** Leuchtender Strahler in einem Canvas (für DRL-Streifen etc.). */
export function glowLine(g, pts, width, color = '#fff', glow = 18) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = glow;
  g.strokeStyle = color; g.lineWidth = width;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.restore();
}

/** Flache runde Plakette (Emblem) mit leichtem Relief, an Position/Normale. */
export function emblemMesh(type, size, pos, normal, tilt = 0) {
  const geo = new THREE.CircleGeometry(size / 2, 40);
  const mat = new THREE.MeshStandardMaterial({ map: emblemTexture(type), transparent: true, alphaTest: 0.05, roughness: 0.25, metalness: 0.5, envMapIntensity: 1.3,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  m.quaternion.copy(q);
  if (tilt) m.rotateZ(tilt);
  return m;
}

export { translated };
