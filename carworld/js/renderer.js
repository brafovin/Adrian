// Renderer, Nachbearbeitung (MSAA, Bloom, Tonemapping, Vignette) und skalierbare Qualitätsstufen.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { clamp } from './util.js';

export const QUALITY = {
  low:    { scale: 0.75, samples: 0, bloom: false, ao: false, shadow: 1024, shadowRange: 50, view: 700, anisotropy: 2 },
  medium: { scale: 1.0, samples: 2, bloom: true, ao: false, shadow: 2048, shadowRange: 60, view: 1000, anisotropy: 4 },
  high:   { scale: 1.0, samples: 4, bloom: true, ao: false, shadow: 2048, shadowRange: 70, view: 1400, anisotropy: 8 },
  ultra:  { scale: 1.25, samples: 4, bloom: true, ao: true, shadow: 4096, shadowRange: 80, view: 1800, anisotropy: 16 },
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uGrain: { value: 0.02 }, uTime: { value: 0 }, uAspect: { value: 1.6 }, uWarm: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig, uGrain, uTime, uAspect, uWarm; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.35, 1.05, length(q));
      c.rgb *= 1.0 - v * uVig;
      // leichte S-Kurve + warme Lichter / kühle Schatten (Automotive-Look)
      vec3 x = c.rgb;
      x = mix(x, x * x * (3.0 - 2.0 * x), 0.22);
      float l = dot(x, vec3(0.299, 0.587, 0.114));
      x += vec3(0.012, 0.004, -0.010) * smoothstep(0.3, 1.0, l) * (1.0 + uWarm);
      x += vec3(-0.004, 0.0, 0.010) * (1.0 - smoothstep(0.0, 0.25, l));
      x += (h(vUv * 1400.0) - 0.5) * uGrain;
      gl_FragColor = vec4(x, c.a);
    }`,
};

export class Pipeline {
  constructor(canvas, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    this.q = QUALITY.high;
    this.qName = 'high';
    this.scale = 1;
    this.drsScale = 1;
    this.auto = true;
    this.frameTimes = [];
    this.setQuality('high');
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.q = q; this.qName = name;
    this._build();
  }

  _build() {
    const r = this.renderer, q = this.q;
    if (this.composer) { this.composer.dispose?.(); this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const w = Math.max(2, Math.floor(r.domElement.clientWidth || window.innerWidth)), h = Math.max(2, Math.floor(r.domElement.clientHeight || window.innerHeight));
    const pr = Math.min(window.devicePixelRatio || 1, 2) * q.scale * this.drsScale;
    r.setPixelRatio(pr);
    r.setSize(w, h, false);
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.samples, colorSpace: THREE.LinearSRGBColorSpace });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.ao = null;
    if (q.ao) {
      this.ao = new GTAOPass(this.scene, this.camera, w, h);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1.5, scale: 1.1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
    }
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 1.0);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.grade.renderToScreen = true;
    this.w = w; this.h = h;
    this.onShadowQuality?.(q);
  }

  /** Andere Szene/Kamera rendern (z. B. Garage). */
  setView(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    if (this.ao) { this.ao.scene = scene; this.ao.camera = camera; }
    this.resize(true);
  }

  resize(force = false) {
    const r = this.renderer;
    const el = r.domElement;
    const w = Math.max(2, el.clientWidth), h = Math.max(2, el.clientHeight);
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * this.q.scale * this.drsScale;
    r.setPixelRatio(pr);
    r.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
    if (this.camera.isPerspectiveCamera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  /** Dynamische Auflösung: hält die Bildrate, indem der Render-Maßstab in kleinen Schritten angepasst wird. */
  trackFrame(dtMs) {
    if (!this.auto) return;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let s = this.drsScale;
    if (avg > 24) s = Math.max(0.5, s - 0.1);
    else if (avg < 15) s = Math.min(1, s + 0.05);
    if (Math.abs(s - this.drsScale) > 1e-3) {
      this.drsScale = s;
      const pr = Math.min(window.devicePixelRatio || 1, 2) * this.q.scale * this.drsScale;
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(this.w, this.h, false);
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.w, this.h);
    }
  }

  render(dt, time) {
    this.grade.uniforms.uTime.value = time % 10;
    this.composer.render(dt);
  }
}

export function applyShadowQuality(env, q) {
  env.sun.shadow.mapSize.set(q.shadow, q.shadow);
  if (env.sun.shadow.map) { env.sun.shadow.map.dispose(); env.sun.shadow.map = null; }
  env.setShadowRange(q.shadowRange);
}
