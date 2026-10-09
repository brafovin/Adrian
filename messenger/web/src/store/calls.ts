import type { PublicUser } from '../types';

/** Startet einen 1:1-Anruf (Sprache/Video). */
export function startCall(_peer: PublicUser, _kind: 'audio' | 'video'): void {}
/** Anzahl verpasster, noch nicht angesehener Anrufe (Badge in der Navigation). */
export function useMissedCallCount(): number {
  return 0;
}
export function initCallEvents(): () => void {
  return () => {};
}
export function resetCalls(): void {}
