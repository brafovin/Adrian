/**
 * Katalog-Anbieter auf Basis der öffentlichen iTunes Search API von Apple.
 *
 * Liefert für Songs offizielle 30-Sekunden-Hörproben (previewUrl) und Cover.
 * Es werden keine Audiodateien gespeichert oder weiterverteilt: Die App lädt Metadaten und
 * Hörproben zur Laufzeit direkt von Apple. Die Rechte liegen bei den Rechteinhabern; vollständige
 * Songs sind nur über Apple Music verfügbar (Link im Song-Menü).
 *
 * Die API ist ratenbegrenzt (ca. 20 Anfragen/Minute je IP) – darum wird ein Schnappschuss der
 * Katalogdaten lokal zwischengespeichert und Albumtracks werden erst bei Bedarf nachgeladen.
 */
import { storage } from '../core/storage.js';
import { normalize } from '../core/util.js';
import { MapCatalogProvider } from './provider.js';

const API = 'https://itunes.apple.com';
const SNAPSHOT_KEY = 'catalog:itunes:v1';
const SNAPSHOT_TTL = 24 * 3600 * 1000;
const PREVIEW_SECONDS = 30;

const artwork = (url, size) => (url ? url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, `/${size}x${size}bb.$2`) : null);
const day = (iso) => String(iso || '').slice(0, 10) || '1970-01-01';

async function api(path, params) {
  const url = `${API}/${path}?${new URLSearchParams({ country: 'de', ...params })}`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()).results || [];
      lastErr = new Error(`iTunes API ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  throw lastErr;
}

export class ItunesCatalogProvider extends MapCatalogProvider {
  info = {
    label: 'iTunes-Hörproben',
    notice: 'Hörproben (30 s) und Cover stammen von Apple (iTunes Search API) und gehören den Rechteinhabern. Vollständige Songs gibt es bei Apple Music.',
    previews: true,
  };

  /** @param {{ artists: { id: string, itunesId: number, name: string, tagline: string, description: string }[] }} config */
  constructor(config) {
    super();
    this.config = config;
    this.lastLive = 0;
    this.liveCache = new Map();
    this.albumLoaded = new Set();
    this.albumMissing = new Set();
  }

  async init() {
    const snap = storage.get(SNAPSHOT_KEY);
    const fresh = snap && Date.now() - snap.at < SNAPSHOT_TTL && snap.signature === this.#signature();
    if (fresh) return this.#apply(snap.data);
    try {
      const data = await this.#fetchAll();
      storage.set(SNAPSHOT_KEY, { at: Date.now(), signature: this.#signature(), data });
      this.#apply(data);
    } catch (err) {
      if (!snap || snap.signature !== this.#signature()) throw err;
      console.warn('[itunes] nutze älteren Schnappschuss', err);
      this.#apply(snap.data);
    }
  }

  #signature() {
    return this.config.artists.map((a) => a.itunesId).join(',');
  }

  async #fetchAll() {
    const parts = await Promise.all(this.config.artists.map(async (a) => {
      const [songs, albums] = await Promise.all([
        api('lookup', { id: a.itunesId, entity: 'song', limit: 200 }),
        api('lookup', { id: a.itunesId, entity: 'album', limit: 200 }),
      ]);
      return { cfg: a, songs: songs.filter((r) => r.wrapperType === 'track'), albums: albums.filter((r) => r.wrapperType === 'collection') };
    }));
    const tracks = [];
    const albums = [];
    const seen = new Set();
    for (const { cfg, songs, albums: al } of parts) {
      songs.filter((r) => r.previewUrl && r.artistId === cfg.itunesId).forEach((r, i) => {
        if (seen.has(r.trackId)) return;
        seen.add(r.trackId);
        tracks.push(this.#mapTrack(r, cfg.id, 100 - i * 0.4));
      });
      al.forEach((r) => albums.push(this.#mapAlbum(r, cfg.id)));
    }
    if (!tracks.length) throw new Error('Keine Titel von der iTunes-API erhalten');
    return { tracks, albums };
  }

  #mapTrack(r, artistId, popularity) {
    return {
      id: `it-${r.trackId}`,
      title: r.trackName,
      artistIds: [artistId],
      albumId: `it-c${r.collectionId}`,
      albumTitle: String(r.collectionName || '').replace(/ - (Single|EP)$/, ''),
      trackNumber: r.trackNumber || 1,
      discNumber: r.discNumber || 1,
      duration: PREVIEW_SECONDS,
      fullDuration: Math.round((r.trackTimeMillis || 0) / 1000) || PREVIEW_SECONDS,
      sources: { low: r.previewUrl, high: r.previewUrl },
      cover: { small: artwork(r.artworkUrl100, 200), large: artwork(r.artworkUrl100, 600) },
      addedAt: day(r.releaseDate),
      popularity: Math.max(1, popularity),
      preview: true,
      explicit: r.trackExplicitness === 'explicit',
      externalUrl: r.trackViewUrl,
    };
  }

  #mapAlbum(r, artistId) {
    const name = r.collectionName || '';
    const single = / - Single$/.test(name);
    return {
      id: `it-c${r.collectionId}`,
      title: name.replace(/ - (Single|EP)$/, ''),
      type: single ? 'single' : 'album',
      artistIds: [artistId],
      year: Number(String(r.releaseDate).slice(0, 4)) || '',
      cover: { small: artwork(r.artworkUrl100, 200), large: artwork(r.artworkUrl100, 600) },
      trackCount: r.trackCount,
      trackIds: [],
      addedAt: day(r.releaseDate),
      externalUrl: r.collectionViewUrl,
    };
  }

  #apply({ tracks, albums }) {
    const byAlbum = new Map();
    for (const t of tracks) (byAlbum.get(t.albumId) || byAlbum.set(t.albumId, []).get(t.albumId)).push(t);
    const artists = this.config.artists.map((a) => {
      const own = tracks.filter((t) => t.artistIds[0] === a.id);
      const top = own.slice().sort((x, y) => y.popularity - x.popularity)[0];
      return {
        id: a.id,
        name: a.name,
        tagline: a.tagline,
        description: a.description,
        genres: ['Rap'],
        image: top ? { small: top.cover.small, large: artwork(top.cover.large, 1000) } : null,
        externalUrl: a.url,
      };
    });
    const playlists = this.config.artists.flatMap((a) => {
      const own = tracks.filter((t) => t.artistIds[0] === a.id);
      const top = own.slice().sort((x, y) => y.popularity - x.popularity).slice(0, 15).map((t) => t.id);
      const recent = own.slice().sort((x, y) => y.addedAt.localeCompare(x.addedAt)).slice(0, 12).map((t) => t.id);
      return [
        { id: `pl-${a.id}-top`, title: `${a.name} Essentials`, description: `Die beliebtesten Hörproben von ${a.name}.`, ownerName: 'ROUGE', artistIds: [a.id], trackIds: top },
        { id: `pl-${a.id}-new`, title: `${a.name} Neu`, description: `Die neuesten Veröffentlichungen von ${a.name}.`, ownerName: 'ROUGE', artistIds: [a.id], trackIds: recent },
      ];
    });
    for (const al of albums) al.trackIds = (byAlbum.get(al.id) || []).map((t) => t.id);
    this.setData({ artists, albums, tracks, playlists });
  }

  /** Lädt fehlende Titel eines Albums nach (die Künstler-Abfrage ist auf 200 Songs begrenzt). */
  async loadAlbumTracks(albumId) {
    if (this.albumLoaded.has(albumId) || !albumId.startsWith('it-c')) return;
    this.albumLoaded.add(albumId);
    const album = this.albums.get(albumId);
    const have = [...this.tracks.values()].filter((t) => t.albumId === albumId).length;
    if (album && have >= (album.trackCount || 0)) return;
    try {
      const rows = await api('lookup', { id: albumId.slice(4), entity: 'song' });
      this.#addSongs(rows);
    } catch (err) {
      this.albumLoaded.delete(albumId);
      console.warn('[itunes] Album konnte nicht nachgeladen werden', err);
    }
  }

  /** Nimmt Songs der konfigurierten Künstler in den Speicher auf. */
  #addSongs(rows, popularity = 40) {
    let added = 0;
    for (const r of rows) {
      if (r.wrapperType !== 'track' || !r.previewUrl) continue;
      const cfg = this.config.artists.find((a) => a.itunesId === r.artistId);
      if (!cfg || this.tracks.has(`it-${r.trackId}`)) continue;
      this.tracks.set(`it-${r.trackId}`, this.#mapTrack(r, cfg.id, popularity));
      added++;
    }
    return added;
  }

  async getTracks(ids) {
    const missing = ids.filter((id) => id.startsWith('it-') && !id.startsWith('it-c') && !this.tracks.has(id));
    if (missing.length) {
      try {
        for (let i = 0; i < missing.length; i += 50) {
          this.#addSongs(await api('lookup', { id: missing.slice(i, i + 50).map((x) => x.slice(3)).join(','), entity: 'song' }));
        }
      } catch (err) {
        console.warn('[itunes] Titel konnten nicht nachgeladen werden', err);
      }
    }
    return super.getTracks(ids);
  }

  /** Fehlende Alben werden nur auf ausdrückliche Anfrage (Albumseite) nachgeladen – spart API-Aufrufe. */
  async getAlbums(ids, { remote = false } = {}) {
    const missing = remote ? ids.filter((id) => id.startsWith('it-c') && !this.albums.has(id) && !this.albumMissing.has(id)) : [];
    if (missing.length) {
      missing.forEach((id) => this.albumMissing.add(id));
      try {
        for (const r of await api('lookup', { id: missing.map((x) => x.slice(4)).join(','), entity: 'album' })) {
          const cfg = this.config.artists.find((a) => a.itunesId === r.artistId);
          if (r.wrapperType === 'collection' && cfg) this.albums.set(`it-c${r.collectionId}`, this.#mapAlbum(r, cfg.id));
        }
      } catch (err) {
        console.warn('[itunes] Alben konnten nicht nachgeladen werden', err);
      }
    }
    return super.getAlbums(ids);
  }

  /** Lokale Suche; findet sie wenig Songs, wird zusätzlich live bei Apple nach weiteren Titeln gesucht. */
  async search(query, opts = {}) {
    let result = await super.search(query, opts);
    const q = normalize(query);
    const wantsTracks = !opts.types || opts.types.includes('tracks');
    if (wantsTracks && q.length >= 3 && result.tracks.length < 4 && Date.now() - this.lastLive > 2500) {
      this.lastLive = Date.now();
      try {
        if (!this.liveCache.has(q)) {
          for (const cfg of this.config.artists) {
            this.#addSongs(await api('search', { term: `${cfg.name} ${query}`, entity: 'song', limit: 40, attribute: 'songTerm' }));
          }
          this.liveCache.set(q, true);
        }
        result = await super.search(query, opts);
      } catch (err) {
        console.warn('[itunes] Live-Suche fehlgeschlagen', err);
      }
    }
    return result;
  }
}
