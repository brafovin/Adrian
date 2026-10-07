import { h, pluralize } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { favorites } from '../services/favorites.js';
import { player } from '../services/player.js';
import { trackList } from '../ui/cards.js';
import { emptyState, pageHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function favoritesView(ctx) {
  ctx.on('favorites:change', () => ctx.refresh());
  const tracks = await catalog.getTracks(favorites.list());

  const header = pageHeader('Favoriten', { sub: tracks.length ? pluralize(tracks.length, 'Song', 'Songs') : undefined });
  if (!tracks.length) {
    return h('div', { class: 'view-favorites' }, header, emptyState({
      iconName: 'heart',
      title: 'Noch keine Favoriten',
      text: 'Tippe auf das Herz bei einem Song, um ihn hier zu speichern.',
      action: h('a', { class: 'btn btn-primary', href: '#/search?browse=songs' }, 'Songs entdecken'),
    }));
  }
  return h('div', { class: 'view-favorites' },
    header,
    h('div', { class: 'action-bar' },
      h('button', { class: 'btn-fab', type: 'button', 'aria-label': 'Favoriten abspielen', onclick: () => player.playTracks(tracks, 0, { context: 'Favoriten' }) }, icon('play', 34)),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => player.playTracks(tracks, 0, { context: 'Favoriten', shuffle: true }) }, icon('shuffle', 20), ' Zufällig')),
    h('section', { class: 'section' }, trackList(tracks, { context: 'Favoriten' })));
}
