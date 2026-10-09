import { hashHue, initials } from '../lib/format';

interface Props {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean | null;
  ring?: 'unseen' | 'seen' | null;
  className?: string;
  onClick?: () => void;
}

/** Profilbild oder farbige Initialen. */
export function Avatar({ name, src, size = 44, online, ring, className = '', onClick }: Props) {
  const hue = hashHue(name);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const inner = src ? (
    <img src={src} alt="" loading="lazy" draggable={false} style={style} className="avatar-img" />
  ) : (
    <span className="avatar-fallback" style={{ ...style, background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}>
      {initials(name)}
    </span>
  );
  return (
    <span className={`avatar ${ring ? `ring ring-${ring}` : ''} ${className}`} style={{ width: size, height: size }} onClick={onClick} role={onClick ? 'button' : 'img'} aria-label={name}>
      {inner}
      {online ? <span className="online-dot" aria-label="online" /> : null}
    </span>
  );
}
