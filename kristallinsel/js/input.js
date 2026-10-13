// Eingabe: Tastatur + Maus (Zeigersperre), Touch (virtueller Stick, Blick ziehen, Knöpfe), Controller.
const KEYS_FWD = ['KeyW', 'ArrowUp'], KEYS_BACK = ['KeyS', 'ArrowDown'], KEYS_LEFT = ['KeyA', 'ArrowLeft'], KEYS_RIGHT = ['KeyD', 'ArrowRight'];

export class Input {
  constructor(canvas, touchUi) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.touch = { stick: null, look: null, run: false, jump: false, pinch: null };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;
    this.pointerLocked = false;
    this.lastLookTime = 0;
    this.gp = { prev: [] };

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (!['Space'].includes(e.code)) return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && document.activeElement?.tagName !== 'INPUT') e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (this.isTouch || !this.enabled) return;
      if (e.button === 0) this.onClick?.();
      if (e.button === 0 && !this.pointerLocked && this.wantLock) this.lock();
      this.drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', () => { this.drag = null; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) { this.lookDX += e.movementX; this.lookDY += e.movementY; this.lastLookTime = performance.now(); }
      else if (this.drag) {
        this.lookDX += e.clientX - this.drag.x; this.lookDY += e.clientY - this.drag.y;
        this.drag = { x: e.clientX, y: e.clientY };
        this.lastLookTime = performance.now();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.onUnlock?.();
    });
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (touchUi) this._setupTouch(touchUi);
  }

  /** Zeigersperre anfordern (manche Browser liefern ein Promise, das bei zu schnellem Wiederholen scheitert). */
  lock() {
    try { const p = this.canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* egal */ }
  }

  _setupTouch(ui) {
    const { zone, stick, knob, buttons } = ui;
    const T = this.touch;
    const start = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && !T.stick) {
          T.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: 0, y: 0 };
          stick.style.left = `${t.clientX}px`; stick.style.top = `${t.clientY}px`;
          stick.classList.add('on');
        } else if (!T.look) {
          T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        } else if (!T.pinch) {
          const lx = T.look.x, ly = T.look.y;
          T.pinch = { id: t.identifier, d: Math.hypot(t.clientX - lx, t.clientY - ly) };
        }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (T.stick && t.identifier === T.stick.id) {
          let dx = t.clientX - T.stick.x0, dy = t.clientY - T.stick.y0;
          const R = 52, l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          T.stick.x = dx / R; T.stick.y = -dy / R;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (T.look && t.identifier === T.look.id) {
          this.lookDX += (t.clientX - T.look.x) * 1.6; this.lookDY += (t.clientY - T.look.y) * 1.6;
          T.look.x = t.clientX; T.look.y = t.clientY;
          this.lastLookTime = performance.now();
          if (T.pinch) T.pinch.lx = t.clientX;
        } else if (T.pinch && t.identifier === T.pinch.id) {
          const d = Math.hypot(t.clientX - T.look.x, t.clientY - T.look.y);
          this.zoom += (T.pinch.d - d) / 40;
          T.pinch.d = d;
        }
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (T.stick && t.identifier === T.stick.id) { T.stick = null; stick.classList.remove('on'); knob.style.transform = ''; }
        if (T.look && t.identifier === T.look.id) { T.look = null; T.pinch = null; }
        if (T.pinch && t.identifier === T.pinch.id) T.pinch = null;
      }
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    for (const [name, el] of Object.entries(buttons)) {
      if (!el) continue;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (name === 'run') { T.run = !T.run; el.classList.toggle('active', T.run); }
        else { this.edges.add('touch-' + name); el.classList.add('pressed'); if (name === 'jump') T.jump = true; }
      }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('pressed'); if (name === 'jump') T.jump = false; });
      el.addEventListener('click', () => { if (!this.isTouch) this.edges.add('touch-' + name); });
    }
  }

  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const b = gp.buttons.map((x) => x.pressed);
    const prev = this.gp.prev;
    const pressed = (i) => b[i] && !prev[i];
    this.gp.prev = b;
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { this.lookDX += rx * 14; this.lookDY += ry * 10; this.lastLookTime = performance.now(); }
    return {
      mx: lx, my: -ly, run: b[1] || b[10] || (gp.buttons[7]?.value > 0.4),
      jump: pressed(0), interact: pressed(2), map: pressed(3) || pressed(8), pause: pressed(9),
      zoomIn: b[5], zoomOut: b[4],
    };
  }

  /** Liefert den Eingabezustand dieses Frames und setzt einmalige Ereignisse zurück. */
  read() {
    const k = this.keys, e = this.edges, T = this.touch;
    const any = (list) => list.some((c) => k.has(c));
    const was = (...codes) => codes.some((c) => e.has(c));
    let mx = (any(KEYS_RIGHT) ? 1 : 0) - (any(KEYS_LEFT) ? 1 : 0);
    let my = (any(KEYS_FWD) ? 1 : 0) - (any(KEYS_BACK) ? 1 : 0);
    let run = k.has('ShiftLeft') || k.has('ShiftRight') || T.run;
    if (T.stick) { mx = T.stick.x; my = T.stick.y; if (Math.hypot(mx, my) > 0.95 && T.run) run = true; }
    const g = this._pollGamepad();
    let jump = was('Space', 'touch-jump'), interact = was('KeyE', 'KeyF', 'Enter', 'touch-interact');
    let map = was('KeyK', 'Tab', 'touch-map'), pause = was('Escape', 'KeyP', 'touch-pause');
    if (g) {
      if (Math.hypot(g.mx, g.my) > 0) { mx = g.mx; my = g.my; }
      run = run || g.run; jump = jump || g.jump; interact = interact || g.interact; map = map || g.map; pause = pause || g.pause;
      if (g.zoomIn) this.zoom -= 0.15; if (g.zoomOut) this.zoom += 0.15;
    }
    const out = {
      mx, my, run, jump, interact, map, pause,
      jumpHeld: k.has('Space') || T.jump,
      mute: was('KeyM'), camReset: was('KeyC'), fps: was('F3'), photo: was('KeyO'),
      lookDX: this.lookDX, lookDY: this.lookDY, zoom: this.zoom,
      any: mx !== 0 || my !== 0 || jump || interact,
      pad: !!g && (g.mx !== 0 || g.my !== 0),
    };
    this.edges.clear();
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    return out;
  }
}
