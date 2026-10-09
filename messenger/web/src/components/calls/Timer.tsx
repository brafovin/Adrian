import { formatDuration } from '../../lib/format';
import { useTick } from '../../lib/hooks';

export function CallTimer({ startedAt }: { startedAt: number | null }) {
  useTick(1000);
  if (!startedAt) return <>0:00</>;
  return <time>{formatDuration((Date.now() - startedAt) / 1000)}</time>;
}
