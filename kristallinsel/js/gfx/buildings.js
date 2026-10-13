// Bauwerke als wenige zusammengeführte Meshes + bewegliche Gruppen (Mühlenflügel, Boot, Fahne)
// und Effekte an Markern (Rauch, Lagerfeuer, Laternenlicht, Leuchtfeuer).
import * as THREE from 'three';
import { buildParts } from './geo.js';

export class Buildings {
  constructor(scene, st, quality) {
    this.scene = scene;
    this.mats = {
      std: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
      glow: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, color: 0x3d4a58, emissive: 0xffc070, emissiveIntensity: 0 }),
      lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, color: 0xd8e8f0, emissive: 0xfff0c0, emissiveIntensity: 0, transparent: true, opacity: 0.85 }),
    };
    const add = (geos, parent) => {
      for (const [m, g] of geos) {
        const mesh = new THREE.Mesh(g, this.mats[m] || this.mats.std);
        mesh.castShadow = quality.shadows && m === 'std';
        mesh.receiveShadow = m === 'std';
        parent.add(mesh);
      }
    };
    add(buildParts(st.parts), scene);

    this.groups = [];
    for (const g of st.groups) {
      const root = new THREE.Group();
      root.position.set(...g.pos);
      root.rotation.y = g.yaw;
      const inner = new THREE.Group();
      root.add(inner);
      add(buildParts(g.parts), inner);
      scene.add(root);
      this.groups.push({ def: g, root, inner, base: root.position.clone(), phase: g.pos[0] * 0.1 });
    }

    // Rauch aus Schornsteinen: ein Punktsystem für alle Schornsteine
    const chimneys = st.markers.filter((k) => k.type === 'smoke');
    const PER = 6;
    this.smokeN = chimneys.length * PER;
    this.smokePos = new Float32Array(this.smokeN * 3);
    this.smokeA = new Float32Array(this.smokeN);
    this.smokeS = new Float32Array(this.smokeN);
    this.smokeSrc = [];
    chimneys.forEach((m) => { for (let i = 0; i < PER; i++) this.smokeSrc.push({ x: m.x, y: m.y, z: m.z, t: i / PER }); });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
    sg.setAttribute('alpha', new THREE.BufferAttribute(this.smokeA, 1));
    sg.setAttribute('size', new THREE.BufferAttribute(this.smokeS, 1));
    this.smokeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 }, uCol: { value: new THREE.Color(0.85, 0.85, 0.85) } },
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; uniform float uScale;' +
        'void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; uniform vec3 uCol;' +
        'void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a);\n' +
        '#include <colorspace_fragment>\n}',
    });
    this.smoke = new THREE.Points(sg, this.smokeMat);
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);

    // Lagerfeuer: flackernde Flammen + Licht
    this.fires = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const m of st.markers.filter((k) => k.type === 'fire')) {
      const g = new THREE.Group();
      g.position.set(m.x, m.y, m.z);
      const flames = [];
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.04, 1.0 - i * 0.12, 6), i === 0 ? coreMat : flameMat);
        f.position.set(Math.cos(i * 2.1) * 0.15 * (i > 0), 0.4, Math.sin(i * 2.1) * 0.15 * (i > 0));
        g.add(f); flames.push(f);
      }
      const light = new THREE.PointLight(0xff9a4a, 6, 16, 1.6);
      light.position.y = 0.8;
      g.add(light);
      scene.add(g);
      this.fires.push({ g, flames, light });
    }

    // Laternen: wenige Punktlichter wandern nachts zu den nächstgelegenen Laternen
    this.lanterns = st.markers.filter((k) => k.type === 'lantern').map((k) => new THREE.Vector3(k.x, k.y, k.z));
    this.lanternLights = [];
    for (let i = 0; i < quality.lights; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 14, 1.5);
      scene.add(l);
      this.lanternLights.push(l);
    }

    // Leuchtfeuer: drehende Lichtkegel, erst nach dem Entzünden
    const b = st.markers.find((k) => k.type === 'beacon');
    this.beacon = new THREE.Group();
    this.beacon.position.set(b.x, b.y, b.z);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 140, 16, 1, true), beamMat);
      cone.rotation.z = s * Math.PI / 2;
      cone.position.x = s * 70;
      this.beacon.add(cone);
    }
    this.beaconLight = new THREE.PointLight(0xfff0c0, 0, 60, 1.2);
    this.beaconLight.position.set(b.x, b.y, b.z);
    scene.add(this.beaconLight);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.beaconLit = false;
  }

  setBeacon(lit) {
    this.beaconLit = lit;
    this.beacon.visible = lit;
  }

  update(dt, t, night, focus) {
    for (const g of this.groups) {
      const d = g.def;
      if (d.spin) g.inner.rotation.z -= d.spin * dt;
      if (d.bob) {
        g.root.position.y = g.base.y + Math.sin(t * 1.3 + g.phase) * 0.08;
        g.inner.rotation.z = Math.sin(t * 0.9 + g.phase) * 0.04;
        g.inner.rotation.x = Math.sin(t * 1.1) * 0.025;
      }
      if (d.wave) g.inner.rotation.y = Math.sin(t * 3.1) * 0.25 + Math.sin(t * 7.3) * 0.08;
    }
    for (let i = 0; i < this.smokeN; i++) {
      const u = this.smokeSrc[i];
      u.t = (u.t + dt * 0.12) % 1;
      this.smokePos[i * 3] = u.x + u.t * 2.5; this.smokePos[i * 3 + 1] = u.y + u.t * 6; this.smokePos[i * 3 + 2] = u.z + u.t * 0.8;
      this.smokeS[i] = 0.9 + u.t * 3.2;
      this.smokeA[i] = (1 - u.t) * 0.35 * Math.min(1, u.t * 6);
    }
    const sa = this.smoke.geometry.attributes;
    sa.position.needsUpdate = sa.alpha.needsUpdate = sa.size.needsUpdate = true;
    this.smokeMat.uniforms.uScale.value = (this.pixelHeight || 720) * 0.9;
    this.smokeMat.uniforms.uCol.value.setScalar(0.25 + 0.6 * (1 - night));
    for (const f of this.fires) {
      f.flames.forEach((m, i) => {
        const k = 0.75 + Math.sin(t * (9 + i * 2.3) + i) * 0.15 + Math.sin(t * 23 + i * 5) * 0.08;
        m.scale.set(1, k, 1);
        m.position.y = 0.4 * k;
      });
      f.light.intensity = (2 + night * 8) * (0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 29) * 0.05);
    }
    // Fenster und Laternen leuchten in der Dämmerung auf
    const glow = Math.min(1, night * 1.4);
    this.mats.glow.emissiveIntensity = glow * 1.6;
    this.mats.glow.color.setRGB(0.24 + glow * 0.5, 0.3 + glow * 0.35, 0.36 + glow * 0.1);
    this.mats.lamp.emissiveIntensity = this.beaconLit ? 2.5 : 0.15 * glow;
    if (this.lanternLights.length) {
      const near = this.lanterns.map((p) => [p.distanceToSquared(focus), p]).sort((a, b) => a[0] - b[0]);
      this.lanternLights.forEach((l, i) => {
        const n = near[i];
        if (!n) { l.intensity = 0; return; }
        l.position.copy(n[1]);
        l.intensity = glow * 5;
      });
    }
    if (this.beaconLit) {
      this.beacon.rotation.y += dt * 0.6;
      this.beacon.children.forEach((c) => { if (c.material) c.material.opacity = 0.05 + 0.25 * night; });
      this.beaconLight.intensity = 3 + night * 12;
    }
  }
}
