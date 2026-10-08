// Entwicklungs-Betrachter: zeigt ein Fahrzeug aus Referenz-Blickwinkeln (Query-Parameter), z. B.
//   viewer.html?car=cls63&view=hero&tod=0.8&q=low
import * as THREE from 'three';
import { Pipeline, QUALITY, applyShadowQuality } from './renderer.js';
import { Environment } from './env.js';
import { loadCar } from './cars/index.js';

const qs = new URLSearchParams(location.search);
const carId = qs.get('car') || 'cls63';
const view = qs.get('view') || 'hero';
const tod = parseFloat(qs.get('tod') ?? '0.8');
const quality = qs.get('q') || 'high';
const studio = qs.get('studio') === '1';
const yawDeg = parseFloat(qs.get('yaw') ?? '0');

const canvas = document.getElementById('c');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 3000);
const pipe = new Pipeline(canvas, scene, camera);
pipe.setQuality(quality);
pipe.auto = false;
const env = new Environment(pipe.renderer, scene);
env.setTime(tod, true);
applyShadowQuality(env, QUALITY[quality]);
env.setShadowRange(14);

if (studio) {
  const rt = env.makeStudioEnv();
  scene.environment = rt.texture;
  scene.background = new THREE.Color(0x030304);
  scene.fog = null;
  env.sky.visible = false;
  env.hemi.intensity = 0.05; env.sun.intensity = 0; env.moon.intensity = 0;
  pipe.renderer.toneMappingExposure = 1.0;
}

// Boden: nasser, dunkler Asphalt
const gMat = new THREE.MeshStandardMaterial({ color: 0x0c0b0c, roughness: 0.3, metalness: 0.0, envMapIntensity: 1.0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), gMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

const model = await loadCar(carId);
model.root.rotation.y = (yawDeg * Math.PI) / 180;
scene.add(model.root);
if (qs.get('lights') === '1') model.setLights({ head: 1, brake: 1 });

const D = {
  // [Kameraposition], [Ziel], fov
  hero: [[3.55, 0.78, -3.15], [0.55, 0.5, 0], 38],
  side: [[0, 0.62, -22], [0, 0.66, 0], 7.3],
  rear: [[-5.4, 1.15, -4.4], [-0.2, 0.6, 0], 34],
  front: [[7.5, 0.9, 0.0], [0, 0.6, 0], 30],
  top: [[0.01, 12, 0], [0, 0, 0], 30],
  back: [[-8, 0.9, 0.0], [0, 0.65, 0], 30],
  wheel: [[0.6, 0.45, -3.2], [1.475, 0.38, -0.85], 20],
  wheelr: [[-0.6, 0.45, -3.2], [-1.475, 0.38, -0.85], 20],
  noseclose: [[4.2, 0.55, -1.8], [2.3, 0.4, 0], 38],
  tailclose: [[-4.2, 0.6, -1.8], [-2.3, 0.45, 0], 38],
  threeq: [[6.5, 1.5, 4.5], [0, 0.6, 0], 30],
};
let cp, ct, fov;
if (qs.get('cam')) {
  const a = qs.get('cam').split(',').map(Number);
  cp = a.slice(0, 3); ct = a.slice(3, 6); fov = a[6] || 32;
} else [cp, ct, fov] = D[view] || D.hero;
camera.position.set(...cp);
camera.lookAt(...ct);
camera.fov = fov; camera.updateProjectionMatrix();

// Orthografische Referenz-Überlagerung: ortho=cx,cy,pxPerM,breitePx,höhePx (cx/cy = Bildmitte in Fahrzeugmetern)
let activeCam = camera;
if (qs.get('ortho')) {
  const [cx, cy, ppm, wpx, hpx] = qs.get('ortho').split(',').map(Number);
  const oc = new THREE.OrthographicCamera(-wpx / ppm / 2, wpx / ppm / 2, hpx / ppm / 2, -hpx / ppm / 2, 0.1, 200);
  const side = qs.get('side') === 'right' ? 1 : -1; // Kamera auf der linken (-z) oder rechten Fahrzeugseite
  oc.position.set(cx, cy, side * 30);
  oc.lookAt(cx, cy, 0);
  activeCam = oc;
  pipe.camera = oc; pipe.renderPass.camera = oc;
}
if (qs.get('mat') === 'normal') {
  const nm = new THREE.MeshNormalMaterial();
  scene.traverse((o) => { if (o.isMesh && o !== ground && o !== env.sky) o.material = nm; });
}
if (qs.get('sil') === '1') {
  scene.background = new THREE.Color(0xffffff);
  scene.fog = null; env.sky.visible = false; ground.visible = false;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  scene.traverse((o) => { if (o.isMesh && o !== ground && o !== env.sky) o.material = black; });
  pipe.renderer.toneMapping = THREE.NoToneMapping;
  pipe.grade.uniforms.uVig.value = 0; pipe.grade.uniforms.uGrain.value = 0;
}
pipe.resize();
let frames = 0;
function loop() {
  pipe.resize();
  env.update(0.016, activeCam, new THREE.Vector3(0, 0, 0));
  pipe.render(0.016, frames * 0.016);
  if (++frames === 3) { window.__info = { tris: pipe.renderer.info.render.triangles, calls: pipe.renderer.info.render.calls }; window.__done = true; }
  else requestAnimationFrame(loop);
}
loop();
