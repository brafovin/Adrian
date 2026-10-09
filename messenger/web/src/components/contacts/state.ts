import { create } from 'zustand';
import { ApiError, errorMessage } from '../../api';
import { useContacts } from '../../store/contacts';
import type { UserWithRelation } from '../../types';

export type ContactsTab = 'contacts' | 'requests' | 'search';
export type SearchStatus = 'idle' | 'short' | 'loading' | 'ok' | 'rate' | 'error';

interface UiState {
  tab: ContactsTab;
  query: string;
  results: UserWithRelation[];
  status: SearchStatus;
  error: string;
  setTab(t: ContactsTab): void;
  setQuery(q: string): void;
  /** Sucht sofort erneut (z. B. nach Änderung der Beziehungen oder Klick auf „Erneut suchen“). */
  refresh(silent?: boolean): void;
  reset(): void;
}

export const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

/** Zustand der Kontakte-Oberfläche; bleibt beim Wechsel zwischen Liste und Profil erhalten. */
export const useContactsUi = create<UiState>((set, get) => {
  async function run(silent: boolean) {
    const q = get().query.trim();
    const mine = ++seq;
    if (q.length < MIN_QUERY) {
      set({ results: [], status: q.length ? 'short' : 'idle', error: '' });
      return;
    }
    if (!silent) set({ status: 'loading', error: '' });
    try {
      const users = await useContacts.getState().search(q);
      if (mine !== seq) return;
      set({ results: users, status: 'ok', error: '' });
    } catch (e) {
      if (mine !== seq) return;
      if (e instanceof ApiError && e.status === 429) set({ status: 'rate', error: '' });
      else if (silent) return;
      else set({ status: 'error', error: errorMessage(e) });
    }
  }
  return {
    tab: 'contacts',
    query: '',
    results: [],
    status: 'idle',
    error: '',
    setTab: (tab) => set({ tab }),
    setQuery(query) {
      set({ query });
      if (timer) clearTimeout(timer);
      const q = query.trim();
      if (q.length < MIN_QUERY) {
        seq++;
        set({ results: [], status: q.length ? 'short' : 'idle', error: '' });
        return;
      }
      set({ status: 'loading', error: '' });
      timer = setTimeout(() => void run(false), DEBOUNCE_MS);
    },
    refresh(silent = false) {
      if (timer) clearTimeout(timer);
      void run(silent);
    },
    reset() {
      if (timer) clearTimeout(timer);
      seq++;
      set({ tab: 'contacts', query: '', results: [], status: 'idle', error: '' });
    },
  };
});

if (typeof window !== 'undefined') window.addEventListener('adrian:reset', () => useContactsUi.getState().reset());

let wantFocus = false;
/** Wechselt zur Suche und merkt vor, dass das Eingabefeld den Fokus bekommen soll (nur bei Zeiger-Bedienung). */
export function gotoSearch(focus = true) {
  wantFocus = focus;
  useContactsUi.getState().setTab('search');
}
export function consumeSearchFocus(): boolean {
  const v = wantFocus;
  wantFocus = false;
  return v;
}
