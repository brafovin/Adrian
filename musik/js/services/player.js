/**
 * Audio-Player: ein einziges <audio>-Element, das App-weit (auch bei Seitenwechseln) weiterläuft.
 *
 * Warteschlange:
 *  - `queue`    = aktuelle Abspielreihenfolge (bei Shuffle gemischt),
 *  - `original` = ursprüngliche Reihenfolge (zum Zurückschalten von Shuffle).
 * Einträge sind { key, track }, damit derselbe Song mehrfach vorkommen darf.
 */
import { bus } from '../core/events.js';
import { userData } from '../core/userdata.js';
import { clamp, shuffled, throttle, uid } from '../core/util.js';
import { catalog } from '../data/catalog.js';
import { library } from './library.js';
import { settings } from './settings.js';

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

const s = {
  queue: [],
  original: [],
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  context: '',
  error: null,
};
let errorStreak = 0;
let recorded = null; // Entry-Key, für den der Verlauf schon geschrieben wurde
let pendingSeek = null;

const entry = (track) => ({ key: uid('q'), track });
const currentEntry = () => s.queue[s.index] || null;

// Lautstärke-Unterstützung prüfen (iOS ignoriert audio.volume)
const volumeSupported = (() => {
  const probe = new Audio();
  probe.volume = 0.5;
  return probe.volume === 0.5;
})();

function pickSource(track) {
  const src = track.sources || {};
  let q = settings.get('quality');
  if (q === 'auto') {
    const c = navigator.connection;
    q = c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || '')) ? 'low' : 'high';
  }
  return src[q] || src.high || src.low || Object.values(src)[0];
}

function applyVolume() {
  audio.volume = settings.get('muted') ? 0 : clamp(settings.get('volume'), 0, 1);
}

function savePlayback() {
  userData.set('playback', {
    queue: s.queue.map((e) => e.track.id),
    original: s.original.map((e) => e.track.id),
    index: s.index,
    position: pendingSeek ?? (audio.currentTime || s.position || 0),
    context: s.context,
  });
}
const savePlaybackSoon = throttle(savePlayback, 3000);

function loadCurrent({ autoplay, startAt = 0 }) {
  const e = currentEntry();
  if (!e) return;
  s.error = null;
  s.loading = true;
  s.position = startAt;
  s.duration = e.track.duration || 0;
  recorded = null;
  if (!autoplay) s.playing = false;
  pendingSeek = startAt > 0 ? startAt : null;
  audio.src = new URL(pickSource(e.track), document.baseURI).href;
  audio.load();
  bus.emit('player:track', { track: e.track, entry: e });
  bus.emit('player:time', { position: s.position, duration: s.duration });
  bus.emit('player:state', {});
  if (autoplay) play();
  savePlayback();
}

async function play() {
  if (!currentEntry()) return;
  try {
    await audio.play();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      s.playing = false;
      bus.emit('player:state', {});
    } else if (err.name !== 'AbortError') {
      console.warn('[player] play() fehlgeschlagen', err);
    }
  }
}

function pause() {
  audio.pause();
}

async function advance({ auto }) {
  if (!s.queue.length) return;
  const last = s.index >= s.queue.length - 1;
  if (!last) {
    s.index++;
    return loadCurrent({ autoplay: true });
  }
  if (settings.get('repeat') === 'all') {
    s.index = 0;
    return loadCurrent({ autoplay: true });
  }
  if (settings.get('autoplay')) {
    const seed = currentEntry().track;
    const more = await catalog.recommend(seed.id, { exclude: s.queue.map((e) => e.track.id), limit: 8 });
    if (more.length) {
      for (const t of more) {
        const e = entry(t);
        s.queue.push(e);
        s.original.push(e);
      }
      bus.emit('player:queue', {});
      s.index++;
      return loadCurrent({ autoplay: true });
    }
  }
  if (auto) {
    // Ende der Warteschlange: zurück an den Anfang, aber pausiert.
    s.index = 0;
    loadCurrent({ autoplay: false });
  } else {
    s.index = 0;
    loadCurrent({ autoplay: true });
  }
}

// ---------- Audio-Events ----------
audio.addEventListener('play', () => {
  s.playing = true;
  bus.emit('player:state', {});
});
audio.addEventListener('pause', () => {
  s.playing = false;
  savePlayback();
  bus.emit('player:state', {});
});
audio.addEventListener('waiting', () => {
  s.loading = true;
  bus.emit('player:state', {});
});
audio.addEventListener('canplay', () => {
  s.loading = false;
  bus.emit('player:state', {});
});
audio.addEventListener('playing', () => {
  s.loading = false;
  s.playing = true;
  errorStreak = 0;
  const e = currentEntry();
  if (e && recorded !== e.key) {
    recorded = e.key;
    library.recordPlay(e.track.id);
  }
  bus.emit('player:state', {});
});
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) s.duration = audio.duration;
  if (pendingSeek != null) {
    audio.currentTime = Math.min(pendingSeek, Math.max(0, s.duration - 0.5));
    pendingSeek = null;
  }
  bus.emit('player:time', { position: audio.currentTime, duration: s.duration });
});
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) s.duration = audio.duration;
});
audio.addEventListener('timeupdate', () => {
  s.position = audio.currentTime;
  bus.emit('player:time', { position: s.position, duration: s.duration });
  if (s.playing) savePlaybackSoon();
});
audio.addEventListener('ended', () => {
  if (settings.get('repeat') === 'one') {
    audio.currentTime = 0;
    play();
  } else {
    advance({ auto: true });
  }
});
audio.addEventListener('error', () => {
  if (!audio.src || !currentEntry()) return;
  s.loading = false;
  s.playing = false;
  s.error = 'Song konnte nicht geladen werden.';
  bus.emit('player:state', {});
  bus.emit('player:error', { track: currentEntry().track });
  // Bei Fehlern weiterspringen – aber nicht endlos im Kreis.
  if (++errorStreak < Math.min(s.queue.length, 5) && s.queue.length > 1) setTimeout(() => advance({ auto: false }), 600);
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && savePlayback());
window.addEventListener('pagehide', savePlayback);

bus.on('settings:change', ({ keys, all }) => {
  if (all || keys.includes('volume') || keys.includes('muted')) applyVolume();
  if (all || keys.includes('shuffle')) syncShuffle();
  bus.emit('player:modes', {});
});

function syncShuffle() {
  const want = settings.get('shuffle');
  const cur = currentEntry();
  if (!s.queue.length) return;
  if (want) {
    const rest = shuffled(s.queue.filter((e) => e !== cur));
    s.queue = cur ? [cur, ...rest] : rest;
    s.index = cur ? 0 : -1;
  } else if (cur) {
    // Reihenfolge wiederherstellen (inkl. zwischenzeitlich eingefügter Songs, die in `original` ergänzt wurden)
    s.queue = [...s.original];
    s.index = Math.max(0, s.queue.indexOf(cur));
  }
  bus.emit('player:queue', {});
  savePlayback();
}

// ---------- Öffentliche API ----------
export const player = {
  volumeSupported,
  get state() {
    return s;
  },
  get audio() {
    return audio;
  },
  get current() {
    const e = currentEntry();
    return e ? e.track : null;
  },
  get currentEntry() {
    return currentEntry();
  },
  get shuffle() {
    return settings.get('shuffle');
  },
  get repeat() {
    return settings.get('repeat');
  },
  get volume() {
    return settings.get('volume');
  },
  get muted() {
    return settings.get('muted');
  },
  get position() {
    return s.position;
  },

  /** Spielt eine Liste ab. `shuffle: true` startet gemischt (zufälliger Startsong). */
  playTracks(tracks, startIndex = 0, { context = '', shuffle } = {}) {
    if (!tracks.length) return;
    s.original = tracks.map(entry);
    s.queue = [...s.original];
    s.context = context;
    let start = clamp(startIndex, 0, tracks.length - 1);
    if (shuffle === true) start = Math.floor(Math.random() * tracks.length);
    s.index = start;
    if (shuffle !== undefined && settings.get('shuffle') !== shuffle) {
      settings.set({ shuffle }); // löst syncShuffle aus
    } else if (settings.get('shuffle')) {
      syncShuffle();
    }
    bus.emit('player:queue', {});
    loadCurrent({ autoplay: true });
  },

  toggle() {
    if (!currentEntry()) return;
    if (s.error) return loadCurrent({ autoplay: true, startAt: 0 });
    audio.paused ? play() : pause();
  },
  play,
  pause,
  next() {
    advance({ auto: false });
  },
  prev() {
    if (!s.queue.length) return;
    if (audio.currentTime > 3 || (s.index === 0 && settings.get('repeat') !== 'all')) {
      audio.currentTime = 0;
      return;
    }
    s.index = s.index === 0 ? s.queue.length - 1 : s.index - 1;
    loadCurrent({ autoplay: true });
  },
  seek(seconds) {
    if (!currentEntry()) return;
    const max = s.duration || audio.duration || 0;
    audio.currentTime = clamp(seconds, 0, max ? max - 0.05 : seconds);
    s.position = audio.currentTime;
    bus.emit('player:time', { position: s.position, duration: s.duration, seeked: true });
    savePlayback();
  },
  seekBy(delta) {
    this.seek((audio.currentTime || 0) + delta);
  },
  jumpTo(index) {
    if (index < 0 || index >= s.queue.length) return;
    s.index = index;
    loadCurrent({ autoplay: true });
  },

  setVolume(v) {
    settings.set({ volume: clamp(v, 0, 1), muted: false });
  },
  toggleMute() {
    settings.set({ muted: !settings.get('muted') });
  },
  toggleShuffle() {
    settings.set({ shuffle: !settings.get('shuffle') });
  },
  setRepeat(mode) {
    settings.set({ repeat: mode });
  },
  cycleRepeat() {
    const order = ['off', 'all', 'one'];
    this.setRepeat(order[(order.indexOf(settings.get('repeat')) + 1) % order.length]);
  },

  /** Hängt Songs ans Ende der Warteschlange. */
  addToQueue(tracks) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    if (!currentEntry()) return this.playTracks(list, 0);
    for (const t of list) {
      const e = entry(t);
      s.queue.push(e);
      s.original.push(e);
    }
    bus.emit('player:queue', {});
    savePlayback();
  },
  /** Fügt Songs direkt nach dem aktuellen Titel ein. */
  playNext(tracks) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    const cur = currentEntry();
    if (!cur) return this.playTracks(list, 0);
    const entries = list.map(entry);
    s.queue.splice(s.index + 1, 0, ...entries);
    const oi = s.original.indexOf(cur);
    s.original.splice(oi < 0 ? s.original.length : oi + 1, 0, ...entries);
    bus.emit('player:queue', {});
    savePlayback();
  },
  removeFromQueue(index) {
    if (index === s.index || index < 0 || index >= s.queue.length) return;
    const [removed] = s.queue.splice(index, 1);
    s.original = s.original.filter((e) => e !== removed);
    if (index < s.index) s.index--;
    bus.emit('player:queue', {});
    savePlayback();
  },
  clearUpcoming() {
    const keep = new Set(s.queue.slice(0, s.index + 1));
    s.queue = s.queue.slice(0, s.index + 1);
    s.original = s.original.filter((e) => keep.has(e));
    bus.emit('player:queue', {});
    savePlayback();
  },

  /** Setzt den Player komplett zurück (z. B. beim Abmelden). */
  reset() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    s.queue = [];
    s.original = [];
    s.index = -1;
    s.playing = false;
    s.loading = false;
    s.position = 0;
    s.duration = 0;
    s.context = '';
    s.error = null;
    bus.emit('player:track', { track: null });
    bus.emit('player:queue', {});
    bus.emit('player:state', {});
  },

  /** Stellt Warteschlange und Position nach dem Start wieder her (pausiert). */
  async restore() {
    const saved = userData.get('playback');
    audio.pause();
    audio.removeAttribute('src');
    s.queue = [];
    s.original = [];
    s.index = -1;
    s.playing = false;
    s.position = 0;
    s.duration = 0;
    applyVolume();
    if (!saved?.queue?.length) {
      bus.emit('player:track', { track: null });
      bus.emit('player:queue', {});
      bus.emit('player:state', {});
      return;
    }
    const ids = [...new Set([...saved.queue, ...(saved.original || [])])];
    const tracks = new Map((await catalog.getTracks(ids)).map((t) => [t.id, t]));
    const make = (list) => list.filter((id) => tracks.has(id)).map((id) => entry(tracks.get(id)));
    const queue = make(saved.queue);
    if (!queue.length) return;
    // original: gleiche Entry-Objekte wiederverwenden
    const pool = [...queue];
    const original = (saved.original || saved.queue).filter((id) => tracks.has(id)).map((id) => {
      const i = pool.findIndex((e) => e.track.id === id);
      return i >= 0 ? pool.splice(i, 1)[0] : entry(tracks.get(id));
    });
    s.queue = queue;
    s.original = original;
    const savedId = saved.queue[saved.index];
    s.index = Math.max(0, tracks.has(savedId) ? queue.findIndex((e) => e.track.id === savedId) : 0);
    s.context = saved.context || '';
    bus.emit('player:queue', {});
    loadCurrent({ autoplay: false, startAt: saved.position || 0 });
  },
};
