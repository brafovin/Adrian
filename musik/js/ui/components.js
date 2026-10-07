/** Wiederverwendbare UI-Bausteine ohne Geschäftslogik. */
import { h } from '../core/util.js';
import { favorites } from '../services/favorites.js';
import { player } from '../services/player.js';
import { icon } from './icons.js';

/** Cover mit Fallback-Fläche, falls das Bild fehlt oder nicht lädt. */
export function cover(c, { variant = 'small', cls = '', alt = '' } = {}) {
  const el = h('div', { class: `cover ${cls}` }, h('span', { class: 'cover-fallback' }, icon('note', 28)));
  const src = c && (c[variant] || c.large || c.small);
  if (src) {
    const img = h('img', { src, alt, decoding: 'async', draggable: 'false' });
    if (variant === 'small') img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    el.append(img);
  }
  return el;
}

/** 2×2-Mosaik aus Song-Covern (Playlists). */
export function mosaic(tracks, cls = '') {
  const covers = [];
  for (const t of tracks) {
    const key = t.cover?.small;
    if (key && !covers.includes(key)) covers.push(key);
  }
  if (covers.length >= 4) {
    return h('div', { class: `cover mosaic ${cls}` }, covers.slice(0, 4).map((src) => h('img', { src, alt: '', loading: 'lazy', decoding: 'async' })));
  }
  const first = tracks.find((t) => t.cover);
  return cover(first?.cover, { variant: 'large', cls: `${cls} ${first ? '' : 'cover-empty'}` });
}

export function equalizer() {
  return h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
}

export function spinner() {
  return h('span', { class: 'spinner', role: 'progressbar', 'aria-label': 'Lädt' });
}

export function heartButton(trackId, cls = '') {
  const fav = favorites.has(trackId);
  const btn = h('button', {
    class: `icon-btn heart-btn ${cls}${fav ? ' is-fav' : ''}`,
    type: 'button',
    'data-fav-id': trackId,
    'aria-label': 'Favorisieren',
    'aria-pressed': String(fav),
  }, icon('heart', 24, 'heart-off'), icon('heart-fill', 24, 'heart-on'), h('span', { class: 'heart-burst', 'aria-hidden': 'true' }));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    favorites.toggle(trackId);
  });
  return btn;
}

/** Play/Pause-Button mit animiertem Wechsel (`.is-playing` wird von live.js gesetzt). */
export function playButton({ cls = '', size = 28, onClick } = {}) {
  const playing = player.state.playing;
  return h('button', { class: `play-btn ${cls}${playing ? ' is-playing' : ''}`, type: 'button', 'data-sync': 'player', 'aria-label': playing ? 'Pause' : 'Wiedergabe', onclick: onClick },
    icon('play', size, 'ic-play'), icon('pause', size, 'ic-pause'));
}

export function songRow(track, { onPlay, onMenu, number, showDuration = false, formatTime } = {}) {
  const lead = number != null
    ? h('span', { class: 'song-num' }, h('span', { class: 'num' }, number), equalizer())
    : h('span', { class: 'song-cover' }, cover(track.cover), h('span', { class: 'eq-overlay' }, equalizer()));
  return h('div', { class: `song-row${player.current?.id === track.id ? ' is-current' : ''}`, role: 'listitem', 'data-track-id': track.id },
    h('button', { class: 'song-main', type: 'button', onclick: () => onPlay?.(track), 'aria-label': `${track.title} von ${track.artistName} abspielen` },
      lead,
      h('span', { class: 'song-text' },
        h('span', { class: 'song-title' }, track.title),
        h('span', { class: 'song-sub' }, track.demo && h('span', { class: 'badge-demo' }, 'DEMO'), h('span', { class: 'song-artist' }, track.artistName)))),
    showDuration && formatTime && h('span', { class: 'song-dur' }, formatTime(track.duration)),
    heartButton(track.id),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Weitere Optionen', onclick: (e) => { e.stopPropagation(); onMenu?.(track); } }, icon('more', 24)));
}

/** Karte für horizontale Listen. Entweder `href` oder `onClick`. */
export function card({ href, onClick, coverEl, title, subtitle, onPlay, round = false, cls = '' }) {
  const inner = [coverEl, h('span', { class: 'card-title' }, title), subtitle && h('span', { class: 'card-sub' }, subtitle)];
  const main = href
    ? h('a', { class: 'card-link', href }, inner)
    : h('button', { class: 'card-link', type: 'button', onclick: onClick }, inner);
  return h('div', { class: `card ${round ? 'card-round' : ''} ${cls}` },
    main,
    onPlay && h('button', { class: 'card-play', type: 'button', 'aria-label': `${title} abspielen`, onclick: (e) => { e.stopPropagation(); onPlay(); } }, icon('play', 22)));
}

export function sectionHeader(title, { href, label = 'Alle anzeigen', actions } = {}) {
  return h('div', { class: 'section-head' },
    h('h2', null, title),
    actions,
    href && h('a', { class: 'link-more', href }, label));
}

export const scroller = (...children) => h('div', { class: 'scroller' }, children);

export function emptyState({ iconName = 'note', title, text, action }) {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, icon(iconName, 36)),
    h('h3', null, title),
    text && h('p', null, text),
    action);
}

export function pageHeader(title, { back = false, actions, sub } = {}) {
  return h('header', { class: 'page-header' },
    back && h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zurück', onclick: () => history.back() }, icon('chevron-left', 28)),
    h('div', { class: 'page-title' }, h('h1', null, title), sub && h('p', null, sub)),
    actions && h('div', { class: 'header-actions' }, actions));
}
