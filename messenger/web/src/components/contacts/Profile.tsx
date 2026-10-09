import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage, get } from '../../api';
import { formatLastSeen } from '../../lib/format';
import { realtime } from '../../realtime';
import { useContacts } from '../../store/contacts';
import { usePeerPresence } from '../../store/presence';
import type { UserWithRelation } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { EmptyState, ErrorBox, PaneHeader, Spinner } from '../ui';
import {
  acceptFrom, blockUser, callUser, copyProfileLink, declineFrom, openDirectChat, removeContact, requestContact, unblockUser, withdrawTo,
} from './actions';
import { ReportDialog } from './ReportDialog';

type Load = { status: 'loading' } | { status: 'ok'; user: UserWithRelation } | { status: 'notfound' } | { status: 'error'; message: string };

/** Lädt ein Profil (UUID oder @Benutzername) und aktualisiert es live bei Änderungen. */
function useProfile(key: string) {
  const [state, setState] = useState<Load>({ status: 'loading' });
  const seq = useRef(0);
  const load = useCallback(async (silent = false) => {
    const mine = ++seq.current;
    if (!silent) setState({ status: 'loading' });
    try {
      const { user } = await get<{ user: UserWithRelation }>(`/api/users/${encodeURIComponent(key)}`);
      if (mine === seq.current) setState({ status: 'ok', user });
    } catch (e) {
      if (mine !== seq.current) return;
      if (e instanceof ApiError && e.status === 404) setState({ status: 'notfound' });
      else if (silent) return; // bei einem Hintergrund-Reload den vorhandenen Stand behalten
      else setState({ status: 'error', message: errorMessage(e) });
    }
  }, [key]);

  useEffect(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(true), 150);
    };
    const offs = [realtime.on('contacts.changed', reload), realtime.on('profile.updated', reload)];
    return () => {
      if (t) clearTimeout(t);
      seq.current++;
      offs.forEach((f) => f());
    };
  }, [load]);
  return { state, reload: () => load(true), retry: () => load(false) };
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="ct-section">
      {title && <h2 className="section-title">{title}</h2>}
      {children}
    </section>
  );
}

export function ProfilePane({ userKey }: { userKey: string }) {
  const navigate = useNavigate();
  const { state, reload, retry } = useProfile(userKey);
  const blocked = useContacts((s) => s.blocked);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState(false);

  useEffect(() => {
    void useContacts.getState().loadBlocked().catch(() => {});
  }, [userKey]);

  const bare = userKey.replace(/^@/, '');
  const blockedEntry = blocked.find((b) => b.id === userKey || b.username.toLowerCase() === bare.toLowerCase());

  const back = (
    <button className="icon-btn back-btn mobile-only" onClick={() => navigate('/contacts')} aria-label="Zurück zu den Kontakten"><Icon name="back" size={24} /></button>
  );
  const shell = (body: ReactNode, title = 'Profil') => (
    <section className="ct-profile" aria-label="Profil">
      <PaneHeader title={title} left={back} />
      <div className="pane-body">{body}</div>
    </section>
  );

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
    await reload();
  }

  if (state.status === 'loading') return shell(<div className="ct-center"><Spinner size={32} /></div>);
  if (state.status === 'error') return shell(<ErrorBox message={state.message} onRetry={() => void retry()} />);

  if (state.status === 'notfound') {
    if (blockedEntry) {
      return shell(
        <div className="ct-narrow">
          <div className="ct-hero">
            <Avatar name={blockedEntry.displayName} src={blockedEntry.avatarUrl} size={96} />
            <h2>{blockedEntry.displayName}</h2>
            <p className="muted-text">@{blockedEntry.username}</p>
          </div>
          <div className="ct-notice" role="status"><Icon name="ban" size={20} /><span>Du hast diese Person blockiert. Sie kann dich nicht finden, dir nicht schreiben und dich nicht anrufen.</span></div>
          <button className="btn btn-primary btn-block" disabled={busy === 'unblock'} onClick={() => void act('unblock', () => unblockUser(blockedEntry))}><Icon name="user-check" size={18} />Entblocken</button>
        </div>,
      );
    }
    return shell(
      <EmptyState icon="user-x" title="Profil nicht verfügbar"
        action={<button className="btn btn-secondary" onClick={() => navigate('/contacts')}>Zu den Kontakten</button>}>
        Diese Person wurde nicht gefunden. Sie existiert nicht, hat ihre Auffindbarkeit eingeschränkt oder ist für dich nicht sichtbar.
      </EmptyState>,
    );
  }

  const u = state.user;
  return (
    <>
      {shell(<ProfileBody u={u} busy={busy} act={act} onReport={() => setReport(true)} />, u.displayName)}
      {report && <ReportDialog user={u} onClose={() => setReport(false)} />}
    </>
  );
}

function ProfileBody({ u, busy, act, onReport }: { u: UserWithRelation; busy: string | null; act: (k: string, fn: () => Promise<unknown>) => Promise<void>; onReport: () => void }) {
  const navigate = useNavigate();
  const presence = usePeerPresence(u);
  const self = u.relation === 'self';
  const canWrite = !self;
  const presenceLine =
    presence.online === true ? <span className="ct-online">online</span>
    : presence.lastSeenAt ? <span>{formatLastSeen(presence.lastSeenAt)}</span>
    : presence.online === false ? <span>offline</span>
    : null;

  return (
    <div className="ct-narrow">
      <div className="ct-hero">
        <Avatar name={u.displayName} src={u.avatarUrl} size={112} online={presence.online} />
        <h2>{u.displayName}</h2>
        <p className="ct-handle">@{u.username}</p>
        {presenceLine && <p className="ct-presence" aria-live="polite">{presenceLine}</p>}
        {u.relation === 'contact' && <span className="ct-pill"><Icon name="user-check" size={14} />Kontakt</span>}
        {u.bio && <p className="ct-bio">{u.bio}</p>}
      </div>

      {self ? (
        <div className="ct-notice" role="status">
          <Icon name="user" size={20} />
          <span>Das bist du. <Link to="/settings">Profil in den Einstellungen bearbeiten</Link></span>
        </div>
      ) : (
        <>
          <div className="ct-quick" role="group" aria-label="Aktionen">
            <button className="ct-quick-btn" onClick={() => void act('chat', () => openDirectChat(u.id, navigate))} disabled={busy === 'chat'}>
              <span className="ico"><Icon name="chat" size={22} /></span>Schreiben
            </button>
            {u.canCall && (
              <>
                <button className="ct-quick-btn" onClick={() => callUser(u, 'audio')}>
                  <span className="ico"><Icon name="phone" size={22} /></span>Sprachanruf
                </button>
                <button className="ct-quick-btn" onClick={() => callUser(u, 'video')}>
                  <span className="ico"><Icon name="video" size={22} /></span>Videoanruf
                </button>
              </>
            )}
          </div>

          {u.relation === 'none' && (
            u.canRequest ? (
              <button className="btn btn-primary btn-block" disabled={busy === 'request'} onClick={() => void act('request', () => requestContact(u))}>
                <Icon name="user-plus" size={18} />Kontakt hinzufügen
              </button>
            ) : (
              <div className="ct-notice" role="status"><Icon name="info" size={20} /><span>Diese Person nimmt keine Kontaktanfragen an.</span></div>
            )
          )}
          {u.relation === 'pending_out' && (
            <div className="ct-request" role="group" aria-label="Offene Anfrage">
              <span className="ct-request-text"><Icon name="clock" size={18} />Anfrage gesendet – wartet auf Antwort</span>
              <button className="btn btn-secondary btn-sm" disabled={busy === 'withdraw'} onClick={() => void act('withdraw', () => withdrawTo(u))}>Anfrage zurückziehen</button>
            </div>
          )}
          {u.relation === 'pending_in' && (
            <div className="ct-request" role="group" aria-label="Eingehende Anfrage">
              <span className="ct-request-text"><Icon name="user-plus" size={18} />{u.displayName} möchte dein Kontakt sein</span>
              <div className="ct-request-actions">
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void act('accept', () => acceptFrom(u))}>Annehmen</button>
                <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => void act('decline', () => declineFrom(u))}>Ablehnen</button>
              </div>
            </div>
          )}
        </>
      )}

      {u.sharedGroups && (
        <Section title={`Gemeinsame Gruppen${u.sharedGroups.length ? ` (${u.sharedGroups.length})` : ''}`}>
          {u.sharedGroups.length ? (
            <div className="settings-group">
              {u.sharedGroups.map((g) => (
                <button key={g.id} className="settings-row" onClick={() => navigate(`/chats/${g.id}`)}>
                  <span className="icon-wrap"><Icon name="users" size={18} /></span>
                  <span className="label">{g.title}</span>
                  <Icon name="forward" size={18} style={{ color: 'var(--text-faint)' }} />
                </button>
              ))}
            </div>
          ) : (
            <p className="ct-hint left">Keine gemeinsamen Gruppen.</p>
          )}
        </Section>
      )}

      <Section>
        <div className="settings-group">
          <button className="settings-row" onClick={() => void copyProfileLink(u.username)}>
            <span className="icon-wrap"><Icon name="link" size={18} /></span><span className="label">Profil-Link kopieren</span>
          </button>
          {canWrite && u.relation === 'contact' && (
            <button className="settings-row ct-danger" disabled={busy === 'remove'} onClick={() => void act('remove', () => removeContact(u))}>
              <span className="icon-wrap"><Icon name="user-x" size={18} /></span><span className="label">Kontakt entfernen</span>
            </button>
          )}
          {canWrite && (
            <>
              <button className="settings-row ct-danger" disabled={busy === 'block'} onClick={() => void act('block', () => (u.blockedByMe ? unblockUser(u) : blockUser(u)))}>
                <span className="icon-wrap"><Icon name="ban" size={18} /></span><span className="label">{u.blockedByMe ? 'Entblocken' : 'Blockieren'}</span>
              </button>
              <button className="settings-row ct-danger" onClick={onReport}>
                <span className="icon-wrap"><Icon name="flag" size={18} /></span><span className="label">Melden</span>
              </button>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
