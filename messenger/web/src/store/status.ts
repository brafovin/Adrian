import { create } from 'zustand';
import { ApiError, del, get, patch, post, put, uploadMedia } from '../api';
import { realtime } from '../realtime';
import type { PublicUser, StatusGroup, StatusItem } from '../types';
import { useSession } from './session';

export type Visibility = 'contacts' | 'only' | 'except';
export interface StatusInput {
  kind: 'text' | 'image' | 'video';
  body: string;
  style: StatusItem['style'];
  mediaId?: string;
  visibility: Visibility;
  audienceIds: string[];
}
export interface StatusViews {
  hidden: boolean;
  views: { user: PublicUser; viewedAt: string }[];
  reactions: { user: PublicUser; emoji: string; createdAt: string }[];
}

const SEEN_MAX = 600;
const seenKey = () => `adrian:status-seen:${useSession.getState().me?.id ?? ''}`;
function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey()) ?? '[]') as string[]); } catch { return new Set(); }
}
function writeSeen(ids: Set<string>) {
  try { localStorage.setItem(seenKey(), JSON.stringify([...ids].slice(-SEEN_MAX))); } catch { /* Speicher voll/gesperrt */ }
}

export const isActive = (s: StatusItem, now = Date.now()) => !s.publishedAt || !s.expiresAt || new Date(s.expiresAt).getTime() > now;
export const isLive =(s: StatusItem, now = Date.now()) => !!s.publishedAt && !!s.expiresAt && new Date(s.expiresAt).getTime() > now;

/** Ohne Lesebestätigungen speichert der Server keine Ansicht – dann merken wir „gesehen“ lokal. */
function normalizeGroups(groups: StatusGroup[], now = Date.now()): StatusGroup[] {
  const seen = readSeen();
  const out: StatusGroup[] = [];
  for (const g of groups) {
    const statuses = g.statuses.filter((s) => isLive(s, now)).map((s) => (s.viewed || !seen.has(s.id) ? s : { ...s, viewed: true }));
    if (!statuses.length) continue;
    out.push({ ...g, statuses, allViewed: statuses.every((s) => s.viewed), latestAt: statuses[statuses.length - 1]!.publishedAt ?? g.latestAt });
  }
  return out.sort((a, b) => Number(a.allViewed) - Number(b.allViewed) || b.latestAt.localeCompare(a.latestAt));
}

interface StatusState {
  groups: StatusGroup[];
  mine: StatusItem[];
  loaded: boolean;
  mineLoaded: boolean;
  error: string | null;
  views: Record<string, StatusViews | undefined>;
  loadFeed(): Promise<void>;
  loadMine(): Promise<void>;
  loadAll(): Promise<void>;
  create(input: StatusInput, publish: boolean): Promise<StatusItem>;
  update(id: string, input: StatusInput): Promise<StatusItem>;
  publish(id: string): Promise<StatusItem>;
  remove(id: string): Promise<void>;
  markViewed(id: string): Promise<void>;
  react(id: string, emoji: string | null): Promise<void>;
  loadViews(id: string): Promise<StatusViews>;
  upload(file: Blob, name: string, meta: { width?: number; height?: number; durationMs?: number }, onProgress?: (p: number) => void): ReturnType<typeof uploadMedia>;
  pruneExpired(): void;
  reset(): void;
}

let feedSeq = 0;
let mineSeq = 0;

export const useStatus = create<StatusState>((set, getState) => ({
  groups: [],
  mine: [],
  loaded: false,
  mineLoaded: false,
  error: null,
  views: {},

  async loadFeed() {
    const seq = ++feedSeq;
    try {
      const { groups } = await get<{ groups: StatusGroup[] }>('/api/statuses/feed');
      if (seq !== feedSeq) return;
      set({ groups: normalizeGroups(groups), loaded: true, error: null });
    } catch (e) {
      if (seq !== feedSeq) return;
      set({ loaded: true, error: e instanceof ApiError ? e.message : 'Status konnten nicht geladen werden.' });
      throw e;
    }
  },
  async loadMine() {
    const seq = ++mineSeq;
    const { statuses } = await get<{ statuses: StatusItem[] }>('/api/statuses/mine');
    if (seq !== mineSeq) return;
    set({ mine: statuses.filter((s) => isActive(s)), mineLoaded: true });
  },
  async loadAll() {
    const r = await Promise.allSettled([getState().loadFeed(), getState().loadMine()]);
    const failed = r.find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;
  },

  async create(input, publish) {
    const { status } = await post<{ status: StatusItem }>('/api/statuses', { ...input, publish });
    set((s) => ({ mine: [...s.mine.filter((x) => x.id !== status.id), status], mineLoaded: true }));
    return status;
  },
  async update(id, input) {
    const { status } = await patch<{ status: StatusItem }>(`/api/statuses/${id}`, input);
    set((s) => ({ mine: s.mine.map((x) => (x.id === id ? status : x)) }));
    return status;
  },
  async publish(id) {
    const { status } = await post<{ status: StatusItem }>(`/api/statuses/${id}/publish`);
    set((s) => ({ mine: s.mine.map((x) => (x.id === id ? status : x)) }));
    return status;
  },
  async remove(id) {
    await del(`/api/statuses/${id}`);
    set((s) => ({ mine: s.mine.filter((x) => x.id !== id) }));
  },

  async markViewed(id) {
    const seen = readSeen();
    seen.add(id);
    writeSeen(seen);
    set((s) => ({ groups: normalizeGroups(s.groups.map((g) => ({ ...g, statuses: g.statuses.map((x) => (x.id === id ? { ...x, viewed: true } : x)) }))) }));
    try {
      await post(`/api/statuses/${id}/view`);
    } catch (e) {
      // Abgelaufen/entfernt: Feed neu laden, sonst still ignorieren
      if (e instanceof ApiError && e.status === 404) void getState().loadFeed().catch(() => {});
    }
  },

  async react(id, emoji) {
    const prev = getState().groups.flatMap((g) => g.statuses).find((x) => x.id === id)?.myReaction ?? null;
    const apply = (v: string | null) =>
      set((s) => ({ groups: s.groups.map((g) => ({ ...g, statuses: g.statuses.map((x) => (x.id === id ? { ...x, myReaction: v } : x)) })) }));
    apply(emoji);
    try {
      await put(`/api/statuses/${id}/reaction`, { emoji });
    } catch (e) {
      apply(prev);
      throw e;
    }
  },

  async loadViews(id) {
    const v = await get<StatusViews>(`/api/statuses/${id}/views`);
    set((s) => ({ views: { ...s.views, [id]: v } }));
    return v;
  },

  upload: (file, name, meta, onProgress) => uploadMedia(file, name, { purpose: 'status', ...meta }, onProgress),

  pruneExpired() {
    const now = Date.now();
    set((s) => {
      const mine = s.mine.filter((x) => isActive(x, now));
      const groups = normalizeGroups(s.groups, now);
      return mine.length === s.mine.length && groups.length === s.groups.length && groups.every((g, i) => g.statuses.length === s.groups[i]?.statuses.length) ? s : { mine, groups };
    });
  },

  reset() {
    feedSeq++;
    mineSeq++;
    set({ groups: [], mine: [], loaded: false, mineLoaded: false, error: null, views: {} });
  },
}));

/** Anzahl Kontakte mit ungesehenen Status (Badge in der Navigation). */
export function useUnseenStatusCount(): number {
  return useStatus((s) => s.groups.reduce((n, g) => n + (g.statuses.some((x) => !x.viewed) ? 1 : 0), 0));
}

export function resetStatus(): void {
  useStatus.getState().reset();
}

/** Registriert die Echtzeit-Ereignisse des Status-Features. Gibt die Aufräum-Funktion zurück. */
export function initStatusEvents(): () => void {
  const st = () => useStatus.getState();
  const quiet = (p: Promise<unknown>) => void p.catch(() => {});
  const offs = [
    realtime.on('connected', () => quiet(st().loadAll())),
    realtime.on('resync', () => quiet(st().loadAll())),
    realtime.on('status.new', () => quiet(st().loadFeed())),
    realtime.on('status.removed', (e) => {
      useStatus.setState((s) => ({ groups: normalizeGroups(s.groups.map((g) => ({ ...g, statuses: g.statuses.filter((x) => x.id !== e.statusId) }))) }));
      quiet(st().loadFeed());
    }),
    realtime.on('status.viewed', (e) => {
      useStatus.setState((s) => ({ views: { ...s.views, [e.statusId]: undefined } }));
      quiet(st().loadMine());
    }),
    realtime.on('status.reaction', (e) => {
      useStatus.setState((s) => ({ views: { ...s.views, [e.statusId]: undefined } }));
      quiet(st().loadMine());
    }),
    realtime.on('status.mine.updated', () => quiet(st().loadMine())),
  ];

  // Abgelaufene Status zum Ablaufzeitpunkt ausblenden (der Server erzwingt den Ablauf zusätzlich)
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    const { groups, mine } = st();
    const times = [...groups.flatMap((g) => g.statuses), ...mine].map((x) => (x.expiresAt && x.publishedAt ? new Date(x.expiresAt).getTime() : Infinity));
    const next = Math.min(...times);
    if (!Number.isFinite(next)) return;
    timer = setTimeout(() => { st().pruneExpired(); schedule(); }, Math.min(Math.max(next - Date.now() + 250, 500), 2 ** 30));
  };
  const unsub = useStatus.subscribe(schedule);
  schedule();
  return () => {
    offs.forEach((f) => f());
    unsub();
    clearTimeout(timer);
  };
}
