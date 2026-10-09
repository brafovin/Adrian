import { create } from 'zustand';
import { del, get, put } from '../api';
import type { Background, BackgroundParams } from '../types';

export const DEFAULT_BG_PARAMS: BackgroundParams = { zoom: 1, x: 0, y: 0, brightness: 1, overlay: 0.25, blur: 0 };

interface BgState {
  list: Background[];
  loaded: boolean;
  load(): Promise<void>;
  /** Hintergrund für einen Chat: chat-spezifisch, sonst Standard, sonst null. Nur für den eigenen Benutzer. */
  forConversation(id: string): Background | null;
  set(target: string | 'default', body: { mediaId: string; sourceMediaId?: string | null; params: BackgroundParams }): Promise<void>;
  clear(target: string | 'default'): Promise<void>;
  apply(conversationId: string | null, bg: Background | null): void;
  reset(): void;
}

export const useBackgrounds = create<BgState>((set, getState) => ({
  list: [],
  loaded: false,
  async load() {
    const { backgrounds } = await get<{ backgrounds: Background[] }>('/api/chat-backgrounds');
    set({ list: backgrounds, loaded: true });
  },
  forConversation(id) {
    const l = getState().list;
    return l.find((b) => b.conversationId === id) ?? l.find((b) => b.conversationId === null) ?? null;
  },
  async set(target, body) {
    const { background } = await put<{ background: Background }>(`/api/chat-backgrounds/${target}`, body);
    getState().apply(target === 'default' ? null : target, background);
  },
  async clear(target) {
    await del(`/api/chat-backgrounds/${target}`);
    getState().apply(target === 'default' ? null : target, null);
  },
  apply(conversationId, bg) {
    set((s) => {
      const rest = s.list.filter((b) => b.conversationId !== conversationId);
      return { list: bg ? [...rest, bg] : rest };
    });
  },
  reset() {
    set({ list: [], loaded: false });
  },
}));

/** CSS-Stil für einen Hintergrund (Zuschnitt wurde bereits beim Speichern angewendet; hier nur Helligkeit/Overlay/Unschärfe). */
export function backgroundLayers(bg: Background | null): { image: string; filter: string; overlay: number } | null {
  if (!bg) return null;
  return {
    image: `url(${bg.url}?v=${encodeURIComponent(bg.updatedAt)})`,
    filter: `brightness(${bg.params.brightness}) blur(${bg.params.blur}px)`,
    overlay: bg.params.overlay,
  };
}
