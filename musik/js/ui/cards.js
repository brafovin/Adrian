/** Karten und Songlisten für Entitäten des Katalogs (verbinden Komponenten mit Aktionen). */
import { formatTime, h } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { playAlbum, playArtist, playPlaylist, playTracks, openTrackMenu } from './actions.js';
import { card, cover, mosaic, songRow } from './components.js';
import { icon } from './icons.js';

export const albumCard = (album) =>
  card({
    href: `#/album/${album.id}`,
    coverEl: cover(album.cover, { variant: 'large', cls: 'cover-card' }),
    title: album.title,
    subtitle: `${album.year} · ${album.type === 'single' ? 'Single' : 'Album'}`,
    onPlay: () => playAlbum(album.id),
  });

export const trackCard = (track, tracks, index, context) =>
  card({
    onClick: () => playTracks(tracks, index, context),
    coverEl: cover(track.cover, { variant: 'large', cls: 'cover-card' }),
    title: track.title,
    subtitle: track.artistName,
    onPlay: () => playTracks(tracks, index, context),
  });

export const artistCard = (artist) =>
  card({
    href: `#/artist/${artist.id}`,
    coverEl: cover(artist.image, { variant: 'large', cls: 'cover-card cover-round' }),
    title: artist.name,
    subtitle: 'Künstler',
    round: true,
    onPlay: () => playArtist(artist.id),
  });

/** Karte für eigene und redaktionelle Playlists. */
export async function playlistCard(pl) {
  const tracks = await catalog.getTracks(pl.trackIds.slice(0, 8));
  const title = pl.name || pl.title;
  return card({
    href: `#/playlist/${pl.id}`,
    coverEl: mosaic(tracks, 'cover-card'),
    title,
    subtitle: pl.editorial ? `Playlist · ${pl.ownerName}` : `${pl.trackIds.length} ${pl.trackIds.length === 1 ? 'Song' : 'Songs'}`,
    onPlay: () => playPlaylist(pl),
  });
}

export function createPlaylistCard(onClick) {
  return card({
    onClick,
    coverEl: h('div', { class: 'cover cover-card cover-create' }, icon('plus', 40)),
    title: 'Neue Playlist',
    subtitle: 'Erstellen',
  });
}

/** Songliste; Tippen startet die Liste ab dem gewählten Song. */
export function trackList(tracks, { context = '', numbered = false, showDuration = false, playlistId, onChanged } = {}) {
  return h('div', { class: 'song-list', role: 'list' }, tracks.map((track, i) =>
    songRow(track, {
      number: numbered ? i + 1 : undefined,
      showDuration,
      formatTime,
      onPlay: () => playTracks(tracks, i, context),
      onMenu: (t) => openTrackMenu(t, { tracks, index: i, context, playlistId, onChanged }),
    })));
}
