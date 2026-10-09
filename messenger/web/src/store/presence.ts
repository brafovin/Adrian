import { create } from 'zustand';

interface Presence {
  online: boolean | null;
  lastSeenAt?: string | null;
}
/** Live-Präsenz aus WebSocket-Ereignissen; überschreibt die beim Laden mitgelieferten Werte. */
export const usePresence = create<{ map: Record<string, Presence>; set(userId: string, p: Presence): void; reset(): void }>((set) => ({
  map: {},
  set: (userId, p) => set((s) => ({ map: { ...s.map, [userId]: { ...s.map[userId], ...p } } })),
  reset: () => set({ map: {} }),
}));

export function usePeerPresence(user: { id: string; online: boolean | null; lastSeenAt: string | null } | null | undefined) {
  const live = usePresence((s) => (user ? s.map[user.id] : undefined));
  if (!user) return { online: null as boolean | null, lastSeenAt: null as string | null };
  return {
    online: live && live.online !== undefined ? live.online : user.online,
    lastSeenAt: live?.lastSeenAt ?? user.lastSeenAt,
  };
}
