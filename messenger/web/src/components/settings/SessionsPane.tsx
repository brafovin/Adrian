import { useCallback, useEffect, useState } from 'react';
import { del, errorMessage, get, post } from '../../api';
import { useSession } from '../../store/session';
import { confirmDialog, toast, toastError } from '../../store/ui';
import { Icon } from '../Icon';
import { ErrorBox, Spinner } from '../ui';
import { formatDateTime, Group, PaneShell } from './parts';

interface SessionInfo {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

const deviceIcon = (s: SessionInfo) => (/Android|iPhone|iPad|iOS/i.test(`${s.deviceName} ${s.userAgent}`) ? 'device' : 'globe');

export function SessionsPane({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await get<{ sessions: SessionInfo[] }>('/api/me/sessions');
      setSessions(r.sessions);
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const others = (sessions ?? []).filter((s) => !s.current);

  async function end(s: SessionInfo) {
    if (!(await confirmDialog({ title: 'Gerät abmelden?', message: `„${s.deviceName ?? 'Unbekanntes Gerät'}“ wird sofort abgemeldet.`, confirmLabel: 'Abmelden', danger: true }))) return;
    setBusy(s.id);
    try { await del(`/api/me/sessions/${s.id}`); toast('Gerät abgemeldet', 'success'); await load(); } catch (e) { toastError(e); } finally { setBusy(null); }
  }

  async function endOthers() {
    if (!(await confirmDialog({ title: 'Alle anderen Geräte abmelden?', message: `${others.length} ${others.length === 1 ? 'Gerät wird' : 'Geräte werden'} abgemeldet. Dieses Gerät bleibt angemeldet.`, confirmLabel: 'Abmelden', danger: true }))) return;
    setBusy('others');
    try {
      const results = await Promise.allSettled(others.map((s) => del(`/api/me/sessions/${s.id}`)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) toast(`${failed} Gerät(e) konnten nicht abgemeldet werden.`, 'error'); else toast('Alle anderen Geräte wurden abgemeldet', 'success');
      await load();
    } finally { setBusy(null); }
  }

  async function logoutAll() {
    if (!(await confirmDialog({ title: 'Überall abmelden?', message: 'Du wirst auf allen Geräten abgemeldet – auch auf diesem – und musst dich neu anmelden.', confirmLabel: 'Überall abmelden', danger: true }))) return;
    setBusy('all');
    try {
      await post('/api/auth/logout-all');
      useSession.getState().reset();
    } catch (e) { toastError(e); setBusy(null); }
  }

  return (
    <PaneShell title="Geräte & Sitzungen" onBack={onBack}>
      <p className="set-lead"><Icon name="shield" size={18} /><span>Hier siehst du alle Geräte, auf denen du angemeldet bist. Erkennst du eines nicht, melde es ab und ändere dein Passwort.</span></p>
      {error && <ErrorBox message={error} onRetry={() => void load()} />}
      {!sessions && !error && <div className="set-loading"><Spinner size={28} /></div>}
      {sessions && (
        <Group title="Angemeldete Geräte">
          {sessions.map((s) => (
            <div className="settings-row" key={s.id} data-session={s.id} data-current={s.current || undefined}>
              <span className="icon-wrap"><Icon name={deviceIcon(s)} size={18} /></span>
              <div className="label">
                <span>{s.deviceName ?? 'Unbekanntes Gerät'} {s.current && <span className="set-pill ok">Dieses Gerät</span>}</span>
                <small>{s.current ? 'Jetzt aktiv' : `Zuletzt aktiv ${formatDateTime(s.lastUsedAt)}`} · angemeldet {formatDateTime(s.createdAt)}{s.ip ? ` · ${s.ip}` : ''}</small>
              </div>
              {!s.current && <button className="btn btn-ghost btn-sm btn-text-danger" onClick={() => void end(s)} disabled={busy !== null} aria-label={`${s.deviceName ?? 'Gerät'} abmelden`}>Beenden</button>}
            </div>
          ))}
        </Group>
      )}
      {sessions && (
        <Group>
          {others.length > 0 && (
            <button className="settings-row" onClick={() => void endOthers()} disabled={busy !== null}>
              <span className="icon-wrap"><Icon name="device" size={18} /></span>
              <span className="label">Alle anderen Geräte abmelden<small>Dieses Gerät bleibt angemeldet.</small></span>
            </button>
          )}
          <button className="settings-row set-danger" onClick={() => void logoutAll()} disabled={busy !== null}>
            <span className="icon-wrap"><Icon name="logout" size={18} /></span>
            <span className="label">Überall abmelden<small>Meldet dich auf allen Geräten ab, auch auf diesem.</small></span>
          </button>
        </Group>
      )}
    </PaneShell>
  );
}
