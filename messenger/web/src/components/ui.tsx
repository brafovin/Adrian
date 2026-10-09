import type { ReactNode } from 'react';
import { Icon } from './Icon';

export const Spinner = ({ size = 22 }: { size?: number }) => <span className="spinner" style={{ width: size, height: size }} role="progressbar" aria-label="Lädt" />;

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={34} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Erneut versuchen</button>}
    </div>
  );
}

export function PaneHeader({ title, left, right, sub }: { title: ReactNode; left?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="pane-header">
      {left}
      <div className="pane-title">
        <h1>{title}</h1>
        {sub && <div className="pane-sub">{sub}</div>}
      </div>
      <div className="pane-actions">{right}</div>
    </header>
  );
}
