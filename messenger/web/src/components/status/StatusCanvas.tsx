import type { CSSProperties } from 'react';
import type { StatusItem } from '../../types';

type Style = StatusItem['style'];

export const BG_COLORS = [
  { hex: '#6d5efc', name: 'Violett' }, { hex: '#e5484d', name: 'Rot' }, { hex: '#f76b15', name: 'Orange' }, { hex: '#d9a400', name: 'Gelb' },
  { hex: '#2fb26a', name: 'Grün' }, { hex: '#12a594', name: 'Türkis' }, { hex: '#0090ff', name: 'Blau' }, { hex: '#8e4ec6', name: 'Lila' },
  { hex: '#d6409f', name: 'Pink' }, { hex: '#3e4a61', name: 'Schiefer' }, { hex: '#1b1b1f', name: 'Schwarz' }, { hex: '#8b5e3c', name: 'Braun' },
];
export const TEXT_COLORS = [
  { hex: '#ffffff', name: 'Weiß' }, { hex: '#111111', name: 'Schwarz' }, { hex: '#ffe66d', name: 'Gelb' }, { hex: '#ffd1e8', name: 'Rosa' }, { hex: '#c8f7dc', name: 'Mint' },
];
export const FONTS: { id: NonNullable<Style['font']>; label: string; stack: string }[] = [
  { id: 'sans', label: 'Standard', stack: 'var(--font)' },
  { id: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  { id: 'hand', label: 'Schreibschrift', stack: "'Segoe Print', 'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', cursive" },
];
export const DEFAULT_BG = BG_COLORS[0]!.hex;

/** Der Server speichert nur eine Hex-Farbe – der Verlauf wird daraus im Client abgeleitet. */
export const statusBackground = (bg?: string) => {
  const c = bg ?? DEFAULT_BG;
  return `linear-gradient(160deg, color-mix(in oklab, ${c}, white 16%) 0%, ${c} 45%, color-mix(in oklab, ${c}, black 38%) 100%)`;
};

const sizeClass = (n: number) => (n <= 30 ? 'xl' : n <= 80 ? 'l' : n <= 160 ? 'm' : n <= 320 ? 's' : 'xs');

/** Textstatus: Hintergrund, Schrift und Emoji gemäß `style` (auch für Vorschau und Miniaturen). */
export function StatusCanvas({ style, body, className = '' }: { style: Style; body: string; className?: string }) {
  const font = FONTS.find((f) => f.id === (style.font ?? 'sans')) ?? FONTS[0]!;
  const css: CSSProperties = {
    background: statusBackground(style.bg),
    color: style.color ?? '#ffffff',
    textAlign: style.align ?? 'center',
    fontFamily: font.stack,
  };
  return (
    <div className={`sc ${className}`} style={css}>
      <div className="sc-inner">
        {style.emoji && <div className="sc-emoji" aria-hidden="true">{style.emoji}</div>}
        <div className={`sc-text sc-${sizeClass(body.length)}`}>{body}</div>
      </div>
    </div>
  );
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  return `vor ${Math.floor(min / 60)} Std.`;
}

export const statusSnippet = (s: StatusItem) =>
  s.body.trim() || (s.kind === 'image' ? 'Foto' : s.kind === 'video' ? 'Video' : 'Textstatus');
