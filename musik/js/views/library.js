import { h, pluralize } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { favorites } from '../services/favorites.js';
import { library } from '../services/library.js';
import { playlists } from '../services/playlists.js';
import { createPlaylistFlow } from '../ui/actions.js';
import { albumCard, createPlaylistCard, playlistCard, trackList } from '../ui/cards.js';
import { pageHeader, sectionHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

export async function libraryView(ctx) {
  ctx.on('playlists:change', () => ctx.refresh());
  ctx.on('library:change', (e) => (e.type === 'albums' || e.all) && ctx.refresh());

  const [recent, albums] = await Promise.all([
    catalog.getTracks(library.recentIds().slice(0, 8)),
    catalog.getAlbums(library.savedAlbumIds()),
  ]);
  const lists = playlists.list();
  const cards = await Promise.all(lists.map(playlistCard));
  const favCount = favorites.count();

  return h('div', { class: 'view-library' },
    pageHeader('Bibliothek', { actions: h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Neue Playlist', onclick: () => createPlaylistFlow({ open: true }) }, icon('plus', 28)) }),
    h('a', { class: 'fav-tile', href: '#/favorites' },
      h('span', { class: 'fav-icon' }, icon('heart-fill', 30)),
      h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, 'Favoriten'), h('span', { class: 'song-sub' }, favCount ? pluralize(favCount, 'Song', 'Songs') : 'Noch keine Songs')),
      icon('chevron-right', 22, 'chev')),
    h('section', { class: 'section' },
      sectionHeader('Eigene Playlists'),
      h('div', { class: 'grid-2' }, createPlaylistCard(() => createPlaylistFlow({ open: true })), cards)),
    h('section', { class: 'section' },
      sectionHeader('Zuletzt gehört', recent.length ? { actions: h('button', { class: 'link-more', type: 'button', onclick: () => { library.clearHistory(); ctx.refresh(); toast('Verlauf gelöscht', { iconName: 'check' }); } }, 'Verlauf löschen') } : {}),
      recent.length ? trackList(recent, { context: 'Zuletzt gehört' }) : h('div', { class: 'hint-card' }, icon('clock', 22), h('p', null, 'Noch nichts gehört. Spiele einen Song ab – er erscheint dann hier.'))),
    h('section', { class: 'section' },
      sectionHeader('Gespeicherte Alben'),
      albums.length
        ? h('div', { class: 'grid-2' }, albums.map(albumCard))
        : h('div', { class: 'hint-card' }, icon('bookmark', 22), h('p', null, 'Tippe in einem Album auf das Lesezeichen, um es hier zu speichern.'))));
}
