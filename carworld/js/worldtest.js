// Entwicklungs-Test der Welt: freie Kamera, Parameter über die URL (?cam=x,y,z,tx,ty,tz,fov&tod=0.8&q=low&r=3)
import * as THREE from 'three';
import { Pipeline, QUALITY, applyShadowQuality } from './renderer.js';
import { Environment } from './env.js';
import { World } from './world/world.js';

const qs = new URLSearchParams(location.search);
const quality = qs.get('q') || 'low';
const canvas = document.getElementById('c');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 6000);
const pipe = new Pipeline(canvas, scene, camera);
pipe.setQuality(quality); pipe.auto = false;
const env = new Environment(pipe.renderer, scene);
env.setTime(parseFloat(qs.get('tod') ?? '0.8'), true);
applyShadowQuality(env, QUALITY[quality]);
const world = new World(scene, { quality });
world.radius = parseInt(qs.get('r') || '4');

const cam = (qs.get('cam') || '0,60,200,0,10,0,60').split(',').map(Number);
camera.position.set(cam[0], cam[1], cam[2]);
camera.lookAt(cam[3], cam[4], cam[5]);
camera.fov = cam[6] || 60; camera.updateProjectionMatrix();
camera.far = 6000;

const t0 = performance.now();
await world.preload(cam[0], cam[2], world.radius);
const loadMs = performance.now() - t0;
console.log(`chunks: ${world.chunks.size}, build ms: ${loadMs.toFixed(0)}, avg ${(world._buildStat.ms / world._buildStat.n).toFixed(1)} ms/chunk, colliders ${world.grid.count}`);
let verts = 0, tris = 0, meshes = 0;
world.group.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; tris += (o.geometry.index ? o.geometry.index.count : 0) / 3; } });
console.log(`Geometrie: ${meshes} Meshes, ${(verts / 1000).toFixed(0)}k Vertices, ${(tris / 1000).toFixed(0)}k Dreiecke (${(tris / world.chunks.size / 1000).toFixed(1)}k je Chunk)`);
window.__info = { chunks: world.chunks.size, loadMs, avg: world._buildStat.ms / world._buildStat.n };
pipe.resize();
let frames = 0;
function loop() {
  pipe.resize();
  world.setTimeOfDay(env.params, 0.016, camera.position);
  env.update(0.016, camera, camera.position);
  pipe.render(0.016, frames * 0.016);
  if (++frames === 3) window.__done = true; else requestAnimationFrame(loop);
}
loop();
