import { bus } from '../core/events.js';
import { h } from '../core/util.js';
import { icon } from './icons.js';

const TABS = [
  { id: 'home', label: 'Start', href: '#/home', off: 'home', on: 'home-fill' },
  { id: 'search', label: 'Suche', href: '#/search', off: 'search', on: 'search' },
  { id: 'favorites', label: 'Favoriten', href: '#/favorites', off: 'heart', on: 'heart-fill' },
  { id: 'library', label: 'Bibliothek', href: '#/library', off: 'library', on: 'library' },
];

export function initTabbar(host, scroller) {
  const links = TABS.map((t) =>
    h('a', { class: 'tab', href: t.href, 'data-tab': t.id },
      h('span', { class: 'tab-icon' }, icon(t.off, 26, 'ic-off'), icon(t.on, 26, 'ic-on')),
      h('span', { class: 'tab-label' }, t.label)));
  host.append(h('nav', { class: 'tabbar', 'aria-label': 'Hauptnavigation' }, links));

  const select = (id) => {
    links.forEach((a) => {
      const on = a.dataset.tab === id;
      a.classList.toggle('active', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
  };
  select('home');
  bus.on('route:change', ({ tab }) => tab && select(tab));
  // Erneutes Tippen auf den aktiven Tab scrollt nach oben
  links.forEach((a) => a.addEventListener('click', () => {
    if (a.classList.contains('active') && location.hash.startsWith(a.getAttribute('href'))) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}
