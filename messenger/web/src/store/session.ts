import { create } from 'zustand';
import { ApiError, get, patch, post } from '../api';
import type { Me, Settings } from '../types';
import { realtime } from '../realtime';

interface SessionState {
  status: 'loading' | 'anon' | 'authed';
  me: Me | null;
  init(): Promise<void>;
  login(identifier: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setMe(me: Me): void;
  updateSettings(patch: Partial<Omit<Settings, 'notify'>> & { notify?: Partial<Settings['notify']> }): Promise<void>;
  /** Setzt den lokalen Zustand zurück (Sitzung ungültig). */
  reset(): void;
}

export function applyAppearance(s: Pick<Settings, 'theme' | 'accent'> | null) {
  const root = document.documentElement;
  root.dataset.theme = s?.theme ?? 'system';
  root.style.setProperty('--accent', s?.accent ?? '#6d5efc');
  const dark = s?.theme === 'dark' || (s?.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d17' : '#f4f5fb');
}

export const useSession = create<SessionState>((set, get_) => ({
  status: 'loading',
  me: null,
  async init() {
    try {
      const { user } = await get<{ user: Me }>('/api/me');
      applyAppearance(user.settings);
      set({ me: user, status: 'authed' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) set({ me: null, status: 'anon' });
      else if (e instanceof ApiError && e.status === 0) {
        // Server nicht erreichbar: erneut versuchen
        set({ status: 'loading' });
        setTimeout(() => void get_().init(), 3000);
      } else set({ me: null, status: 'anon' });
    }
  },
  async login(identifier, password) {
    const deviceName = deviceLabel();
    const { user } = await post<{ user: Me }>('/api/auth/login', { identifier, password, deviceName });
    applyAppearance(user.settings);
    set({ me: user, status: 'authed' });
  },
  async logout() {
    try { await post('/api/auth/logout'); } catch { /* egal */ }
    get_().reset();
  },
  setMe(me) {
    applyAppearance(me.settings);
    set({ me });
  },
  async updateSettings(p) {
    const cur = get_().me;
    if (cur) {
      const optimistic = { ...cur.settings, ...p, notify: { ...cur.settings.notify, ...(p.notify ?? {}) } } as Settings;
      set({ me: { ...cur, settings: optimistic } });
      applyAppearance(optimistic);
    }
    const { settings } = await patch<{ settings: Settings }>('/api/me/settings', p);
    const now = get_().me;
    if (now) set({ me: { ...now, settings } });
    applyAppearance(settings);
  },
  reset() {
    realtime.stop();
    applyAppearance(null);
    set({ me: null, status: 'anon' });
    window.dispatchEvent(new Event('adrian:reset'));
  },
}));

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} auf ${os}`;
}
