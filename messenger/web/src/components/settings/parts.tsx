import { useId, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { PaneHeader } from '../ui';

/** Seitenrahmen eines Einstellungsbereichs: Kopfzeile mit Zurück-Pfeil (nur am Handy) und scrollbarer Inhalt. */
export function PaneShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="set-pane" aria-label={title}>
      <PaneHeader title={title} left={<button className="icon-btn back-btn mobile-only" onClick={onBack} aria-label="Zurück zu den Einstellungen"><Icon name="back" size={24} /></button>} />
      <div className="pane-body set-body">
        <div className="set-content">{children}</div>
      </div>
    </section>
  );
}

/** Gruppe mit Überschrift und Karten-Container. */
export function Group({ title, children, note }: { title?: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="set-section">
      {title && <h2 className="section-title set-section-title">{title}</h2>}
      <div className="settings-group">{children}</div>
      {note && <p className="set-note">{note}</p>}
    </div>
  );
}

export function SwitchRow({ title, sub, checked, onChange, disabled, icon }: { title: string; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; icon?: string }) {
  const id = useId();
  return (
    <div className="settings-row">
      {icon && <span className="icon-wrap"><Icon name={icon} size={18} /></span>}
      <div className="label">
        <span id={`${id}-t`}>{title}</span>
        {sub && <small id={`${id}-s`}>{sub}</small>}
      </div>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-labelledby={`${id}-t`} aria-describedby={sub ? `${id}-s` : undefined} onChange={(e) => onChange(e.target.checked)} />
        <i />
      </span>
    </div>
  );
}

export function SelectRow<T extends string>({ title, sub, value, options, onChange, disabled }: { title: string; sub?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="settings-row">
      <div className="label">
        <label htmlFor={`${id}-sel`}>{title}</label>
        {sub && <small id={`${id}-s`}>{sub}</small>}
      </div>
      <select id={`${id}-sel`} className="set-select" value={value} disabled={disabled} aria-describedby={sub ? `${id}-s` : undefined} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
