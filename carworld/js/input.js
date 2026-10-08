// Eingabe: Tastatur, Controller (Gamepad API) und Maus (Kamera). Weitere Geräte lassen sich als "Quelle" einhängen:
//
//   input.addSource({ name: 'Lenkrad', poll(state, dt) { state.steer = wheel.angle; state.throttle = wheel.gas; } })
//
// Jede Quelle schreibt kontinuierliche Werte in `state` (Mittelwerte werden nicht gebildet: die zuletzt aktive Quelle gewinnt)
// und kann einmalige Aktionen über `input.fire('cam')` auslösen.

import { clamp, damp } from './util.js';

export const ACTIONS = ['cam', 'lights', 'gearMode', 'reset', 'pause', 'map', 'photo', 'shiftUp', 'shiftDown', 'horn', 'nav', 'radio'];

const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], shiftUp: ['KeyE', 'ShiftRight'], shiftDown: ['KeyQ', 'ControlRight'], reverseGear: ['KeyR'],
};
const KEY_ACTIONS = {
  KeyC: 'cam', KeyL: 'lights', KeyG: 'gearMode', Backspace: 'reset', KeyP: 'pause', Escape: 'pause', KeyM: 'map', KeyV: 'photo', KeyH: 'horn', KeyN: 'nav',
};

export class Input {
  constructor(target = window) {
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0, reverse: false, lookX: 0, lookY: 0, zoom: 0, drag: false, boost: 0 };
    this.keys = new Set();
    this.sources = [];
    this.listeners = new Map();
    this.lastDevice = 'keyboard';
    this.gamepadName = null;
    this._steerK = 0;
    this._thr = 0;
    this._brk = 0;
    this._pending = [];
    this.enabled = true;

    target.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      const a = KEY_ACTIONS[e.code];
      if (a) this.fire(a);
      if (KEYMAP.shiftUp.includes(e.code)) this.fire('shiftUp');
      if (KEYMAP.shiftDown.includes(e.code)) this.fire('shiftDown');
    });
    target.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyH') this.fire('hornUp'); });
    target.addEventListener('blur', () => this.keys.clear());

    // Maus: Ziehen = Kamera drehen, Rad = Zoom
    let dragging = false, lx = 0, ly = 0;
    const el = typeof target.addEventListener === 'function' ? window : target;
    el.addEventListener('mousedown', (e) => { if (e.target.closest?.('.ui')) return; dragging = true; lx = e.clientX; ly = e.clientY; this.state.drag = true; });
    el.addEventListener('mouseup', () => { dragging = false; this.state.drag = false; });
    el.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this._mx = (this._mx || 0) + (e.clientX - lx); this._my = (this._my || 0) + (e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });
    el.addEventListener('wheel', (e) => { if (e.target.closest?.('.ui')) return; this._wheel = (this._wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
    // Touch: Zwei-Finger-Pinch ist nicht nötig; Wischen dreht die Kamera
    el.addEventListener('touchstart', (e) => { if (e.target.closest?.('.ui')) return; const t = e.touches[0]; lx = t.clientX; ly = t.clientY; dragging = true; this.state.drag = true; }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (!dragging) return; const t = e.touches[0]; this._mx = (this._mx || 0) + (t.clientX - lx); this._my = (this._my || 0) + (t.clientY - ly); lx = t.clientX; ly = t.clientY; }, { passive: true });
    el.addEventListener('touchend', () => { dragging = false; this.state.drag = false; });
    window.addEventListener('gamepadconnected', (e) => { this.gamepadName = e.gamepad.id; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadName = null; });
  }

  on(action, fn) { (this.listeners.get(action) || this.listeners.set(action, []).get(action)).push(fn); }
  fire(action) { for (const fn of this.listeners.get(action) || []) fn(); }
  addSource(src) { this.sources.push(src); }
  down(codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }

  /** Pro Frame aufrufen. */
  poll(dt) {
    const s = this.state;
    // ---- Tastatur
    const kThr = this.down(KEYMAP.throttle) ? 1 : 0;
    const kBrk = this.down(KEYMAP.brake) ? 1 : 0;
    const kL = this.down(KEYMAP.left) ? 1 : 0, kR = this.down(KEYMAP.right) ? 1 : 0;
    const kSteerT = kR - kL;
    // Lenken wie am Analogstick: schnell hinein, schneller zurück zur Mitte
    const rate = kSteerT === 0 ? 7 : (Math.sign(kSteerT) !== Math.sign(this._steerK) && this._steerK !== 0 ? 10 : 4.2);
    this._steerK = damp(this._steerK, kSteerT, rate, dt);
    if (Math.abs(this._steerK) < 0.002) this._steerK = 0;
    this._thr = damp(this._thr, kThr, kThr ? 9 : 14, dt);
    this._brk = damp(this._brk, kBrk, kBrk ? 14 : 18, dt);
    const kb = { throttle: this._thr, brake: this._brk, steer: this._steerK, handbrake: this.down(KEYMAP.handbrake) ? 1 : 0, reverse: this.down(KEYMAP.reverseGear) };
    const kbActive = kThr || kBrk || kL || kR || kb.handbrake;

    // ---- Controller
    let gp = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    let gpState = null;
    if (gp) {
      const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88; };
      const bt = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const steer = ax(0);
      gpState = {
        throttle: bt(7) || (bt(0) ? 0 : 0), brake: bt(6), steer: Math.sign(steer) * Math.pow(Math.abs(steer), 1.4), handbrake: bt(1) || bt(2) ? 1 : 0,
        lookX: ax(2), lookY: ax(3),
      };
      const edge = (i, name) => {
        const pressed = !!(gp.buttons[i] && gp.buttons[i].pressed);
        const was = this._gpPrev ? this._gpPrev[i] : false;
        if (pressed && !was) this.fire(name);
        (this._gpNext || (this._gpNext = []))[i] = pressed;
      };
      this._gpNext = [];
      edge(3, 'cam'); edge(5, 'shiftUp'); edge(4, 'shiftDown'); edge(12, 'lights'); edge(8, 'reset'); edge(9, 'pause'); edge(10, 'horn'); edge(13, 'gearMode'); edge(15, 'nav'); edge(14, 'photo');
      this._gpPrev = this._gpNext;
      if (gpState.throttle > 0.02 || gpState.brake > 0.02 || Math.abs(gpState.steer) > 0.05) this.lastDevice = 'gamepad';
    }
    const src = this.lastDevice === 'gamepad' && gpState ? gpState : kb;
    s.throttle = src.throttle; s.brake = src.brake; s.steer = src.steer; s.handbrake = src.handbrake ?? 0;
    s.reverse = !!kb.reverse;
    if (!kbActive && !gpState) { s.throttle = 0; s.brake = 0; }
    // Kamera-Eingaben
    s.lookX = (gpState ? gpState.lookX : 0) * 1.8 + (this._mx || 0) * 0.0042;
    s.lookY = (gpState ? gpState.lookY : 0) * 1.4 + (this._my || 0) * 0.0035;
    s.zoom = (this._wheel || 0);
    this._mx = 0; this._my = 0; this._wheel = 0;
    for (const src2 of this.sources) src2.poll?.(s, dt);
    s.steer = clamp(s.steer, -1, 1);
    return s;
  }
}
