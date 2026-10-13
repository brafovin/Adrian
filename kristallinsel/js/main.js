// Kristallinsel – Spielablauf: Laden, Menüs, Steuerung, Kristalle, Dialoge, Tag/Nacht, Speichern.
import * as THREE from 'three';
import { createWorld, CRYSTAL_COUNT } from './world.js';
import { buildTerrainMesh, buildDepthTexture } from './gfx/terrain-mesh.js';
import { buildWater } from './gfx/water.js';
import { SkySystem } from './gfx/sky.js';
import { Vegetation } from './gfx/vegetation.js';
import { Buildings } from './gfx/buildings.js';
import { Crystals } from './gfx/crystals.js';
import { Particles, Fireflies } from './gfx/particles.js';
import { Creatures } from './gfx/creatures.js';
import { Figure, LOOKS, STYLE_NAMES, DEFAULT_LOOK } from './gfx/figure.js';
import { createPlayer, stepPlayer, P } from './controller.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { talk, objective, newState, clockText, GOALS } from './story.js';
import { loadSettings, saveSettings, loadGame, saveGame, hasSave, clearGame } from './save.js';
import { WATER } from './terrain.js';
import { VILLAGE } from './layout.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const NOSAVE = params.has('nosave') || params.has('autostart');

const QUALITY = {
  low: { name: 'low', pr: 1, aa: false, shadows: false, shadowSize: 0, shadowRange: 1, grass: 0, grassDist: 0, fogNear: 110, fogFar: 560, lights: 0 },
  medium: { name: 'medium', pr: 1.5, aa: true, shadows: true, shadowSize: 1024, shadowRange: 38, grass: 0.5, grassDist: 70, fogNear: 160, fogFar: 760, lights: 2 },
  high: { name: 'high', pr: 2, aa: true, shadows: true, shadowSize: 2048, shadowRange: 55, grass: 1, grassDist: 110, fogNear: 200, fogFar: 980, lights: 4 },
};
function pickQuality(setting) {
  const q = params.get('q') || setting;
  if (QUALITY[q]) return QUALITY[q];
  if (isTouch) return (navigator.deviceMemory && navigator.deviceMemory < 4) ? QUALITY.low : QUALITY.medium;
  return QUALITY.high;
}

function setLoad(f, text) {
  $('loadbar').style.width = `${Math.round(f * 100)}%`;
  if (text) $('loadtext').textContent = text;
}

async function boot() {
  const settings = loadSettings();
  const Q = pickQuality(settings.quality);
  setLoad(0.08, 'Insel wird geformt …');
  await nextFrame();
  const world = createWorld({ density: Q.grass });
  setLoad(0.4, 'Bäume werden gepflanzt …');
  await nextFrame();

  // ------------------------------------------------------------ Renderer & Szene
  const canvas = $('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  } catch (e) {
    setLoad(1, 'WebGL ist auf diesem Gerät nicht verfügbar. Bitte einen aktuellen Browser verwenden.');
    throw e;
  }
  const maxPR = Math.min(window.devicePixelRatio || 1, Q.pr);
  let pixelRatio = maxPR;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3200);

  const terrainMesh = buildTerrainMesh(world.terrain);
  scene.add(terrainMesh);
  const water = buildWater(buildDepthTexture(world.terrain));
  scene.add(water.mesh);
  const sky = new SkySystem(scene, Q);
  setLoad(0.55, 'Dorf wird gebaut …');
  await nextFrame();
  const buildings = new Buildings(scene, world.structures, Q);
  const windU = { uTime: { value: 0 }, uWind: { value: 1 } };
  const vegetation = new Vegetation(scene, world.veg, Q, windU);
  setLoad(0.72, 'Kristalle werden versteckt …');
  await nextFrame();

  // ------------------------------------------------------------ Spielstand
  let state = (!NOSAVE && loadGame()) || newState();
  if (params.has('t')) state.time = +params.get('t');
  if (params.has('glider')) state.flags.glider = state.flags.intro = true;
  if (params.has('crystals')) {
    const n = Math.min(CRYSTAL_COUNT, +params.get('crystals'));
    world.crystals.slice(0, n).forEach((c) => state.crystals.add(c.id));
    state.flags.intro = true;
  }
  const crystals = new Crystals(scene, world.crystals, state.crystals);
  const particles = new Particles(scene, 500);
  const fireflies = new Fireflies(scene, 70);
  const creatures = new Creatures(scene, world.terrain.heightAt);
  buildings.setBeacon(state.flags.finale);

  // Spielfigur + Bewohner
  const sp = state.pos || world.spawn;
  const player = createPlayer(sp.x, sp.y, sp.z, sp.yaw ?? world.spawn.yaw);
  if (params.has('pos')) {
    const [x, z] = params.get('pos').split(',').map(Number);
    Object.assign(player, { x, z, y: world.groundAt(x, z) });
  }
  let lastSafe = { x: player.x, y: player.y, z: player.z };
  const figure = new Figure(settings.look, { backpack: true, shadows: Q.shadows });
  scene.add(figure.root);
  const npcs = world.npcs.map((n) => {
    const f = new Figure(n.look, { small: n.small, shadows: Q.shadows });
    f.root.position.set(n.x, n.y, n.z);
    f.root.rotation.y = n.yaw;
    scene.add(f.root);
    return { def: n, fig: f, yaw: n.yaw, talking: false };
  });
  // Aufgaben-Markierung "!" über Mira bzw. am Leuchtturm
  const markTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd166'; x.strokeStyle = '#3a2408'; x.lineWidth = 6;
    x.font = '900 84px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeText('!', 32, 52); x.fillText('!', 32, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false, transparent: true }));
  marker.scale.set(0.7, 1.05, 1);
  marker.renderOrder = 5;
  scene.add(marker);
  // Runder Schatten unter der Figur (wenn echte Schatten aus sind)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  blob.visible = !Q.shadows;
  scene.add(blob);

  const follow = new FollowCamera(camera);
  follow.yaw = player.yaw + Math.PI;
  const input = new Input(canvas, {
    zone: $('touch-zone'), stick: $('stick'), knob: $('knob'),
    buttons: { jump: $('t-jump'), run: $('t-run'), interact: $('t-interact'), map: $('t-map'), pause: $('t-pause') },
  });
  const sfx = new Sfx();
  sfx.setVolume(settings.volume);
  const hud = new Hud(world, terrainMesh);
  hud.setCount(state.crystals.size, CRYSTAL_COUNT);

  setLoad(0.9, 'Shader werden vorbereitet …');
  await nextFrame();
  sky.update(state.time, 0, player, camera, 0);
  renderer.compile(scene, camera);

  // ------------------------------------------------------------ Bildschirme
  const screens = ['menu', 'custom', 'settings', 'help', 'pause', 'confirm', 'finale', 'mapview'];
  let mode = 'menu';
  const stack = [];
  function show(name) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== name);
    const playing = name === 'play';
    hud.show(playing || name === 'mapview');
    $('touch-ui').classList.toggle('hidden', !(playing && isTouch));
    input.wantLock = playing && !isTouch;
    if (!playing && document.pointerLockElement) document.exitPointerLock();
    mode = name;
    if (name === 'menu') refreshMenu();
    if (name === 'settings') fillSettings();
    if (name === 'custom') fillCustom();
  }
  function open(name) { stack.push(mode); show(name); }
  function back() { show(stack.pop() || 'menu'); }

  function refreshMenu() {
    const saved = !NOSAVE && (hasSave() || state.play > 5);
    $('btn-play').textContent = saved ? 'Weiterspielen' : 'Spielen';
    $('btn-new').classList.toggle('hidden', !saved);
    const n = state.crystals.size;
    $('menu-progress').textContent = saved ? `Kristalle ${n}/${CRYSTAL_COUNT} · ${state.discovered.size} Orte entdeckt` : '';
  }

  let started = false;
  function startPlay() {
    started = true;
    sfx.init();
    stack.length = 0;
    show('play');
    if (!state.flags.intro && state.play < 1) setTimeout(() => hud.toast('Sprich mit Mira – sie steht am Brunnen.', 'gold'), 900);
  }

  // Einstellungen
  function fillSettings() {
    $('s-quality').value = settings.quality;
    $('s-sens').value = settings.sens;
    $('s-invert').checked = settings.invertY;
    $('s-volume').value = settings.volume;
    $('s-day').value = String(settings.dayMinutes);
    $('s-fps').checked = settings.showFps;
    $('s-note').textContent = '';
  }
  $('s-quality').addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(settings); $('s-note').textContent = 'Die Grafik wird beim Schließen neu geladen (Spielstand bleibt erhalten).'; settings._reload = true; });
  $('s-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; saveSettings(settings); });
  $('s-invert').addEventListener('change', (e) => { settings.invertY = e.target.checked; saveSettings(settings); });
  $('s-volume').addEventListener('input', (e) => { settings.volume = +e.target.value; sfx.setVolume(settings.volume); saveSettings(settings); });
  $('s-day').addEventListener('change', (e) => { settings.dayMinutes = +e.target.value; saveSettings(settings); });
  $('s-fps').addEventListener('change', (e) => { settings.showFps = e.target.checked; saveSettings(settings); $('fps').textContent = ''; });

  // Figur anpassen
  function fillCustom() {
    for (const box of document.querySelectorAll('#custom [data-key]')) {
      const key = box.dataset.key;
      box.innerHTML = '';
      const opts = LOOKS[key];
      opts.forEach((v, i) => {
        const b = document.createElement('button');
        const isStyle = key === 'hairStyle';
        b.className = isStyle ? 'choice' : 'swatch';
        if (isStyle) b.textContent = STYLE_NAMES[v]; else { b.style.background = v; b.setAttribute('aria-label', `Farbe ${i + 1}`); }
        const cur = settings.look[key] ?? DEFAULT_LOOK[key];
        if ((isStyle ? v : i) === cur) b.classList.add('on');
        b.addEventListener('click', () => {
          settings.look = { ...settings.look, [key]: isStyle ? v : i };
          figure.setLook(settings.look);
          saveSettings(settings);
          sfx.init(); sfx.ui();
          fillCustom();
        });
        box.appendChild(b);
      });
    }
  }

  const actions = {
    play: () => { startPlay(); if (!isTouch) input.lock(); },
    newgame: () => open('confirm'),
    confirmNew: () => {
      clearGame();
      state = newState();
      Object.assign(player, createPlayer(world.spawn.x, world.spawn.y, world.spawn.z, world.spawn.yaw));
      follow.yaw = player.yaw + Math.PI;
      crystals.reset(state.crystals);
      buildings.setBeacon(false);
      hud.setCount(0, CRYSTAL_COUNT);
      startPlay();
    },
    custom: () => open('custom'),
    settings: () => open('settings'),
    help: () => open('help'),
    back: () => {
      if (mode === 'settings' && settings._reload) { persist(); location.reload(); return; }
      back();
    },
    resume: () => { stack.length = 0; show('play'); if (!isTouch) input.lock(); },
    openMap: () => openMap(),
    closeMap: () => closeMap(),
    toMenu: () => { persist(); stack.length = 0; show('menu'); },
    randomLook: () => {
      const r = (n) => Math.floor(Math.random() * n);
      settings.look = { skin: r(LOOKS.skin.length), hair: r(LOOKS.hair.length), hairStyle: LOOKS.hairStyle[r(LOOKS.hairStyle.length)], top: r(LOOKS.top.length), bottom: r(LOOKS.bottom.length) };
      figure.setLook(settings.look); saveSettings(settings); sfx.init(); sfx.ui(); fillCustom();
    },
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    sfx.init(); sfx.ui();
    actions[b.dataset.act]?.();
  });
  $('dialog').addEventListener('click', () => hud.advance());
  input.onUnlock = () => { if (mode === 'play' && !hud.inDialog) open('pause'); };
  input.onClick = () => { if (mode === 'play' && hud.inDialog) hud.advance(); };

  function openMap() {
    stack.length = 0;
    show('mapview');
    hud.drawBig(player, state, world.pois, world.crystals);
  }
  function closeMap() { show('play'); }

  function persist() { if (!NOSAVE && started) saveGame(state, player); }
  addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  addEventListener('pagehide', persist);

  // ------------------------------------------------------------ Interaktion
  let busy = false;          // Dialog oder Zwischensequenz läuft
  let jumpBlock = 0;
  let talkingNpc = null;

  function nearestInteract() {
    let best = null, bd = Infinity;
    for (const it of world.interact) {
      const d = Math.hypot(it.x - player.x, it.z - player.z);
      if (d < it.r && Math.abs(it.y - player.y) < 3 && d < bd) { best = it; bd = d; }
    }
    return best;
  }

  async function interact(it) {
    busy = true;
    sfx.init();
    if (it.type === 'npc') {
      const npc = npcs.find((n) => n.def.id === it.id);
      talkingNpc = npc;
      const res = talk(it.id, state);
      const pitch = { mira: 0.8, jonas: 0.7, lotta: 1.5, bruno: 0.75, ronja: 1.15 }[it.id] || 1;
      await hud.dialog(npc.def.name, npc.def.title, res.lines, () => sfx.talk(pitch));
      talkingNpc = null;
      for (const e of res.effects) {
        state.flags[e] = true;
        if (e === 'glider') { hud.toast('Gleiter erhalten! In der Luft: Springen drücken', 'gold'); sfx.milestone(); }
        if (e === 'map') { hud.toast('Die übrigen Kristalle stehen jetzt auf deiner Karte (K)', 'gold'); sfx.milestone(); }
      }
    } else if (it.type === 'sign') {
      await hud.dialog('Wegweiser', '', [it.text], () => sfx.ui());
    } else if (it.type === 'rest') {
      await rest();
    } else if (it.type === 'beacon') {
      if (state.flags.finale) await hud.dialog('Leuchtturm Westkap', '', ['Das Leuchtfeuer brennt hell und warm.']);
      else if (state.crystals.size < GOALS.all) await hud.dialog('Leuchtturm Westkap', '', [`Das Leuchtfeuer ist erloschen. Es braucht die Kraft aller Kristalle (${state.crystals.size}/${GOALS.all}).`]);
      else await finale();
    }
    jumpBlock = 0.25;
    busy = false;
    persist();
  }

  async function rest() {
    hud.fade(true);
    sfx.rest();
    await new Promise((r) => setTimeout(r, 900));
    const day = state.time >= 0.25 && state.time < 0.75;
    if (day) state.time = 0.79;
    else { if (state.time >= 0.75) state.day++; state.time = 0.29; }
    player.stamina = 1; player.exhausted = false;
    await new Promise((r) => setTimeout(r, 500));
    hud.fade(false);
    hud.toast(day ? 'Du hast bis zum Abend gerastet.' : 'Guten Morgen! Du bist ausgeruht.', 'gold');
  }

  async function finale() {
    await hud.dialog('Leuchtturm Westkap', '', ['Du legst die 40 Kristalle in die Laterne …', 'Sie beginnen zu summen und zu leuchten!']);
    state.flags.finale = true;
    buildings.setBeacon(true);
    sfx.fanfare();
    fireworks = 7;
    cinematic = 7.5;
    hud.toast('Das Leuchtfeuer brennt wieder!', 'gold');
    setTimeout(() => {
      const mins = Math.max(1, Math.round(state.play / 60));
      $('finale-stats').innerHTML = `<p>Spielzeit: <b>${mins} ${mins === 1 ? 'Minute' : 'Minuten'}</b><br>Orte entdeckt: <b>${state.discovered.size}/${world.pois.length}</b><br>Tage auf der Insel: <b>${state.day}</b></p>`;
      show('finale');
    }, 4500);
  }
  let fireworks = 0, fwTimer = 0, cinematic = 0;

  function collectCrystals() {
    for (let i = 0; i < world.crystals.length; i++) {
      const c = world.crystals[i];
      if (state.crystals.has(c.id)) continue;
      const dx = c.x - player.x, dz = c.z - player.z;
      if (dx * dx + dz * dz > 2.2) continue;
      if (Math.abs(c.y - (player.y + 0.9)) > 1.5) continue;
      state.crystals.add(c.id);
      crystals.collect(i);
      const n = state.crystals.size;
      sfx.pickup(n);
      particles.emit(c.x, c.y, c.z, { count: 40, color: [0.4, 0.9, 1.0], speed: 4, up: 4, size: 0.3, life: 1.1, gravity: 5 });
      hud.setCount(n, CRYSTAL_COUNT, true);
      if (n === GOALS.all) { hud.toast('Alle 40 Kristalle! Auf zum Leuchtturm im Westen!', 'gold'); sfx.milestone(); }
      else if (n === GOALS.glider && !state.flags.glider) { hud.toast(`Kristall ${n}/${CRYSTAL_COUNT} – Mira hat jetzt etwas für dich!`, 'gold'); sfx.milestone(); }
      else if (n === GOALS.map && !state.flags.map) { hud.toast(`Kristall ${n}/${CRYSTAL_COUNT} – zeig sie Mira!`, 'gold'); sfx.milestone(); }
      else hud.toast(`Kristall gefunden! ${n}/${CRYSTAL_COUNT}`, 'crystal');
      persist();
    }
  }

  let currentPoi = null;
  function checkPois() {
    for (const poi of world.pois) {
      const d = Math.hypot(poi.x - player.x, poi.z - player.z);
      if (d < poi.r) {
        if (currentPoi !== poi.id) {
          currentPoi = poi.id;
          const isNew = !state.discovered.has(poi.id);
          if (isNew) { state.discovered.add(poi.id); sfx.discover(); persist(); }
          hud.banner(poi.name, isNew);
        }
        return;
      }
    }
    if (currentPoi) {
      const poi = world.pois.find((q) => q.id === currentPoi);
      if (Math.hypot(poi.x - player.x, poi.z - player.z) > poi.r * 1.3) currentPoi = null;
    }
  }

  // ------------------------------------------------------------ Schleife
  const clock = new THREE.Clock();
  let elapsed = 0, saveTimer = 0, hudTimer = 0, coast = 0, coastTimer = 0, frames = 0, fpsT = 0, slowT = 0, fastT = 0, safeT = 0;
  let menuAngle = 0;
  const focus = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function handleEvents(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'step': sfx.step(e.surface, e.run); break;
        case 'stroke': sfx.stroke(); break;
        case 'jump': sfx.jump(); if (e.water) particles.emit(player.x, WATER, player.z, { count: 12, color: [0.8, 0.9, 1], speed: 2, up: 3, size: 0.18, life: 0.6, gravity: 9 }); break;
        case 'land':
          sfx.land(e.v);
          figure.landed(Math.min(1, e.v / 13));
          if (e.v > 8) particles.emit(player.x, player.y + 0.05, player.z, { count: 14, color: [0.55, 0.5, 0.42], speed: 2.5, up: 0.8, size: 0.25, life: 0.6, gravity: 2 });
          if (e.v > 15) follow.shake = 0.25;
          break;
        case 'splash':
          sfx.splash(e.v);
          particles.emit(player.x, WATER + 0.1, player.z, { count: 30, color: [0.8, 0.92, 1], speed: 3, up: 4 + Math.min(6, e.v * 0.3), size: 0.22, life: 0.8, gravity: 12, spread: 0.6 });
          break;
        case 'glideOn': sfx.glide(true); break;
        case 'glideOff': sfx.glide(false); break;
        case 'exhausted': sfx.exhausted(); break;
        case 'lost': Object.assign(player, { x: lastSafe.x, y: lastSafe.y + 0.5, z: lastSafe.z, vx: 0, vy: 0, vz: 0, mode: 'air' }); break;
      }
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;
    const inp = input.read();
    const playing = mode === 'play';

    if (inp.mute) { sfx.init(); const m = sfx.toggleMute(); hud.toast(m ? 'Ton aus' : 'Ton an'); }

    // Menü-/Dialogtasten
    if (mode === 'mapview' && (inp.map || inp.pause || inp.interact)) closeMap();
    else if (mode === 'pause' && inp.pause) show('play');
    else if (['settings', 'help', 'custom', 'confirm'].includes(mode) && inp.pause) back();
    else if (mode === 'finale' && (inp.interact || inp.pause)) show('play');

    let moveX = 0, moveZ = 0;
    if (playing) {
      if (hud.inDialog) {
        if (inp.interact || inp.jump) hud.advance();
      } else if (!busy) {
        if (inp.pause) { open('pause'); }
        else if (inp.map) openMap();
        else {
          const it = nearestInteract();
          if (inp.interact && it) interact(it);
        }
      }
      follow.look(inp.lookDX, inp.lookDY, settings.sens, settings.invertY);
      if (inp.zoom) follow.zoomBy(inp.zoom);
      if (!busy && cinematic <= 0) {
        const b = follow.basis();
        moveX = b.rx * inp.mx + b.fx * inp.my;
        moveZ = b.rz * inp.mx + b.fz * inp.my;
      }
      jumpBlock = Math.max(0, jumpBlock - dt);
      const ev = stepPlayer(player, { mx: moveX, mz: moveZ, run: inp.run && !busy, jump: inp.jump && !busy && !hud.inDialog && jumpBlock <= 0, canGlide: state.flags.glider }, dt, world);
      handleEvents(ev);
      if (player.mode === 'ground' && !player.sliding) { safeT += dt; if (safeT > 1) { safeT = 0; lastSafe = { x: player.x, y: player.y, z: player.z }; } }
      // Kamera folgt bei Touch/Controller langsam hinter die Figur
      if ((isTouch || inp.pad) && performance.now() - input.lastLookTime > 1500 && player.speed > 1 && (player.mode === 'ground' || player.mode === 'glide')) follow.follow(player.yaw, dt * 1.2);
      if (!busy) { collectCrystals(); checkPois(); }
      state.play += dt;
      if (settings.dayMinutes > 0) {
        state.time += dt / (settings.dayMinutes * 60);
        if (state.time >= 1) { state.time -= 1; state.day++; }
      }
      saveTimer += dt;
      if (saveTimer > 15) { saveTimer = 0; persist(); }
      // Hinweis
      const it = !busy && !hud.inDialog && cinematic <= 0 ? nearestInteract() : null;
      const label = it ? (it.type === 'npc' ? it.label : it.type === 'beacon' ? (state.flags.finale ? 'Leuchtfeuer ansehen' : state.crystals.size >= GOALS.all ? 'Leuchtfeuer entzünden' : 'Leuchtfeuer untersuchen') : it.label) : null;
      hud.prompt(label, isTouch ? '✋' : 'E');
      $('t-interact').classList.toggle('hidden', !label);
      $('hint-lock').classList.toggle('hidden', isTouch || input.pointerLocked || elapsed > 40 || hud.inDialog);
    } else if (mode === 'mapview' || mode === 'pause') {
      // Welt läuft im Hintergrund nicht weiter
    }

    // ---------------- Kamera je Modus
    if (mode === 'menu' || mode === 'confirm' || (mode === 'settings' || mode === 'help') && stack[0] === 'menu') {
      menuAngle += dt * 0.05;
      const cx = VILLAGE.x, cz = VILLAGE.z;
      camera.position.set(cx + Math.sin(menuAngle) * 75, VILLAGE.y + 32, cz + Math.cos(menuAngle) * 75);
      camera.lookAt(cx, VILLAGE.y + 4, cz);
    } else if (mode === 'custom') {
      menuAngle += dt * 0.25;
      const a = player.yaw + Math.sin(menuAngle) * 0.6;
      const off = isTouch && innerWidth < 720 ? 0 : -0.75;
      tmp.set(Math.sin(a) * 3.2, 1.25, Math.cos(a) * 3.2);
      camera.position.set(player.x + tmp.x, player.y + tmp.y, player.z + tmp.z);
      const rx = Math.cos(a), rz = -Math.sin(a);
      camera.lookAt(player.x - rx * off, player.y + (isTouch && innerWidth < 720 ? 0.6 : 1.05), player.z - rz * off);
    } else if (cinematic > 0) {
      // Kamerafahrt um den Leuchtturm beim Entzünden
      cinematic -= dt;
      const b = world.markers.find((m) => m.type === 'beacon');
      const a = 2.2 + (7.5 - cinematic) * 0.12;
      camera.position.set(b.x + Math.cos(a) * 55, b.y + 8, b.z + Math.sin(a) * 55);
      camera.lookAt(b.x, b.y + 10, b.z);
      if (cinematic <= 0) follow.smoothY = null;
    } else {
      focus.set(player.x, player.y, player.z);
      follow.update(dt, focus, world, { extraDist: player.mode === 'glide' ? 2.5 : 0, height: player.mode === 'swim' ? 1.1 : 1.5 });
    }

    // ---------------- Welt aktualisieren
    const skyState = sky.update(state.time, dt, player, camera, elapsed);
    const night = skyState.night;
    const k = skyState.k;
    water.uniforms.uTime.value = elapsed;
    water.uniforms.uSunDir.value.copy(skyState.elev > -0.06 ? skyState.sunDir : sky.uniforms.uMoonDir.value);
    water.uniforms.uSunCol.value.copy(sky.sun.color).multiplyScalar(Math.min(1.2, sky.sun.intensity / 2));
    water.uniforms.uSky.value.copy(k.zen);
    water.uniforms.uHorizon.value.copy(k.hor);
    water.uniforms.uLight.value = 0.25 + 0.75 * skyState.light;
    windU.uTime.value = elapsed;
    windU.uWind.value = 0.8 + 0.4 * Math.sin(elapsed * 0.13);
    buildings.update(dt, elapsed, night, player);
    vegetation.update(camera.position);
    crystals.update(dt, elapsed, camera.position, night, state.crystals);
    particles.update(dt, renderer.domElement.height);
    buildings.pixelHeight = renderer.domElement.height;
    fireflies.update(elapsed, player, night, world.terrain.heightAt);
    const cev = creatures.update(dt, elapsed, player, night);
    if (playing) for (const e of cev) {
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (e.type === 'bleat') sfx.bleat(d); else if (e.type === 'gull') sfx.gull(d);
    }
    if (fireworks > 0) {
      fireworks -= dt; fwTimer -= dt;
      if (fwTimer <= 0) {
        fwTimer = 0.35 + Math.random() * 0.4;
        const b = world.markers.find((m) => m.type === 'beacon');
        const cols = [[1, 0.5, 0.3], [0.4, 0.9, 1], [1, 0.85, 0.3], [0.7, 0.5, 1], [0.5, 1, 0.5]];
        particles.emit(b.x + (Math.random() - 0.5) * 50, b.y + 25 + Math.random() * 25, b.z + (Math.random() - 0.5) * 50, { count: 60, color: cols[Math.floor(Math.random() * cols.length)], speed: 9, up: 3, size: 0.9, life: 1.6, gravity: 3, spread: 0.5 });
        sfx.firework(0);
      }
    }

    // Figur
    figure.root.position.set(player.x, player.y, player.z);
    figure.root.rotation.y = player.yaw;
    figure.update(dt, { mode: player.mode, speed: player.speed, phase: player.phase, running: player.running, sliding: player.sliding, vy: player.vy, walk: P.walk, run: P.run, wave: mode === 'custom' && Math.sin(menuAngle * 2) > 0.6 });
    if (blob.visible) {
      const gy = world.groundAt(player.x, player.z, player.y + 0.5);
      const hgt = player.y - gy;
      blob.position.set(player.x, gy + 0.04, player.z);
      blob.material.opacity = player.mode === 'swim' ? 0 : 0.3 * Math.max(0, 1 - hgt / 8);
      blob.scale.setScalar(1 + hgt * 0.05);
    }
    // Bewohner schauen zur Figur, wenn sie in der Nähe ist
    for (const n of npcs) {
      const d = Math.hypot(player.x - n.def.x, player.z - n.def.z);
      const want = d < 7 ? Math.atan2(player.x - n.def.x, player.z - n.def.z) : n.def.yaw;
      let dd = want - n.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      n.yaw += dd * Math.min(1, dt * 4);
      n.fig.root.rotation.y = n.yaw;
      n.fig.root.visible = Math.hypot(camera.position.x - n.def.x, camera.position.z - n.def.z) < 160;
      if (!n.fig.root.visible) continue;
      const waves = n.def.id === 'mira' && !state.flags.intro && d < 18 && d > 3;
      n.fig.update(dt, { mode: 'ground', speed: 0, phase: 0, talk: talkingNpc === n, wave: waves });
    }
    // Aufgaben-Markierung
    const mira = npcs.find((n) => n.def.id === 'mira');
    const nC = state.crystals.size;
    const miraNews = !state.flags.intro || (!state.flags.glider && nC >= GOALS.glider) || (!state.flags.map && nC >= GOALS.map);
    if (miraNews) marker.position.set(mira.def.x, mira.def.y + 2.45 + Math.sin(elapsed * 3) * 0.08, mira.def.z);
    else if (nC >= GOALS.all && !state.flags.finale) { const b = world.interact.find((i) => i.type === 'beacon'); marker.position.set(b.x, b.y + 3.2 + Math.sin(elapsed * 3) * 0.1, b.z); }
    marker.visible = miraNews || (nC >= GOALS.all && !state.flags.finale);

    // ---------------- Ton
    coastTimer -= dt;
    if (coastTimer < 0) {
      coastTimer = 0.5;
      let wet = 0;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (world.terrain.heightAt(player.x + Math.cos(a) * 35, player.z + Math.sin(a) * 35) < WATER) wet++; }
      coast = wet / 8;
    }
    if (playing) sfx.ambient(dt, { alt: player.y, coast, night, gliding: player.mode === 'glide', speed: player.speed, swimming: player.mode === 'swim' });

    // ---------------- HUD
    if (playing || mode === 'mapview') {
      hud.update(dt);
      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.1;
        hud.setObjective(objective(state));
        hud.setCount(state.crystals.size, CRYSTAL_COUNT);
        hud.setClock(clockText(state.time, state.day));
        hud.drawMini(player, follow.yaw, state, world.pois, world.crystals);
      }
      hud.stamina(player.stamina, player.exhausted, player.stamina < 0.999 || player.mode === 'glide');
    }

    // ---------------- Auflösung an Leistung anpassen
    frames++; fpsT += dt;
    if (fpsT >= 1) {
      const fps = frames / fpsT;
      if (settings.showFps) $('fps').textContent = `${fps.toFixed(0)} FPS · ${Q.name} · ${pixelRatio.toFixed(2)}x`;
      if (playing) {
        if (fps < 28) { slowT++; fastT = 0; } else if (fps > 55) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
        if (slowT >= 3 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.2); renderer.setPixelRatio(pixelRatio); slowT = 0; }
        if (fastT >= 6 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); fastT = 0; }
      }
      frames = 0; fpsT = 0;
    }
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (mode === 'mapview') hud.drawBig(player, state, world.pois, world.crystals);
  });

  // Test- und Debug-Zugriff
  window.__game = {
    get player() { return player; }, get state() { return state; }, world, camera, follow, sfx, renderer, scene,
    get mode() { return mode; },
    setTime(t) { state.time = t; },
    teleport(x, z, yaw) { Object.assign(player, { x, z, y: world.groundAt(x, z), vx: 0, vy: 0, vz: 0, mode: 'ground' }); if (yaw !== undefined) { player.yaw = yaw; follow.yaw = yaw + Math.PI; } },
    interact: () => { const it = nearestInteract(); if (it) interact(it); return it?.type; },
    advance: () => hud.advance(),
    show, openMap,
  };

  setLoad(1, 'Fertig!');
  $('loading').classList.add('hidden');
  show('menu');
  if (params.has('autostart')) startPlay();
  if (params.has('view')) show(params.get('view'));
  requestAnimationFrame(frame);
  // Erstes Bild abwarten, dann ist alles bereit (für automatische Tests)
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
}

boot().catch((e) => {
  console.error(e);
  const t = $('loadtext');
  if (t) t.textContent = 'Fehler beim Laden: ' + (e?.message || e);
});
