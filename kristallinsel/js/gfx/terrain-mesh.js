// Gelände als ein Dreiecksnetz mit Vertexfarben (flach schattiert, Low-Poly-Stil).
import * as THREE from 'three';
import { SEG, CELL, HALF, SIZE, groundColor } from '../terrain.js';

export function buildTerrainMesh(terrain) {
  const N = SEG + 1;
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      pos[k * 3] = x; pos[k * 3 + 1] = terrain.heights[k]; pos[k * 3 + 2] = z;
      const g = groundColor(terrain, x, z);
      c.setRGB(g[0], g[1], g[2], THREE.SRGBColorSpace);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  // Gleiche Diagonale wie terrain.heightAt: (v00, v01, v10) und (v01, v11, v10)
  const idx = new Uint32Array(SEG * SEG * 6);
  let o = 0;
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
      idx[o++] = a; idx[o++] = d; idx[o++] = b;
      idx[o++] = d; idx[o++] = e; idx[o++] = b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Tiefenkarte fürs Wasser (R = Wassertiefe / 20 m). */
export function buildDepthTexture(terrain) {
  const N = SEG + 1;
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    const d = Math.max(0, Math.min(1, -terrain.heights[k] / 20));
    data[k * 4] = Math.round(d * 255);
    data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export const TERRAIN_SIZE = SIZE;
