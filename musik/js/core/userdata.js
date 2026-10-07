/** Nutzerbezogene Daten: alle Schlüssel liegen unter "u:<userId>:<name>". */
import { storage } from './storage.js';

let currentUserId = 'guest';

export function setUserId(id) {
  currentUserId = id || 'guest';
}

export const getUserId = () => currentUserId;
const key = (name) => `u:${currentUserId}:${name}`;

export const userData = {
  get: (name, fallback = null) => storage.get(key(name), fallback),
  set: (name, value) => storage.set(key(name), value),
  remove: (name) => storage.remove(key(name)),
  /** Alle Daten eines Nutzers (für Export/Löschen). */
  dump(userId = currentUserId) {
    const prefix = `u:${userId}:`;
    return Object.fromEntries(storage.keys(prefix).map((k) => [k.slice(prefix.length), storage.get(k)]));
  },
  wipe(userId = currentUserId) {
    storage.removePrefix(`u:${userId}:`);
  },
};
