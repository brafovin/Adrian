import { APP } from '../config.js';
import { h } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { auth } from '../services/auth.js';
import { favorites } from '../services/favorites.js';
import { library } from '../services/library.js';
import { playlists } from '../services/playlists.js';
import { createPlaylistFlow, playAll, playArtist, playTracks } from '../ui/actions.js';
import { albumCard, createPlaylistCard, playlistCard, trackCard, trackList } from '../ui/cards.js';
import { cover, mosaic, scroller, sectionHeader } from '../ui/components.js';
import { icon, logoMark } from '../ui/icons.js';

function quickTile({ coverEl, title, href, onClick, cls = '' }) {
  const inner = [coverEl, h('span', { class: 'tile-title' }, title)];
  return href ? h('a', { class: `tile ${cls}`, href }, inner) : h('button', { class: `tile ${cls}`, type: 'button', onclick: onClick }, inner);
}

function heroCard(artist) {
  return h('section', { class: 'artist-hero-card' },
    h('a', { class: 'hero-link', href: `#/artist/${artist.id}`, 'aria-label': `${artist.name} – Künstlerseite öffnen` },
      cover(artist.image, { variant: 'large', cls: 'hero-bg' }),
      h('span', { class: 'hero-shade' }),
      h('span', { class: 'hero-text' },
        h('span', { class: 'eyebrow' }, 'Im Mittelpunkt'),
        h('span', { class: 'hero-name' }, artist.name),
        h('span', { class: 'hero-sub' }, artist.tagline))),
    h('button', { class: 'hero-play', type: 'button', 'aria-label': `${artist.name} abspielen`, onclick: () => playArtist(artist.id) }, icon('play', 30)));
}

export async function homeView(ctx) {
  ctx.on('playlists:change', () => ctx.refresh());

  const user = auth.user;
  const artists = await catalog.artists();
  const [popular, newest, editorial, recent, albumsByArtist] = await Promise.all([
    catalog.tracks({ sort: 'popularity', limit: 6 }),
    catalog.tracks({ sort: 'newest', limit: 12 }),
    catalog.playlists({ limit: 2 }),
    catalog.getTracks(library.recentIds().slice(0, 12)),
    Promise.all(artists.map((a) => catalog.albums({ artistId: a.id, limit: 12 }))),
  ]);
  const myCards = await Promise.all(playlists.list().slice(0, 12).map(playlistCard));
  const editorialTracks = await Promise.all(editorial.map((p) => catalog.getTracks(p.trackIds.slice(0, 4))));

  const name = user && !user.guest ? user.username : '';
  const tiles = [
    quickTile({
      href: '#/favorites',
      cls: 'tile-fav',
      coverEl: h('span', { class: 'tile-cover tile-heart' }, icon('heart-fill', 26)),
      title: `Favoriten${favorites.count() ? ` · ${favorites.count()}` : ''}`,
    }),
    quickTile({
      onClick: () => playAll({ shuffle: true }),
      coverEl: h('span', { class: 'tile-cover tile-shuffle' }, icon('shuffle', 24)),
      title: 'Zufalls-Mix',
    }),
    ...editorial.map((p, i) => quickTile({ href: `#/playlist/${p.id}`, coverEl: mosaic(editorialTracks[i], 'tile-cover'), title: p.title })),
  ];

  const heroes = artists.length === 1
    ? heroCard(artists[0])
    : h('div', { class: 'hero-row' }, artists.map(heroCard));

  const recentSection = h('section', { class: 'section' },
    sectionHeader('Zuletzt gehört', recent.length ? { href: '#/library', label: 'Bibliothek' } : {}),
    recent.length
      ? scroller(recent.map((t, i) => trackCard(t, recent, i, 'Zuletzt gehört')))
      : h('div', { class: 'hint-card' }, icon('clock', 22), h('p', null, 'Hier erscheinen deine zuletzt gehörten Songs.'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => popular.length && playTracks(popular, 0, 'Beliebte Songs') }, 'Jetzt starten')));

  return h('div', { class: 'view-home' },
    h('header', { class: 'home-top' },
      h('div', { class: 'brand' }, logoMark(34), h('span', { class: 'wordmark' }, APP.name)),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Einstellungen' }, icon('settings', 26))),
    h('section', { class: 'welcome' },
      h('h1', null, name ? `Bienvenue, ${name}` : 'Bienvenue'),
      h('p', null, 'Ton univers. Ta musique.')),
    h('div', { class: 'tiles' }, tiles),
    heroes,
    recentSection,
    h('section', { class: 'section' },
      sectionHeader('Beliebte Songs', { href: '#/search?browse=popular', label: 'Alle anzeigen' }),
      trackList(popular, { context: 'Beliebte Songs' })),
    h('section', { class: 'section' },
      sectionHeader('Deine Playlists', myCards.length ? { href: '#/library' } : {}),
      scroller(createPlaylistCard(() => createPlaylistFlow({ open: true })), myCards)),
    artists.map((a, i) => albumsByArtist[i].length > 0 && h('section', { class: 'section' },
      sectionHeader(a.name, { href: `#/artist/${a.id}`, label: 'Zur Künstlerseite' }),
      scroller(albumsByArtist[i].map(albumCard)))),
    h('section', { class: 'section' },
      sectionHeader('Neu hinzugefügt'),
      scroller(newest.map((t, i) => trackCard(t, newest, i, 'Neu hinzugefügt')))),
    catalog.info.notice && h('p', { class: 'demo-note' }, catalog.info.notice));
}
