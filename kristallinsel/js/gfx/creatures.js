// Tiere: Schafe auf der Weide (grasen, laufen umher, weichen aus), Möwen am Meer, Schmetterlinge am Tag.
import * as THREE from 'three';
import { lumpyIco, colored, mergeGeos } from './geo.js';
import { PASTURE, ROCKISLE, PIER, WRECK } from '../layout.js';

class Sheep {
  constructor(scene, x, z, mats) {
    this.g = new THREE.Group();
    const body = new THREE.Mesh(lumpyIco(0.5, 1, Math.floor(x * 10), 0.12), mats.wool);
    body.scale.set(0.95, 0.8, 1.35);
    body.position.y = 0.72;
    body.castShadow = true;
    this.g.add(body);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.85, 0.62);
    const parts = [
      colored(new THREE.BoxGeometry(0.26, 0.3, 0.36), 0x2e2620, { z: 0.12 }),
      colored(lumpyIco(0.17, 0, 5, 0.1), 0xf2efe6, { y: 0.13 }),
    ];
    for (const s of [-1, 1]) {
      parts.push(colored(new THREE.BoxGeometry(0.16, 0.05, 0.08), 0x2e2620, { x: s * 0.18, y: 0.08, z: 0.04, rz: s * 0.4 }));
      parts.push(colored(new THREE.SphereGeometry(0.025, 5, 4), 0x0a0a0a, { x: s * 0.1, y: 0.06, z: 0.31 }));
    }
    const hm = new THREE.Mesh(mergeGeos(parts), mats.vc);
    hm.castShadow = true;
    this.head.add(hm);
    this.g.add(this.head);
    this.legs = [];
    for (const [lx, lz] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.5, lz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.5, 5), mats.face);
      m.position.y = -0.25;
      leg.add(m);
      this.g.add(leg);
      this.legs.push(leg);
    }
    this.g.position.set(x, 0, z);
    scene.add(this.g);
    this.target = new THREE.Vector2(x, z);
    this.wait = Math.random() * 4;
    this.speed = 0;
    this.phase = Math.random() * 10;
    this.yaw = Math.random() * 6.28;
  }
}

export class Creatures {
  constructor(scene, heightAt) {
    this.heightAt = heightAt;
    const mats = {
      wool: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 1, flatShading: true }),
      face: new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x0a0a0a }),
      gull: new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.8, flatShading: true }),
      wing: new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }),
      beak: new THREE.MeshStandardMaterial({ color: 0xf0b030 }),
      vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    };
    this.sheep = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 3 + (i % 3) * 3;
      this.sheep.push(new Sheep(scene, PASTURE.x + Math.cos(a) * r, PASTURE.z + Math.sin(a) * r, mats));
    }

    // Möwen kreisen über dem Möwenfels, dem Steg und dem Wrack
    this.gulls = [];
    const centers = [[ROCKISLE.x, ROCKISLE.z, 4], [PIER.x, PIER.z + 25, 3], [WRECK.x, WRECK.z, 2]];
    for (const [cx, cz, n] of centers) {
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(mergeGeos([
          colored(new THREE.SphereGeometry(0.16, 6, 5), 0xf6f6f2, { sx: 0.8, sy: 0.7, sz: 2.0 }),
          colored(new THREE.ConeGeometry(0.04, 0.14, 4), 0xf0b030, { z: 0.36, rx: Math.PI / 2 }),
        ]), mats.vc));
        const wings = [-1, 1].map((s) => {
          const w = new THREE.Group();
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.24), mats.wing);
          m.position.x = s * 0.38;
          w.add(m);
          g.add(w);
          return { w, s };
        });
        scene.add(g);
        this.gulls.push({ g, wings, cx, cz, r: 10 + Math.random() * 14, h: 12 + Math.random() * 14, sp: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1), a: Math.random() * 6.28, flap: Math.random() * 6 });
      }
    }

    // Schmetterlinge in der Nähe der Figur (tagsüber): alle Flügel in einem instanzierten Mesh
    const cols = [0xffb02e, 0xf55f8c, 0x7fc8ff, 0xffffff, 0xc59cff];
    const wingGeo = new THREE.PlaneGeometry(0.14, 0.12).rotateX(-Math.PI / 2).translate(0.07, 0, 0);
    this.wingMesh = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 24);
    this.wingMesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < 24; i++) this.wingMesh.setColorAt(i, c.setHex(cols[Math.floor(i / 2) % cols.length]));
    scene.add(this.wingMesh);
    this.butterflies = [];
    for (let i = 0; i < 12; i++) this.butterflies.push({ home: new THREE.Vector3(), p: Math.random() * 10, s: 0.6 + Math.random() * 0.8, set: false });
    this._o = new THREE.Object3D();
    this.events = [];
  }

  update(dt, t, player, night) {
    this.events.length = 0;
    const H = this.heightAt;
    for (const s of this.sheep) {
      const pos = s.g.position;
      const dp = Math.hypot(player.x - pos.x, player.z - pos.z);
      s.g.visible = dp < 170;
      let flee = false;
      if (dp < 4.5) {
        // vor der Figur ausweichen
        const ax = pos.x - player.x, az = pos.z - player.z, l = Math.hypot(ax, az) || 1;
        s.target.set(pos.x + (ax / l) * 6, pos.z + (az / l) * 6);
        s.wait = 0;
        flee = true;
        if (Math.random() < dt * 0.6) this.events.push({ type: 'bleat', x: pos.x, z: pos.z });
      }
      // innerhalb des Zauns bleiben
      const ox = s.target.x - PASTURE.x, oz = s.target.y - PASTURE.z, ol = Math.hypot(ox, oz);
      if (ol > 12.5) s.target.set(PASTURE.x + (ox / ol) * 12.5, PASTURE.z + (oz / ol) * 12.5);
      const dx = s.target.x - pos.x, dz = s.target.y - pos.z, d = Math.hypot(dx, dz);
      let want = 0;
      if (s.wait > 0) s.wait -= dt;
      else if (d > 0.3) want = flee ? 3.2 : 0.9;
      else { s.wait = 2 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * 11; s.target.set(PASTURE.x + Math.cos(a) * r, PASTURE.z + Math.sin(a) * r); }
      s.speed += (want - s.speed) * Math.min(1, dt * 4);
      if (d > 0.01 && s.speed > 0.05) {
        const ty = Math.atan2(dx, dz);
        let dd = ty - s.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        s.yaw += dd * Math.min(1, dt * 5);
        pos.x += Math.sin(s.yaw) * s.speed * dt;
        pos.z += Math.cos(s.yaw) * s.speed * dt;
      }
      pos.y = H(pos.x, pos.z);
      s.g.rotation.y = s.yaw;
      s.phase += s.speed * dt * 6;
      s.legs.forEach((l, i) => { l.rotation.x = Math.sin(s.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 * Math.min(1, s.speed); });
      const graze = s.speed < 0.1 && s.wait > 0 ? 1 : 0;
      s.head.rotation.x += ((graze ? 0.9 + Math.sin(t * 3 + s.phase) * 0.1 : -0.1) - s.head.rotation.x) * Math.min(1, dt * 3);
      if (Math.random() < dt * 0.02 && dp < 40) this.events.push({ type: 'bleat', x: pos.x, z: pos.z });
    }
    for (const g of this.gulls) {
      g.a += g.sp * dt;
      const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r;
      g.g.position.set(x, g.h + Math.sin(t * 0.7 + g.a) * 2, z);
      g.g.visible = Math.hypot(x - player.x, z - player.z) < 260;
      g.g.rotation.y = Math.atan2(-Math.sin(g.a) * g.sp, Math.cos(g.a) * g.sp);
      g.g.rotation.z = -Math.sign(g.sp) * 0.3;
      g.flap += dt;
      const flapping = Math.sin(g.flap * 0.4) > 0.2;
      const ang = flapping ? Math.sin(g.flap * 9) * 0.6 : 0.08;
      g.wings.forEach(({ w, s }) => { w.rotation.z = s * ang; });
      if (Math.random() < dt * 0.05) this.events.push({ type: 'gull', x, z });
    }
    const day = 1 - night;
    this.wingMesh.visible = day > 0.5;
    if (this.wingMesh.visible) {
      const o = this._o;
      this.butterflies.forEach((b, i) => {
        if (!b.set || b.home.distanceTo(player) > 30) {
          const a = Math.random() * 6.28, r = 6 + Math.random() * 14;
          b.home.set(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r);
          b.set = true;
        }
        const x = b.home.x + Math.sin(t * 0.6 * b.s + b.p) * 2.5, z = b.home.z + Math.cos(t * 0.45 * b.s + b.p * 1.7) * 2.5;
        const y = Math.max(H(x, z), 0.3) + 0.8 + Math.sin(t * 2.2 * b.s + b.p) * 0.4;
        const f = Math.sin(t * 22 * b.s + b.p);
        for (const s of [-1, 1]) {
          o.position.set(x, y, z);
          o.rotation.set(0, t * 0.6 * b.s + b.p, s * f);
          o.scale.set(s, 1, 1);
          o.updateMatrix();
          this.wingMesh.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.matrix);
        }
      });
      this.wingMesh.instanceMatrix.needsUpdate = true;
    }
    return this.events;
  }
}
