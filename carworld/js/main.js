// Sunset Drive – Hauptprogramm: Start, Menüs, Fahrmodus, Garage, Pause.

import * as THREE from 'three';
import { Pipeline, QUALITY, applyShadowQuality } from './renderer.js';
import { Environment } from './env.js';
import { World } from './world/world.js';
import { loadCar, CAR_IDS } from './cars/index.js';
import { PAINTS, RIMS } from './cars/builder.js';
import { SPECS } from './cars/specs.js';
import { Vehicle } from './physics/vehicle.js';
import { Player } from './player.js';
import { CameraRig, CAM_NAMES } from './camera.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Garage } from './garage.js';
import { Traffic, Pedestrians } from './world/traffic.js';
import { DEFAULTS, loadSettings, saveSettings, SETTING_DEFS, TOD_PRESETS } from './settings.js';
import { clamp, lerp } from './util.js';

const $ = (id) => document.getElementById(id);
const SPAWN = { x: -700, z: -6.6, yaw: Math.PI }; // Allee Richtung Meer und Sonnenuntergang
const MENU = { x: -1180, z: 500, yaw: Math.PI };  // Promenade an der Küste: Skyline im Gegenlicht des Sonnenuntergangs (Startbild)

const CAR_INFO = {
  cls63: { tag: 'Widebody · 5,5 l V8 Biturbo · Allrad', ps: 585, drive: 'Allrad' },
  rs7: { tag: 'Widebody · 4,0 l V8 Biturbo · quattro', ps: 600, drive: 'quattro' },
  i7: { tag: 'Widebody · Zwei Elektromotoren · Allrad', ps: 660, drive: 'Elektro-Allrad' },
  g63: { tag: 'Mansory-Stil · 4,0 l V8 Biturbo · Allrad', ps: 850, drive: 'Allrad' },
};

/** Beschleunigung 0–100 km/h im Spiel selbst messen (ehrliche Werte für die Auswahl). */
function measure0100(id) {
  const v = new Vehicle(SPECS[id]); v.reset(0, 0, 0);
  let t = 0; const dt = 1 / 240;
  while (v.u * 3.6 < 100 && t < 15) { v.step(dt, { throttle: 1, brake: 0, steer: 0 }, { assist: 1 }); t += dt; }
  return t;
}

class Game {
  async boot() {
    this.qs = new URLSearchParams(location.search);
    this.settings = loadSettings();
    if (this.qs.get('car') && CAR_IDS.includes(this.qs.get('car'))) this.settings.car = this.qs.get('car');
    if (this.qs.get('q')) this.settings.quality = this.qs.get('q');
    if (this.qs.get('tod') && TOD_PRESETS[this.qs.get('tod')] !== undefined) this.settings.tod = this.qs.get('tod');
    this.mode = 'loading';
    this.canvas = $('c');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 4500);
    this.pipe = new Pipeline(this.canvas, this.scene, this.camera);
    this.pipe.setQuality(this.settings.quality);
    this.pipe.auto = this.settings.dynres && !this.qs.get('static');
    this.env = new Environment(this.pipe.renderer, this.scene);
    this.world = new World(this.scene, { quality: this.settings.quality });
    applyShadowQuality(this.env, QUALITY[this.settings.quality]);
    // Schaufenster-Licht fürs Startbild/Fahrzeugwahl: warmes Seitenlicht + Gegenlicht-Kante, damit der schwarze Lack Form zeigt
    this.menuLights = new THREE.Group();
    this.menuKey = new THREE.DirectionalLight(0xffd3a1, 1.5); this.menuRim = new THREE.DirectionalLight(0xff9a5c, 2.4);
    for (const l of [this.menuKey, this.menuRim]) { l.castShadow = false; this.menuLights.add(l, l.target); }
    this.menuLights.visible = false;
    this.scene.add(this.menuLights);
    this.hud = new Hud(this.world.layout);
    this.input = new Input(window);
    this.audio = new AudioEngine();
    this.cameraRig = new CameraRig(this.camera, this.world);
    this.garage = new Garage(this.pipe.renderer, this.env);
    const Q = { low: [14, 30], medium: [26, 60], high: [40, 90], ultra: [56, 130] }[this.settings.quality] || [40, 90];
    this.traffic = new Traffic(this.scene, this.world, { count: Q[0] });
    this.peds = new Pedestrians(this.scene, this.world, { count: Q[1] });
    this.models = {};
    this.stats = {};
    this.pending = { shiftUp: false, shiftDown: false };
    this.testInput = null;
    this.navIndex = -1;
    this.lastSafe = { ...SPAWN };
    this.safeT = 0;
    this.last = performance.now();
    this.time = 0;
    this.pois = this.makePois();

    this.applyTod();
    this.bindInput();
    this.bindUI();
    this.buildSettingsUI();

    // Welt rund um den Startpunkt aufbauen (Fortschrittsbalken)
    this.setProgress(0, 'Stadt wird aufgebaut …');
    await this.world.preload(MENU.x, MENU.z, 3, (p) => this.setProgress(p * 0.35));
    await this.world.preload(SPAWN.x, SPAWN.z, 3, (p) => this.setProgress(0.35 + p * 0.35));
    this.setProgress(0.72, 'Fahrzeug wird geladen …');
    await new Promise((r) => setTimeout(r, 0));
    const model = await this.getModel(this.settings.car);
    this.player = new Player(model, this.world);
    this.scene.add(model.root);
    this.applyTuning(model);
    this.player.assist = this.settings.assist;
    this.player.manual = this.settings.gearbox === 'manual';
    this.player.reset(MENU.x, MENU.z, MENU.yaw);
    this.setProgress(0.9, 'Beleuchtung …');
    for (const id of CAR_IDS) this.stats[id] = { zero100: measure0100(id) };
    this.enterMenu();
    this.setProgress(1);
    $('loading').classList.add('hidden');
    window.__game = this;
    window.__ready = true;
    requestAnimationFrame((t) => this.frame(t));
    if (this.qs.get('autostart')) { this.startPlay(); }
  }

  setProgress(p, text) { $('loadbar').style.width = (p * 100).toFixed(0) + '%'; if (text) $('loadtext').textContent = text; }

  makePois() { return this.world.layout.pois; }

  async getModel(id) {
    if (!this.models[id]) {
      this.models[id] = await loadCar(id);
      this.applyTuning(this.models[id]);
    }
    return this.models[id];
  }

  // -------------------------------------------------------------- Einstellungen
  applyTod() {
    const t = this.settings.tod;
    if (t === 'cycle') { this.env.auto = true; if (this.env.t > 2.9 || this.env.t < 0.1) this.env.setTime(0.5, true); }
    else { this.env.auto = false; this.env.setTime(TOD_PRESETS[t] ?? 0.82, true); }
  }

  applyAll() {
    const s = this.settings;
    this.pipe.setQuality(s.quality);
    this.pipe.auto = s.dynres;
    const Q = { low: [14, 30], medium: [26, 60], high: [40, 90], ultra: [56, 130] }[s.quality] || [40, 90];
    this.traffic?.setCount(Q[0]); this.peds?.setCount(Q[1]);
    applyShadowQuality(this.env, QUALITY[s.quality]);
    this.world.setQuality(s.quality);
    this.applyTod();
    this.audio.setVolume(s.master); this.audio.engineVol = s.engineVol;
    if (this.player) { this.player.assist = s.assist; this.player.manual = s.gearbox === 'manual'; }
    $('hints').style.opacity = s.hints ? 1 : 0;
    saveSettings(s);
  }

  buildSettingsUI() {
    const root = $('setList');
    root.innerHTML = '';
    for (const d of SETTING_DEFS) {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('label'); lab.textContent = d.label; row.appendChild(lab);
      if (d.type === 'seg') {
        const seg = document.createElement('div'); seg.className = 'seg';
        for (const [val, text] of d.options) {
          const b = document.createElement('button'); b.textContent = text; b.dataset.val = JSON.stringify(val);
          b.onclick = () => { this.settings[d.key] = val; for (const x of seg.children) x.classList.toggle('on', x.dataset.val === JSON.stringify(val)); this.applyAll(); this.audio.click(660); };
          if (JSON.stringify(this.settings[d.key]) === b.dataset.val) b.classList.add('on');
          seg.appendChild(b);
        }
        row.appendChild(seg);
      } else {
        const r = document.createElement('input'); r.type = 'range'; r.min = d.min; r.max = d.max; r.step = d.step; r.value = this.settings[d.key];
        r.oninput = () => { this.settings[d.key] = parseFloat(r.value); this.applyAll(); };
        row.appendChild(r);
      }
      root.appendChild(row);
    }
  }

  // -------------------------------------------------------------- Eingabe-Aktionen
  bindInput() {
    const I = this.input;
    I.on('pause', () => { if (this.mode === 'play') this.pause(); else if (this.mode === 'pause') this.resume(); });
    I.on('cam', () => { if (this.mode !== 'play') return; const n = this.cameraRig.cycle(); this.hud.toast('Kamera: ' + n); });
    I.on('photo', () => { if (this.mode !== 'play') return; const on = this.cameraRig.togglePhoto(); $('photoHint').classList.toggle('hidden', !on); this.hud.toast(on ? 'Freie Kamera' : 'Verfolgerkamera'); });
    I.on('lights', () => {
      if (this.mode !== 'play') return;
      const p = this.player; p.lightsMode = p.lightsMode === 'auto' ? 'on' : p.lightsMode === 'on' ? 'off' : 'auto';
      this.hud.toast('Licht: ' + { auto: 'Automatisch', on: 'An', off: 'Aus' }[p.lightsMode]);
    });
    I.on('gearMode', () => {
      if (this.mode !== 'play') return;
      this.player.manual = !this.player.manual; this.settings.gearbox = this.player.manual ? 'manual' : 'auto'; saveSettings(this.settings);
      this.hud.toast('Getriebe: ' + (this.player.manual ? 'Manuell (E/Q)' : 'Automatik'));
    });
    I.on('shiftUp', () => { this.pending.shiftUp = true; });
    I.on('shiftDown', () => { this.pending.shiftDown = true; });
    I.on('reset', () => { if (this.mode === 'play') this.resetCar(); });
    I.on('horn', () => { if (this.mode === 'play') this.audio.horn(true); });
    I.on('hornUp', () => this.audio.horn(false));
    I.on('nav', () => {
      if (this.mode !== 'play') return;
      this.navIndex = (this.navIndex + 1) % (this.pois.length + 1) - 0;
      if (this.navIndex >= this.pois.length) { this.navIndex = -1; this.hud.toast('Navigation: aus'); }
      else this.hud.toast('Ziel: ' + this.pois[this.navIndex].name);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.pause(); });
  }

  bindUI() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.audio.start().then(() => this.audio.click());
      this.act(b.dataset.act);
    });
    document.addEventListener('keydown', (e) => {
      if (['select', 'garage'].includes(this.mode) && ['ArrowLeft', 'ArrowRight'].includes(e.code)) this.act(e.code === 'ArrowLeft' ? 'prevCar' : 'nextCar');
      if (this.mode === 'menu' && (e.code === 'Enter')) this.act('start');
    });
  }

  show(...ids) { for (const id of ['menu', 'select', 'garage', 'settings', 'pause', 'hud']) $(id).classList.toggle('hidden', !ids.includes(id)); }

  act(a) {
    switch (a) {
      case 'start': this.startPlay(); break;
      case 'select': this.enterSelect(); break;
      case 'garage': this.enterGarage(); break;
      case 'settings': this.prevMode = this.mode; this.mode = 'settings'; $('settings').classList.remove('hidden'); $('pause').classList.add('hidden'); $('menu').classList.add('hidden'); break;
      case 'back': this.back(); break;
      case 'prevCar': this.switchCar(-1); break;
      case 'nextCar': this.switchCar(1); break;
      case 'pick': this.startPlay(); break;
      case 'toGarage': this.enterGarage(); break;
      case 'drive': this.exitGarage(true); break;
      case 'resume': this.resume(); break;
      case 'toMenu': this.exitToMenu(); break;
    }
  }

  back() {
    if (this.mode === 'settings') {
      $('settings').classList.add('hidden');
      if (this.prevMode === 'pause') { this.mode = 'pause'; $('pause').classList.remove('hidden'); } else this.enterMenu();
    } else if (this.mode === 'garage') this.exitGarage(false);
    else this.enterMenu();
  }

  // -------------------------------------------------------------- Zustände
  enterMenu() {
    this.mode = 'menu';
    this.show('menu');
    this.cameraRig.free = true; this.cameraRig.freeDist = 6.6; this.cameraRig.yawOff = Math.PI + 0.62; this.cameraRig.pitchOff = 0.1; this.cameraRig.zoom = 0;
    $('photoHint').classList.add('hidden');
    this.updateMenuCar();
    this.parkAtSpawn();
    $('gpName').textContent = this.input.gamepadName ? this.input.gamepadName.slice(0, 36) : 'kein Controller erkannt';
  }

  parkAtSpawn() {
    this.player.reset(MENU.x, MENU.z, MENU.yaw);
    this.cameraRig.snap(this.player);
  }

  updateMenuCar() {
    const id = this.settings.car, info = CAR_INFO[id];
    $('menuCarName').textContent = this.player.model.name;
    $('menuCarSub').textContent = info.tag;
  }

  async startPlay() {
    await this.audio.start();
    this.audio.setVolume(this.settings.master); this.audio.engineVol = this.settings.engineVol; this.audio.setCar(this.player.model.id);
    this.mode = 'play';
    this.show('hud');
    $('hints').style.opacity = this.settings.hints ? 1 : 0;
    setTimeout(() => { $('hints').style.opacity = 0; }, 22000);
    this.cameraRig.free = false; this.cameraRig.yawOff = 0; this.cameraRig.pitchOff = 0; this.cameraRig.zoom = 0; this.cameraRig.mode = 'chase';
    $('photoHint').classList.add('hidden');
    this.player.reset(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.cameraRig.snap(this.player);
    this.hud.toast('Los geht\'s – Richtung Sonnenuntergang');
  }

  pause() { this.mode = 'pause'; this.show('hud', 'pause'); this.audio.setVolume(0.0001); }
  resume() { this.mode = 'play'; this.show('hud'); this.audio.setVolume(this.settings.master); }
  exitToMenu() { this.audio.setVolume(this.settings.master); this.enterMenu(); }

  resetCar() {
    const s = this.lastSafe;
    this.player.reset(s.x, s.z, s.yaw);
    this.cameraRig.snap(this.player);
    this.hud.toast('Zurückgesetzt');
  }

  // -------------------------------------------------------------- Fahrzeugwechsel
  async switchCar(dir) {
    if (this.switching) return;
    this.switching = true;
    const i = CAR_IDS.indexOf(this.settings.car);
    const id = CAR_IDS[(i + dir + CAR_IDS.length) % CAR_IDS.length];
    await this.setCar(id);
    this.switching = false;
    if (this.mode === 'select') this.fillSelect();
    if (this.mode === 'garage') { this.garage.setModel(this.player.model); this.fillGarage(); }
  }

  async setCar(id) {
    const model = await this.getModel(id);
    const old = this.player.model;
    this.settings.car = id; saveSettings(this.settings);
    if (this.mode === 'garage') this.garage.stage.remove(old.root);
    else this.scene.remove(old.root);
    this.player.setModel(model);
    if (this.mode !== 'garage') this.scene.add(model.root);
    this.player.assist = this.settings.assist; this.player.manual = this.settings.gearbox === 'manual';
    this.parkAtSpawn();
    this.audio.setCar(id);
    this.updateMenuCar();
  }

  // -------------------------------------------------------------- Auswahl
  enterSelect() {
    this.mode = 'select';
    this.show('select');
    this.cameraRig.free = true; this.cameraRig.freeDist = 6.2; this.cameraRig.yawOff = Math.PI + 0.55; this.cameraRig.pitchOff = 0.12;
    this.fillSelect();
  }

  fillSelect() {
    const id = this.settings.car, spec = SPECS[id], info = CAR_INFO[id];
    $('selName').textContent = spec.name;
    $('selTag').textContent = info.tag;
    const st = this.stats[id];
    const tiles = [[info.ps, 'PS'], [st.zero100.toFixed(1) + ' s', '0–100 km/h'], [Math.round(spec.vmax * 3.6), 'km/h Spitze'], [Math.round(spec.mass), 'kg']];
    $('selStats').innerHTML = tiles.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    $('selDots').innerHTML = CAR_IDS.map((c) => `<i class="${c === id ? 'on' : ''}" data-c="${c}"></i>`).join('');
    for (const d of $('selDots').children) d.onclick = async () => { await this.setCar(d.dataset.c); this.fillSelect(); };
  }

  // -------------------------------------------------------------- Garage
  enterGarage() {
    this.prevMode = this.mode === 'pause' ? 'pause' : this.mode === 'select' ? 'select' : 'menu';
    this.mode = 'garage';
    this.show('garage');
    this.scene.remove(this.player.model.root);
    this.garage.setModel(this.player.model);
    this.pipe.setView(this.garage.scene, this.garage.camera);
    this.fillGarage();
  }

  exitGarage(drive) {
    this.garage.stage.remove(this.player.model.root);
    if (this.garage.mirror) this.garage.stage.remove(this.garage.mirror);
    this.scene.add(this.player.model.root);
    this.pipe.setView(this.scene, this.camera);
    this.parkAtSpawn();
    if (drive) this.startPlay();
    else if (this.prevMode === 'pause') { this.mode = 'pause'; this.show('hud', 'pause'); }
    else if (this.prevMode === 'select') this.enterSelect();
    else this.enterMenu();
  }

  tuningOf(id) { return (this.settings.tuning[id] = this.settings.tuning[id] || { paint: 'ref', rim: 'ref', kits: {} }); }

  applyTuning(model) {
    const t = this.tuningOf(model.id);
    model.setPaint(t.paint); model.setRim(t.rim);
    for (const k of model.kitSet) model.setKit(k, t.kits[k] !== false);
  }

  fillGarage() {
    const model = this.player.model, t = this.tuningOf(model.id);
    $('garName').textContent = model.name;
    const tabs = [['paint', 'Lack'], ['rim', 'Felgen'], ['kit', 'Aero'], ['view', 'Innenraum']];
    const cur = this.garTab || 'paint';
    $('garTabs').innerHTML = '';
    for (const [k, label] of tabs) {
      const b = document.createElement('button'); b.textContent = label; b.className = k === cur ? 'on' : '';
      b.onclick = () => { this.garTab = k; this.fillGarage(); this.audio.click(); };
      $('garTabs').appendChild(b);
    }
    const opts = $('garOpts'); opts.innerHTML = '';
    const mk = (label, sw, on, fn, wide) => {
      const b = document.createElement('button'); b.className = 'opt' + (on ? ' on' : '') + (wide ? ' wide' : '');
      b.innerHTML = (sw ? `<span class="sw" style="background:${sw}"></span>` : '') + label;
      b.onclick = () => { fn(); this.fillGarage(); this.audio.click(560); };
      opts.appendChild(b);
    };
    let note = 'Standard ist immer das Referenzdesign aus deinen Bildern.';
    if (cur === 'paint') for (const [id, p] of Object.entries(PAINTS)) mk(p.label, p.sw, t.paint === id, () => { t.paint = id; model.setPaint(id); saveSettings(this.settings); });
    if (cur === 'rim') for (const [id, r] of Object.entries(RIMS)) mk(r.label, r.sw, t.rim === id, () => { t.rim = id; model.setRim(id); saveSettings(this.settings); });
    if (cur === 'kit') {
      const names = { lip: 'Frontlippe', skirt: 'Seitenschweller', diffuser: 'Heckdiffusor', spoiler: 'Spoilerlippe', flares: 'Kotflügelverbreiterung', roof: 'Dachspoiler' };
      if (!model.kitSet.size) note = 'Für dieses Fahrzeug sind keine einzeln schaltbaren Teile hinterlegt.';
      for (const k of model.kitSet) { const on = t.kits[k] !== false; mk(names[k] || k, null, on, () => { t.kits[k] = !on; model.setKit(k, !on); saveSettings(this.settings); }); }
      mk('Alle Teile (Referenz)', null, false, () => { for (const k of model.kitSet) { t.kits[k] = true; model.setKit(k, true); } saveSettings(this.settings); }, true);
    }
    if (cur === 'view') {
      note = model.id === 'g63' ? 'Der komplette Innenraum des G 63 ist in Tiffany Blue gehalten: Leder mit Rautensteppung, Carbon, Türverkleidungen.' : 'Ziehen = umsehen, Mausrad = Blickfeld.';
      mk('Cockpit-Ansicht', null, this.garage.mode === 'interior', () => this.garage.setCam('interior'), true);
      mk('Außenansicht', null, this.garage.mode !== 'interior', () => this.garage.setCam('3q'), true);
    }
    $('garNote').textContent = note;
    const cams = [['3q', 'Schräg'], ['front', 'Front'], ['side', 'Seite'], ['rear', 'Heck'], ['wheel', 'Felge'], ['top', 'Oben'], ['interior', 'Innen']];
    $('garCams').innerHTML = '';
    for (const [k, label] of cams) {
      const b = document.createElement('button'); b.textContent = label; b.className = this.garage.camName === k ? 'on' : '';
      b.onclick = () => { this.garage.setCam(k); this.fillGarage(); };
      $('garCams').appendChild(b);
    }
  }

  // -------------------------------------------------------------- Hauptschleife
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = clamp((now - this.last) / 1000, 0.0005, 0.05);
    this.last = now;
    this.time += dt;
    this.pipe.trackFrame(dt * 1000);
    const I = this.input.poll(dt);
    const inp = this.testInput ? { ...I, ...this.testInput } : I;
    const player = this.player, world = this.world, env = this.env;

    if (this.mode === 'garage') {
      this.garage.update(dt, inp, this.pipe.w / this.pipe.h);
      this.pipe.render(dt, this.time);
      return;
    }

    // ---- Physik / Fahrzeug
    const playing = this.mode === 'play';
    let impacts = [];
    if (playing) {
      const opts = { shiftUp: this.pending.shiftUp, shiftDown: this.pending.shiftDown, traffic: this.traffic, grip: 1 };
      this.pending.shiftUp = this.pending.shiftDown = false;
      impacts = player.step(dt, inp, opts);
      for (const h of impacts) if (h.speed > 1.4) { this.cameraRig.impact(h.speed * (this.settings.shake || 0.0001)); this.audio.impact(h.speed); }
      // letzte sichere Position für "Zurücksetzen"
      this.safeT += dt;
      if (this.safeT > 1.5 && !player.air && Math.abs(player.vehicle.u) > 3 && impacts.length === 0) { this.safeT = 0; this.lastSafe = { x: player.vehicle.x, z: player.vehicle.z, yaw: player.vehicle.yaw }; }
      if (player.y < -25) this.resetCar();
    } else if (this.mode === 'menu' || this.mode === 'select' || this.mode === 'settings' || this.mode === 'pause') {
      if (this.mode !== 'pause') player.step(dt, { throttle: 0, brake: 0, steer: 0, handbrake: 1 }, {});
    }

    // ---- Kamera
    if (this.mode === 'menu' || this.mode === 'select' || this.mode === 'settings') {
      this.cameraRig.yawOff += dt * 0.05;
      const u = { lookX: this.mode === 'menu' || this.mode === 'select' ? inp.lookX : 0, lookY: inp.lookY, zoom: inp.zoom, drag: inp.drag, steer: 0 };
      this.cameraRig.update(dt, player, u);
    } else if (playing || this.mode === 'pause') {
      if (playing) this.cameraRig.update(dt, player, inp);
    }

    // ---- Schaufenster-Licht (nur Menü/Auswahl)
    const showcase = this.mode === 'menu' || this.mode === 'select';
    this.menuLights.visible = showcase;
    if (showcase) {
      const v = player.vehicle, c = Math.cos(v.yaw), sn = -Math.sin(v.yaw);   // Fahrzeug-Vorwärts (x,z) und rechts
      const fx = c, fz = sn, rx = -sn, rz = c;
      const at = (l, f, r, u) => { l.position.set(v.x + fx * f + rx * r, player.y + u, v.z + fz * f + rz * r); l.target.position.set(v.x, player.y + 0.7, v.z); l.target.updateMatrixWorld(); };
      at(this.menuKey, 9, -7, 6);     // vorn links, hoch
      at(this.menuRim, -9, 6, 4);     // hinten rechts: Kantenlicht auf Dach/Schulter
      const k = 1 - 0.5 * (env.params.lights || 0);
      this.menuKey.intensity = 1.5 * k; this.menuRim.intensity = 2.4 * k;
    }

    // ---- Welt, Himmel, Lichter
    const focus = player.vehicle;
    world.update(focus.x, focus.z, playing ? 3 : 6);
    env.update(dt, this.camera, { x: focus.x, y: player.y, z: focus.z });
    world.setTimeOfDay(env.params, dt, this.camera.position);
    if (this.mode !== 'pause' && this.mode !== 'garage') { this.traffic.update(dt, player, env.params); this.peds.update(dt, player, env.params.lights); }
    player.updateLights(env.params.lights);
    this.updateNightLights();

    // ---- Anzeige, Ton
    if (playing || this.mode === 'pause') {
      const nav = this.navIndex >= 0 ? this.pois[this.navIndex] : null;
      this.hud.update(dt, { info: player.info, vehicle: focus, gearLabel: player.gearLabel, manual: player.manual, lightsOn: player.headOn, tod: env.t, nav });
    }
    if (this.audio.ready) {
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      const f = focus.fwd;
      this.audio.update(dt, { info: player.info, speed: focus.u, carPos: { x: focus.x, y: player.y, z: focus.z }, camPos: this.camera.position, camDir: dir, camMode: this.mode === 'play' ? (this.cameraRig.free ? 'free' : this.cameraRig.mode) : 'free', world: { x: focus.x, z: focus.z } });
      void f;
      this.audio.trafficVoices(this.traffic.sound, this.camera.position, dir);
    }
    this.pipe.resize();
    this.pipe.render(dt, this.time);
  }

  /** Testhilfe: Spielzeit ohne Rendern vorspulen (feste 1/60-s-Schritte). */
  fastForward(seconds, input = {}, onStep = null) {
    const dt = 1 / 60;
    const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, lookX: 0, lookY: 0, zoom: 0, drag: false, ...input };
    for (let t = 0; t < seconds; t += dt) {
      const imp = this.player.step(dt, inp, { shiftUp: false, shiftDown: false });
      this.world.update(this.player.vehicle.x, this.player.vehicle.z, 4);
      this.cameraRig.update(dt, this.player, inp);
      if (onStep) onStep(t, imp);
    }
  }

  /** Nachts: die nächsten Laternen bekommen echte Punktlichter. */
  updateNightLights() {
    const L = this.env.params.lights;
    if (!this.lampLights) {
      this.lampLights = [];
      for (let i = 0; i < 8; i++) { const p = new THREE.PointLight(0xffc27a, 0, 38, 1.6); p.castShadow = false; this.scene.add(p); this.lampLights.push(p); }
    }
    const f = this.player.vehicle;
    const near = this.world.nearestLamps(f.x, f.z, 8, []);
    for (let i = 0; i < this.lampLights.length; i++) {
      const p = this.lampLights[i], lamp = near[i] && near[i][1];
      if (lamp && (L >= 0.12 || lamp[3])) { p.position.set(lamp[0], lamp[1], lamp[2]); p.intensity = (lamp[3] ? Math.max(L, 0.7) : L) * 70; } else p.intensity = 0;
    }
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadtext'); if (t) t.textContent = 'Fehler beim Start: ' + e.message;
});
