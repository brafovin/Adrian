// Kristalle: leuchtende, schwebende Oktaeder mit Lichtsäule (von weitem sichtbar) und Glanzpunkt.
import * as THREE from 'three';
import { glowTexture } from './geo.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Crystals {
  constructor(scene, list, collected) {
    this.list = list;
    this.state = list.map((c) => ({ done: collected.has(c.id), anim: collected.has(c.id) ? 1 : 0, collecting: false, ph: c.x * 0.37 + c.z * 0.11 }));
    const n = list.length;
    const geo = new THREE.OctahedronGeometry(0.42, 0);
    geo.scale(0.72, 1.45, 0.72);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x8ff6ff, emissive: 0x22c8ee, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.15, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const beamGeo = new THREE.CylinderGeometry(0.1, 0.4, 70, 8, 1, true);
    beamGeo.translate(0, 35, 0);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: /* glsl */`
        varying float vH; varying float vD;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vH = position.y / 70.0;
          vD = distance(cameraPosition, base);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uFade;
        varying float vH; varying float vD;
        void main() {
          float a = pow(1.0 - vH, 1.6) * smoothstep(18.0, 60.0, vD) * (1.0 - smoothstep(320.0, 520.0, vD));
          a *= 0.55 + 0.15 * sin(uTime * 2.0 + vH * 12.0);
          gl_FragColor = vec4(vec3(0.35, 0.9, 1.0) * a * uFade, 1.0);
        }`,
    });
    this.beams = new THREE.InstancedMesh(beamGeo, this.beamMat, n);
    this.beams.frustumCulled = false;
    scene.add(this.beams);

    const pg = new THREE.BufferGeometry();
    this.haloPos = new Float32Array(n * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.haloPos, 3));
    this.halo = new THREE.Points(pg, new THREE.PointsMaterial({
      map: glowTexture(64, 'rgba(160,240,255,1)', 'rgba(120,220,255,0)'), size: 2.6, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
    }));
    this.halo.frustumCulled = false;
    scene.add(this.halo);
    this.update(0, 0, new THREE.Vector3());
  }

  collect(i) {
    const s = this.state[i];
    if (s.done || s.collecting) return;
    s.collecting = true;
  }

  /** Nur für den Neustart: alle wieder sichtbar machen. */
  reset(collected) {
    this.state.forEach((s, i) => { s.done = collected.has(this.list[i].id); s.anim = s.done ? 1 : 0; s.collecting = false; });
  }

  update(dt, t, camPos, night = 0, collected = null) {
    this.beamMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uFade.value = 0.55 + night * 0.45;
    this.mat.emissiveIntensity = 1.0 + night * 0.8 + Math.sin(t * 3) * 0.15;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i], s = this.state[i];
      if (collected && !s.done && !s.collecting && collected.has(c.id)) s.done = true;
      if (s.collecting) { s.anim = Math.min(1, s.anim + dt * 1.4); if (s.anim >= 1) { s.done = true; s.collecting = false; } }
      const a = s.anim;
      const vis = s.done ? 0 : 1 - a * a;
      _p.set(c.x, c.y + Math.sin(t * 1.6 + s.ph) * 0.12 + a * 2.2, c.z);
      _e.set(0, t * (1.2 + a * 9) + s.ph, 0.12);
      _q.setFromEuler(_e);
      _s.setScalar(vis);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      _q.identity();
      _s.set(vis, s.collecting || s.done ? 0 : 1, vis);
      _p.set(c.x, c.y - 0.9, c.z);
      _m.compose(_p, _q, _s);
      this.beams.setMatrixAt(i, _m);
      this.haloPos[i * 3] = c.x; this.haloPos[i * 3 + 1] = vis > 0.01 ? _p.y + 0.9 + Math.sin(t * 1.6 + s.ph) * 0.12 + a * 2.2 : -9999; this.haloPos[i * 3 + 2] = c.z;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    this.halo.geometry.attributes.position.needsUpdate = true;
  }
}
