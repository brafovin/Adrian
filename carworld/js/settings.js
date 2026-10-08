// Einstellungen (werden im Browser gespeichert).

export const DEFAULTS = {
  quality: 'high', dynres: true, tod: 'sunset', assist: 1, gearbox: 'auto', master: 0.8, engineVol: 1.0, shake: 1, hints: true,
  car: 'cls63', tuning: {},
};

const KEY = 'sunsetdrive.v1';

export function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* privater Modus */ } }

export const SETTING_DEFS = [
  { key: 'quality', label: 'Grafikqualität', type: 'seg', options: [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch'], ['ultra', 'Ultra']] },
  { key: 'dynres', label: 'Auto-Auflösung (hält die Bildrate)', type: 'seg', options: [[true, 'An'], [false, 'Aus']] },
  { key: 'tod', label: 'Tageszeit', type: 'seg', options: [['afternoon', 'Nachmittag'], ['sunset', 'Sonnenuntergang'], ['dusk', 'Dämmerung'], ['night', 'Nacht'], ['cycle', 'Übergang']] },
  { key: 'assist', label: 'Fahrhilfen (ESC, ABS, Traktion)', type: 'seg', options: [[0, 'Aus'], [1, 'Normal'], [2, 'Stark']] },
  { key: 'gearbox', label: 'Getriebe', type: 'seg', options: [['auto', 'Automatik'], ['manual', 'Manuell']] },
  { key: 'shake', label: 'Kamerawackeln', type: 'seg', options: [[0, 'Aus'], [1, 'Normal'], [2, 'Stark']] },
  { key: 'master', label: 'Gesamtlautstärke', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'engineVol', label: 'Motorlautstärke', type: 'range', min: 0, max: 1.5, step: 0.05 },
  { key: 'hints', label: 'Tastenhinweise im Spiel', type: 'seg', options: [[true, 'An'], [false, 'Aus']] },
];

export const TOD_PRESETS = { afternoon: 0.12, sunset: 0.82, dusk: 1.85, night: 2.85 };
