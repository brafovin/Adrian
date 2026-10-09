import { useEffect, useState } from 'react';

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    fn();
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return m;
}
export const useIsDesktop = () => useMedia('(min-width: 900px)');

/** Erzwingt in festem Takt ein erneutes Rendern (z. B. für Restzeiten). */
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
