import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, PaneHeader, Spinner } from '../components/ui';
import { del, errorMessage, get } from '../api';
import { formatDuration, formatListTime } from '../lib/format';
import { realtime, useConnection } from '../realtime';
import { markCallsSeen, startCall } from '../store/calls';
import { confirmDialog, toast, toastError } from '../store/ui';
import type { CallRecord } from '../types';
import './calls.css';

const PAGE = 50;

/** Ausführliche Beschreibung (Screenreader). */
function describe(c: CallRecord): string {
  const kind = c.kind === 'video' ? 'Videoanruf' : 'Sprachanruf';
  if (c.missed) return `Verpasster ${kind}`;
  if (c.direction === 'outgoing') return c.durationSeconds > 0 ? `Ausgehender ${kind}` : c.state === 'declined' ? `${kind} abgelehnt` : `${kind} nicht angenommen`;
  return c.state === 'declined' ? `Abgelehnter ${kind}` : `Eingehender ${kind}`;
}
/** Kurzfassung für die Liste: Richtung/Ergebnis und Art. */
function short(c: CallRecord): string {
  const kind = c.kind === 'video' ? 'Video' : 'Sprache';
  if (c.missed) return `Verpasst · ${kind}`;
  if (c.direction === 'outgoing') return `${c.durationSeconds > 0 ? 'Ausgehend' : c.state === 'declined' ? 'Abgelehnt' : 'Keine Antwort'} · ${kind}`;
  return `${c.state === 'declined' ? 'Abgelehnt' : 'Eingehend'} · ${kind}`;
}

function CallRow({ c, onOpen }: { c: CallRecord; onOpen: () => void }) {
  const name = c.peer?.displayName ?? 'Gelöschter Benutzer';
  const icon = c.direction === 'incoming' ? 'phone-in' : 'phone-out';
  return (
    <li className={`list-item call-row ${c.missed ? 'missed' : ''}`} style={{ padding: 0 }}>
      <button className="call-main" onClick={onOpen} disabled={!c.peer} aria-label={`${name} – ${describe(c)}, ${formatListTime(c.createdAt)}. Kontakt öffnen`}>
        <Avatar name={name} src={c.peer?.avatarUrl} size={48} />
        <span className="grow">
          <span className="title ellipsis" style={{ display: 'block' }}>{name}</span>
          <span className="sub">
            <span className="dir"><Icon name={icon} size={15} /></span>
            <span className="ellipsis">{short(c)}</span>
          </span>
        </span>
        <span className="meta"><time dateTime={c.createdAt}>{formatListTime(c.createdAt)}</time>{c.durationSeconds > 0 && <span className="dur" aria-label={`Dauer ${formatDuration(c.durationSeconds)}`}>{formatDuration(c.durationSeconds)}</span>}</span>
      </button>
      {c.peer && (
        <div className="call-actions">
          <button className="icon-btn" onClick={() => startCall(c.peer!, 'audio')} aria-label={`${name} per Sprachanruf zurückrufen`}><Icon name="phone" size={21} /></button>
          <button className="icon-btn" onClick={() => startCall(c.peer!, 'video')} aria-label={`${name} per Videoanruf zurückrufen`}><Icon name="video" size={21} /></button>
        </div>
      )}
    </li>
  );
}

export function CallsScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const conn = useConnection((s) => s.state);
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const { calls: list } = await get<{ calls: CallRecord[] }>(`/api/calls?limit=${PAGE}`);
      if (my !== seq.current) return;
      setCalls(list);
      setHasMore(list.length >= PAGE);
      setError(null);
      markCallsSeen(list[0]?.createdAt);
    } catch (e) {
      if (my === seq.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
    markCallsSeen();
    // Live: nach jedem beendeten/verpassten Anruf und nach Wiederverbinden neu laden
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void load(), 250); };
    const offs = [realtime.on('call.ended', refresh), realtime.on('call.missed', refresh), realtime.on('resync', refresh)];
    return () => { offs.forEach((f) => f()); clearTimeout(timer); seq.current++; markCallsSeen(); };
  }, [load]);

  // Aufruf aus einer Push-Benachrichtigung: `/calls?incoming=<id>` – das Overlay erscheint über das Ereignis `call.incoming`.
  useEffect(() => {
    if (params.has('incoming')) {
      const next = new URLSearchParams(params);
      next.delete('incoming');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  async function loadMore() {
    if (!calls?.length) return;
    setLoadingMore(true);
    try {
      const before = encodeURIComponent(calls[calls.length - 1]!.createdAt);
      const { calls: more } = await get<{ calls: CallRecord[] }>(`/api/calls?limit=${PAGE}&before=${before}`);
      setCalls((cur) => [...(cur ?? []), ...more.filter((m) => !(cur ?? []).some((x) => x.id === m.id))]);
      setHasMore(more.length >= PAGE);
    } catch (e) {
      toastError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  async function clearAll() {
    const ok = await confirmDialog({ title: 'Anrufverlauf löschen?', message: 'Alle beendeten Anrufe werden aus deinem Verlauf entfernt. Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Verlauf löschen', danger: true });
    if (!ok) return;
    try {
      await del('/api/calls');
      setCalls([]);
      setHasMore(false);
      toast('Anrufverlauf gelöscht', 'success');
    } catch (e) {
      toastError(e);
    }
  }

  const shown = (calls ?? []).filter((c) => !onlyMissed || c.missed);

  return (
    <div className="split no-detail-pane">
      <div className="pane-list">
        <PaneHeader title="Anrufe" right={
          <button className="icon-btn" onClick={() => void clearAll()} disabled={!calls?.length} aria-label="Verlauf löschen"><Icon name="trash" /></button>
        } />
        {conn === 'offline' && <div className="conn-banner" role="status">Keine Verbindung – verbinde neu…</div>}
        {!!calls?.length && (
          <div className="call-filter">
            <div className="segmented" role="group" aria-label="Filter">
              <button aria-pressed={!onlyMissed} onClick={() => setOnlyMissed(false)}>Alle</button>
              <button aria-pressed={onlyMissed} onClick={() => setOnlyMissed(true)}>Verpasste</button>
            </div>
          </div>
        )}
        <div className="pane-body">
          {error && !calls ? <ErrorBox message={error} onRetry={() => void load()} /> : calls === null ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner size={30} /></div>
          ) : shown.length === 0 ? (
            <EmptyState icon="phone" title={onlyMissed && calls.length ? 'Keine verpassten Anrufe' : 'Noch keine Anrufe'}>
              {onlyMissed && calls.length ? '' : 'Starte einen Sprach- oder Videoanruf über den Chat mit einem Kontakt.'}
            </EmptyState>
          ) : (
            <ul className="list" aria-label="Anrufverlauf">
              {shown.map((c) => <CallRow key={c.id} c={c} onOpen={() => navigate(`/contacts/${c.peer!.id}`)} />)}
            </ul>
          )}
          {hasMore && !onlyMissed && calls && (
            <div className="call-more"><button className="btn btn-ghost" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Lädt…' : 'Ältere Anrufe laden'}</button></div>
          )}
        </div>
      </div>
    </div>
  );
}
