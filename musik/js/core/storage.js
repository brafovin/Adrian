/**
 * Dauerhafte Speicherung (Schlüssel/Wert) auf IndexedDB.
 *
 * - Beim Start wird alles in einen Speicher-Cache geladen → Lesen ist synchron und schnell.
 * - Schreibzugriffe landen sofort im Cache und werden gebündelt in IndexedDB geschrieben.
 * - Fällt IndexedDB aus (z. B. privater Modus), wird auf localStorage ausgewichen.
 */
const DB_NAME = 'rouge-music';
const STORE = 'kv';
const LS_PREFIX = 'rouge:';

const mem = new Map();
const dirty = new Map(); // key -> value | undefined (= löschen)
let db = null;
let useLocalStorage = false;
let flushTimer = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
}

function readAll(database) {
  return new Promise((resolve, reject) => {
    const out = [];
    const req = database.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push([cursor.key, cursor.value]);
        cursor.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function initStorage() {
  try {
    if (!('indexedDB' in window)) throw new Error('kein IndexedDB');
    db = await openDb();
    for (const [k, v] of await readAll(db)) mem.set(k, v);
  } catch (err) {
    console.warn('[storage] Fallback auf localStorage:', err);
    useLocalStorage = true;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(LS_PREFIX)) mem.set(key.slice(LS_PREFIX.length), JSON.parse(localStorage.getItem(key)));
      }
    } catch {
      /* Speicher nicht verfügbar – App läuft dann nur für diese Sitzung. */
    }
  }
  navigator.storage?.persist?.().catch(() => {});
  const flushNow = () => flush();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow());
  window.addEventListener('pagehide', flushNow);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 150);
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!dirty.size) return;
  const batch = [...dirty];
  dirty.clear();
  if (useLocalStorage) {
    for (const [k, v] of batch) {
      try {
        if (v === undefined) localStorage.removeItem(LS_PREFIX + k);
        else localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
      } catch {
        /* z. B. Speicher voll */
      }
    }
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of batch) v === undefined ? store.delete(k) : store.put(v, k);
    tx.onerror = () => console.error('[storage] Schreibfehler', tx.error);
  } catch (err) {
    console.error('[storage] flush fehlgeschlagen', err);
  }
}

const clone = (v) => (v !== null && typeof v === 'object' ? structuredClone(v) : v);

export const storage = {
  get(key, fallback = null) {
    return mem.has(key) ? clone(mem.get(key)) : fallback;
  },
  set(key, value) {
    const v = clone(value);
    mem.set(key, v);
    dirty.set(key, v);
    scheduleFlush();
  },
  remove(key) {
    mem.delete(key);
    dirty.set(key, undefined);
    scheduleFlush();
  },
  keys(prefix = '') {
    return [...mem.keys()].filter((k) => k.startsWith(prefix));
  },
  removePrefix(prefix) {
    for (const k of this.keys(prefix)) this.remove(k);
  },
  flush,
};
