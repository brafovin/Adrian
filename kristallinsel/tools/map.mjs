// Zeichnet die Insel als PNG (Draufsicht, Norden oben) – zum Abstimmen von Gelände und Orten.
// Aufruf: node tools/map.mjs ausgabe.png [Pixel] [roh]   ("roh" = ohne Orte/Wege/Kristalle)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildTerrain, groundColor, HALF, SIZE, WATER } from '../js/terrain.js';

const [,, out = 'map.png', px = '768', raw] = process.argv;
const W = +px;
let t, extra = null;
if (raw !== 'roh') {
  const { createWorld } = await import('../js/world.js');
  const w = createWorld();
  t = w.terrain;
  extra = { POIS: w.pois, CRYSTALS: w.crystals, NPCS: w.npcs, SPAWN: w.spawn, trees: w.veg.trees, cols: w.colliders.list };
  console.log('Bäume', w.veg.trees.length, 'Felsen', w.veg.rocks.length, 'Büsche', w.veg.bushes.length, 'Blumen', w.veg.flowers.length, 'Gras', w.veg.grass.length, 'Kristalle', w.crystals.length, 'Kollider', w.colliders.list.length);
} else t = buildTerrain({ flatten: [], paths: [] });
const img = Buffer.alloc(W * W * 3);
for (let py = 0; py < W; py++) {
  for (let pxi = 0; pxi < W; pxi++) {
    const x = -HALF + (pxi + 0.5) / W * SIZE, z = -HALF + (py + 0.5) / W * SIZE;
    const h = t.heightAt(x, z);
    let c = groundColor(t, x, z);
    const n = t.smoothNormal(x, z);
    const shade = Math.max(0.35, Math.min(1.2, 0.55 + 0.65 * (n[1] * 0.6 + (-n[0] * 0.5 + -n[2] * 0.6))));
    c = c.map((v) => v * shade);
    if (h < WATER) {
      const d = Math.min(1, (WATER - h) / 10);
      c = [c[0] * (1 - d) * 0.4 + 0.12 * d + 0.1, c[1] * (1 - d) * 0.5 + 0.45 * d + 0.15, c[2] * (1 - d) * 0.5 + 0.6 * d + 0.25];
    }
    const o = (py * W + pxi) * 3;
    for (let k = 0; k < 3; k++) img[o + k] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.min(1, c[k]), 1 / 2.2) * 255)));
  }
}
function dot(x, z, rgb, r = 3) {
  const cx = Math.round((x + HALF) / SIZE * W), cz = Math.round((z + HALF) / SIZE * W);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const X = cx + dx, Y = cz + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
    const o = (Y * W + X) * 3; img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2];
  }
}
if (extra) {
  for (const tr of extra.trees) dot(tr.x, tr.z, tr.type === 'pine' ? [20, 70, 40] : tr.type === 'palm' ? [90, 140, 40] : [40, 100, 30], 1);
  for (const c of extra.cols) if (!c.tag) dot(c.x, c.z, [120, 60, 30], 1);
  for (const p of extra.POIS) dot(p.x, p.z, [255, 40, 40], 5);
  for (const c of extra.CRYSTALS) dot(c.x, c.z, [40, 255, 255], 2);
  for (const n of extra.NPCS) dot(n.x, n.z, [255, 140, 0], 3);
  dot(extra.SPAWN.x, extra.SPAWN.z, [255, 255, 255], 4);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const rows = Buffer.alloc((W * 3 + 1) * W);
for (let y = 0; y < W; y++) { rows[y * (W * 3 + 1)] = 0; img.copy(rows, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
console.log('geschrieben:', out);
