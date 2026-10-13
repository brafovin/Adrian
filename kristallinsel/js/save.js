// Spielstand und Einstellungen im localStorage (mit try/catch: privates Fenster, gesperrter Speicher).
import { newState } from './story.js';
import { DEFAULT_LOOK } from './gfx/figure.js';

const KEY = 'kristallinsel.spielstand.v1';
const SKEY = 'kristallinsel.einstellungen.v1';

export const DEFAULT_SETTINGS = { quality: 'auto', sens: 1, invertY: false, volume: 0.8, dayMinutes: 16, look: DEFAULT_LOOK, showFps: false };

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(read(SKEY) || {}) };
}
export function saveSettings(s) { write(SKEY, s); }

export function hasSave() { return !!read(KEY); }

export function loadGame() {
  const d = read(KEY);
  if (!d || d.v !== 1) return null;
  const s = newState();
  s.crystals = new Set(d.crystals || []);
  s.flags = { ...s.flags, ...(d.flags || {}) };
  s.discovered = new Set(d.discovered || []);
  s.talkCount = d.talkCount || {};
  s.time = Number.isFinite(d.time) ? d.time : s.time;
  s.day = d.day || 1;
  s.play = d.play || 0;
  s.pos = d.pos || null;
  return s;
}

export function saveGame(s, player) {
  if (player && player.mode === 'ground' && !player.sliding) s.pos = { x: player.x, y: player.y, z: player.z, yaw: player.yaw };
  return write(KEY, {
    v: 1,
    crystals: [...s.crystals], flags: s.flags, discovered: [...s.discovered], talkCount: s.talkCount,
    time: s.time, day: s.day, play: Math.round(s.play),
    pos: s.pos,
  });
}

export function clearGame() { try { localStorage.removeItem(KEY); } catch { /* egal */ } }
