// Himmel und Tageszeit: Farbverlauf, Sonne, Mond, Sterne, Wolken, Sonnen-/Mondlicht mit Schatten.
import * as THREE from 'three';
import { lumpyIco, colored, mergeGeos } from './geo.js';
import { mulberry32 } from '../noise.js';

const K = (hex) => new THREE.Color(hex);
// Stützstellen nach Sonnenhöhe (sin): Nacht, Dämmerung, Sonnenaufgang, Vormittag, Mittag
const KEYS = [
  { e: -0.35, zen: K(0x070b1c), hor: K(0x18223e), sun: K(0x000000), sunI: 0, hemiS: K(0x4a5c96), hemiG: K(0x1a2030), hemiI: 0.85, fog: K(0x141e36) },
  { e: -0.08, zen: K(0x1d2a52), hor: K(0x6a4a6e), sun: K(0xff7a45), sunI: 0, hemiS: K(0x6a6aa0), hemiG: K(0x24202a), hemiI: 0.8, fog: K(0x4a3f5c) },
  { e: 0.04, zen: K(0x3e64a8), hor: K(0xf29a62), sun: K(0xffa060), sunI: 1.3, hemiS: K(0xa8a8d0), hemiG: K(0x4a3a30), hemiI: 0.7, fog: K(0xe0a07a) },
  { e: 0.22, zen: K(0x3c7fd6), hor: K(0xbcd8ee), sun: K(0xffe2bc), sunI: 2.4, hemiS: K(0xbcd4ff), hemiG: K(0x5f6a40), hemiI: 0.95, fog: K(0xb4cfe6) },
  { e: 0.9, zen: K(0x2f78d8), hor: K(0xb6dbf5), sun: K(0xfff6e6), sunI: 2.9, hemiS: K(0xc4dcff), hemiG: K(0x6b7448), hemiI: 1.05, fog: K(0xaed0ec) },
];

function sample(e) {
  if (e <= KEYS[0].e) return KEYS[0];
  for (let i = 1; i < KEYS.length; i++) {
    const a = KEYS[i - 1], b = KEYS[i];
    if (e <= b.e) {
      const t = (e - a.e) / (b.e - a.e);
      const s = t * t * (3 - 2 * t);
      const o = {};
      for (const k of Object.keys(a)) o[k] = a[k] instanceof THREE.Color ? a[k].clone().lerp(b[k], s) : a[k] + (b[k] - a[k]) * s;
      return o;
    }
  }
  return KEYS.at(-1);
}

export class SkySystem {
  constructor(scene, quality) {
    this.scene = scene;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZen: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir, uMoonDir, uZen, uHor, uSunCol;
        uniform float uNight, uTime;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, uHor * 0.75, smoothstep(0.0, -0.25, h));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6);
          col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 4.0;
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.9, 0.95, 1.0) * smoothstep(0.99955, 0.9998, md) * 1.6 * uNight;
          col += vec3(0.25, 0.3, 0.45) * pow(md, 30.0) * 0.4 * uNight;
          if (uNight > 0.01 && h > 0.0) {
            vec2 sp = vec2(atan(d.z, d.x), asin(h)) * 120.0;
            vec2 c = floor(sp);
            float r = hash(c);
            if (r > 0.985) {
              vec2 f = fract(sp) - 0.5;
              float s = smoothstep(0.18, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0));
              col += vec3(0.85, 0.9, 1.0) * s * uNight * smoothstep(0.0, 0.2, h);
            }
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.dome.scale.setScalar(2500);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      const s = quality.shadowRange;
      Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xaaccee, quality.fogNear, quality.fogFar);
    scene.fog = this.fog;
    this.quality = quality;
    this._buildClouds();
    this.state = { night: 0, sunDir: new THREE.Vector3(), light: 1, elev: 1 };
  }

  _buildClouds() {
    // Alle Wolken in einem Mesh; die ganze Gruppe dreht sich langsam um die Insel.
    const rnd = mulberry32(99);
    this.cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, fog: false });
    const all = [];
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, d = 150 + rnd() * 750, rot = rnd() * Math.PI;
      const cx = Math.cos(a) * d, cy = 150 + rnd() * 90, cz = Math.sin(a) * d;
      const n = 3 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const r = 9 + rnd() * 12;
        const lx = (j - n / 2) * 13 + rnd() * 6, ly = rnd() * 5, lz = (rnd() - 0.5) * 14;
        const c = Math.cos(rot), sn = Math.sin(rot);
        all.push(colored(lumpyIco(r, 1, i * 10 + j, 0.15), 0xffffff, { x: cx + lx * c + lz * sn, y: cy + ly, z: cz - lx * sn + lz * c, sy: 0.55, ry: rot }));
      }
    }
    this.clouds = new THREE.Mesh(mergeGeos(all), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }

  /** t = Tageszeit 0..1 (0 = Mitternacht, 0.5 = Mittag). */
  update(t, dt, focus, camera, elapsed) {
    const th = (t - 0.25) * Math.PI * 2;
    const sunDir = this.state.sunDir.set(Math.cos(th), Math.sin(th) * 0.92, 0.38).normalize();
    const e = sunDir.y;
    const k = sample(e);
    const night = Math.min(1, Math.max(0, (-e - 0.02) / 0.2));
    this.state.night = night;
    this.state.elev = e;
    this.state.light = Math.max(0.12, Math.min(1, (e + 0.15) / 0.4));
    const u = this.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(sunDir).negate();
    u.uZen.value.copy(k.zen);
    u.uHor.value.copy(k.hor);
    u.uSunCol.value.copy(k.sun).multiplyScalar(e > -0.1 ? 1 : 0);
    u.uNight.value = night;
    u.uTime.value = elapsed;
    this.dome.position.copy(camera.position);

    this.hemi.color.copy(k.hemiS);
    this.hemi.groundColor.copy(k.hemiG);
    this.hemi.intensity = k.hemiI;
    // Tagsüber Sonnenlicht, nachts schwaches bläuliches Mondlicht (mit Schatten)
    const lightDir = e > -0.06 ? sunDir : u.uMoonDir.value;
    if (e > -0.06) { this.sun.color.copy(k.sun); this.sun.intensity = k.sunI; }
    else { this.sun.color.setRGB(0.6, 0.7, 1.0); this.sun.intensity = 0.6 * night; }
    const lh = Math.max(lightDir.y, 0.12);
    const ld = new THREE.Vector3(lightDir.x, lh, lightDir.z).normalize();
    // Schattenkamera folgt der Figur, auf Texel gerastert gegen Flimmern
    const step = (this.quality.shadowRange * 2) / (this.quality.shadowSize || 1024);
    const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + ld.x * 200, focus.y + ld.y * 200, fz + ld.z * 200);

    this.fog.color.copy(k.fog);
    // Wolken ziehen und färben sich mit der Tageszeit
    const cc = new THREE.Color(1, 1, 1).lerp(k.hor, 0.35).multiplyScalar(0.25 + 0.75 * this.state.light);
    this.cloudMat.color.copy(cc);
    this.cloudMat.emissive.copy(k.hor).multiplyScalar(0.5);
    this.cloudMat.emissiveIntensity = 0.3 + 0.2 * (1 - night);
    this.clouds.rotation.y += dt * 0.004;
    return { ...this.state, k };
  }
}
