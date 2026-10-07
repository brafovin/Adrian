/** Einstellungen (pro Nutzer gespeichert). */
import { bus } from '../core/events.js';
import { userData } from '../core/userdata.js';

export const DEFAULT_SETTINGS = {
  quality: 'auto', // auto | low | high
  autoplay: true, // nach Ende der Warteschlange ähnliche Songs weiterspielen
  shuffle: false,
  repeat: 'off', // off | all | one
  volume: 0.85,
  muted: false,
  toasts: true, // Hinweis-Einblendungen in der App
  notifyReleases: false, // Platzhalter für spätere Push-Benachrichtigungen
  lockscreen: true, // Steuerung über Sperrbildschirm / Benachrichtigungsleiste
};

let state = { ...DEFAULT_SETTINGS };

export const settings = {
  load() {
    state = { ...DEFAULT_SETTINGS, ...(userData.get('settings', {}) || {}) };
    bus.emit('settings:change', { keys: Object.keys(state), all: true });
  },
  get: (key) => state[key],
  all: () => ({ ...state }),
  set(patch) {
    const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
    if (!keys.length) return;
    state = { ...state, ...patch };
    userData.set('settings', state);
    bus.emit('settings:change', { keys });
  },
  reset() {
    state = { ...DEFAULT_SETTINGS };
    userData.set('settings', state);
    bus.emit('settings:change', { keys: Object.keys(state), all: true });
  },
};
