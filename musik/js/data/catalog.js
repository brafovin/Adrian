/**
 * Katalog-Fassade: reichert Rohdaten des Anbieters an (Künstlername, Album, Cover),
 * cached Ergebnisse und bietet der UI eine einheitliche, anbieterunabhängige API.
 */
import { StaticCatalogProvider } from './provider.js';

const cache = { artist: new Map(), album: new Map(), track: new Map(), playlist: new Map() };
let provider = null;

async function ensure(kind, ids, fetcher) {
  const missing = [...new Set(ids)].filter((id) => !cache[kind].has(id));
  if (missing.length) for (const item of await fetcher(missing)) cache[kind].set(item.id, item);
}

async function hydrateTracks(raw) {
  await ensure('artist', raw.flatMap((t) => t.artistIds), (ids) => provider.getArtists(ids));
  await ensure('album', raw.map((t) => t.albumId), (ids) => provider.getAlbums(ids));
  return raw.map((t) => {
    const album = cache.album.get(t.albumId);
    const artists = t.artistIds.map((id) => cache.artist.get(id)).filter(Boolean).map((a) => ({ id: a.id, name: a.name }));
    return {
      ...t,
      artists,
      artistName: artists.map((a) => a.name).join(', '),
      album: album ? { id: album.id, title: album.title, year: album.year, type: album.type } : t.albumTitle ? { id: t.albumId, title: t.albumTitle } : null,
      cover: t.cover || album?.cover || null,
    };
  });
}

async function hydrateAlbums(raw) {
  await ensure('artist', raw.flatMap((a) => a.artistIds), (ids) => provider.getArtists(ids));
  return raw.map((a) => {
    const artists = a.artistIds.map((id) => cache.artist.get(id)).filter(Boolean).map((x) => ({ id: x.id, name: x.name }));
    return { ...a, artists, artistName: artists.map((x) => x.name).join(', ') };
  });
}

async function hydratePlaylists(raw) {
  return raw.map((p) => ({ ...p, editorial: true, kind: 'editorial' }));
}

async function tracksFrom(raw) {
  const hydrated = await hydrateTracks(raw);
  hydrated.forEach((t) => cache.track.set(t.id, t));
  return hydrated;
}

export const catalog = {
  async init(p = new StaticCatalogProvider('data/catalog.json')) {
    provider = p;
    await provider.init();
  },

  /** Quelle des Katalogs (Label, Hinweistext, Hörproben ja/nein). */
  get info() {
    return provider?.info || { label: '', notice: '', previews: false };
  },

  async artists() {
    const list = await provider.listArtists();
    list.forEach((a) => cache.artist.set(a.id, a));
    return list;
  },

  async getArtist(id) {
    await ensure('artist', [id], (ids) => provider.getArtists(ids));
    return cache.artist.get(id) || null;
  },
  async getTracks(ids) {
    await ensure('track', ids, async (missing) => hydrateTracks(await provider.getTracks(missing)));
    return ids.map((id) => cache.track.get(id)).filter(Boolean);
  },
  async getTrack(id) {
    return (await this.getTracks([id]))[0] || null;
  },
  async getAlbum(id) {
    await ensure('album', [id], async (ids) => hydrateAlbums(await provider.getAlbums(ids, { remote: true })));
    const raw = cache.album.get(id);
    if (!raw) return null;
    if (!raw.artistName) cache.album.set(id, (await hydrateAlbums([raw]))[0]);
    return cache.album.get(id);
  },
  async getAlbums(ids) {
    const out = [];
    for (const id of ids) {
      const a = await this.getAlbum(id);
      if (a) out.push(a);
    }
    return out;
  },
  async getPlaylist(id) {
    await ensure('playlist', [id], async (ids) => hydratePlaylists(await provider.getPlaylists(ids)));
    return cache.playlist.get(id) || null;
  },

  async tracks(opts) {
    return tracksFrom(await provider.listTracks(opts));
  },
  async albums(opts) {
    const list = await hydrateAlbums(await provider.listAlbums(opts));
    list.forEach((a) => cache.album.set(a.id, a));
    return list;
  },
  async playlists(opts) {
    const list = await hydratePlaylists(await provider.listPlaylists(opts));
    list.forEach((p) => cache.playlist.set(p.id, p));
    return list;
  },
  async albumTracks(albumId) {
    return this.tracks({ albumId, sort: 'album', limit: 500 });
  },
  async recommend(seedId, opts) {
    return tracksFrom(await provider.recommend(seedId, opts));
  },
  async search(query, opts) {
    const r = await provider.search(query, opts);
    return {
      artists: r.artists,
      albums: await hydrateAlbums(r.albums),
      tracks: await tracksFrom(r.tracks),
      playlists: await hydratePlaylists(r.playlists),
    };
  },
};
