/** Bottom-Sheets und Dialoge (nutzen den Overlay-Stapel für die Zurück-Taste). */
import { closeOverlay, openOverlay } from '../core/overlays.js';
import { h } from '../core/util.js';
import { icon } from './icons.js';

const root = () => document.getElementById('overlays');

function mount(wrap, onClose) {
  root().append(wrap);
  const overlay = openOverlay(() => {
    wrap.classList.remove('open');
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 320);
    onClose?.();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return overlay;
}

/** Zieh-nach-unten-zum-Schließen (Touch & Maus). */
function dragToDismiss(sheet, handles, close) {
  let startY = 0;
  let dy = 0;
  let startT = 0;
  let active = false;
  for (const handle of handles) {
    handle.addEventListener('pointerdown', (e) => {
      active = true;
      startY = e.clientY;
      startT = performance.now();
      dy = 0;
      handle.setPointerCapture(e.pointerId);
      sheet.style.transition = 'none';
    });
    handle.addEventListener('pointermove', (e) => {
      if (!active) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!active) return;
      active = false;
      const velocity = dy / Math.max(1, performance.now() - startT);
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 110 || velocity > 0.6) close();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

export function openSheet({ title, subtitle, content, className = '', head, onClose } = {}) {
  const grab = h('div', { class: 'sheet-grab' }, h('span'));
  const header = head || (title ? h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), subtitle && h('div', { class: 'sheet-sub' }, subtitle)) : null);
  const body = h('div', { class: 'sheet-body' }, content);
  const sheet = h('div', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Menü' }, grab, header, body);
  const backdrop = h('div', { class: 'backdrop' });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
  let overlay;
  const close = () => closeOverlay(overlay);
  overlay = mount(wrap, onClose);
  backdrop.addEventListener('click', close);
  dragToDismiss(sheet, [grab, header].filter(Boolean), close);
  return { close, el: sheet, body };
}

export function openDialog({ title, content, actions = [], className = '', onClose }) {
  const wrap = h('div', { class: 'dialog-wrap' });
  let overlay;
  const close = () => closeOverlay(overlay);
  const buttons = actions.map((a) =>
    h('button', {
      class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`,
      type: a.submit ? 'submit' : 'button',
      onclick: a.submit ? null : () => a.onClick?.(close),
    }, a.label));
  const dialog = h('div', { class: `dialog ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', { class: 'dialog-title' }, title), content, h('div', { class: 'dialog-actions' }, buttons));
  wrap.append(h('div', { class: 'backdrop' }), dialog);
  overlay = mount(wrap, onClose);
  wrap.firstChild.addEventListener('click', close);
  return { close, el: dialog };
}

/** Formular-Dialog; liefert die Werte oder null bei Abbruch. */
export function promptDialog({ title, fields, confirmLabel = 'Speichern', note }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const inputs = fields.map((f) => {
      const input = f.multiline
        ? h('textarea', { name: f.name, rows: 3, maxlength: f.maxlength, placeholder: f.placeholder || '', class: 'input' }, f.value || '')
        : h('input', { name: f.name, type: f.type || 'text', maxlength: f.maxlength, placeholder: f.placeholder || '', value: f.value || '', class: 'input', autocomplete: 'off', required: f.required });
      return { f, input };
    });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'form' },
      inputs.map(({ f, input }) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, f.label), input)),
      note && h('p', { class: 'form-note' }, note),
      error);
    const dlg = openDialog({
      title,
      content: form,
      onClose: () => done(null),
      actions: [
        { label: 'Abbrechen', kind: 'ghost', onClick: (close) => { done(null); close(); } },
        { label: confirmLabel, kind: 'primary', onClick: () => form.requestSubmit() },
      ],
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = Object.fromEntries(inputs.map(({ f, input }) => [f.name, input.value.trim()]));
      const missing = fields.find((f) => f.required && !values[f.name]);
      if (missing) {
        error.textContent = `Bitte ${missing.label} angeben.`;
        return;
      }
      done(values);
      dlg.close();
    });
    setTimeout(() => inputs[0]?.input.focus(), 120);
  });
}

export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    openDialog({
      title,
      content: h('p', { class: 'dialog-text' }, message),
      onClose: () => done(false),
      actions: [
        { label: 'Abbrechen', kind: 'ghost', onClick: (close) => { done(false); close(); } },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: (close) => { done(true); close(); } },
      ],
    });
  });
}

/** Zeile für Menüs in Sheets. */
export function menuItem({ iconName, label, sub, onClick, danger = false, active = false, trailing }) {
  return h('button', { class: `menu-item${danger ? ' danger' : ''}${active ? ' active' : ''}`, type: 'button', onclick: onClick },
    iconName && h('span', { class: 'menu-icon' }, icon(iconName, 22)),
    h('span', { class: 'menu-text' }, h('span', { class: 'menu-label' }, label), sub && h('span', { class: 'menu-sub' }, sub)),
    trailing);
}
