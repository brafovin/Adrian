/** Anbindung an die Media Session API: Steuerung & Cover auf Sperrbildschirm / Benachrichtigungsleiste. */
import { bus } from '../core/events.js';
import { absoluteUrl, throttle } from '../core/util.js';
import { player } from './player.js';
import { settings } from './settings.js';

const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;

function updateMetadata() {
  if (!ms) return;
  const t = player.current;
  if (!t || !settings.get('lockscreen')) {
    ms.metadata = null;
    return;
  }
  const art = t.cover?.large ? [{ src: absoluteUrl(t.cover.large), sizes: '640x640', type: 'image/jpeg' }] : [];
  ms.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artistName,
    album: t.album?.title || '',
    artwork: art,
  });
}

const updatePosition = throttle(() => {
  if (!ms?.setPositionState) return;
  const { duration, position } = player.state;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    ms.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 });
  } catch {
    /* ungültige Werte ignorieren */
  }
}, 1000);

export function initMediaSession() {
  if (!ms) return;
  const handlers = {
    play: () => player.play(),
    pause: () => player.pause(),
    previoustrack: () => player.prev(),
    nexttrack: () => player.next(),
    seekto: (d) => player.seek(d.seekTime),
    seekbackward: (d) => player.seekBy(-(d.seekOffset || 10)),
    seekforward: (d) => player.seekBy(d.seekOffset || 10),
    stop: () => player.pause(),
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* Aktion wird nicht unterstützt */
    }
  }
  bus.on('player:track', updateMetadata);
  bus.on('player:state', () => {
    ms.playbackState = player.state.playing ? 'playing' : player.current ? 'paused' : 'none';
    updatePosition();
  });
  bus.on('player:time', updatePosition);
  bus.on('settings:change', ({ keys, all }) => (all || keys.includes('lockscreen')) && updateMetadata());
}
