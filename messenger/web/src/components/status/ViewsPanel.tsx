import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api';
import { formatListTime } from '../../lib/format';
import { useStatus } from '../../store/status';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { ErrorBox, Spinner } from '../ui';

/** Aufrufer und Reaktionen eines eigenen Status. */
export function ViewsPanel({ statusId, onClose }: { statusId: string; onClose: () => void }) {
  const data = useStatus((s) => s.views[statusId]);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = () => {
    setError(null);
    useStatus.getState().loadViews(statusId).catch((e) => setError(errorMessage(e)));
  };
  // Beim Öffnen und nach Änderungen (Ereignis setzt den Cache zurück) neu laden
  useEffect(() => { if (!data) load(); }, [statusId, data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <>
    <div className="sv-scrim" onClick={onClose} aria-hidden="true" />
    <section className="sv-panel" role="region" aria-label="Aufrufe und Reaktionen">
      <header className="sv-panel-head">
        <h2>Aufrufe</h2>
        <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Aufrufe schließen"><Icon name="x" /></button>
      </header>
      <div className="sv-panel-body">
        {error ? <ErrorBox message={error} onRetry={load} /> : !data ? (
          <div className="st-center"><Spinner size={28} /></div>
        ) : data.hidden ? (
          <div className="sv-note" role="note">
            <Icon name="eye-off" size={26} />
            <p><b>Lesebestätigungen sind deaktiviert.</b></p>
            <p>Wenn du Lesebestätigungen ausgeschaltet hast, siehst du nicht, wer deinen Status angesehen hat – und andere sehen deine Aufrufe ebenfalls nicht. Du kannst das in den Datenschutz-Einstellungen unter „Profil“ ändern.</p>
          </div>
        ) : (
          <>
            <h3 className="sv-sub">Reaktionen ({data.reactions.length})</h3>
            {data.reactions.length === 0 ? <p className="sv-empty">Noch keine Reaktionen.</p> : (
              <ul className="list" aria-label="Reaktionen">
                {data.reactions.map((r) => (
                  <li key={r.user.id} className="sv-person">
                    <Avatar name={r.user.displayName} src={r.user.avatarUrl} size={40} />
                    <span className="grow"><b className="ellipsis">{r.user.displayName}</b><small>{formatListTime(r.createdAt)}</small></span>
                    <span className="sv-react-emoji" aria-label={`Reaktion ${r.emoji}`}>{r.emoji}</span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="sv-sub">Aufrufe ({data.views.length})</h3>
            {data.views.length === 0 ? <p className="sv-empty">Noch niemand hat deinen Status angesehen.</p> : (
              <ul className="list" aria-label="Aufrufer">
                {data.views.map((v) => (
                  <li key={v.user.id} className="sv-person">
                    <Avatar name={v.user.displayName} src={v.user.avatarUrl} size={40} />
                    <span className="grow"><b className="ellipsis">{v.user.displayName}</b><small>{formatListTime(v.viewedAt)}</small></span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
    </>
  );
}
