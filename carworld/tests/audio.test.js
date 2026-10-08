import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineSynth, PROFILES } from '../js/engine-synth.js';

const SR = 44100;
function render(id, rpm, load, seconds = 1.0, extra = {}) {
  const s = new EngineSynth(SR, PROFILES[id]);
  const out = new Float32Array(128);
  const total = Math.floor(seconds * SR / 128);
  const buf = new Float32Array(total * 128);
  for (let b = 0; b < total; b++) {
    s.process(out, 128, { rpm, throttle: load, load, limiter: false, speed: 20, ...extra });
    buf.set(out, b * 128);
  }
  return buf.slice(SR * 0.4 | 0); // Einschwingen weglassen
}
function dft(buf, f) { // einzelne Frequenz (Goertzel-artig)
  let re = 0, im = 0;
  const w = (2 * Math.PI * f) / SR;
  for (let i = 0; i < buf.length; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / buf.length;
}
function centroid(buf) {
  let num = 0, den = 0;
  for (let f = 40; f < 6000; f += 20) { const m = dft(buf.slice(0, 8192), f); num += f * m; den += m; }
  return num / den;
}

test('Zündfrequenz folgt der Drehzahl (V8: rpm/15 Hz)', () => {
  for (const id of ['cls63', 'rs7', 'g63']) {
    const rpm = 3000, fire = rpm / 15; // 200 Hz
    const b = render(id, rpm, 0.7);
    const mFire = dft(b, fire);
    const mOff = (dft(b, fire * 0.77) + dft(b, fire * 1.31)) / 2; // zwischen den Ordnungen
    assert.ok(mFire > mOff * 3, `${id}: Zündordnung nicht dominant (${mFire} vs ${mOff})`);
  }
});

test('Höhere Drehzahl klingt höher; Lautstärke bleibt beschränkt und endlich', () => {
  for (const id of ['cls63', 'rs7', 'g63', 'i7']) {
    const lo = render(id, id === 'i7' ? 3000 : 1500, 0.6), hi = render(id, id === 'i7' ? 9000 : 6200, 0.6);
    assert.ok(centroid(hi) > centroid(lo), `${id}: Klangschwerpunkt steigt nicht mit der Drehzahl`);
    for (const b of [lo, hi]) {
      let peak = 0, sum = 0;
      for (const v of b) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      assert.ok(peak <= 1.0, `${id}: Übersteuerung ${peak}`);
      assert.ok(Math.sqrt(sum / b.length) > 0.003, `${id}: fast stumm`);
    }
  }
});

test('Last macht lauter', () => {
  const rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);
  assert.ok(rms(render('cls63', 3500, 1.0)) > rms(render('cls63', 3500, 0.05)) * 1.3);
});

test('Elektroantrieb: Heulen steigt mit der Drehzahl, kein Verbrennergeräusch bei Stillstand', () => {
  const a = render('i7', 1000, 0.0, 1, { speed: 0 }), b = render('i7', 8000, 0.8, 1, { speed: 40 });
  const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  assert.ok(rms(b) > rms(a) * 2);
});
