// Klänge per WebAudio erzeugt (keine Audiodateien): Schritte je Untergrund, Sprünge, Wasser, Kristalle,
// Gleiter, Stimmen-Piepser, Tiere und Umgebung (Wind, Meer, Vögel am Tag, Grillen in der Nacht).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this._applyVolume();
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; b = (b + 0.02 * d[i]) / 1.02; bd[i] = b * 3.5; }
    // Endlose Umgebungsgeräusche
    this.amb = {
      wind: this._loop(this.noise, 'bandpass', 500, 0.4),
      ocean: this._loop(this.brown, 'lowpass', 600, 0),
      glide: this._loop(this.noise, 'bandpass', 900, 0),
    };
    this.amb.wind.f.Q.value = 0.6;
    this.birdT = 0; this.cricketT = 0;
  }

  _loop(buf, type, freq, gain) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(this.master);
    s.start();
    return { s, f, g };
  }

  _applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.9; }
  setVolume(v) { this.volume = v; this._applyVolume(); }
  toggleMute() { this.muted = !this.muted; this._applyVolume(); return this.muted; }

  _noiseHit({ freq = 800, q = 1, dur = 0.08, gain = 0.3, type = 'bandpass', at = 0, sweep = 0, pan = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = s.connect(f).connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(this.master);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, at = 0, slide = 0, attack = 0.01, pan = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o.connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  step(surface, run) {
    const v = run ? 1.25 : 1;
    switch (surface) {
      case 'sand': return this._noiseHit({ freq: 2200, q: 0.5, dur: 0.12, gain: 0.07 * v, type: 'highpass' });
      case 'wood': this._tone({ freq: 140 + Math.random() * 30, dur: 0.08, gain: 0.12 * v, type: 'triangle' }); return this._noiseHit({ freq: 900, q: 2, dur: 0.05, gain: 0.08 * v });
      case 'stone': case 'plaza': case 'rock': return this._noiseHit({ freq: 2600, q: 3, dur: 0.05, gain: 0.09 * v });
      case 'snow': return this._noiseHit({ freq: 1200, q: 0.7, dur: 0.16, gain: 0.08 * v, sweep: 0.6 });
      case 'water': return this._noiseHit({ freq: 1000, q: 0.8, dur: 0.18, gain: 0.08 * v, sweep: 0.5 });
      default: return this._noiseHit({ freq: 650 + Math.random() * 200, q: 1.2, dur: 0.09, gain: 0.09 * v });
    }
  }
  jump() { this._noiseHit({ freq: 600, q: 0.8, dur: 0.18, gain: 0.07, sweep: 2.5 }); }
  land(v) { const k = Math.min(1, v / 14); this._noiseHit({ freq: 300, q: 0.9, dur: 0.15 + k * 0.1, gain: 0.08 + k * 0.2, type: 'lowpass' }); }
  splash(v) {
    const k = Math.min(1, v / 12);
    this._noiseHit({ freq: 1500, q: 0.6, dur: 0.35 + k * 0.3, gain: 0.12 + k * 0.2, sweep: 0.3 });
    this._noiseHit({ freq: 400, q: 0.8, dur: 0.3, gain: 0.1 + k * 0.1, type: 'lowpass', at: 0.03 });
  }
  stroke() { this._noiseHit({ freq: 900, q: 0.7, dur: 0.25, gain: 0.06, sweep: 0.5 }); }
  pickup(n) {
    const base = 523.25 * Math.pow(2, ((n % 8) * 2) / 12);
    [0, 4, 7, 12].forEach((s, i) => this._tone({ freq: base * Math.pow(2, s / 12), type: 'triangle', dur: 0.5, gain: 0.12, at: i * 0.07 }));
    this._tone({ freq: base * 4, type: 'sine', dur: 0.8, gain: 0.05, at: 0.28 });
  }
  milestone() { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this._tone({ freq: 392 * Math.pow(2, s / 12), type: 'triangle', dur: 0.6, gain: 0.1, at: i * 0.09 })); }
  fanfare() {
    const notes = [[0, 0], [4, 0.15], [7, 0.3], [12, 0.45], [7, 0.7], [12, 0.85], [16, 1.0], [19, 1.2], [24, 1.45]];
    for (const [s, at] of notes) { this._tone({ freq: 349.2 * Math.pow(2, s / 12), type: 'square', dur: 0.4, gain: 0.05, at }); this._tone({ freq: 349.2 * Math.pow(2, s / 12), type: 'triangle', dur: 0.6, gain: 0.08, at }); }
  }
  firework(at = 0) { this._noiseHit({ freq: 300, q: 0.5, dur: 0.9, gain: 0.25, type: 'lowpass', at, sweep: 0.3 }); this._noiseHit({ freq: 4000, q: 0.5, dur: 1.2, gain: 0.05, type: 'highpass', at: at + 0.1 }); }
  discover() { [0, 7, 12].forEach((s, i) => this._tone({ freq: 440 * Math.pow(2, s / 12), type: 'sine', dur: 0.9, gain: 0.08, at: i * 0.12, attack: 0.05 })); }
  glide(on) { if (on) this._noiseHit({ freq: 1200, q: 0.6, dur: 0.3, gain: 0.12, sweep: 0.4 }); else this._noiseHit({ freq: 500, q: 0.6, dur: 0.2, gain: 0.08, sweep: 2 }); }
  talk(pitch = 1) {
    for (let i = 0; i < 3; i++) this._tone({ freq: (300 + Math.random() * 180) * pitch, type: 'square', dur: 0.06, gain: 0.025, at: i * 0.07 });
  }
  ui() { this._tone({ freq: 880, type: 'triangle', dur: 0.08, gain: 0.06 }); }
  rest() { this._noiseHit({ freq: 400, q: 0.5, dur: 1.6, gain: 0.08, sweep: 3 }); }
  exhausted() { this._tone({ freq: 220, type: 'sine', dur: 0.4, gain: 0.08, slide: 0.7 }); }
  bleat(dist) {
    const g = 0.12 * Math.max(0, 1 - dist / 40);
    if (g < 0.01) return;
    const f = 380 + Math.random() * 80;
    for (let i = 0; i < 4; i++) this._tone({ freq: f * (1 + (i % 2) * 0.04), type: 'sawtooth', dur: 0.12, gain: g * 0.35, at: i * 0.09 });
  }
  gull(dist) {
    const g = 0.1 * Math.max(0, 1 - dist / 70);
    if (g < 0.01) return;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this._tone({ freq: 1400 + Math.random() * 300, type: 'triangle', dur: 0.18, gain: g, at: i * 0.22, slide: 0.65 });
  }

  /** Umgebung: alt = Höhe, coast = Nähe zum Meer (0..1), night 0..1, gliding, speed */
  ambient(dt, { alt, coast, night, gliding, speed, swimming }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (p, v) => p.setTargetAtTime(v, now, 0.4);
    set(this.amb.wind.g.gain, 0.012 + Math.min(0.08, Math.max(0, alt - 20) / 900) + (gliding ? 0.02 : 0));
    set(this.amb.wind.f.frequency, 380 + Math.min(600, alt * 5));
    set(this.amb.ocean.g.gain, 0.1 * coast * (0.75 + 0.25 * Math.sin(now * 0.5)) + (swimming ? 0.05 : 0));
    set(this.amb.glide.g.gain, gliding ? 0.04 + Math.min(0.06, speed / 160) : 0);
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 1.5 + Math.random() * 4;
      if (night < 0.3 && alt < 60) {
        const base = 2000 + Math.random() * 1500, pan = Math.random() * 1.6 - 0.8;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this._tone({ freq: base * (1 + (Math.random() - 0.5) * 0.3), type: 'sine', dur: 0.09, gain: 0.025 * (1 - night), at: i * 0.11, slide: 1.3 + Math.random() * 0.4, pan });
      }
    }
    this.cricketT -= dt;
    if (this.cricketT < 0) {
      this.cricketT = 0.4 + Math.random() * 0.9;
      if (night > 0.4 && alt < 50 && !swimming) {
        const pan = Math.random() * 1.6 - 0.8;
        for (let i = 0; i < 3; i++) this._tone({ freq: 4200 + Math.random() * 300, type: 'sine', dur: 0.04, gain: 0.012 * night, at: i * 0.06, pan });
      }
    }
  }
}
