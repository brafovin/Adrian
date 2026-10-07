/** Nutzeraktionen, die mehrere Services und Sheets verbinden (Menüs, Playlist-Dialoge, Abspielen). */
import { navigate, navigateFromOverlay } from '../core/nav.js';
import { debounce, h, pluralize } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { favorites } from '../services/favorites.js';
import { library } from '../services/library.js';
import { player } from '../services/player.js';
import { LIMITS, playlists } from '../services/playlists.js';
import { cover, heartButton } from './components.js';
import { icon } from './icons.js';
import { confirmDialog, menuItem, openSheet, promptDialog } from './sheet.js';
import { toast } from './toast.js';

// ---------- Abspielen ----------
export function playTracks(tracks, index = 0, context = '') {
  player.playTracks(tracks, index, { context });
}

export async function playAlbum(albumId, { shuffle } = {}) {
  const [album, tracks] = await Promise.all([catalog.getAlbum(albumId), catalog.albumTracks(albumId)]);
  player.playTracks(tracks, 0, { context: album?.title || 'Album', shuffle });
}

export async function playArtist(artistId, { shuffle } = {}) {
  const [artist, tracks] = await Promise.all([catalog.getArtist(artistId), catalog.tracks({ artistId, sort: 'popularity', limit: 500 })]);
  player.playTracks(tracks, 0, { context: artist?.name || 'Künstler', shuffle });
}

export async function playPlaylist(pl, { shuffle } = {}) {
  const tracks = await catalog.getTracks(pl.trackIds);
  if (!tracks.length) return toast('Diese Playlist ist noch leer.');
  player.playTracks(tracks, 0, { context: pl.name || pl.title, shuffle });
}

export function toggleAlbumSaved(album) {
  const saved = library.toggleAlbum(album.id);
  toast(saved ? 'In Bibliothek gespeichert' : 'Aus Bibliothek entfernt', { iconName: saved ? 'bookmark-fill' : 'bookmark' });
  return saved;
}

// ---------- Song-Menü ----------
export function openTrackMenu(track, { tracks, index, context = '', playlistId, onChanged } = {}) {
  let sheet;
  const act = (fn) => () => {
    sheet.close();
    fn();
  };
  const fav = favorites.has(track.id);
  const head = h('div', { class: 'sheet-head sheet-head-track' },
    cover(track.cover, { cls: 'cover-md' }),
    h('div', { class: 'sheet-head-text' }, h('div', { class: 'sheet-title' }, track.title), h('div', { class: 'sheet-sub' }, track.artistName)));
  const items = [
    menuItem({ iconName: 'play', label: 'Abspielen', onClick: act(() => (tracks ? playTracks(tracks, index ?? tracks.indexOf(track), context) : playTracks([track], 0, track.artistName))) }),
    menuItem({ iconName: 'queue', label: 'Als Nächstes spielen', onClick: act(() => { player.playNext(track); toast('Wird als Nächstes gespielt', { iconName: 'queue' }); }) }),
    menuItem({ iconName: 'playlist-add', label: 'Zur Warteschlange hinzufügen', onClick: act(() => { player.addToQueue(track); toast('Zur Warteschlange hinzugefügt', { iconName: 'queue' }); }) }),
    menuItem({ iconName: 'plus', label: 'Zu Playlist hinzufügen', onClick: act(() => openAddToPlaylist([track.id])) }),
    menuItem({
      iconName: fav ? 'heart-fill' : 'heart',
      label: fav ? 'Aus Favoriten entfernen' : 'Favorisieren',
      active: fav,
      onClick: act(() => favorites.toggle(track.id)),
    }),
  ];
  if (playlistId) {
    items.push(menuItem({
      iconName: 'delete',
      label: 'Aus dieser Playlist entfernen',
      danger: true,
      onClick: act(() => {
        playlists.removeTrack(playlistId, track.id);
        toast('Aus Playlist entfernt', { iconName: 'delete' });
        onChanged?.();
      }),
    }));
  }
  if (track.album) items.push(menuItem({ iconName: 'album', label: 'Zum Album', sub: track.album.title, onClick: () => navigateFromOverlay(`/album/${track.album.id}`) }));
  if (track.artists?.[0]) items.push(menuItem({ iconName: 'person', label: 'Zum Künstler', sub: track.artists[0].name, onClick: () => navigateFromOverlay(`/artist/${track.artists[0].id}`) }));
  sheet = openSheet({ head, content: h('div', { class: 'menu' }, items), className: 'sheet-menu' });
  return sheet;
}

// ---------- Playlists ----------
export async function createPlaylistFlow({ trackIds = [], open = false } = {}) {
  const values = await promptDialog({
    title: 'Neue Playlist',
    confirmLabel: 'Erstellen',
    fields: [
      { name: 'name', label: 'Name', required: true, maxlength: LIMITS.name, placeholder: 'z. B. Meine JUL Favoriten' },
      { name: 'description', label: 'Beschreibung (optional)', multiline: true, maxlength: LIMITS.description, placeholder: 'Worum geht es in dieser Playlist?' },
    ],
  });
  if (!values) return null;
  const pl = playlists.create({ ...values, trackIds });
  toast(`Playlist „${pl.name}“ erstellt`, { iconName: 'check' });
  if (open) navigate(`/playlist/${pl.id}`);
  return pl;
}

export async function editPlaylistFlow(id) {
  const pl = playlists.get(id);
  if (!pl) return;
  const values = await promptDialog({
    title: 'Playlist bearbeiten',
    fields: [
      { name: 'name', label: 'Name', required: true, maxlength: LIMITS.name, value: pl.name },
      { name: 'description', label: 'Beschreibung', multiline: true, maxlength: LIMITS.description, value: pl.description },
    ],
  });
  if (values) playlists.update(id, values);
  return !!values;
}

export async function deletePlaylistFlow(id) {
  const pl = playlists.get(id);
  if (!pl) return false;
  const ok = await confirmDialog({
    title: 'Playlist löschen?',
    message: `„${pl.name}“ wird endgültig gelöscht. Die Songs bleiben in der App erhalten.`,
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (ok) {
    playlists.remove(id);
    toast('Playlist gelöscht', { iconName: 'delete' });
  }
  return ok;
}

export function openAddToPlaylist(trackIds) {
  let sheet;
  const finish = (name, added) => {
    sheet.close();
    toast(added ? `Zu „${name}“ hinzugefügt` : `Bereits in „${name}“ enthalten`, { iconName: added ? 'check' : 'info' });
  };
  const items = playlists.list().map((p) => {
    const all = trackIds.every((t) => p.trackIds.includes(t));
    return menuItem({
      iconName: 'library',
      label: p.name,
      sub: all ? 'Bereits enthalten' : pluralize(p.trackIds.length, 'Song', 'Songs'),
      trailing: all ? icon('check', 20, 'text-red') : null,
      onClick: () => finish(p.name, playlists.addTracks(p.id, trackIds) > 0),
    });
  });
  const create = menuItem({
    iconName: 'plus',
    label: 'Neue Playlist',
    onClick: async () => {
      sheet.close();
      const pl = await createPlaylistFlow({ trackIds });
      if (pl) toast(`Zu „${pl.name}“ hinzugefügt`, { iconName: 'check' });
    },
  });
  sheet = openSheet({
    title: 'Zu Playlist hinzufügen',
    content: h('div', { class: 'menu' }, create, items.length ? items : h('p', { class: 'menu-hint' }, 'Du hast noch keine Playlists.')),
  });
}

export function openPlaylistMenu(pl, { onDeleted } = {}) {
  let sheet;
  const act = (fn) => () => {
    sheet.close();
    fn();
  };
  sheet = openSheet({
    title: pl.name,
    subtitle: pluralize(pl.trackIds.length, 'Song', 'Songs'),
    content: h('div', { class: 'menu' },
      menuItem({ iconName: 'plus', label: 'Songs hinzufügen', onClick: act(() => openSongPicker(pl.id)) }),
      menuItem({ iconName: 'edit', label: 'Name & Beschreibung ändern', onClick: act(() => editPlaylistFlow(pl.id)) }),
      menuItem({ iconName: 'delete', label: 'Playlist löschen', danger: true, onClick: act(async () => (await deletePlaylistFlow(pl.id)) && onDeleted?.()) })),
  });
}

/** Song-Auswahl zum Befüllen einer Playlist (mit Suche). */
export function openSongPicker(playlistId) {
  const list = h('div', { class: 'menu picker-list' });
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Songs suchen …', 'aria-label': 'Songs suchen', autocomplete: 'off' });
  const toggle = (track, btn) => {
    if (playlists.has(playlistId, track.id)) playlists.removeTrack(playlistId, track.id);
    else playlists.addTracks(playlistId, [track.id]);
    paintBtn(btn, track);
  };
  const paintBtn = (btn, track) => {
    const has = playlists.has(playlistId, track.id);
    btn.replaceChildren(icon(has ? 'check' : 'plus', 22));
    btn.classList.toggle('on', has);
    btn.setAttribute('aria-label', has ? `${track.title} entfernen` : `${track.title} hinzufügen`);
  };
  const render = async () => {
    const q = input.value.trim();
    const tracks = q ? (await catalog.search(q, { types: ['tracks'], limit: 60 })).tracks : await catalog.tracks({ sort: 'popularity', limit: 200 });
    list.replaceChildren(...(tracks.length ? tracks.map((track) => {
      const btn = h('button', { class: 'pick-btn', type: 'button' });
      btn.addEventListener('click', () => toggle(track, btn));
      paintBtn(btn, track);
      return h('div', { class: 'pick-row' },
        cover(track.cover), h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, track.title), h('span', { class: 'song-sub' }, track.artistName)), btn);
    }) : [h('p', { class: 'menu-hint' }, 'Keine Songs gefunden.')]));
  };
  input.addEventListener('input', debounce(render, 150));
  const sheet = openSheet({ title: 'Songs hinzufügen', className: 'sheet-tall', content: [h('div', { class: 'picker-search' }, input), list] });
  render();
  return sheet;
}

export { heartButton };
