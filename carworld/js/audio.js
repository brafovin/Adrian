// Audio: räumlicher Motor-, Reifen-, Wind- und Umgebungsklang. Alles wird synthetisiert (keine Audiodateien).

import { clamp, lerp, smoothstep, damp } from './util.js';
import { coastX } from './world/layout.js';

function noiseBuffer(ctx, seconds = 2, pink = true) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  // nahtlose Schleife: Enden überblenden
  const f = Math.floor(n * 0.02);
  for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[n - f + i] * (1 - t); }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false; this.volume = 0.8; this.engineVol = 1.0; this.enabled = true;
    this.carId = 'cls63';
    this.hornOsc = null;
    this._inside = 0;
  }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);

    // --- Motor (Worklet), räumlich am Fahrzeug
    try {
      await ctx.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
      this.engine = new AudioWorkletNode(ctx, 'engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: { profile: this.carId } });
    } catch (e) { console.warn('AudioWorklet nicht verfügbar:', e); this.engine = null; }
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0.9;
    this.engineLP = ctx.createBiquadFilter(); this.engineLP.type = 'lowpass'; this.engineLP.frequency.value = 9000;
    this.carPan = ctx.createPanner(); this.carPan.panningModel = 'HRTF'; this.carPan.distanceModel = 'inverse'; this.carPan.refDistance = 4; this.carPan.rolloffFactor = 1.1;
    if (this.engine) this.engine.connect(this.engineGain);
    this.engineGain.connect(this.engineLP); this.engineLP.connect(this.carPan); this.carPan.connect(this.master);

    // --- Rauschquellen
    this.noise = noiseBuffer(ctx, 3, true);
    const mkNoise = () => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(0, Math.random() * 2); return s; };
    // Reifen: quietschen
    this.skidBP = ctx.createBiquadFilter(); this.skidBP.type = 'bandpass'; this.skidBP.frequency.value = 1700; this.skidBP.Q.value = 3.2;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    const sk = mkNoise(); sk.connect(this.skidBP); this.skidBP.connect(this.skidGain); this.skidGain.connect(this.carPan);
    // Abrollgeräusch
    this.rollLP = ctx.createBiquadFilter(); this.rollLP.type = 'lowpass'; this.rollLP.frequency.value = 700;
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    const rl = mkNoise(); rl.connect(this.rollLP); this.rollLP.connect(this.rollGain); this.rollGain.connect(this.carPan);
    // Wind (am Hörer)
    this.windLP = ctx.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 900;
    this.windHP = ctx.createBiquadFilter(); this.windHP.type = 'highpass'; this.windHP.frequency.value = 120;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wn = mkNoise(); wn.connect(this.windHP); this.windHP.connect(this.windLP); this.windLP.connect(this.windGain); this.windGain.connect(this.master);
    // Umgebung: Meer, Stadt
    this.seaLP = ctx.createBiquadFilter(); this.seaLP.type = 'lowpass'; this.seaLP.frequency.value = 520;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0;
    const sn = mkNoise(); sn.connect(this.seaLP); this.seaLP.connect(this.seaGain); this.seaGain.connect(this.master);
    this.cityLP = ctx.createBiquadFilter(); this.cityLP.type = 'lowpass'; this.cityLP.frequency.value = 380;
    this.cityGain = ctx.createGain(); this.cityGain.gain.value = 0;
    const cn = mkNoise(); cn.connect(this.cityLP); this.cityLP.connect(this.cityGain); this.cityGain.connect(this.master);
    // Fremdfahrzeuge (Verkehr): gemeinsamer Bus
    this.trafficBus = ctx.createGain(); this.trafficBus.gain.value = 0.55; this.trafficBus.connect(this.master);
    this.voices = [];
    this.ready = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setCar(id) { this.carId = id; this.engine?.port.postMessage({ profile: id }); }

  /** Kurzer Klick für Menüs. */
  click(freq = 520) {
    if (!this.ready) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.1);
  }

  horn(on) {
    if (!this.ready) return;
    const c = this.ctx;
    if (on && !this.hornOsc) {
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 0.02);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const oscs = [415, 523].map((f) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
      lp.connect(g); g.connect(this.carPan);
      this.hornOsc = { oscs, g };
    } else if (!on && this.hornOsc) {
      const { oscs, g } = this.hornOsc; g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0.0001, c.currentTime, 0.03);
      setTimeout(() => oscs.forEach((o) => o.stop()), 200); this.hornOsc = null;
    }
  }

  impact(speed) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const k = clamp(speed / 25, 0.08, 1);
    const src = c.createBufferSource(); src.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600 + 1200 * (1 - k); bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * k, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + 0.4 * k);
    src.connect(bp); bp.connect(g); g.connect(this.carPan); src.start(t, Math.random() * 2); src.stop(t + 1);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const og = c.createGain(); og.gain.setValueAtTime(0.9 * k, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.4);
  }

  /**
   * Pro Frame. s: { info (Player.info), speed (m/s), carPos {x,y,z}, camPos, camDir (Vector3), camUp, camMode, world {x,z}, vehicleRpm...}
   */
  update(dt, s) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const L = c.listener;
    const set = (p, v) => { if (p.setTargetAtTime) p.setTargetAtTime(v, t, 0.02); else p.value = v; };
    if (L.positionX) {
      L.positionX.value = s.camPos.x; L.positionY.value = s.camPos.y; L.positionZ.value = s.camPos.z;
      L.forwardX.value = s.camDir.x; L.forwardY.value = s.camDir.y; L.forwardZ.value = s.camDir.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(s.camPos.x, s.camPos.y, s.camPos.z); L.setOrientation(s.camDir.x, s.camDir.y, s.camDir.z, 0, 1, 0); }
    const inside = s.camMode === 'cockpit' ? 1 : s.camMode === 'hood' ? 0.45 : 0;
    this._inside = damp(this._inside, inside, 8, dt);
    // Quelle am Fahrzeug (im Cockpit am Hörer)
    const px = lerp(s.carPos.x, s.camPos.x, this._inside), py = lerp(s.carPos.y + 0.6, s.camPos.y, this._inside), pz = lerp(s.carPos.z, s.camPos.z, this._inside);
    if (this.carPan.positionX) { this.carPan.positionX.value = px; this.carPan.positionY.value = py; this.carPan.positionZ.value = pz; } else this.carPan.setPosition(px, py, pz);

    const i = s.info;
    const load = clamp(i.throttle, 0, 1);
    if (this.engine) {
      const p = this.engine.parameters;
      p.get('rpm').value = i.ev ? clamp(Math.abs(s.speed) * 3.6 * 60 + i.throttle * 1500, 600, 15000) : i.rpm;
      p.get('throttle').value = i.throttle; p.get('load').value = load; p.get('limiter').value = i.limiter ? 1 : 0; p.get('speed').value = Math.abs(s.speed);
    }
    set(this.engineGain.gain, (0.85 + 0.35 * this._inside) * this.engineVol);
    set(this.engineLP.frequency, lerp(11000, 2600, this._inside));
    // Reifen
    const sp = Math.abs(s.speed);
    set(this.skidGain.gain, clamp(i.skid, 0, 1) * 0.5 * (1 - this._inside * 0.5));
    set(this.skidBP.frequency, 1300 + clamp(sp, 0, 40) * 18 + i.skid * 400);
    set(this.rollGain.gain, smoothstep(1, 35, sp) * 0.2 * (1 - this._inside * 0.4));
    set(this.rollLP.frequency, 350 + sp * 22);
    // Wind
    set(this.windGain.gain, Math.pow(clamp(sp / 70, 0, 1.4), 1.8) * 0.5 * (s.camMode === 'cockpit' ? 0.7 : 1.0));
    set(this.windLP.frequency, lerp(2200, 900, this._inside) + sp * 18);
    // Umgebung
    const cx = coastX(s.world.z);
    const dSea = Math.max(0, s.world.x - cx);
    set(this.seaGain.gain, clamp(1 - dSea / 900, 0, 1) * 0.17 * (1 - this._inside * 0.5));
    const zoneCity = clamp(1 - Math.hypot(s.world.x + 240, s.world.z) / 1100, 0, 1);
    set(this.cityGain.gain, (0.025 + zoneCity * 0.1) * (1 - this._inside * 0.6));
  }

  /** Lautstärke je Fremdfahrzeug (nur nahe, wenige Stimmen) – wird vom Verkehrssystem befüllt. */
  trafficVoices(list, camPos, camDir) {
    if (!this.ready) return;
    const c = this.ctx;
    while (this.voices.length < 5) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0;
      const pan = c.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 5; pan.rolloffFactor = 1.4;
      o.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.trafficBus); o.start();
      this.voices.push({ o, g, pan, lp });
    }
    for (let k = 0; k < this.voices.length; k++) {
      const v = this.voices[k], car = list[k];
      if (!car) { v.g.gain.setTargetAtTime(0, c.currentTime, 0.1); continue; }
      const f = 38 + Math.abs(car.speed) * 2.2 + (car.id % 7);
      // grobe Dopplerverschiebung aus der Annäherungsgeschwindigkeit
      const rel = car.closing || 0;
      const dop = clamp(343 / (343 - clamp(rel, -40, 40)), 0.85, 1.18);
      v.o.frequency.setTargetAtTime(f * dop, c.currentTime, 0.05);
      v.lp.frequency.setTargetAtTime(300 + Math.abs(car.speed) * 18, c.currentTime, 0.1);
      v.g.gain.setTargetAtTime(0.045 * clamp(car.speed / 10, 0.3, 1), c.currentTime, 0.1);
      if (v.pan.positionX) { v.pan.positionX.value = car.x; v.pan.positionY.value = 0.6; v.pan.positionZ.value = car.z; } else v.pan.setPosition(car.x, 0.6, car.z);
    }
  }
}
