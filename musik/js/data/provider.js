/**
 * Katalog-Anbieter.
 *
 * Die App spricht ausschließlich mit der Schnittstelle des CatalogProvider (siehe catalog.js).
 * Aktuell liefert StaticCatalogProvider die Demo-Inhalte aus data/catalog.json.
 * Für echte, lizenzierte Musik und viele Künstler/Millionen Songs wird später ein
 * RemoteCatalogProvider mit denselben Methoden implementiert (REST/GraphQL, Paginierung via
 * limit/offset); UI, Player und Services müssen dafür nicht geändert werden.
 *
 * Erwartete Methoden (alle async):
 *   init()
 *   getArtists(ids) getAlbums(ids) getTracks(ids) getPlaylists(ids)
 *   listTracks({ sort, artistId, albumId, limit, offset })
 *   listAlbums({ artistId, type, limit, offset })
 *   listPlaylists({ artistId, limit, offset })
 *   search(query, { types, limit })  → { artists, albums, tracks, playlists }
 *   recommend(seedTrackId, { exclude, limit })
 */
import { normalize } from '../core/util.js';

/** Gemeinsame Logik für Anbieter, die ihre Daten im Speicher halten (Listen, Suche, Empfehlungen). */
export class MapCatalogProvider {
  /** Hinweise für die UI (Quelle, Hörproben-Kennzeichnung). */
  info = { label: 'Katalog', notice: '', previews: false };

  setData({ artists = [], albums = [], tracks = [], playlists = [] }) {
    const byId = (list) => new Map(list.map((x) => [x.id, x]));
    this.artists = byId(artists);
    this.albums = byId(albums);
    this.tracks = byId(tracks);
    this.playlists = byId(playlists);
  }

  async listArtists() {
    return [...this.artists.values()].filter((a) => !a.hidden);
  }

  #pick(map, ids) {
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  async getArtists(ids) {
    return this.#pick(this.artists, ids);
  }
  async getAlbums(ids) {
    return this.#pick(this.albums, ids);
  }
  async getTracks(ids) {
    return this.#pick(this.tracks, ids);
  }
  async getPlaylists(ids) {
    return this.#pick(this.playlists, ids);
  }

  async listTracks({ sort = 'popularity', artistId, albumId, limit = 50, offset = 0 } = {}) {
    if (albumId) await this.loadAlbumTracks?.(albumId);
    let list = [...this.tracks.values()];
    if (artistId) list = list.filter((t) => t.artistIds.includes(artistId));
    if (albumId) list = list.filter((t) => t.albumId === albumId);
    const sorters = {
      popularity: (a, b) => b.popularity - a.popularity,
      newest: (a, b) => b.addedAt.localeCompare(a.addedAt) || b.popularity - a.popularity,
      album: (a, b) => (a.discNumber || 1) * 1000 + a.trackNumber - ((b.discNumber || 1) * 1000 + b.trackNumber),
      title: (a, b) => a.title.localeCompare(b.title, 'fr'),
    };
    return list.sort(sorters[sort] || sorters.popularity).slice(offset, offset + limit);
  }

  async listAlbums({ artistId, type, limit = 50, offset = 0 } = {}) {
    let list = [...this.albums.values()];
    if (artistId) list = list.filter((a) => a.artistIds.includes(artistId));
    if (type) list = list.filter((a) => a.type === type);
    return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.title.localeCompare(b.title)).slice(offset, offset + limit);
  }

  async listPlaylists({ artistId, limit = 50, offset = 0 } = {}) {
    let list = [...this.playlists.values()];
    if (artistId) list = list.filter((p) => p.artistIds.includes(artistId));
    return list.slice(offset, offset + limit);
  }

  async search(query, { types = ['artists', 'albums', 'tracks', 'playlists'], limit = 30 } = {}) {
    const q = normalize(query);
    const out = { artists: [], albums: [], tracks: [], playlists: [] };
    if (!q) return out;
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = (text) => terms.every((t) => text.includes(t));
    const starts = (text) => text.startsWith(q) || text.split(/\s+/).some((w) => w.startsWith(q));

    // Treffer-Künstler: deren Inhalte werden mit ausgegeben (Suche "JUL" → Songs, Alben, Playlists)
    const hitArtists = [...this.artists.values()].filter((a) => matches(normalize(a.name + ' ' + (a.genres || []).join(' '))));
    const hitIds = new Set(hitArtists.map((a) => a.id));
    const artistName = (ids) => ids.map((id) => this.artists.get(id)?.name || '').join(' ');

    const score = (title, extra, byArtist, popularity = 0) => {
      const t = normalize(title);
      let s = 0;
      if (t === q) s = 100;
      else if (starts(t)) s = 80;
      else if (matches(t)) s = 60;
      else if (extra && matches(normalize(extra))) s = 40;
      else if (byArtist) s = 20;
      return s ? s + popularity / 100 : 0;
    };

    if (types.includes('artists')) {
      out.artists = hitArtists.map((a) => ({ item: a, s: score(a.name, '', false) })).sort((a, b) => b.s - a.s).map((x) => x.item);
    }
    if (types.includes('tracks')) {
      out.tracks = [...this.tracks.values()]
        .map((t) => ({
          item: t,
          s: score(t.title, `${artistName(t.artistIds)} ${this.albums.get(t.albumId)?.title || ''}`, t.artistIds.some((id) => hitIds.has(id)), t.popularity),
        }))
        .filter((x) => x.s)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.item);
    }
    if (types.includes('albums')) {
      out.albums = [...this.albums.values()]
        .map((a) => ({ item: a, s: score(a.title, artistName(a.artistIds), a.artistIds.some((id) => hitIds.has(id))) }))
        .filter((x) => x.s)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.item);
    }
    if (types.includes('playlists')) {
      out.playlists = [...this.playlists.values()]
        .map((p) => ({ item: p, s: score(p.title, `${p.description} ${p.ownerName}`, p.artistIds.some((id) => hitIds.has(id))) }))
        .filter((x) => x.s)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.item);
    }
    return out;
  }

  async recommend(seedTrackId, { exclude = [], limit = 10 } = {}) {
    const seed = this.tracks.get(seedTrackId);
    const skip = new Set(exclude);
    const pool = [...this.tracks.values()].filter((t) => !skip.has(t.id) && (!seed || t.artistIds.some((a) => seed.artistIds.includes(a))));
    // gewichtete Zufallsauswahl nach Beliebtheit
    return pool
      .map((t) => ({ t, k: Math.random() * (40 + t.popularity) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, limit)
      .map((x) => x.t);
  }
}

/** Demo-Katalog aus data/catalog.json (eigene, lizenzfreie Inhalte). */
export class StaticCatalogProvider extends MapCatalogProvider {
  info = { label: 'Demo-Katalog', notice: 'Alle Inhalte sind eigene Demo-Platzhalter (CC0) – keine geschützten Songs.', previews: false };

  constructor(url) {
    super();
    this.url = url;
  }

  async init() {
    const res = await fetch(this.url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Katalog konnte nicht geladen werden (${res.status})`);
    this.setData(await res.json());
  }
}
