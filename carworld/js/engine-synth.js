// Motorklang-Synthese (reines JS, läuft im AudioWorklet und in Node-Tests).
//
// Verbrenner: Summe der Motorordnungen k * (rpm/120) mit Amplituden je Ordnung (Zündfrequenz = 8. Ordnung beim V8,
// 2. Kurbelordnung = 4. usw.), geformt durch Auspuff-Resonanzen (Formanten). Dazu Zündgeräusch-Rauschen, Turbo-Pfeifen,
// Schubabschaltungs-Knallen. Elektro: Heulen (Motorordnungen) + Inverter-Hochton + sphärischer Fahrton.

const TAU = Math.PI * 2;

export const PROFILES = {
  cls63: { kind: 'ice', cyl: 8, formants: [[85, 1.0, 45], [175, 1.0, 70], [380, 0.8, 140], [800, 0.55, 260], [1700, 0.32, 600], [3800, 0.14, 1400]], low4: 0.62, low2: 0.3, low1: 0.12, tilt: 2200, rough: 0.12, crackle: 0.5, pops: 0.85, turbo: 0.35, gain: 0.7 },
  rs7: { kind: 'ice', cyl: 8, formants: [[100, 0.9, 50], [210, 1.0, 80], [470, 0.85, 160], [980, 0.6, 300], [2100, 0.4, 700], [4200, 0.18, 1500]], low4: 0.45, low2: 0.2, low1: 0.08, tilt: 2800, rough: 0.09, crackle: 0.55, pops: 0.6, turbo: 0.5, gain: 0.68 },
  g63: { kind: 'ice', cyl: 8, formants: [[70, 1.0, 38], [145, 1.0, 60], [320, 0.85, 120], [680, 0.5, 240], [1500, 0.28, 520], [3300, 0.1, 1200]], low4: 0.78, low2: 0.4, low1: 0.18, tilt: 1800, rough: 0.16, crackle: 0.6, pops: 1.0, turbo: 0.3, gain: 0.78 },
  i7: { kind: 'ev', gain: 0.5 },
};

class OnePole {
  constructor() { this.y = 0; }
  lp(x, a) { this.y += (x - this.y) * a; return this.y; }
}

export class EngineSynth {
  constructor(sampleRate, profile = PROFILES.cls63) {
    this.sr = sampleRate;
    this.p = profile;
    this.phi = 0; this.phiW = 0; this.phiT = 0;
    this.K = 120;
    this.amp = new Float64Array(this.K + 1);
    this.target = new Float64Array(this.K + 1);
    this.psC = new Float64Array(this.K + 1); this.psS = new Float64Array(this.K + 1);
    let s = 1234567;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.r = r;
    for (let k = 1; k <= this.K; k++) { const a = r() * TAU; this.psC[k] = Math.cos(a); this.psS[k] = Math.sin(a); }
    this.noiseLP = new OnePole(); this.noiseHP = new OnePole(); this.rumbleLP = new OnePole();
    this.burst = 0; this.pop = 0; this.popTone = 0;
    this.lastThr = 0; this.limT = 0;
    this.wob = 0; this.wobT = 0;
    this.rpm = 800; this.load = 0; this.thr = 0;
    // Elektro
    this.evPhase = [0, 0, 0, 0, 0, 0, 0];
    this.evSmooth = { v: 0, load: 0 };
    this.fireCount = 0;
  }

  /** Formantkurve R(f) (Auspuff-/Karosserie-Resonanzen). */
  resonance(f) {
    let a = 0.03;
    for (const [fc, g, bw] of this.p.formants) { const d = (f - fc) / bw; a += g * Math.exp(-d * d); }
    return a;
  }

  /** Steuerwerte (pro Block) → Zielamplituden der Ordnungen. */
  _retarget(rpm, load) {
    const p = this.p;
    const fcyc = rpm / 120;
    const tiltF = p.tilt * (0.8 + 1.8 * load);
    const kmax = Math.min(this.K, Math.floor(9000 / Math.max(fcyc, 1)));
    for (let k = 1; k <= this.K; k++) {
      if (k > kmax) { this.target[k] = 0; continue; }
      const f = k * fcyc;
      let shape;
      if (k % 8 === 0) shape = 1.0;
      else if (k % 4 === 0) shape = p.low4;
      else if (k % 2 === 0) shape = p.low2;
      else shape = p.low1;
      const t = 1 / (1 + Math.pow(f / tiltF, 2.2));
      this.target[k] = shape * this.resonance(f) * t * (k <= 3 ? 0.4 : 1);
    }
  }

  /** n Samples erzeugen. c = {rpm, throttle (0..1), load (0..1), limiter (bool), speed (m/s)} */
  process(out, n, c) {
    const p = this.p;
    if (p.kind === 'ev') return this.processEv(out, n, c);
    const sr = this.sr;
    const rpm = Math.max(300, c.rpm);
    this._retarget(rpm, c.load);
    const fcyc = rpm / 120;
    const dphi = TAU * fcyc / sr;
    // Gas weggenommen bei hoher Drehzahl -> Knallen/Burble
    if (this.lastThr > 0.45 && c.throttle < 0.12 && rpm > 2800 && this.r() < p.pops) { this.pop = 1; this.popTone = 80 + this.r() * 200; }
    this.lastThr = c.throttle;
    const gate = c.limiter ? (Math.sin(this.limT) > 0.15 ? 1 : 0.25) : 1;
    const load = c.load;
    const g0 = p.gain * (0.45 + 0.55 * load) * (0.6 + 0.4 * Math.min(1, rpm / 4000));
    const A = this.amp, T = this.target;
    const rough = p.rough * (1.1 - load * 0.5);
    for (let i = 0; i < n; i++) {
      this.phi += dphi; if (this.phi > TAU) this.phi -= TAU;
      // langsame, unregelmäßige Modulation (V8-Unwucht)
      this.wobT += 1 / sr; if (this.wobT > 0.011) { this.wobT = 0; this.wob += (this.r() - 0.5 - this.wob) * 0.45; }
      const c1 = Math.cos(this.phi), s1 = Math.sin(this.phi);
      let ck = 1, sk = 0, y = 0;
      for (let k = 1; k <= this.K; k++) {
        const nc = ck * c1 - sk * s1, ns = sk * c1 + ck * s1;
        ck = nc; sk = ns;
        A[k] += (T[k] - A[k]) * 0.0025;
        if (A[k] > 1e-5) y += A[k] * (sk * this.psC[k] + ck * this.psS[k]);
      }
      y *= (1 + rough * this.wob * 2);
      // Zündimpuls-Rauschen
      const firePhase = (this.phi * 8) % TAU; // 8 Zündungen je Zyklus
      if (firePhase < dphi * 8) this.burst = 1;
      this.burst *= 0.9975 - 0.003 * Math.min(1, rpm / 7000);
      const nz = this.r() * 2 - 1;
      const bark = nz - this.noiseLP.lp(nz, 0.18);
      y += bark * this.burst * p.crackle * (0.15 + 0.85 * load) * 0.5;
      // dunkles Grundrauschen (Ansaug-/Auspuffgrollen)
      y += this.rumbleLP.lp(nz, 0.012 + 0.03 * load) * (0.8 + 2.6 * load) * 0.35;
      // Turbo-Pfeifen
      if (p.turbo) {
        this.phiT += TAU * (2400 + rpm * 0.55 + 2200 * load) / sr; if (this.phiT > TAU) this.phiT -= TAU;
        y += Math.sin(this.phiT) * p.turbo * 0.025 * load * Math.min(1, rpm / 3500);
      }
      // Schubabschaltung / Knallen
      if (this.pop > 0.001) {
        this.pop *= 0.9988;
        y += (nz * 0.7 + Math.sin(this.pop * this.popTone * 40)) * this.pop * 0.6 * p.pops;
        if (this.pop < 0.04 && this.r() < 0.0008) this.pop = 0.9;
      }
      out[i] = Math.tanh(y * g0 * 1.9) * 0.9;
    }
    this.limT += (n / sr) * TAU * 14;
  }

  processEv(out, n, c) {
    const sr = this.sr, p = this.p;
    const v = Math.max(0, c.speed || 0);
    const load = c.load;
    const S = this.evSmooth;
    // Heulen steigt mit der Drehzahl (Motor ≈ Raddrehzahl), Last macht es lauter
    const base = 60 + c.rpm * 0.09; // Hz
    const ord = [[1, 0.5], [2, 0.32], [3, 0.2], [5, 0.12]];
    const inv = 5200 + 1600 * Math.sin(this.fireCount * 0.0005);
    for (let i = 0; i < n; i++) {
      S.v += (v - S.v) * 0.00012; S.load += (load - S.load) * 0.0008;
      let y = 0;
      for (let k = 0; k < ord.length; k++) {
        this.evPhase[k] += TAU * base * ord[k][0] / sr; if (this.evPhase[k] > TAU) this.evPhase[k] -= TAU;
        y += Math.sin(this.evPhase[k]) * ord[k][1];
      }
      y *= (0.015 + 0.09 * S.load + 0.05 * Math.min(1, S.v / 30));
      // Inverter-Hochton (nur unter Last)
      this.evPhase[5] += TAU * inv / sr; if (this.evPhase[5] > TAU) this.evPhase[5] -= TAU;
      y += Math.sin(this.evPhase[5]) * 0.006 * S.load;
      // Fahrton: ruhiger Akkord, steigt mit der Geschwindigkeit (eigene, abstrakte Klangfarbe)
      const chordBase = 110 + S.v * 1.6;
      this.evPhase[6] += TAU * chordBase / sr; if (this.evPhase[6] > TAU) this.evPhase[6] -= TAU;
      const ph = this.evPhase[6];
      y += (Math.sin(ph) + 0.6 * Math.sin(ph * 1.5 + 0.4) + 0.4 * Math.sin(ph * 2.0 + 1.1) + 0.2 * Math.sin(ph * 3.01)) * 0.02 * Math.min(1, 0.25 + S.v / 25);
      this.fireCount++;
      out[i] = Math.tanh(y * 3.0) * 0.8 * p.gain;
    }
  }
}
