import { formatLong, h } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { library } from '../services/library.js';
import { playAlbum, toggleAlbumSaved } from '../ui/actions.js';
import { trackList } from '../ui/cards.js';
import { cover, emptyState } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function albumView(ctx) {
  const [album, tracks] = await Promise.all([catalog.getAlbum(ctx.params.id), catalog.albumTracks(ctx.params.id)]);
  if (!album) return emptyState({ iconName: 'album', title: 'Album nicht gefunden', action: h('a', { class: 'btn btn-primary', href: '#/home' }, 'Zur Startseite') });
  const total = tracks.reduce((s, t) => s + (t.fullDuration || t.duration), 0);

  const saveBtn = h('button', { class: 'icon-btn icon-btn-lg', type: 'button' });
  const paintSave = () => {
    const saved = library.isAlbumSaved(album.id);
    saveBtn.replaceChildren(icon(saved ? 'bookmark-fill' : 'bookmark', 28));
    saveBtn.classList.toggle('on', saved);
    saveBtn.setAttribute('aria-label', saved ? 'Aus Bibliothek entfernen' : 'In Bibliothek speichern');
    saveBtn.setAttribute('aria-pressed', String(saved));
  };
  saveBtn.addEventListener('click', () => {
    toggleAlbumSaved(album);
    paintSave();
  });
  paintSave();

  return h('div', { class: 'view-album' },
    h('div', { class: 'album-top' },
      h('button', { class: 'back-btn back-btn-flat', type: 'button', 'aria-label': 'Zurück', onclick: () => history.back() }, icon('chevron-left', 28)),
      h('div', { class: 'album-cover' }, cover(album.cover, { variant: 'large', cls: 'cover-hero' })),
      h('div', { class: 'album-info' },
        h('h1', null, album.title),
        h('p', { class: 'album-by' },
          album.artists.map((a, i) => [i ? ', ' : '', h('a', { href: `#/artist/${a.id}` }, a.name)]), ),
        h('p', { class: 'album-meta' },
          `${album.type === 'single' ? 'Single' : 'Album'} · ${album.year} · ${tracks.length} ${tracks.length === 1 ? 'Song' : 'Songs'} · ${formatLong(total)}`),
        tracks[0]?.preview ? h('span', { class: 'badge-demo' }, '30-S-HÖRPROBEN') : album.demo && h('span', { class: 'badge-demo' }, 'DEMO'))),
    h('div', { class: 'action-bar' },
      h('button', { class: 'btn-fab', type: 'button', 'aria-label': `${album.title} abspielen`, onclick: () => playAlbum(album.id) }, icon('play', 34)),
      h('button', { class: 'icon-btn icon-btn-lg', type: 'button', 'aria-label': 'Zufällig abspielen', onclick: () => playAlbum(album.id, { shuffle: true }) }, icon('shuffle', 28)),
      saveBtn,
      album.externalUrl && h('a', { class: 'btn btn-ghost btn-sm', href: album.externalUrl, target: '_blank', rel: 'noopener' }, 'Apple Music')),
    h('section', { class: 'section' }, trackList(tracks, { context: album.title, numbered: true, showDuration: true })));
}
