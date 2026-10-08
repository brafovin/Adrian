// Himmel, Sonne, Umgebungsreflexionen (IBL) und Tageszeit-Übergang (Nachmittag -> Sonnenuntergang -> Nacht).

import * as THREE from 'three';
import { clamp, lerp, smoothstep, rng } from './util.js';

const C = (r, g, b) => new THREE.Color(r, g, b); // lineare Werte

// Stützstellen der Tageszeit: t = 0 Nachmittag, 1 Sonnenuntergang, 2 Dämmerung, 3 Nacht
const KEYS = [
  { el: 20, az: 0, zenith: C(0.09, 0.2, 0.5), mid: C(0.38, 0.48, 0.68), horizon: C(0.95, 0.7, 0.45), sun: C(1.0, 0.76, 0.5), sunI: 5.0,
    fog: C(0.62, 0.5, 0.42), fogD: 0.00024, hemiSky: C(0.35, 0.45, 0.65), hemiGnd: C(0.35, 0.25, 0.18), hemiI: 0.45, exposure: 0.8, lights: 0, stars: 0, cloudLit: C(1.0, 0.72, 0.45), cloudDark: C(0.3, 0.28, 0.38), env: 1.0 },
  { el: 5, az: 0, zenith: C(0.05, 0.09, 0.27), mid: C(0.34, 0.2, 0.28), horizon: C(1.0, 0.4, 0.11), sun: C(1.0, 0.43, 0.13), sunI: 4.4, fog: C(0.62, 0.3, 0.17), fogD: 0.00042,
    hemiSky: C(0.25, 0.22, 0.4), hemiGnd: C(0.4, 0.2, 0.1), hemiI: 0.4, exposure: 0.95, lights: 0.25, stars: 0, cloudLit: C(1.0, 0.42, 0.14), cloudDark: C(0.16, 0.1, 0.2), env: 0.95 },
  { el: -5, az: 0, zenith: C(0.012, 0.02, 0.08), mid: C(0.09, 0.06, 0.16), horizon: C(0.42, 0.15, 0.12), sun: C(0.5, 0.18, 0.12), sunI: 0.5, fog: C(0.1, 0.06, 0.09), fogD: 0.0005,
    hemiSky: C(0.08, 0.08, 0.2), hemiGnd: C(0.12, 0.07, 0.07), hemiI: 0.4, exposure: 1.25, lights: 0.85, stars: 0.3, cloudLit: C(0.4, 0.14, 0.14), cloudDark: C(0.04, 0.03, 0.07), env: 0.7 },
  { el: -25, az: 0, zenith: C(0.003, 0.006, 0.022), mid: C(0.008, 0.015, 0.04), horizon: C(0.035, 0.035, 0.07), sun: C(0.1, 0.1, 0.2), sunI: 0.0, fog: C(0.025, 0.03, 0.055), fogD: 0.0004,
    hemiSky: C(0.04, 0.06, 0.14), hemiGnd: C(0.03, 0.03, 0.05), hemiI: 0.5, exposure: 1.7, lights: 1, stars: 1, cloudLit: C(0.06, 0.07, 0.14), cloudDark: C(0.01, 0.01, 0.03), env: 0.45 },
];

export const TOD_NAMES = ['Nachmittag', 'Sonnenuntergang', 'Dämmerung', 'Nacht'];

function mixColor(a, b, t) { return a.clone().lerp(b, t); }

/** Interpoliert die Stützstellen für t in [0,3]. */
export function todParams(t) {
  t = clamp(t, 0, 3);
  const i = Math.min(2, Math.floor(t));
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const A = KEYS[i], B = KEYS[i + 1];
  const o = {};
  for (const k of Object.keys(A)) {
    const a = A[k], b = B[k];
    o[k] = a.isColor ? mixColor(a, b, s) : lerp(a, b, s);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Himmel

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // an die hintere Clipping-Ebene
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith, uMid, uHorizon, uSunColor, uGround, uCloudLit, uCloudDark;
uniform float uStars, uTime, uCloudAmt, uSunDisc;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float h = clamp(e, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZenith, smoothstep(0.14, 0.8, h));
  float sd = max(dot(d, uSunDir), 0.0);
  // Glühen um die Sonne (zusätzliche Aufhellung des Horizonts in Sonnenrichtung)
  float horizonGlow = exp(-abs(e) * 7.0);
  col += uSunColor * horizonGlow * pow(sd, 3.0) * 0.55;
  col += uSunColor * (pow(sd, 8.0) * 0.30 + pow(sd, 60.0) * 0.55 + pow(sd, 900.0) * 3.0);
  col += uSunColor * smoothstep(0.99972, 0.99992, sd) * uSunDisc;

  // Wolken: gestreckte Bänder, von unten durch die tiefe Sonne angestrahlt
  if (e > -0.02) {
    vec2 cuv = d.xz / (max(e, 0.0) + 0.16);
    cuv = vec2(cuv.x * 0.55, cuv.y * 1.4) * 0.9 + vec2(uTime * 0.004, 0.0);
    float c1 = fbm(cuv * 1.7);
    float c2 = fbm(cuv * 4.3 + 9.0);
    float c = smoothstep(0.50 - uCloudAmt * 0.25, 0.80, c1 * 0.8 + c2 * 0.25);
    float edge = clamp(c * (1.0 - c) * 3.5, 0.0, 1.0);
    float towardSun = pow(sd, 2.2);
    vec3 cl = mix(uCloudDark, uCloudLit, clamp(towardSun * 1.1 + (1.0 - c) * 0.45 + 0.1, 0.0, 1.0));
    cl += uSunColor * edge * towardSun * 0.9;
    float fade = smoothstep(-0.02, 0.07, e) * (1.0 - smoothstep(0.55, 1.0, e) * 0.35);
    col = mix(col, cl, c * fade * 0.92);
  }
  col = mix(col, uGround, smoothstep(0.0, -0.05, e));
  if (uStars > 0.001 && e > 0.0) {
    vec2 su = d.xz / (e + 0.3) * 160.0;
    float st = hash(floor(su));
    float tw = step(0.9965, st) * (0.5 + 0.5 * hash(floor(su) + 3.0));
    col += vec3(0.8, 0.85, 1.0) * tw * uStars * smoothstep(0.02, 0.25, e);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-1, 0.1, 0.2).normalize() },
      uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uStars: { value: 0 }, uTime: { value: 0 }, uCloudAmt: { value: 0.6 }, uSunDisc: { value: 40 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    fog: false,
  });
}

function setSkyUniforms(mat, p, sunDir, discI = 40) {
  const u = mat.uniforms;
  u.uSunDir.value.copy(sunDir);
  u.uZenith.value.copy(p.zenith); u.uMid.value.copy(p.mid); u.uHorizon.value.copy(p.horizon);
  u.uSunColor.value.copy(p.sun);
  u.uGround.value.copy(p.fog).multiplyScalar(0.75);
  u.uCloudLit.value.copy(p.cloudLit); u.uCloudDark.value.copy(p.cloudDark);
  u.uStars.value = p.stars;
  u.uSunDisc.value = discI * Math.min(1, Math.max(0, p.sunI / 2));
}

export function sunDirection(elDeg, azDeg = 0) {
  // Westen (Meer) liegt bei -x; leicht nach Süden (+z) versetzt für lange, schräge Schatten
  const el = (elDeg * Math.PI) / 180;
  const az = ((200 + azDeg) * Math.PI) / 180; // 180 = -x
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)).normalize();
}

// ---------------------------------------------------------------------------------------------
// Umgebungs-Szenen für die Reflexionen

function skylineRing(rand, radius = 380) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a10 });
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.8, 0.4) });
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.04;
    const tall = rand() < 0.25 ? rand.range(120, 260) : rand.range(25, 90);
    const w = rand.range(18, 42), d = rand.range(18, 42);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, tall, d), mat);
    b.position.set(Math.cos(a) * radius, tall / 2 - 5, Math.sin(a) * radius);
    b.rotation.y = -a;
    g.add(b);
    if (rand() < 0.35) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.4, d * 0.9), winMat);
      strip.position.copy(b.position); strip.position.y = rand.range(8, tall - 4); strip.rotation.y = -a;
      g.add(strip);
    }
  }
  return g;
}

export function buildSunsetEnvScene(p, sunDir) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), createSkyMaterial());
  setSkyUniforms(sky.material, p, sunDir, 120);
  sky.material.uniforms.uCloudAmt.value = 0.7;
  scene.add(sky);
  scene.add(skylineRing(rng(11)));
  // Boden: dunkler, leicht warmer Asphalt mit Glanz zur Sonne hin
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: p.fog.clone().multiplyScalar(0.28).add(new THREE.Color(0.012, 0.01, 0.01)) }));
  gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.5;
  scene.add(gnd);
  // warme Straßenlaternen-Reflexe
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 1.4).multiplyScalar(0.3 + p.lights * 2.2) });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), lampMat);
    m.position.set(Math.cos(a) * 60, 9, Math.sin(a) * 60);
    scene.add(m);
  }
  return scene;
}

export function buildStudioEnvScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 60), new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide }));
  room.position.y = 9;
  scene.add(room);
  const soft = (w, h, pos, rot, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot);
    scene.add(m);
  };
  // Lange Lichtbänder: zeichnen die Karosserielinien auf schwarzem Lack nach
  soft(3, 24, [-4.5, 11, 0], [Math.PI / 2, 0, 0], 0xfff1e0, 7);
  soft(3, 24, [4.5, 11, 0], [Math.PI / 2, 0, 0], 0xffe3c6, 6);
  soft(1.2, 22, [0, 11, 0], [Math.PI / 2, 0, 0], 0xffffff, 9);
  soft(2, 14, [-18, 5, 0], [0, Math.PI / 2, 0], 0xffd9b0, 5);
  soft(2, 14, [18, 5, 0], [0, -Math.PI / 2, 0], 0xffd9b0, 5);
  soft(24, 1.4, [0, 4, -20], [0, 0, 0], 0xffe8d0, 4);
  soft(24, 0.7, [0, 1.2, 20], [0, Math.PI, 0], 0xc8d8ff, 3);
  // rote Akzentlichter
  soft(1, 10, [-14, 3, -14], [0, Math.PI / 4, 0], 0xff3018, 6);
  soft(1, 10, [14, 3, -14], [0, -Math.PI / 4, 0], 0xff5028, 5);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0x08080a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01;
  scene.add(floor);
  return scene;
}

// ---------------------------------------------------------------------------------------------
// Umgebung (Szene-seitig): Himmel-Mesh, Sonnen-/Mondlicht, Nebel, Reflexionskarte

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileCubemapShader();
    this.t = 0.6;
    this.auto = false;
    this.autoSpeed = 1 / 150; // Stufen pro Sekunde (Nachmittag -> Nacht in etwa 7,5 Minuten)
    this.lastEnvT = -99;

    this.skyMat = createSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 500; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.06;
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x7f95ff, 0);
    this.moon.position.set(120, 160, -80);
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 0.4);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xaa6644, 0.0004);
    this.sunDir = new THREE.Vector3(-1, 0.2, 0.2).normalize();
    this.params = todParams(this.t);
    this.envRT = null;
    this.setTime(this.t, true);
  }

  setShadowRange(half) {
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix();
  }

  setTime(t, force = false) {
    this.t = clamp(t, 0, 3);
    const p = (this.params = todParams(this.t));
    this.sunDir = sunDirection(p.el, p.az);
    setSkyUniforms(this.skyMat, p, this.sunDir, 40);
    this.skyMat.uniforms.uCloudAmt.value = 0.6;
    this.sunVis = smoothstep(-3, 2.5, p.el);
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunI * this.sunVis;
    this.moon.intensity = 0.55 * (1 - smoothstep(0.5, 2.5, this.t) * 0 ) * smoothstep(1.7, 3, this.t);
    this.hemi.color.copy(p.hemiSky); this.hemi.groundColor.copy(p.hemiGnd); this.hemi.intensity = p.hemiI;
    this.scene.fog.color.copy(p.fog);
    this.scene.fog.density = p.fogD;
    this.scene.environmentIntensity = p.env;
    this.renderer.toneMappingExposure = p.exposure;
    this.sun.visible = this.sunVis > 0.001;
    // Reflexionskarte nur bei merklicher Änderung neu rendern (kostet einige ms)
    if (force || Math.abs(this.t - this.lastEnvT) > 0.025) {
      this.lastEnvT = this.t;
      this._rebuildEnv();
    }
  }

  _rebuildEnv() {
    const es = buildSunsetEnvScene(this.params, this.sunDir);
    const rt = this.pmrem.fromScene(es, 0.0, 0.1, 2000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
  }

  /** Eigene Reflexionskarte (z. B. Studio für die Garage) -> RenderTarget; Aufrufer kümmert sich um dispose. */
  makeStudioEnv() {
    const es = buildStudioEnvScene();
    const rt = this.pmrem.fromScene(es, 0.0, 0.1, 200);
    es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    return rt;
  }

  /** Pro Frame: Himmel an Kamera heften, Schatten dem Ziel folgen lassen. */
  update(dt, camera, target) {
    if (this.auto) this.setTime(Math.min(3, this.t + dt * this.autoSpeed));
    this.skyMat.uniforms.uTime.value += dt;
    this.sky.position.copy(camera.position);
    const far = camera.far * 0.9;
    this.sky.scale.setScalar(far);
    if (target) {
      // Schattenkamera am Raster einrasten, damit die Schatten nicht flimmern
      const texel = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
      const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
      this.sun.target.position.set(tx, target.y, tz);
      this.sun.position.set(tx, target.y, tz).addScaledVector(this.sunDir.y > 0.02 ? this.sunDir : new THREE.Vector3(0, 1, 0), 220);
      this.sun.target.updateMatrixWorld();
    }
  }
}
