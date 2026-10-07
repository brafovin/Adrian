/**
 * Katalog-Anbieter auf Basis der öffentlichen iTunes Search API von Apple.
 *
 * Liefert für Songs offizielle 30-Sekunden-Hörproben (previewUrl) und Cover. Es werden keine
 * Audiodateien gespeichert oder weiterverteilt: Metadaten und Hörproben kommen zur Laufzeit direkt
 * von Apple. Die Rechte liegen bei den Rechteinhabern; vollständige Songs gibt es nur über Apple Music
 * (Link im Song-Menü).
 *
 * Skalierung auf viele Künstler: Ein statischer Index (data/artists.json, erzeugt mit
 * tools/resolve_artists.py) enthält Name, Apple-ID und Bild aller Künstler. Songs und Alben eines
 * Künstlers werden erst geladen, wenn er geöffnet/gesucht/abgespielt wird, und danach lokal
 * zwischengespeichert. Die API ist ratenbegrenzt (~20 Anfragen/Minute je IP), daher laufen alle
 * Anfragen gedrosselt über eine gemeinsame Warteschlange.
 */
import { storage } from '../core/storage.js';
import { normalize } from '../core/util.js';
import { MapCatalogProvider } from './provider.js';

const API = 'https://itunes.apple.com';
const TTL = 24 * 3600 * 1000;
const PREVIEW_SECONDS = 30;
const MIN_GAP_MS = 450;

const artwork = (url, size) => (url ? url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, `/${size}x${size}bb.$2`) : null);
const day = (iso) => String(iso || '').slice(0, 10) || '1970-01-01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- gedrosselte Anfrage-Warteschlange ----
let queue = Promise.resolve();
let lastStart = 0;

function api(path, params) {
  const job = queue.then(async () => {
    const url = `${API}/${path}?${new URLSearchParams({ country: 'de', ...params })}`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = MIN_GAP_MS - (Date.now() - lastStart);
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      try {
        const res = await fetch(url);
        if (res.ok) return (await res.json()).results || [];
        lastErr = new Error(`iTunes API ${res.status}`);
        if (res.status === 403 || res.status === 429) await sleep(4000 * (attempt + 1)); // Ratenlimit
      } catch (err) {
        lastErr = err;
        await sleep(800);
      }
    }
    throw lastErr;
  });
  queue = job.catch(() => {});
  return job;
}

export class ItunesCatalogProvider extends MapCatalogProvider {
  info = {
    label: 'iTunes-Hörproben',
    notice: 'Hörproben (30 s) und Cover stammen von Apple (iTunes Search API) und gehören den Rechteinhabern. Vollständige Songs gibt es bei Apple Music.',
    previews: true,
  };

  /**
   * @param {{ indexUrl: string, overrides?: Record<string, object>, preload?: string[], defaults?: object }} config
   */
  constructor(config) {
    super();
    this.config = config;
    this.ready = new Map(); // artistId -> Promise
    this.liveCache = new Set();
    this.albumLoaded = new Set();
    this.albumMissing = new Set();
    this.byItunes = new Map();
  }

  async init() {
    const res = await fetch(this.config.indexUrl);
    if (!res.ok) throw new Error(`Künstlerindex nicht ladbar (${res.status})`);
    const index = await res.json();
    const artists = index.map((a) => ({
      id: a.id,
      itunesId: a.itunesId,
      name: a.name,
      tagline: 'Rap',
      description: '',
      genres: [a.genre || 'Hip-Hop/Rap'],
      image: a.image,
      ...this.config.defaults,
      ...this.config.overrides?.[a.id],
    }));
    this.setData({ artists });
    artists.forEach((a) => this.byItunes.set(a.itunesId, a));
    // Hauptkünstler vorladen (Startseite); scheitert alles, löst der Aufrufer den Demo-Fallback aus.
    const results = await Promise.allSettled((this.config.preload || []).map((id) => this.ensureArtist(id)));
    if (results.length && results.every((r) => r.status === 'rejected')) throw results[0].reason;
  }

  // ---------- Laden pro Künstler ----------
  ensureArtist(id) {
    if (!this.ready.has(id)) {
      this.ready.set(id, this.#loadArtist(id).catch((err) => {
        this.ready.delete(id);
        throw err;
      }));
    }
    return this.ready.get(id);
  }

  async #loadArtist(id) {
    const artist = this.artists.get(id);
    if (!artist) return;
    const key = `catalog:itunes:a:${artist.itunesId}`;
    const snap = storage.get(key);
    if (snap && Date.now() - snap.at < TTL) return this.#apply(artist, snap.data);
    try {
      const songs = await api('lookup', { id: artist.itunesId, entity: 'song', limit: 200 });
      const albums = await api('lookup', { id: artist.itunesId, entity: 'album', limit: 200 });
      const data = {
        tracks: songs.filter((r) => r.wrapperType === 'track' && r.previewUrl && r.artistId === artist.itunesId)
          .map((r, i) => this.#mapTrack(r, artist.id, 100 - i * 0.4)),
        albums: albums.filter((r) => r.wrapperType === 'collection').map((r) => this.#mapAlbum(r, artist.id)),
      };
      storage.set(key, { at: Date.now(), data });
      this.#apply(artist, data);
    } catch (err) {
      if (!snap) throw err;
      console.warn('[itunes] nutze älteren Schnappschuss für', artist.name, err);
      this.#apply(artist, snap.data);
    }
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
    return {
      id: `it-c${r.collectionId}`,
      title: name.replace(/ - (Single|EP)$/, ''),
      type: / - Single$/.test(name) ? 'single' : 'album',
      artistIds: [artistId],
      year: Number(String(r.releaseDate).slice(0, 4)) || '',
      cover: { small: artwork(r.artworkUrl100, 200), large: artwork(r.artworkUrl100, 600) },
      trackCount: r.trackCount,
      trackIds: [],
      addedAt: day(r.releaseDate),
      externalUrl: r.collectionViewUrl,
    };
  }

  #apply(artist, { tracks, albums }) {
    for (const t of tracks) this.tracks.set(t.id, t);
    for (const a of albums) this.albums.set(a.id, a);
    const sorted = [...tracks].sort((x, y) => y.popularity - x.popularity);
    const newest = [...tracks].sort((x, y) => y.addedAt.localeCompare(x.addedAt));
    const pl = (suffix, title, description, list) => ({ id: `pl-${artist.id}-${suffix}`, title, description, ownerName: 'ROUGE', artistIds: [artist.id], trackIds: list.map((t) => t.id) });
    if (tracks.length) {
      this.playlists.set(`pl-${artist.id}-top`, pl('top', `${artist.name} Essentials`, `Die beliebtesten Hörproben von ${artist.name}.`, sorted.slice(0, 15)));
      this.playlists.set(`pl-${artist.id}-new`, pl('new', `${artist.name} Neu`, `Die neuesten Veröffentlichungen von ${artist.name}.`, newest.slice(0, 12)));
    }
  }

  /** Lädt fehlende Titel eines Albums nach (die Künstler-Abfrage ist auf 200 Songs begrenzt). */
  async loadAlbumTracks(albumId) {
    if (this.albumLoaded.has(albumId) || !albumId.startsWith('it-c')) return;
    this.albumLoaded.add(albumId);
    const album = this.albums.get(albumId);
    const have = [...this.tracks.values()].filter((t) => t.albumId === albumId).length;
    if (album && have >= (album.trackCount || 0)) return;
    try {
      this.#addSongs(await api('lookup', { id: albumId.slice(4), entity: 'song' }));
    } catch (err) {
      this.albumLoaded.delete(albumId);
      console.warn('[itunes] Album konnte nicht nachgeladen werden', err);
    }
  }

  /** Nimmt Songs bekannter Künstler (aus dem Index) in den Speicher auf. */
  #addSongs(rows, popularity = 40) {
    for (const r of rows) {
      if (r.wrapperType !== 'track' || !r.previewUrl) continue;
      const artist = this.byItunes.get(r.artistId);
      if (!artist || this.tracks.has(`it-${r.trackId}`)) continue;
      this.tracks.set(`it-${r.trackId}`, this.#mapTrack(r, artist.id, popularity));
    }
  }

  // ---------- Abfragen (laden bei Bedarf) ----------
  async listTracks(opts = {}) {
    if (opts.artistId) await this.ensureArtist(opts.artistId);
    return super.listTracks(opts);
  }

  async listAlbums(opts = {}) {
    if (opts.artistId) await this.ensureArtist(opts.artistId);
    return super.listAlbums(opts);
  }

  async listPlaylists(opts = {}) {
    if (opts.artistId) await this.ensureArtist(opts.artistId);
    return super.listPlaylists(opts);
  }

  async getTracks(ids) {
    const missing = ids.filter((id) => id.startsWith('it-') && !id.startsWith('it-c') && !this.tracks.has(id));
    for (let i = 0; i < missing.length; i += 50) {
      try {
        this.#addSongs(await api('lookup', { id: missing.slice(i, i + 50).map((x) => x.slice(3)).join(','), entity: 'song' }));
      } catch (err) {
        console.warn('[itunes] Titel konnten nicht nachgeladen werden', err);
        break;
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
          const artist = this.byItunes.get(r.artistId);
          if (r.wrapperType === 'collection' && artist) this.albums.set(`it-c${r.collectionId}`, this.#mapAlbum(r, artist.id));
        }
      } catch (err) {
        console.warn('[itunes] Alben konnten nicht nachgeladen werden', err);
      }
    }
    return super.getAlbums(ids);
  }

  /**
   * Suche: Treffer-Künstler werden vollständig geladen (Songs/Alben/Playlists erscheinen dann mit),
   * zusätzlich findet eine Live-Suche bei Apple einzelne Titel aller bekannten Künstler.
   */
  async search(query, opts = {}) {
    const q = normalize(query);
    const wantsTracks = !opts.types || opts.types.includes('tracks');
    if (q.length >= 2) {
      const hits = [...this.artists.values()].filter((a) => normalize(a.name).includes(q)).slice(0, 3);
      await Promise.allSettled(hits.map((a) => this.ensureArtist(a.id)));
    }
    let result = await super.search(query, opts);
    if (wantsTracks && q.length >= 3 && result.tracks.length < 6 && !this.liveCache.has(q)) {
      this.liveCache.add(q);
      try {
        this.#addSongs(await api('search', { term: query, entity: 'song', limit: 50 }));
        result = await super.search(query, opts);
      } catch (err) {
        this.liveCache.delete(q);
        console.warn('[itunes] Live-Suche fehlgeschlagen', err);
      }
    }
    return result;
  }
}
