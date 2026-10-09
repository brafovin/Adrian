import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { StatusCanvas, ago, statusSnippet } from '../components/status/StatusCanvas';
import { StatusComposer } from '../components/status/StatusComposer';
import { StatusViewer } from '../components/status/StatusViewer';
import { EmptyState, ErrorBox, PaneHeader, Spinner } from '../components/ui';
import { formatRemaining } from '../lib/format';
import { useConnection } from '../realtime';
import { useSession } from '../store/session';
import { isLive, useStatus } from '../store/status';
import { confirmDialog, toast, toastError } from '../store/ui';
import { useTick } from '../lib/hooks';
import type { PublicUser, StatusGroup, StatusItem } from '../types';
import './status.css';

function Thumb({ s }: { s: StatusItem }) {
  return (
    <span className="st-thumb" aria-hidden="true">
      {s.kind === 'text' ? <StatusCanvas style={s.style} body={s.body} /> : s.media ? <img src={s.media.thumbUrl ?? s.media.url} alt="" loading="lazy" draggable={false} /> : null}
      {s.kind === 'video' && <span className="st-thumb-play"><Icon name="play" size={14} fill /></span>}
    </span>
  );
}

function GroupRow({ g, onOpen, active }: { g: StatusGroup; onOpen: () => void; active: boolean }) {
  const unseen = g.statuses.filter((s) => !s.viewed).length;
  const last = g.statuses[g.statuses.length - 1]!;
  const first = g.statuses[0]!;
  return (
    <li>
      <button className={`list-item st-row ${active ? 'active' : ''}`} onClick={onOpen} aria-label={`Status von ${g.user.displayName}, ${unseen ? `${unseen} neu` : 'gesehen'}`}>
        <Avatar name={g.user.displayName} src={g.user.avatarUrl} size={52} ring={unseen ? 'unseen' : 'seen'} />
        <span className="grow">
          <span className="title ellipsis st-name">{g.user.displayName}</span>
          <span className="sub"><span className="ellipsis">{g.statuses.length > 1 ? `${g.statuses.length} Status · ` : ''}{ago(last.publishedAt)}</span></span>
        </span>
        <span className="meta">{first.expiresAt ? formatRemaining(first.expiresAt) : ''}</span>
      </button>
    </li>
  );
}

function OwnItem({ s, onOpen }: { s: StatusItem; onOpen: () => void }) {
  async function remove() {
    const ok = await confirmDialog({ title: 'Status löschen?', message: 'Der Status wird sofort für alle entfernt.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try { await useStatus.getState().remove(s.id); toast('Status gelöscht', 'success'); } catch (e) { toastError(e); }
  }
  return (
    <li className="st-own-item">
      <button className="list-item" onClick={onOpen} aria-label={`Eigenen Status ansehen: ${statusSnippet(s)}`}>
        <Thumb s={s} />
        <span className="grow">
          <span className="title ellipsis">{statusSnippet(s)}</span>
          <span className="sub"><span className="ellipsis">{ago(s.publishedAt)}{s.expiresAt ? ` · ${formatRemaining(s.expiresAt)}` : ''}</span></span>
          <span className="sub st-stats">
            <span title="Aufrufe"><Icon name="eye" size={14} /> {s.viewCount ?? 0}</span>
            <span title="Reaktionen"><Icon name="heart" size={14} /> {s.reactionCount ?? 0}</span>
          </span>
        </span>
      </button>
      <button className="icon-btn" onClick={remove} aria-label={`Status löschen: ${statusSnippet(s)}`}><Icon name="trash" size={20} /></button>
    </li>
  );
}

function DraftItem({ s, onEdit }: { s: StatusItem; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);
  async function publish() {
    setBusy(true);
    try { await useStatus.getState().publish(s.id); toast('Status veröffentlicht – er ist 24 Stunden sichtbar.', 'success'); } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  async function remove() {
    const ok = await confirmDialog({ title: 'Entwurf löschen?', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try { await useStatus.getState().remove(s.id); toast('Entwurf gelöscht', 'success'); } catch (e) { toastError(e); }
  }
  return (
    <li className="st-own-item">
      <button className="list-item" onClick={onEdit} aria-label={`Entwurf bearbeiten: ${statusSnippet(s)}`}>
        <Thumb s={s} />
        <span className="grow">
          <span className="title ellipsis">{statusSnippet(s)}</span>
          <span className="sub">Entwurf · nur für dich</span>
        </span>
      </button>
      <button className="btn btn-primary btn-sm" onClick={publish} disabled={busy}>Veröffentlichen</button>
      <button className="icon-btn" onClick={remove} aria-label={`Entwurf löschen: ${statusSnippet(s)}`}><Icon name="trash" size={20} /></button>
    </li>
  );
}

type ComposerState = null | { draft?: StatusItem; mode?: 'text' | 'media' };

export function StatusScreen() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useSession((s) => s.me)!;
  const conn = useConnection((s) => s.state);
  const { groups, mine, loaded, mineLoaded, error } = useStatus();
  const [composer, setComposer] = useState<ComposerState>(null);
  const [startId, setStartId] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const queue = useRef<string[]>([]);
  useTick(30000);

  useEffect(() => { void useStatus.getState().loadAll().catch(() => {}); }, []);

  const live = useMemo(() => mine.filter((s) => isLive(s)), [mine]);
  const drafts = useMemo(() => mine.filter((s) => !s.publishedAt), [mine]);
  const unseenGroups = groups.filter((g) => g.statuses.some((s) => !s.viewed));
  const seenGroups = groups.filter((g) => g.statuses.every((s) => s.viewed));
  const ownUser = useMemo<PublicUser>(() => ({ id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl, bio: me.bio, online: true, lastSeenAt: null, isContact: false, blockedByMe: false }), [me]);

  const isOwnViewer = userId === me.id;
  const group = userId && !isOwnViewer ? groups.find((g) => g.user.id === userId) : undefined;
  const viewerStatuses = isOwnViewer ? live : group?.statuses;
  const viewerUser = isOwnViewer ? ownUser : group?.user;

  // Reihenfolge der Kontakte beim Öffnen merken, damit sie sich während der Wiedergabe nicht verschiebt
  if (!userId) queue.current = [];
  else if (!queue.current.includes(userId)) queue.current = isOwnViewer ? [me.id] : groups.map((g) => g.user.id);

  const dataReady = loaded && mineLoaded;
  useEffect(() => {
    if (userId && dataReady && !viewerStatuses?.length) navigate('/status', { replace: true });
  }, [userId, dataReady, viewerStatuses, navigate]);

  const close = () => { setStartId(undefined); navigate('/status'); };
  const exists = (id: string) => groups.some((g) => g.user.id === id);
  const go = (dir: 1 | -1) => {
    const i = queue.current.indexOf(userId!);
    const rest = dir === 1 ? queue.current.slice(i + 1) : queue.current.slice(0, i).reverse();
    const target = rest.find(exists);
    if (!target) { if (dir === 1) close(); return; }
    navigate(`/status/${target}`, { replace: true, state: { last: dir === -1 } });
  };
  const hasPrev = !!userId && queue.current.slice(0, Math.max(0, queue.current.indexOf(userId))).some(exists);

  const openOwn = (id?: string) => { setStartId(id); navigate(`/status/${me.id}`); };

  async function refresh() {
    setRefreshing(true);
    try { await useStatus.getState().loadAll(); } catch (e) { toastError(e); } finally { setRefreshing(false); }
  }

  const ownSub = live.length
    ? `${live.length} Status · ${live.reduce((n, s) => n + (s.viewCount ?? 0), 0)} Aufrufe`
    : 'Tippe auf +, um einen Status zu teilen';

  return (
    <div className="split st-split">
      <div className="pane-list">
        <PaneHeader title="Status" right={<button className="icon-btn" onClick={refresh} disabled={refreshing} aria-label="Status aktualisieren"><Icon name="refresh" /></button>} />
        {conn === 'offline' && <div className="conn-banner" role="status">Keine Verbindung – verbinde neu…</div>}
        <div className="pane-body">
          <h2 className="section-title">Mein Status</h2>
          <ul className="list" aria-label="Mein Status">
            <li className="st-own-item st-mine">
              <button className="list-item" onClick={() => (live.length ? openOwn() : setComposer({}))} aria-label={live.length ? 'Meinen Status ansehen' : 'Mein Status – neuen Status erstellen'}>
                <Avatar name={me.displayName} src={me.avatarUrl} size={52} ring={live.length ? 'unseen' : null} />
                <span className="grow">
                  <span className="title">Mein Status</span>
                  <span className="sub"><span className="ellipsis">{ownSub}</span></span>
                </span>
              </button>
              <button className="icon-btn accent" onClick={() => setComposer({})} aria-label="Status erstellen"><Icon name="plus" /></button>
            </li>
            {live.map((s) => <OwnItem key={s.id} s={s} onOpen={() => openOwn(s.id)} />)}
          </ul>
          {drafts.length > 0 && (
            <>
              <h2 className="section-title">Entwürfe</h2>
              <ul className="list" aria-label="Entwürfe">{drafts.map((s) => <DraftItem key={s.id} s={s} onEdit={() => setComposer({ draft: s })} />)}</ul>
            </>
          )}

          {!loaded ? (
            <div className="st-center"><Spinner size={30} /></div>
          ) : error && !groups.length ? (
            <ErrorBox message={error} onRetry={refresh} />
          ) : groups.length === 0 ? (
            <EmptyState icon="status" title="Keine neuen Status">Sobald deine Kontakte einen Status teilen, siehst du ihn hier. Status verschwinden nach 24 Stunden.</EmptyState>
          ) : (
            <>
              {error && <ErrorBox message={error} onRetry={refresh} />}
              {unseenGroups.length > 0 && (
                <>
                  <h2 className="section-title">Neu</h2>
                  <ul className="list" aria-label="Neue Status">{unseenGroups.map((g) => <GroupRow key={g.user.id} g={g} active={g.user.id === userId} onOpen={() => navigate(`/status/${g.user.id}`)} />)}</ul>
                </>
              )}
              {seenGroups.length > 0 && (
                <>
                  <h2 className="section-title">Gesehen</h2>
                  <ul className="list" aria-label="Gesehene Status">{seenGroups.map((g) => <GroupRow key={g.user.id} g={g} active={g.user.id === userId} onOpen={() => navigate(`/status/${g.user.id}`)} />)}</ul>
                </>
              )}
            </>
          )}
        </div>
        <button className="fab" onClick={() => setComposer({ mode: 'media' })} aria-label="Foto oder Video teilen"><Icon name="camera" size={26} /></button>
      </div>
      <div className="pane-detail">
        <div className="placeholder-pane">
          <EmptyState icon="status" title="Status">Wähle links einen Status aus. Neue Status von Kontakten erscheinen hier live.</EmptyState>
        </div>
      </div>

      {userId && viewerUser && viewerStatuses && viewerStatuses.length > 0 && (
        <StatusViewer
          key={userId}
          user={viewerUser}
          statuses={viewerStatuses}
          own={isOwnViewer}
          start={isOwnViewer ? { id: startId } : (location.state as { last?: boolean } | null)?.last ? { last: true } : undefined}
          hasPrevUser={hasPrev}
          onClose={close}
          onNextUser={() => go(1)}
          onPrevUser={() => go(-1)}
        />
      )}
      {composer && <StatusComposer draft={composer.draft} initialMode={composer.mode} onClose={() => setComposer(null)} />}
    </div>
  );
}
