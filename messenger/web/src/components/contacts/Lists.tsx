import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContacts, type ContactUser, type RequestItem } from '../../store/contacts';
import { usePeerPresence } from '../../store/presence';
import { formatLastSeen } from '../../lib/format';
import type { PublicUser, Relation, UserWithRelation } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { EmptyState, ErrorBox, Spinner } from '../ui';
import { acceptFrom, callUser, declineFrom, openDirectChat, requestContact, withdrawTo } from './actions';
import { MIN_QUERY, consumeSearchFocus, gotoSearch, useContactsUi, type ContactsTab } from './state';

/* ---------- Tabs ---------- */

const TABS: { id: ContactsTab; label: string }[] = [
  { id: 'contacts', label: 'Kontakte' },
  { id: 'requests', label: 'Anfragen' },
  { id: 'search', label: 'Suchen' },
];

export function ContactTabs({ tab, onChange, badge }: { tab: ContactsTab; onChange: (t: ContactsTab) => void; badge: number }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const id = TABS[next]!.id;
    onChange(id);
    refs.current[id]?.focus();
  }
  return (
    <div className="ct-tabs" role="tablist" aria-label="Kontaktbereiche" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[t.id] = el; }}
          role="tab"
          id={`ct-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`ct-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className={`ct-tab ${tab === t.id ? 'on' : ''}`}
          onClick={(e) => (t.id === 'search' && e.detail > 0 ? gotoSearch() : onChange(t.id))}
        >
          {t.label}
          {t.id === 'requests' && badge > 0 && <span className="badge" aria-label={`${badge} eingehende Anfragen`}>{badge > 99 ? '99+' : badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: ContactsTab; children: ReactNode }) {
  return <div role="tabpanel" id={`ct-panel-${id}`} aria-labelledby={`ct-tab-${id}`} className="ct-panel">{children}</div>;
}

/* ---------- Gemeinsame Zeile ---------- */

function PresenceText({ user }: { user: PublicUser }) {
  const p = usePeerPresence(user);
  if (p.online === true) return <span className="ct-online">online</span>;
  if (p.lastSeenAt) return <span>{formatLastSeen(p.lastSeenAt)}</span>;
  return <span>@{user.username}</span>;
}

function Row({ user, active, onOpen, children, sub, stack }: { user: PublicUser; active: boolean; onOpen: () => void; children?: ReactNode; sub?: ReactNode; stack?: boolean }) {
  const p = usePeerPresence(user);
  return (
    <li className={`ct-row ${active ? 'active' : ''} ${stack ? 'stack' : ''}`}>
      <button className="ct-row-main" onClick={onOpen} aria-current={active ? 'true' : undefined} aria-label={`Profil von ${user.displayName} öffnen`}>
        <Avatar name={user.displayName} src={user.avatarUrl} size={48} online={p.online} />
        <span className="grow">
          <span className="ct-name ellipsis">{user.displayName}</span>
          <span className="ct-sub ellipsis">{sub ?? <PresenceText user={user} />}</span>
        </span>
      </button>
      {children && <div className="ct-row-actions">{children}</div>}
    </li>
  );
}

const handleOf = (u: PublicUser) => `/contacts/${u.id}`;

/* ---------- Kontakte ---------- */

export function ContactsPanel({ activeKey }: { activeKey?: string }) {
  const navigate = useNavigate();
  const contacts = useContacts((s) => s.contacts);
  const loaded = useContacts((s) => s.loaded);
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase().replace(/^@/, '');
    const list = contacts
      .filter((c) => !term || c.displayName.toLowerCase().includes(term) || c.username.toLowerCase().includes(term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' }));
    const map = new Map<string, ContactUser[]>();
    for (const c of list) {
      const letter = c.displayName.trim().charAt(0).toLocaleUpperCase('de');
      const key = /\p{L}/u.test(letter) ? letter : '#';
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [contacts, filter]);

  if (!loaded) return <div className="ct-center"><Spinner size={30} /></div>;
  if (!contacts.length) {
    return (
      <EmptyState icon="users" title="Noch keine Kontakte"
        action={<button className="btn btn-primary" onClick={() => gotoSearch()}><Icon name="search" size={18} />Personen suchen</button>}>
        Suche nach einem @Benutzernamen oder Namen und sende eine Kontaktanfrage.
      </EmptyState>
    );
  }
  return (
    <>
      <label className="search-box"><Icon name="search" size={18} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Kontakte filtern" aria-label="Kontakte filtern" />
      </label>
      {!groups.length && <EmptyState icon="search" title="Keine Treffer">Kein Kontakt passt zu „{filter}“.</EmptyState>}
      {groups.map(([letter, items]) => (
        <section key={letter} aria-label={`Kontakte mit ${letter}`}>
          <h2 className="section-title">{letter}</h2>
          <ul className="list">
            {items.map((c) => (
              <Row key={c.id} user={c} active={activeKey === c.id || activeKey?.replace(/^@/, '') === c.username} onOpen={() => navigate(handleOf(c))}>
                <button className="icon-btn" aria-label={`Chat mit ${c.displayName}`} title="Schreiben" onClick={() => void openDirectChat(c.id, navigate)}><Icon name="chat" size={20} /></button>
                <button className="icon-btn" aria-label={`${c.displayName} anrufen`} title="Anrufen" onClick={() => callUser(c, 'audio')}><Icon name="phone" size={20} /></button>
              </Row>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ---------- Anfragen ---------- */

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };
  return { busy, run };
}

export function RequestsPanel({ activeKey }: { activeKey?: string }) {
  const navigate = useNavigate();
  const incoming = useContacts((s) => s.incoming);
  const outgoing = useContacts((s) => s.outgoing);
  const loaded = useContacts((s) => s.loaded);
  const { busy, run } = useBusy();

  if (!loaded) return <div className="ct-center"><Spinner size={30} /></div>;
  if (!incoming.length && !outgoing.length) {
    return (
      <EmptyState icon="user-plus" title="Keine offenen Anfragen"
        action={<button className="btn btn-secondary" onClick={() => gotoSearch()}>Personen suchen</button>}>
        Neue Kontaktanfragen erscheinen hier sofort.
      </EmptyState>
    );
  }
  const isActive = (u: PublicUser) => activeKey === u.id || activeKey?.replace(/^@/, '') === u.username;
  const sub = (r: RequestItem) => `@${r.user.username}`;
  return (
    <>
      {incoming.length > 0 && (
        <section aria-label="Eingehende Anfragen">
          <h2 className="section-title">Eingehend ({incoming.length})</h2>
          <ul className="list">
            {incoming.map((r) => (
              <Row key={r.id} stack user={r.user} sub={sub(r)} active={isActive(r.user)} onOpen={() => navigate(handleOf(r.user))}>
                <button className="btn btn-primary btn-sm" disabled={busy === r.id} aria-label={`Anfrage von ${r.user.displayName} annehmen`}
                  onClick={() => void run(r.id, () => acceptFrom(r.user))}>Annehmen</button>
                <button className="btn btn-secondary btn-sm" disabled={busy === r.id} aria-label={`Anfrage von ${r.user.displayName} ablehnen`}
                  onClick={() => void run(r.id, () => declineFrom(r.user))}>Ablehnen</button>
              </Row>
            ))}
          </ul>
        </section>
      )}
      {outgoing.length > 0 && (
        <section aria-label="Gesendete Anfragen">
          <h2 className="section-title">Gesendet ({outgoing.length})</h2>
          <ul className="list">
            {outgoing.map((r) => (
              <Row key={r.id} stack user={r.user} sub={`@${r.user.username} · wartet auf Antwort`} active={isActive(r.user)} onOpen={() => navigate(handleOf(r.user))}>
                <button className="btn btn-secondary btn-sm" disabled={busy === r.id} aria-label={`Anfrage an ${r.user.displayName} zurückziehen`}
                  onClick={() => void run(r.id, () => withdrawTo(r.user))}>Zurückziehen</button>
              </Row>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------- Suche ---------- */

/** Beziehung unter Berücksichtigung des aktuellen Store-Zustands (Suchergebnisse können veraltet sein). */
function useEffectiveRelation(u: UserWithRelation): Relation {
  const isContact = useContacts((s) => s.contacts.some((c) => c.id === u.id));
  const out = useContacts((s) => s.outgoing.some((r) => r.user.id === u.id));
  const inc = useContacts((s) => s.incoming.some((r) => r.user.id === u.id));
  const loaded = useContacts((s) => s.loaded);
  if (u.relation === 'self' || !loaded) return u.relation;
  if (isContact) return 'contact';
  if (out) return 'pending_out';
  if (inc) return 'pending_in';
  return 'none';
}

function SearchRow({ user, active }: { user: UserWithRelation; active: boolean }) {
  const navigate = useNavigate();
  const relation = useEffectiveRelation(user);
  const { busy, run } = useBusy();
  const name = user.displayName;
  let action: ReactNode = null;
  if (relation === 'contact') {
    action = <button className="btn btn-secondary btn-sm" onClick={() => void openDirectChat(user.id, navigate)} aria-label={`Chat mit ${name}`}><Icon name="chat" size={16} />Chat</button>;
  } else if (relation === 'pending_out') {
    action = <span className="ct-pill" aria-label={`Anfrage an ${name} gesendet`}><Icon name="clock" size={14} />Angefragt</span>;
  } else if (relation === 'pending_in') {
    action = <button className="btn btn-primary btn-sm" disabled={busy === 'a'} onClick={() => void run('a', () => acceptFrom(user))} aria-label={`Anfrage von ${name} annehmen`}>Annehmen</button>;
  } else if (relation === 'none') {
    action = user.canRequest
      ? <button className="btn btn-primary btn-sm" disabled={busy === 'r'} onClick={() => void run('r', () => requestContact(user))} aria-label={`Kontaktanfrage an ${name} senden`}><Icon name="user-plus" size={16} />Anfragen</button>
      : <span className="ct-pill dim" title="Diese Person nimmt keine Kontaktanfragen an.">Keine Anfragen</span>;
  }
  const subtitle = `@${user.username}`;
  return <Row user={user} sub={subtitle} active={active} onOpen={() => navigate(handleOf(user))}>{action}</Row>;
}

export function SearchPanel({ activeKey }: { activeKey?: string }) {
  const { query, results, status, error, setQuery, refresh } = useContactsUi();
  const inputRef = useRef<HTMLInputElement>(null);
  // Beziehungen haben sich geändert → Ergebnisse still neu laden, damit Hinweise (z. B. „Keine Anfragen“) stimmen
  const sig = useContacts((s) => `${s.contacts.length}|${s.incoming.length}|${s.outgoing.length}`);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (query.trim().length >= MIN_QUERY) refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => { if (consumeSearchFocus()) inputRef.current?.focus(); }, []);

  return (
    <>
      <label className="search-box ct-search">
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }}
          placeholder="@Benutzername oder Name"
          aria-label="Personen suchen"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={50}
        />
        {query && <button className="icon-btn ct-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Eingabe löschen"><Icon name="x" size={16} /></button>}
      </label>
      <div role="status" aria-live="polite" className="ct-live">
        {status === 'loading' && results.length === 0 && <div className="ct-center slim"><Spinner size={22} /></div>}
        {status === 'idle' && (
          <EmptyState icon="search" title="Personen finden">
            Gib einen @Benutzernamen oder einen Anzeigenamen ein (mindestens {MIN_QUERY} Zeichen).
          </EmptyState>
        )}
        {status === 'short' && <p className="ct-hint">Bitte mindestens {MIN_QUERY} Zeichen eingeben.</p>}
        {status === 'rate' && (
          <div className="error-box" role="alert">
            <span>Zu viele Suchanfragen. Bitte warte einen Moment und versuche es dann erneut.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => refresh()}>Erneut suchen</button>
          </div>
        )}
        {status === 'error' && <ErrorBox message={error} onRetry={() => refresh()} />}
        {status === 'ok' && results.length === 0 && (
          <EmptyState icon="search" title="Niemand gefunden">
            Zu „{query.trim()}“ gibt es keine Treffer. Personen können ihre Auffindbarkeit einschränken – dann erscheinen sie nicht in der Suche. Frag nach dem genauen @Benutzernamen oder einem Profil-Link.
          </EmptyState>
        )}
      </div>
      {(status === 'ok' || status === 'loading') && results.length > 0 && (
        <ul className="list" aria-label="Suchergebnisse">
          {results.map((u) => <SearchRow key={u.id} user={u} active={activeKey === u.id || activeKey?.replace(/^@/, '') === u.username} />)}
        </ul>
      )}
    </>
  );
}
