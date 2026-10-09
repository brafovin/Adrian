const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const longDateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayDiff = (d: Date, now = new Date()) => Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));

/** Für Chatlisten: Uhrzeit heute, „Gestern“, Wochentag, sonst Datum. */
export function formatListTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff <= 0) return timeFmt.format(d);
  if (diff === 1) return 'Gestern';
  if (diff < 7) return weekdayFmt.format(d);
  return dateFmt.format(d);
}

/** Trennzeile im Chatverlauf. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff <= 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff < 7) return longDateFmt.format(d);
  return dateFmt.format(d);
}

export function formatLastSeen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff <= 0) return `zuletzt online heute um ${timeFmt.format(d)}`;
  if (diff === 1) return `zuletzt online gestern um ${timeFmt.format(d)}`;
  return `zuletzt online am ${dateFmt.format(d)}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'abgelaufen';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `noch ${h} Std. ${m} Min.` : `noch ${m} Min.`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0]!.slice(0, 2) : parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
