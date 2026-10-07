import { navigate } from '../core/nav.js';
import { formatLong, h, pluralize } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { auth } from '../services/auth.js';
import { playlists } from '../services/playlists.js';
import { openPlaylistMenu, openSongPicker, playPlaylist } from '../ui/actions.js';
import { trackList } from '../ui/cards.js';
import { emptyState, mosaic } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function playlistView(ctx) {
  const id = ctx.params.id;
  const mine = id.startsWith('up-');
  if (mine) ctx.on('playlists:change', () => ctx.refresh());

  const pl = mine ? playlists.get(id) : await catalog.getPlaylist(id);
  if (!pl) return emptyState({ iconName: 'library', title: 'Playlist nicht gefunden', text: 'Sie wurde möglicherweise gelöscht.', action: h('a', { class: 'btn btn-primary', href: '#/library' }, 'Zur Bibliothek') });

  const tracks = await catalog.getTracks(pl.trackIds);
  const title = pl.name || pl.title;
  const total = tracks.reduce((s, t) => s + (t.fullDuration || t.duration), 0);
  const owner = mine ? auth.user?.username || 'Du' : pl.ownerName;

  return h('div', { class: 'view-playlist' },
    h('div', { class: 'album-top' },
      h('button', { class: 'back-btn back-btn-flat', type: 'button', 'aria-label': 'Zurück', onclick: () => history.back() }, icon('chevron-left', 28)),
      mine && h('button', { class: 'back-btn back-btn-flat top-right', type: 'button', 'aria-label': 'Playlist-Optionen', onclick: () => openPlaylistMenu(pl, { onDeleted: () => navigate('/library') }) }, icon('more', 26)),
      h('div', { class: 'album-cover' }, mosaic(tracks, 'cover-hero')),
      h('div', { class: 'album-info' },
        h('h1', null, title),
        pl.description && h('p', { class: 'playlist-desc' }, pl.description),
        h('p', { class: 'album-meta' }, `${owner} · ${pluralize(tracks.length, 'Song', 'Songs')}${tracks.length ? ` · ${formatLong(total)}` : ''}`))),
    h('div', { class: 'action-bar' },
      h('button', { class: 'btn-fab', type: 'button', 'aria-label': 'Playlist abspielen', disabled: !tracks.length, onclick: () => playPlaylist(pl) }, icon('play', 34)),
      h('button', { class: 'icon-btn icon-btn-lg', type: 'button', 'aria-label': 'Zufällig abspielen', disabled: !tracks.length, onclick: () => playPlaylist(pl, { shuffle: true }) }, icon('shuffle', 28)),
      mine && h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => openSongPicker(id) }, icon('plus', 20), ' Songs hinzufügen')),
    h('section', { class: 'section' },
      tracks.length
        ? trackList(tracks, { context: title, playlistId: mine ? id : undefined })
        : emptyState({
          iconName: 'note',
          title: 'Noch keine Songs',
          text: 'Füge Songs hinzu, um die Playlist zu füllen.',
          action: mine && h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openSongPicker(id) }, 'Songs hinzufügen'),
        })));
}
