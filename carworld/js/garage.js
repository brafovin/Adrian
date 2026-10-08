// Garage: dunkler Showroom mit Lichtbändern, Spiegelboden und Orbit-Kamera. Zeigt das Fahrzeug von außen und innen.

import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

const HDR = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

export class Garage {
  constructor(renderer, env) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020203);
    this.camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 200);
    this.rt = env.makeStudioEnv();
    this.scene.environment = this.rt.texture;
    this.scene.environmentIntensity = 1.0;
    this.build();
    this.yaw = 0.62; this.pitch = 0.16; this.dist = 8; this.target = new THREE.Vector3(0, 0.6, 0);
    this.view = { yaw: this.yaw, pitch: this.pitch, dist: this.dist, target: this.target.clone() };
    this.mode = 'orbit'; // 'orbit' | 'interior'
    this.auto = 0.04;
    this.current = null;
    this.mirror = null;
    this.idle = 0;
  }

  build() {
    const s = this.scene;
    // Raum (sehr dunkel), Lichtbänder wie in der Reflexionskarte -> sichtbar und passend zu den Spiegelungen
    const room = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 60), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.9, side: THREE.BackSide }));
    room.position.y = 9; s.add(room);
    const soft = (w, h, pos, rot, color, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: HDR(color, k), side: THREE.DoubleSide }));
      m.position.set(...pos); m.rotation.set(...rot); s.add(m); return m;
    };
    soft(3, 24, [-4.5, 11, 0], [Math.PI / 2, 0, 0], 0xfff1e0, 7);
    soft(3, 24, [4.5, 11, 0], [Math.PI / 2, 0, 0], 0xffe3c6, 6);
    soft(1.2, 22, [0, 11, 0], [Math.PI / 2, 0, 0], 0xffffff, 9);
    soft(2, 14, [-18, 5, 0], [0, Math.PI / 2, 0], 0xffd9b0, 5);
    soft(2, 14, [18, 5, 0], [0, -Math.PI / 2, 0], 0xffd9b0, 5);
    soft(24, 1.4, [0, 4, -20], [0, 0, 0], 0xffe8d0, 4);
    soft(24, 0.7, [0, 1.2, 20], [0, Math.PI, 0], 0xc8d8ff, 3);
    soft(1, 10, [-14, 3, -14], [0, Math.PI / 4, 0], 0xff3018, 6);
    soft(1, 10, [14, 3, -14], [0, -Math.PI / 4, 0], 0xff5028, 5);
    // Boden: halbtransparent über der gespiegelten Fahrzeugkopie
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({
      color: 0x050506, roughness: 0.16, metalness: 0.2, transparent: true, opacity: 0.8, envMapIntensity: 1.3,
    }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.renderOrder = 1; s.add(floor);
    this.floor = floor;
    // Lichter + Schatten
    const key = new THREE.SpotLight(0xffe9d2, 260, 40, 0.5, 0.7, 1.5);
    key.position.set(6, 9, 6); key.target.position.set(0, 0.5, 0); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.05;
    const rim = new THREE.SpotLight(0xff5a3a, 160, 40, 0.6, 0.8, 1.5);
    rim.position.set(-7, 4, -7); rim.target.position.set(0, 0.6, 0);
    const fill = new THREE.SpotLight(0x9fc4ff, 70, 40, 0.7, 0.9, 1.5);
    fill.position.set(7, 3, -6); fill.target.position.set(0, 0.6, 0);
    s.add(key, key.target, rim, rim.target, fill, fill.target);
    s.add(new THREE.AmbientLight(0xffffff, 0.04));
    // Bodenleuchtlinie (Showroom-Look)
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.66, 96), new THREE.MeshBasicMaterial({ color: HDR(0xffb36b, 2.2), side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; s.add(ring);
    this.stage = new THREE.Group(); s.add(this.stage);
  }

  /** Fahrzeugmodell in die Garage stellen (Hülle um die Räder, parken). */
  setModel(model) {
    if (this.current) { this.stage.remove(this.current.root); if (this.mirror) this.stage.remove(this.mirror); }
    this.current = model;
    model.root.position.set(-model.cgX * 0 - 0.0, 0, 0);
    model.root.rotation.set(0, 0, 0);
    model.root.scale.set(1, 1, 1);
    model.update({ steerAngle: 0, spin: [0, 0, 0, 0], travel: [0, 0, 0, 0], omega: [0, 0, 0, 0], pitch: 0, roll: 0, _steerL: 0, _steerR: 0 });
    model.setLights({ head: 0.6, brake: 0 });
    this.stage.add(model.root);
    // Spiegelbild für den Showroom-Boden: geteilte Materialien, an der Bodenebene gespiegelt
    const mir = model.root.clone(true);
    mir.scale.y = -1;
    mir.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } o.isLight && (o.visible = false); });
    this.mirror = mir; this.stage.add(mir);
    this.view.target.set(0, 0.62, 0);
    this.setCam('3q');
    this.mirrorSync = true;
  }

  setCam(name) {
    const d = this.current?.dims;
    this.mode = 'orbit';
    const L = d ? d.length : 5;
    const presets = {
      '3q': { yaw: 0.62, pitch: 0.14, dist: L * 1.75 },
      front: { yaw: 0.0, pitch: 0.08, dist: L * 1.5 },
      side: { yaw: Math.PI / 2, pitch: 0.04, dist: L * 1.9 },
      rear: { yaw: Math.PI + 0.55, pitch: 0.12, dist: L * 1.6 },
      wheel: { yaw: 0.95, pitch: 0.05, dist: 3.1, target: [this.current ? this.current.def.wheels.front.tireR * 0 + (d.wheelbase / 2) : 1.4, 0.38, -(d.trackF / 2)] },
      top: { yaw: 0.2, pitch: 1.35, dist: L * 2.2 },
    };
    if (name === 'interior') {
      this.mode = 'interior';
      const eye = this.current.interior?.userData.cockpitEye || [0, 1.1, -0.36];
      this.eye = new THREE.Vector3(eye[0], eye[1], eye[2]);
      this.look = { yaw: 0.0, pitch: -0.12 };
      this.camName = name;
      return;
    }
    const p = presets[name] || presets['3q'];
    this.view.yaw = p.yaw; this.view.pitch = p.pitch; this.view.dist = p.dist;
    this.view.target.set(...(p.target || [0, 0.62, 0]));
    this.camName = name;
    this.auto = name === '3q' ? 0.04 : 0;
  }

  /** Maus/Controller-Eingaben und Frame-Update. */
  update(dt, input, aspect) {
    this.camera.aspect = aspect;
    if (Math.abs(input.lookX) + Math.abs(input.lookY) > 0.001 || input.drag) this.idle = 0; else this.idle += dt;
    if (this.mode === 'orbit') {
      this.view.yaw -= input.lookX; this.view.pitch = clamp(this.view.pitch + input.lookY * 0.8, -0.1, 1.45);
      this.view.dist = clamp(this.view.dist + input.zoom * 0.5, 1.6, 22);
      if (this.auto && this.idle > 1.5) this.view.yaw += this.auto * dt;
      this.yaw = damp(this.yaw, this.view.yaw, 10, dt); this.pitch = damp(this.pitch, this.view.pitch, 10, dt); this.dist = damp(this.dist, this.view.dist, 10, dt);
      this.target.x = damp(this.target.x, this.view.target.x, 8, dt); this.target.y = damp(this.target.y, this.view.target.y, 8, dt); this.target.z = damp(this.target.z, this.view.target.z, 8, dt);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      // yaw 0 = von vorne (+x), yaw wächst gegen den Uhrzeigersinn von oben
      this.camera.position.set(this.target.x + Math.cos(this.yaw) * cp * this.dist, Math.max(0.12, this.target.y + sp * this.dist), this.target.z - Math.sin(this.yaw) * cp * this.dist);
      this.camera.fov = 36; this.camera.near = 0.1;
      this.camera.lookAt(this.target);
    } else {
      this.look.yaw -= input.lookX * 0.8; this.look.pitch = clamp(this.look.pitch + input.lookY * 0.6, -0.9, 0.7);
      const eye = this.eye.clone();
      this.current.root.updateMatrixWorld(true);
      this.camera.position.copy(this.current.root.localToWorld(eye));
      const dir = new THREE.Vector3(Math.cos(this.look.yaw) * Math.cos(this.look.pitch), Math.sin(this.look.pitch), -Math.sin(this.look.yaw) * Math.cos(this.look.pitch));
      this.camera.lookAt(this.camera.position.clone().add(dir));
      this.camera.fov = clamp(70 - input.zoom * 3, 40, 95); this.camera.near = 0.03;
    }
    this.camera.updateProjectionMatrix();
    if (this.current) this.current.root.updateMatrixWorld(true);
  }
}
