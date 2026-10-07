/** Favorisierte Songs (pro Nutzer, neueste zuerst). */
import { bus } from '../core/events.js';
import { userData } from '../core/userdata.js';

let items = []; // [{ id, at }]
let ids = new Set();

function persist() {
  userData.set('favorites', items);
}

export const favorites = {
  load() {
    items = userData.get('favorites', []) || [];
    ids = new Set(items.map((f) => f.id));
    bus.emit('favorites:change', { all: true });
  },
  has: (trackId) => ids.has(trackId),
  list: () => items.map((f) => f.id),
  count: () => items.length,
  add(trackId) {
    if (ids.has(trackId)) return;
    items.unshift({ id: trackId, at: Date.now() });
    ids.add(trackId);
    persist();
    bus.emit('favorites:change', { id: trackId, value: true });
  },
  remove(trackId) {
    if (!ids.has(trackId)) return;
    items = items.filter((f) => f.id !== trackId);
    ids.delete(trackId);
    persist();
    bus.emit('favorites:change', { id: trackId, value: false });
  },
  /** @returns {boolean} neuer Zustand */
  toggle(trackId) {
    if (ids.has(trackId)) this.remove(trackId);
    else this.add(trackId);
    return ids.has(trackId);
  },
};
