/** Kompakter Mini-Player über der Tab-Leiste. */
import { bus } from '../core/events.js';
import { h } from '../core/util.js';
import { player } from '../services/player.js';
import { cover, playButton } from './components.js';
import { icon } from './icons.js';
import { openFullPlayer } from './fullplayer.js';

export function initMiniPlayer(host) {
  const fill = h('div', { class: 'mini-progress-fill' });
  const coverSlot = h('div', { class: 'mini-cover' });
  const title = h('div', { class: 'mini-title' });
  const artist = h('div', { class: 'mini-artist' });
  const main = h('button', { class: 'mini-main', type: 'button', 'aria-label': 'Player öffnen' }, coverSlot, h('div', { class: 'mini-text' }, title, artist));
  const btn = (name, label, fn) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(); } }, icon(name, 26));
  const el = h('div', { class: 'miniplayer', role: 'region', 'aria-label': 'Mini-Player' },
    main,
    h('div', { class: 'mini-controls' },
      btn('prev', 'Vorheriger Song', () => player.prev()),
      playButton({ cls: 'mini-play', size: 26, onClick: (e) => { e.stopPropagation(); player.toggle(); } }),
      btn('next', 'Nächster Song', () => player.next())),
    h('div', { class: 'mini-progress' }, fill));
  host.append(el);

  // Tippen öffnet den großen Player; Wischen nach links/rechts wechselt den Song.
  let startX = 0;
  let startY = 0;
  let swiped = false;
  main.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    swiped = false;
  });
  main.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      dx < 0 ? player.next() : player.prev();
      el.classList.remove('swipe-l', 'swipe-r');
      void el.offsetWidth;
      el.classList.add(dx < 0 ? 'swipe-l' : 'swipe-r');
    } else if (Math.abs(dy) > 40 && dy < -40) {
      swiped = true;
      openFullPlayer();
    }
  });
  main.addEventListener('click', () => {
    if (!swiped) openFullPlayer();
  });

  const renderTrack = () => {
    const t = player.current;
    host.classList.toggle('visible', !!t);
    if (!t) return;
    coverSlot.replaceChildren(cover(t.cover));
    title.textContent = t.title;
    artist.textContent = t.artistName;
    el.classList.remove('track-in');
    void el.offsetWidth;
    el.classList.add('track-in');
  };
  const renderTime = ({ position, duration }) => {
    fill.style.transform = `scaleX(${duration ? Math.min(1, position / duration) : 0})`;
  };
  bus.on('player:track', renderTrack);
  bus.on('player:time', renderTime);
  renderTrack();
  renderTime({ position: player.state.position, duration: player.state.duration });
}
