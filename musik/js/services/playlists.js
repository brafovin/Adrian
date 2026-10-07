/** Eigene Playlists (pro Nutzer). */
import { bus } from '../core/events.js';
import { userData } from '../core/userdata.js';
import { uid } from '../core/util.js';

export const LIMITS = { name: 60, description: 200 };
let lists = [];

function persist(change) {
  userData.set('playlists', lists);
  bus.emit('playlists:change', change);
}

const clean = (s, max) => String(s ?? '').trim().slice(0, max);

export const playlists = {
  load() {
    lists = userData.get('playlists', []) || [];
    bus.emit('playlists:change', { all: true });
  },
  list: () => lists.map((p) => ({ ...p, trackIds: [...p.trackIds] })),
  get(id) {
    const p = lists.find((x) => x.id === id);
    return p ? { ...p, trackIds: [...p.trackIds], kind: 'user' } : null;
  },
  create({ name, description = '', trackIds = [] }) {
    name = clean(name, LIMITS.name);
    if (!name) throw new Error('Bitte vergib einen Namen.');
    const now = Date.now();
    const p = { id: uid('up'), name, description: clean(description, LIMITS.description), trackIds: [...new Set(trackIds)], createdAt: now, updatedAt: now };
    lists.unshift(p);
    persist({ id: p.id, type: 'create' });
    return this.get(p.id);
  },
  update(id, { name, description }) {
    const p = lists.find((x) => x.id === id);
    if (!p) return;
    if (name !== undefined) {
      const n = clean(name, LIMITS.name);
      if (!n) throw new Error('Bitte vergib einen Namen.');
      p.name = n;
    }
    if (description !== undefined) p.description = clean(description, LIMITS.description);
    p.updatedAt = Date.now();
    persist({ id, type: 'update' });
  },
  remove(id) {
    lists = lists.filter((p) => p.id !== id);
    persist({ id, type: 'delete' });
  },
  /** @returns {number} Anzahl tatsächlich hinzugefügter Songs (Duplikate werden übersprungen) */
  addTracks(id, trackIds) {
    const p = lists.find((x) => x.id === id);
    if (!p) return 0;
    const fresh = [...new Set(trackIds)].filter((t) => !p.trackIds.includes(t));
    if (!fresh.length) return 0;
    p.trackIds.push(...fresh);
    p.updatedAt = Date.now();
    persist({ id, type: 'tracks' });
    return fresh.length;
  },
  removeTrack(id, trackId) {
    const p = lists.find((x) => x.id === id);
    if (!p) return;
    p.trackIds = p.trackIds.filter((t) => t !== trackId);
    p.updatedAt = Date.now();
    persist({ id, type: 'tracks' });
  },
  has(id, trackId) {
    return !!lists.find((x) => x.id === id)?.trackIds.includes(trackId);
  },
};
