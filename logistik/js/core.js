'use strict';
/* JWG.logistik – Kern: Hilfsfunktionen, HTML-Vorlagen, Symbole und UI-Bausteine (Dialoge, Meldungen, Aktionen). */

let NOW = () => Date.now();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- HTML-Vorlagen mit automatischem Escaping ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s == null ? '' : s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
const toH = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(toH).join('') : esc(v));
function html(st, ...vals) {
  let o = st[0];
  for (let i = 0; i < vals.length; i++) o += toH(vals[i]) + st[i + 1];
  return new Raw(o);
}

/* ---------- Zahlen, Daten ---------- */
const D2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${D2(d.getMonth() + 1)}-${D2(d.getDate())}`;
const today = () => isoDate(new Date(NOW()));
const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 864e5);
const at = (dateISO, hm) => { const [h, m] = String(hm || '00:00').split(':').map(Number); const d = parseISO(dateISO); d.setHours(h, m, 0, 0); return d.getTime(); };
const hhmm = (ts) => { const d = new Date(ts); return `${D2(d.getHours())}:${D2(d.getMinutes())}`; };
const dateOf = (ts) => isoDate(new Date(ts));
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fDate = (s) => {
  if (!s) return '–';
  const d = typeof s === 'number' ? new Date(s) : parseISO(s);
  return `${D2(d.getDate())}.${D2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const fDay = (s) => { const d = typeof s === 'number' ? new Date(s) : parseISO(s); return `${WD[d.getDay()]}, ${D2(d.getDate())}.${D2(d.getMonth() + 1)}.`; };
const fDT = (ts) => (ts ? `${fDate(ts)}, ${hhmm(ts)}` : '–');
const rel = (ts) => {
  const m = Math.round((NOW() - ts) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  if (m < 1440) return `vor ${Math.round(m / 60)} Std.`;
  return `vor ${Math.round(m / 1440)} Tg.`;
};
const eur = (n) => (+n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const nf = (n, d = 0) => (+n || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const dur = (min) => { min = Math.round(min); return min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${D2(min % 60)} Min.`; };
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
const by = (f, dir = 1) => (a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; };
const cmp = (a, b) => (a > b ? 1 : a < b ? -1 : 0);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- Symbole ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2.2.6 3.5 2.4 3.5 5.7"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M3.6 14.5l6-1.5M20.4 14.5l-6-1.5"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h4.5l3.5 3.5V16H13z"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  euro: '<path d="M17.5 6.5A6.5 6.5 0 1 0 17.5 17.5M4 10h9M4 14h9"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-6 9-8"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  building: '<path d="M4 21V5l8-2v18M12 9h8v12M4 21h16M7.5 8.5h1M7.5 12h1M7.5 15.5h1M15.5 13h1M15.5 17h1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M9 16a4.5 4.5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
  wifioff: '<path d="M3 3l18 18M8.5 8.5A14 14 0 0 0 2.5 9M5.5 12.5a9.5 9.5 0 0 1 4-2.2M15 11a9.5 9.5 0 0 1 3.5 1.5M9 16a4.5 4.5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-2 5.5-2 6 0M14 10h4M14 14h3"/>',
};
const ic = (n, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);

/* ---------- Kleine Bausteine ---------- */
const chip = (label, tone = 'gray', title) => html`<span class="chip tone-${tone}" ${title ? raw(`title="${esc(title)}"`) : ''}>${label}</span>`;
const kv = (k, v) => html`<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`;
const empty = (text, sub) => html`<div class="empty">${ic('box')}<p><b>${text}</b></p>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>`;
const initials = (n) => String(n).split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const avatar = (n, tone) => html`<span class="avatar tone-${tone || ['blue', 'teal', 'violet', 'amber', 'pink', 'green'][hash(n) % 6]}" aria-hidden="true">${initials(n)}</span>`;
const progress = (v, max, tone) => {
  const p = max ? clamp((v / max) * 100, 0, 100) : 0;
  return html`<div class="bar ${tone || (p > 100 ? 'bad' : p > 85 ? 'warn' : '')}" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>`;
};

/* ---------- Formulare ---------- */
const optList = (options, val) => options.map((o) => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return html`<option value="${v}" ${String(v) === String(val) ? raw('selected') : ''}>${l}</option>`;
});
function fld(label, name, val = '', o = {}) {
  const type = o.type || 'text';
  const attrs = [o.req ? 'required' : '', o.ph ? `placeholder="${esc(o.ph)}"` : '', o.min != null ? `min="${esc(o.min)}"` : '', o.max != null ? `max="${esc(o.max)}"` : '', o.step ? `step="${esc(o.step)}"` : '', o.list ? `list="${esc(o.list)}"` : '', o.ro ? 'readonly' : '', o.pattern ? `pattern="${esc(o.pattern)}"` : '', o.auto ? `autocomplete="${esc(o.auto)}"` : '', o.maxlength ? `maxlength="${esc(o.maxlength)}"` : '', o.attrs || ''].join(' ');
  let control;
  if (type === 'select') control = html`<select name="${name}" ${raw(attrs)}>${optList(o.options || [], val)}</select>`;
  else if (type === 'textarea') control = html`<textarea name="${name}" rows="${o.rows || 3}" ${raw(attrs)}>${val}</textarea>`;
  else control = html`<input type="${type}" name="${name}" value="${val}" ${raw(attrs)}>`;
  return html`<label class="fld ${o.cls || ''}"><span>${label}${o.req ? raw('<i aria-hidden="true"> *</i>') : ''}</span>${control}${o.hint ? html`<small class="muted">${o.hint}</small>` : ''}</label>`;
}
const checks = (name, options, selected = []) => html`<div class="checks">${options.map((o) => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return html`<label class="chk"><input type="checkbox" name="${name}" value="${v}" ${selected.includes(v) ? raw('checked') : ''}><span>${l}</span></label>`;
})}</div>`;
function formObj(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.name.endsWith('[]') || form.querySelectorAll(`[name="${CSS.escape(el.name)}"]`).length > 1) { (o[el.name.replace('[]', '')] ||= []); if (el.checked) o[el.name.replace('[]', '')].push(el.value); } else o[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else if (el.type === 'file') { o[el.name] = el.files; } else o[el.name] = el.value;
  }
  return o;
}

/* ---------- Meldungen und Dialoge ---------- */
function toast(msg, kind = '') {
  const box = $('#toasts'); if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4300);
}
const modals = [];
function openModal({ title, body, foot, wide, form, cls = '', onClose }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  const inner = html`<header><h2 id="mt${modals.length}">${title}</h2><button type="button" class="icon-btn" data-act="modal.close" aria-label="Schließen">${ic('x')}</button></header><div class="modal-body">${body}</div>${foot ? html`<footer>${foot}</footer>` : ''}`;
  bg.innerHTML = String(form
    ? html`<form class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt${modals.length}" data-submit="${form}" novalidate>${inner}</form>`
    : html`<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt${modals.length}">${inner}</div>`);
  const prev = document.activeElement;
  $('#modals').appendChild(bg);
  document.body.classList.add('has-modal');
  const m = { el: bg, prev, onClose };
  modals.push(m);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  const first = bg.querySelector('[autofocus],.modal-body input:not([type=hidden]):not([readonly]),.modal-body select,.modal-body textarea') || bg.querySelector('.modal-body button,.icon-btn');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  return bg;
}
function closeModal() {
  const m = modals.pop(); if (!m) return;
  m.el.remove();
  if (!modals.length) document.body.classList.remove('has-modal');
  if (m.prev && document.contains(m.prev)) { try { m.prev.focus({ preventScroll: true }); } catch (e) { /* weg */ } }
  if (m.onClose) m.onClose();
}
const closeAllModals = () => { while (modals.length) closeModal(); };
let confirmCb = null;
function confirmBox(text, okLabel, cb, tone = 'danger') {
  confirmCb = cb;
  openModal({ title: 'Bitte bestätigen', body: html`<p>${text}</p>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button type="button" class="btn ${tone}" data-act="confirm.yes" autofocus>${okLabel}</button>`, cls: 'small' });
}
function inputBox(title, label, val, cb, okLabel = 'Speichern') {
  openModal({ title, form: 'inputbox', cls: 'small', body: fld(label, 'v', val, { req: true }), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">${okLabel}</button>` });
  inputBox.cb = cb;
}

/* ---------- Aktionen (Ereignisse per data-act) ---------- */
const ACT = {};
function act(name, mod, fn) { ACT[name] = { mod, fn }; }
const SUBMIT = {};
function onSubmit(name, mod, fn) { SUBMIT[name] = { mod, fn }; }
let canWrite = () => true; // wird von app.js ersetzt

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const a = ACT[el.dataset.act];
  if (!a) return;
  if (a.mod && !canWrite(a.mod)) { ev.preventDefault(); toast('Dafür fehlt dir die Berechtigung (Rolle: ' + (window.roleName ? window.roleName() : '–') + ').', 'bad'); return; }
  if (el.tagName === 'A' && (!el.getAttribute('href') || el.getAttribute('href') === '#')) ev.preventDefault();
  a.fn(el.dataset, el, ev);
});
document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('form[data-submit]');
  if (!f) return;
  ev.preventDefault();
  const s = SUBMIT[f.dataset.submit];
  if (!s) return;
  if (!f.checkValidity()) { f.reportValidity(); return; }
  if (s.mod && !canWrite(s.mod)) { toast('Dafür fehlt dir die Berechtigung (Rolle: ' + (window.roleName ? window.roleName() : '–') + ').', 'bad'); return; }
  s.fn(formObj(f), f);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && modals.length) { ev.preventDefault(); closeModal(); }
  if (ev.key === 'Tab' && modals.length) {
    const m = modals[modals.length - 1].el;
    const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', m).filter((e) => e.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); } else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); } else if (!m.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
  }
});
act('modal.close', null, () => closeModal());
act('confirm.yes', null, () => { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); });
onSubmit('inputbox', null, (d) => { const cb = inputBox.cb; closeModal(); if (cb) cb(d.v.trim()); });

/* ---------- Export, Druck ---------- */
function download(name, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csvOf(header, rows) { return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'); }
function downloadCSV(name, header, rows) { download(name, csvOf(header, rows)); toast(`${name} exportiert (${rows.length} Zeilen)`, 'ok'); }

/* Bilder verkleinern, damit der Browser-Speicher reicht */
function shrinkImage(file, max = 720, q = 0.62) {
  return new Promise((resolve) => {
    if (!file || !/^image\//.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
function readFileSmall(file, limit = 250000) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (file.size > limit) return resolve({ name: file.name, size: file.size, data: null });
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, size: file.size, data: r.result });
    r.onerror = () => resolve({ name: file.name, size: file.size, data: null });
    r.readAsDataURL(file);
  });
}
