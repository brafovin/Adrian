import { navigate, replaceUrl } from '../core/nav.js';
import { debounce, h, normalize, pluralize, setChildren } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { library } from '../services/library.js';
import { playlists } from '../services/playlists.js';
import { trackList } from '../ui/cards.js';
import { cover, emptyState, mosaic, pageHeader, sectionHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const FILTERS = [
  ['all', 'Alle'],
  ['tracks', 'Songs'],
  ['albums', 'Alben'],
  ['artists', 'Künstler'],
  ['playlists', 'Playlists'],
];

const BROWSE = [
  { id: 'artists', title: 'Künstler', icon: 'person' },
  { id: 'songs', title: 'Alle Songs', icon: 'note' },
  { id: 'new', title: 'Neuheiten', icon: 'clock' },
  { id: 'albums', title: 'Alben & Singles', icon: 'album' },
  { id: 'playlists', title: 'Playlists', icon: 'library' },
  { id: 'popular', title: 'Beliebt', icon: 'heart-fill' },
];

function listRow({ href, coverEl, title, sub }) {
  return h('a', { class: 'list-row', href },
    coverEl,
    h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, title), h('span', { class: 'song-sub' }, sub)),
    icon('chevron-right', 22, 'chev'));
}

const albumRow = (a) => listRow({ href: `#/album/${a.id}`, coverEl: cover(a.cover), title: a.title, sub: `${a.type === 'single' ? 'Single' : 'Album'} · ${a.artistName} · ${a.year}` });
const artistRow = (a) => listRow({ href: `#/artist/${a.id}`, coverEl: cover(a.image, { cls: 'cover-round' }), title: a.name, sub: 'Künstler' });

async function playlistRows(list) {
  return Promise.all(list.map(async (p) => {
    const tracks = await catalog.getTracks(p.trackIds.slice(0, 4));
    return listRow({
      href: `#/playlist/${p.id}`,
      coverEl: mosaic(tracks),
      title: p.name || p.title,
      sub: p.editorial ? `Playlist · ${p.ownerName}` : `Deine Playlist · ${pluralize(p.trackIds.length, 'Song', 'Songs')}`,
    });
  }));
}

function matchUserPlaylists(q) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  return playlists.list().filter((p) => {
    const text = normalize(`${p.name} ${p.description}`);
    return terms.every((t) => text.includes(t));
  });
}

export async function searchView(ctx) {
  let q = ctx.query.q || '';
  let filter = FILTERS.some(([id]) => id === ctx.query.f) ? ctx.query.f : 'all';
  const browse = ctx.query.browse;
  let runToken = 0;

  const input = h('input', { class: 'search-input', type: 'search', placeholder: 'Songs, Alben, Künstler, Playlists', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Suche', value: q });
  const clearBtn = h('button', { class: 'icon-btn search-clear', type: 'button', 'aria-label': 'Eingabe löschen', hidden: !q, onclick: () => { input.value = ''; onInput(); input.focus(); } }, icon('close', 22));
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const results = h('div', { class: 'search-results', 'aria-live': 'polite' });

  const paintChips = () => chips.replaceChildren(...FILTERS.map(([id, label]) =>
    h('button', { class: `chip${filter === id ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(filter === id), onclick: () => { filter = id; paintChips(); run(); } }, label)));

  const syncUrl = () => replaceUrl(`/search${q ? `?q=${encodeURIComponent(q)}${filter !== 'all' ? `&f=${filter}` : ''}` : ''}`);

  async function showHome() {
    const recents = library.recentSearches();
    chips.hidden = true;
    setChildren(results,
      recents.length > 0 && h('section', { class: 'section' },
        sectionHeader('Zuletzt gesucht', { actions: h('button', { class: 'link-more', type: 'button', onclick: () => { library.clearSearches(); showHome(); } }, 'Löschen') }),
        h('div', { class: 'chips wrap' }, recents.map((r) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = r; onInput(); } }, icon('clock', 16), r)))),
      h('section', { class: 'section' },
        sectionHeader('Entdecken'),
        h('div', { class: 'browse-grid' }, BROWSE.map((b, i) =>
          h('a', { class: `browse-tile b${i % 3}`, href: b.href || `#/search?browse=${b.id}` },
            h('span', { class: 'browse-title' }, b.title), icon(b.icon, 44, 'browse-ic'))))));
  }

  async function showBrowse() {
    chips.hidden = true;
    const titles = Object.fromEntries(BROWSE.map((b) => [b.id, b.title]));
    let content;
    if (browse === 'artists') content = (await catalog.artists()).map(artistRow);
    else if (browse === 'albums') content = (await catalog.albums({ limit: 100 })).map(albumRow);
    else if (browse === 'playlists') content = await playlistRows([...playlists.list(), ...(await catalog.playlists({}))]);
    else {
      const sort = browse === 'new' ? 'newest' : 'popularity';
      const tracks = await catalog.tracks({ sort, limit: 200 });
      content = trackList(tracks, { context: titles[browse] || 'Songs' });
    }
    results.replaceChildren(h('section', { class: 'section' }, sectionHeader(titles[browse] || 'Entdecken'), h('div', { class: 'list' }, content)));
  }

  async function run() {
    const my = ++runToken;
    syncUrl();
    if (!q.trim()) return browse ? showBrowse() : showHome();
    chips.hidden = false;
    const types = filter === 'all' ? undefined : [filter];
    const data = await catalog.search(q, { types, limit: 60 });
    if (my !== runToken) return;
    const mine = filter === 'all' || filter === 'playlists' ? matchUserPlaylists(q) : [];
    const pls = [...mine.map((p) => ({ ...p, kind: 'user' })), ...data.playlists];
    const plRows = await playlistRows(pls);
    if (my !== runToken) return;

    const show = (type) => filter === 'all' || filter === type;
    const sections = [];
    if (show('artists') && data.artists.length) {
      sections.push(h('section', { class: 'section' }, filter === 'all' && sectionHeader('Künstler'), h('div', { class: 'list' }, data.artists.map(artistRow))));
    }
    if (show('tracks') && data.tracks.length) {
      const shown = filter === 'all' ? data.tracks.slice(0, 6) : data.tracks;
      sections.push(h('section', { class: 'section' },
        filter === 'all' && sectionHeader('Songs'),
        trackList(shown, { context: `Suche: ${q}` }),
        filter === 'all' && data.tracks.length > 6 && h('button', { class: 'btn btn-ghost btn-sm more-btn', type: 'button', onclick: () => { filter = 'tracks'; paintChips(); run(); } }, `Alle ${data.tracks.length} Songs anzeigen`)));
    }
    if (show('albums') && data.albums.length) {
      sections.push(h('section', { class: 'section' }, filter === 'all' && sectionHeader('Alben'), h('div', { class: 'list' }, data.albums.map(albumRow))));
    }
    if (show('playlists') && plRows.length) {
      sections.push(h('section', { class: 'section' }, filter === 'all' && sectionHeader('Playlists'), h('div', { class: 'list' }, plRows)));
    }
    results.replaceChildren(...(sections.length ? sections : [emptyState({ iconName: 'search', title: `Keine Treffer für „${q}“`, text: 'Prüfe die Schreibweise oder suche nach einem Künstler, z. B. „JUL“ oder „Bobby Vandamme“.' })]));
  }

  const debounced = debounce(() => { run(); }, 160);
  function onInput() {
    q = input.value;
    clearBtn.hidden = !q;
    if (!q.trim()) { filter = 'all'; paintChips(); }
    debounced();
  }
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
      library.addSearch(q);
    }
  });
  // Suchbegriff merken, wenn der Nutzer ein Ergebnis antippt
  results.addEventListener('click', (e) => {
    if (q.trim() && e.target.closest('a, button')) library.addSearch(q);
  });
  ctx.onCleanup(() => debounced.cancel());

  paintChips();
  await run();

  return h('div', { class: 'view-search' },
    h('div', { class: 'search-top' },
      pageHeader(browse ? 'Entdecken' : 'Suche', { back: !!browse }),
      h('div', { class: 'search-field' }, icon('search', 22, 'search-ic'), input, clearBtn),
      chips),
    results);
}
