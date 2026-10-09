import { useState } from 'react';
import { closeSheet, useConfirm, useSheet, useToasts } from '../store/ui';
import { Icon } from './Icon';
import { Modal } from './Modal';

export function ToastHost() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button className="toast-action" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Schließen"><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const cur = useConfirm((s) => s.current);
  const [value, setValue] = useState('');
  if (!cur) return null;
  const done = (v: string | boolean) => { useConfirm.setState({ current: null }); setValue(''); cur.resolve(v); };
  return (
    <Modal title={cur.title} onClose={() => done(false)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => done(false)}>{cur.cancelLabel ?? 'Abbrechen'}</button>
          <button className={`btn ${cur.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!!cur.input && !value} onClick={() => done(cur.input ? value : true)}>
            {cur.confirmLabel ?? 'OK'}
          </button>
        </>
      }>
      {cur.message && <p className="muted-text">{cur.message}</p>}
      {cur.input && (
        <label className="field">
          <span>{cur.input.label}</span>
          <input autoFocus type={cur.input.type ?? 'text'} value={value} placeholder={cur.input.placeholder} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value) done(value); }} />
        </label>
      )}
    </Modal>
  );
}

export function SheetHost() {
  const { items, title, emojis, onEmoji } = useSheet();
  if (!items) return null;
  return (
    <Modal title={title} onClose={closeSheet} className="action-sheet">
      {emojis && (
        <div className="emoji-quick">
          {emojis.map((e) => (
            <button key={e} className="emoji-btn" onClick={() => { closeSheet(); onEmoji?.(e); }} aria-label={`Reaktion ${e}`}>{e}</button>
          ))}
        </div>
      )}
      <ul className="sheet-list">
        {items.map((it) => (
          <li key={it.label}>
            <button className={`sheet-item ${it.danger ? 'danger' : ''}`} onClick={async () => { closeSheet(); await it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={20} />}
              <span>{it.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
