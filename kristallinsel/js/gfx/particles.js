// Kleines Partikelsystem (Funken, Spritzer, Staub) und Glühwürmchen in der Nacht.
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vCol; varying float vA;
        uniform float uScale;
        void main() {
          vCol = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
  }

  emit(x, y, z, { count = 10, color = [1, 1, 1], speed = 3, up = 2, size = 0.25, life = 0.8, gravity = 6, spread = 0.2 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, r = Math.random();
      this.pos[i * 3] = x + Math.cos(a) * spread * r; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + Math.sin(a) * spread * r;
      this.vel[i * 3] = Math.cos(a) * speed * (0.3 + r); this.vel[i * 3 + 1] = up * (0.5 + Math.random()); this.vel[i * 3 + 2] = Math.sin(a) * speed * (0.3 + r);
      this.col.set(color, i * 3);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }

  update(dt, pixelHeight) {
    this.mat.uniforms.uScale.value = pixelHeight * 0.87;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.max(0, f);
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -9999;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}

/** Glühwürmchen schwirren nachts um die Figur. */
export class Fireflies {
  constructor(scene, n = 70) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.seed = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60, y: 0.5 + Math.random() * 2.5, p: Math.random() * 10, s: 0.4 + Math.random() }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.center = new THREE.Vector3();
  }

  update(t, focus, night, heightAt) {
    this.points.visible = night > 0.05;
    if (!this.points.visible) return;
    this.mat.opacity = night * (0.75 + 0.25 * Math.sin(t * 7));
    // Schwarm folgt der Figur in Sprüngen, damit die Tierchen nicht mitwandern
    if (this.center.distanceTo(focus) > 25) this.center.set(Math.round(focus.x / 20) * 20, 0, Math.round(focus.z / 20) * 20);
    for (let i = 0; i < this.n; i++) {
      const s = this.seed[i];
      const x = this.center.x + s.x + Math.sin(t * 0.5 * s.s + s.p) * 2;
      const z = this.center.z + s.z + Math.cos(t * 0.4 * s.s + s.p * 2) * 2;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = Math.max(heightAt(x, z), 0) + s.y + Math.sin(t * s.s + s.p) * 0.4;
      this.pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
