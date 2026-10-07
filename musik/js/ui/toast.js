import { h } from '../core/util.js';
import { settings } from '../services/settings.js';
import { icon } from './icons.js';

let timer;

/**
 * Kurze Hinweis-Einblendung. Informative Hinweise lassen sich in den Einstellungen abschalten,
 * Fehler (type: 'error') werden immer angezeigt.
 */
export function toast(message, { type = 'info', iconName } = {}) {
  if (type !== 'error' && !settings.get('toasts')) return;
  const host = document.getElementById('toasts');
  if (!host) return;
  clearTimeout(timer);
  const el = h('div', { class: `toast toast-${type}`, role: 'status' },
    iconName && icon(iconName, 18), h('span', null, message));
  host.replaceChildren(el);
  requestAnimationFrame(() => el.classList.add('show'));
  timer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, type === 'error' ? 3800 : 2400);
}
