import { formatLong, h } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { playArtist } from '../ui/actions.js';
import { albumCard, playlistCard, trackList } from '../ui/cards.js';
import { cover, emptyState, scroller, sectionHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function artistView(ctx) {
  const artist = await catalog.getArtist(ctx.params.id);
  if (!artist) return emptyState({ iconName: 'person', title: 'Künstler nicht gefunden', action: h('a', { class: 'btn btn-primary', href: '#/home' }, 'Zur Startseite') });

  const [tracks, albums, singles, pls] = await Promise.all([
    catalog.tracks({ artistId: artist.id, sort: 'popularity', limit: 500 }),
    catalog.albums({ artistId: artist.id, type: 'album', limit: 30 }),
    catalog.albums({ artistId: artist.id, type: 'single', limit: 30 }),
    catalog.playlists({ artistId: artist.id }),
  ]);
  const playlistCards = await Promise.all(pls.map(playlistCard));
  const total = tracks.reduce((s, t) => s + (t.fullDuration || t.duration), 0);

  const listHost = h('div');
  let expanded = false;
  const more = h('button', { class: 'btn btn-ghost btn-sm more-btn', type: 'button' });
  const paint = () => {
    const shown = expanded ? tracks : tracks.slice(0, 5);
    listHost.replaceChildren(trackList(shown, { context: artist.name, numbered: true }));
    more.textContent = expanded ? 'Weniger anzeigen' : `Alle ${tracks.length} Songs anzeigen`;
    more.hidden = tracks.length <= 5;
  };
  more.addEventListener('click', () => {
    expanded = !expanded;
    paint();
  });
  paint();

  return h('div', { class: 'view-artist' },
    h('div', { class: 'artist-hero' },
      cover(artist.image, { variant: 'large', cls: 'artist-img' }),
      h('div', { class: 'artist-shade' }),
      h('button', { class: 'back-btn', type: 'button', 'aria-label': 'Zurück', onclick: () => history.back() }, icon('chevron-left', 28)),
      h('div', { class: 'artist-head' },
        h('span', { class: 'eyebrow' }, artist.tagline),
        h('h1', null, artist.name),
        h('p', { class: 'artist-meta' }, `${tracks.length} Songs · ${formatLong(total)}`))),
    h('div', { class: 'action-bar' },
      h('button', { class: 'btn-fab', type: 'button', 'aria-label': `${artist.name} abspielen`, onclick: () => playArtist(artist.id) }, icon('play', 34)),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => playArtist(artist.id, { shuffle: true }) }, icon('shuffle', 20), ' Zufällig')),
    h('section', { class: 'section' },
      sectionHeader('Beliebte Songs'),
      listHost, more),
    albums.length > 0 && h('section', { class: 'section' }, sectionHeader('Alben'), scroller(albums.map(albumCard))),
    singles.length > 0 && h('section', { class: 'section' }, sectionHeader('Singles'), scroller(singles.map(albumCard))),
    playlistCards.length > 0 && h('section', { class: 'section' }, sectionHeader('Playlists'), scroller(playlistCards)),
    h('section', { class: 'section' },
      sectionHeader('Über'),
      h('div', { class: 'about-card' }, h('p', null, artist.description))));
}
