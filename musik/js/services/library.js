/** Bibliothek: zuletzt gehört + gespeicherte Alben (pro Nutzer). */
import { bus } from '../core/events.js';
import { userData } from '../core/userdata.js';

const MAX_HISTORY = 50;
let history = []; // [{ id, at }] neueste zuerst, ohne Duplikate
let albums = []; // [{ id, at }]

export const library = {
  load() {
    history = userData.get('history', []) || [];
    albums = userData.get('savedAlbums', []) || [];
    bus.emit('library:change', { all: true });
  },

  recentIds: () => history.map((h) => h.id),
  recordPlay(trackId) {
    history = [{ id: trackId, at: Date.now() }, ...history.filter((h) => h.id !== trackId)].slice(0, MAX_HISTORY);
    userData.set('history', history);
    bus.emit('library:change', { type: 'history' });
  },
  clearHistory() {
    history = [];
    userData.set('history', history);
    bus.emit('library:change', { type: 'history' });
  },

  savedAlbumIds: () => albums.map((a) => a.id),
  isAlbumSaved: (id) => albums.some((a) => a.id === id),
  toggleAlbum(id) {
    if (this.isAlbumSaved(id)) albums = albums.filter((a) => a.id !== id);
    else albums = [{ id, at: Date.now() }, ...albums];
    userData.set('savedAlbums', albums);
    bus.emit('library:change', { type: 'albums', id });
    return this.isAlbumSaved(id);
  },

  recentSearches: () => userData.get('searches', []) || [],
  addSearch(q) {
    q = q.trim();
    if (!q) return;
    userData.set('searches', [q, ...this.recentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8));
  },
  clearSearches() {
    userData.set('searches', []);
  },
};
