import { clamp, h } from '../core/util.js';

/**
 * Touch-/Maus-/Tastatur-bedienbarer Schieberegler (Fortschritt, Lautstärke).
 * onInput: während des Ziehens, onChange: beim Loslassen.
 */
export function createSlider({ min = 0, max = 1, value = 0, step = 0.01, label = '', className = '', onInput, onChange, format }) {
  const fill = h('div', { class: 'slider-fill' });
  const thumb = h('div', { class: 'slider-thumb' });
  const rail = h('div', { class: 'slider-rail' }, fill, thumb);
  const el = h('div', { class: `slider ${className}`, role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max }, rail);
  let dragging = false;
  let current = value;

  const render = (v) => {
    current = clamp(v, min, max);
    const r = max === min ? 0 : (current - min) / (max - min);
    fill.style.transform = `scaleX(${r})`;
    thumb.style.left = `${r * 100}%`;
    el.setAttribute('aria-valuenow', String(current));
    if (format) el.setAttribute('aria-valuetext', format(current));
  };
  const fromEvent = (e) => {
    const rect = rail.getBoundingClientRect();
    return min + clamp((e.clientX - rect.left) / rect.width, 0, 1) * (max - min);
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    render(fromEvent(e));
    onInput?.(current);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    render(fromEvent(e));
    onInput?.(current);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    if (e.type === 'pointerup') onChange?.(current);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const big = (max - min) / 10;
    const delta = { ArrowRight: step * 5, ArrowUp: step * 5, ArrowLeft: -step * 5, ArrowDown: -step * 5, PageUp: big, PageDown: -big }[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      render(e.key === 'Home' ? min : max);
    } else if (delta !== undefined) {
      render(current + delta);
    } else return;
    e.preventDefault();
    onInput?.(current);
    onChange?.(current);
  });

  render(value);
  return {
    el,
    set(v) {
      if (!dragging) render(v);
    },
    get dragging() {
      return dragging;
    },
    get value() {
      return current;
    },
  };
}
