import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Avatar } from '../components/Avatar';
import { BackgroundEditor } from '../components/BackgroundEditor';
import { ChatInfo } from '../components/chat/ChatInfo';
import { Composer } from '../components/chat/Composer';
import { ForwardDialog, Lightbox } from '../components/chat/Dialogs';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Icon } from '../components/Icon';
import { EmptyState, Spinner } from '../components/ui';
import { canEdit, convAvatar, convTitle } from '../lib/chat';
import { formatDayLabel, formatLastSeen } from '../lib/format';
import { useIsDesktop } from '../lib/hooks';
import { startCall } from '../store/calls';
import { backgroundLayers, useBackgrounds } from '../store/backgrounds';
import { messagePreview, useChats } from '../store/chats';
import { usePeerPresence } from '../store/presence';
import { useSession } from '../store/session';
import { actionSheet, confirmDialog, toast, toastError } from '../store/ui';
import { QUICK_EMOJIS } from '../lib/chat';
import type { LocalMessage, Message } from '../types';

export function ChatView({ id }: { id: string }) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const me = useSession((s) => s.me)!;
  const conv = useChats((s) => s.conversations.find((c) => c.id === id));
  const loadedList = useChats((s) => s.loaded);
  const thread = useChats((s) => s.threads[id]);
  const members = useChats((s) => s.members[id]);
  const typingMap = useChats((s) => s.typing[id]);
  const highlightId = useChats((s) => s.highlightId);
  const bgList = useBackgrounds((s) => s.list);
  const bg = useMemo(() => backgroundLayers(useBackgrounds.getState().forConversation(id)), [bgList, id]); // eslint-disable-line
  const presence = usePeerPresence(conv?.peer);

  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [bgEditor, setBgEditor] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; kind: 'image' | 'video' } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [, tick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const prevCount = useRef(0);

  // Chat öffnen / verlassen
  useEffect(() => {
    useChats.getState().setActive(id);
    setReplyTo(null); setEditing(null); setSearchOpen(false); setResults(null); setNewBelow(0);
    stick.current = true; prevCount.current = 0;
    void useChats.getState().openThread(id).catch(() => {});
    return () => { useChats.getState().setActive(null); };
  }, [id]);

  const items = thread?.items ?? [];
  const nameOf = useCallback((uid: string | null) => {
    if (!uid) return 'Gelöschter Nutzer';
    if (uid === me.id) return 'Du';
    return members?.find((m) => m.id === uid)?.displayName ?? (conv?.type === 'direct' ? conv.peer?.displayName : undefined) ?? 'Mitglied';
  }, [members, conv, me.id]);

  // Gelesen markieren, sobald sichtbar
  useEffect(() => {
    if (!conv || conv.unreadCount === 0 || document.visibilityState !== 'visible' || !atBottom || thread?.detached) return;
    void useChats.getState().markRead(id);
  }, [conv?.unreadCount, atBottom, id, items.length, thread?.detached]); // eslint-disable-line
  useEffect(() => {
    const fn = () => { if (document.visibilityState === 'visible') void useChats.getState().markRead(id); };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [id]);

  // Tippanzeige läuft nach 6 s aus
  const typers = Object.entries(typingMap ?? {}).filter(([, exp]) => exp > Date.now()).map(([uid]) => uid);
  useEffect(() => {
    if (!typers.length) return;
    const t = setTimeout(() => tick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  });

  // Scrollverhalten
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const added = items.length - prevCount.current;
    const last = items[items.length - 1];
    if (prevHeight.current && el.scrollHeight > prevHeight.current && !stick.current && added > 0 && items[0] && el.scrollTop < 40) {
      // ältere Nachrichten oben eingefügt: Position halten
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (stick.current || (last && last.senderId === me.id && last.local)) {
      el.scrollTop = el.scrollHeight;
    } else if (added > 0 && last && last.senderId !== me.id) setNewBelow((n) => n + added);
    prevHeight.current = el.scrollHeight;
    prevCount.current = items.length;
  }, [items.length, thread?.loaded, typers.length]); // eslint-disable-line

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => {
      const el = scroller.current?.querySelector(`[data-mid="${highlightId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => useChats.setState({ highlightId: null }), 1800);
    }, 80);
    return () => clearTimeout(t);
  }, [highlightId, items.length]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near && !thread?.detached;
    setAtBottom(near);
    if (near) setNewBelow(0);
    if (el.scrollTop < 80 && thread?.hasMore && !thread.loading) { prevHeight.current = el.scrollHeight; void useChats.getState().loadOlder(id); }
  };
  const toBottom = async () => {
    if (thread?.detached) await useChats.getState().jumpToLatest(id);
    stick.current = true;
    requestAnimationFrame(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });
    setNewBelow(0);
  };

  // Suche
  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => {
      get<{ messages: Message[] }>(`/api/conversations/${id}/search?q=${encodeURIComponent(query.trim())}`).then((r) => setResults(r.messages)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchOpen, id]);

  if (!conv) {
    return loadedList
      ? <div className="chat"><div className="placeholder-pane"><EmptyState icon="chat" title="Chat nicht gefunden">Dieser Chat existiert nicht oder du bist kein Mitglied mehr.</EmptyState></div></div>
      : <div className="chat"><div className="placeholder-pane"><Spinner size={30} /></div></div>;
  }

  const isGroup = conv.type === 'group';
  const title = convTitle(conv);
  let subtitle: string; let subOn = false;
  if (typers.length) subtitle = isGroup ? `${typers.map(nameOf).join(', ')} schreibt…` : 'schreibt…', subOn = true;
  else if (isGroup) subtitle = members ? members.map((m) => (m.id === me.id ? 'Du' : m.displayName)).join(', ') : `${conv.memberCount} Mitglieder`;
  else if (presence.online) subtitle = 'online', subOn = true;
  else subtitle = presence.lastSeenAt ? formatLastSeen(presence.lastSeenAt) : '';

  let disabledReason: string | null = null;
  if (isGroup && conv.sendAdminsOnly && conv.myRole === 'member') disabledReason = 'Nur Admins dürfen hier schreiben';
  if (!isGroup && !conv.peer) disabledReason = 'Dieser Nutzer hat sein Konto gelöscht';
  if (!isGroup && conv.peer?.blockedByMe) disabledReason = 'Du hast diesen Nutzer blockiert';

  function openMenu(m: LocalMessage) {
    if (m.local || m.deletedAt) return;
    const mine = m.senderId === me.id;
    const items = [
      { label: 'Antworten', icon: 'reply', onClick: () => { setEditing(null); setReplyTo(m); } },
      ...(m.body ? [{ label: 'Text kopieren', icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(m.body); toast('Kopiert', 'success'); } catch { toast('Kopieren nicht möglich', 'error'); } } }] : []),
      { label: 'Weiterleiten', icon: 'share', onClick: () => setForwardId(m.id) },
      ...(m.media ? [{ label: 'Herunterladen', icon: 'download', onClick: () => { const a = document.createElement('a'); a.href = m.media!.url; a.download = m.media!.name || 'datei'; a.click(); } }] : []),
      ...(canEdit(m, me.id) && (m.kind === 'text') ? [{ label: 'Bearbeiten', icon: 'edit', onClick: () => { setReplyTo(null); setEditing(m); } }] : []),
      { label: 'Für mich löschen', icon: 'trash', danger: true, onClick: async () => { try { await useChats.getState().remove(m, 'me'); } catch (e) { toastError(e); } } },
      ...(mine || (isGroup && conv!.myRole !== 'member') ? [{ label: 'Für alle löschen', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog({ title: 'Für alle löschen?', message: 'Die Nachricht wird bei allen Teilnehmern entfernt.', danger: true, confirmLabel: 'Löschen' }))) return;
        try { await useChats.getState().remove(m, 'all'); } catch (e) { toastError(e); } } }] : []),
    ];
    actionSheet(items, undefined, { emojis: QUICK_EMOJIS, onEmoji: (e) => { void useChats.getState().react(m, e).catch(toastError); } });
  }

  function headerMenu() {
    const muted = !!conv!.mutedUntil && new Date(conv!.mutedUntil) > new Date();
    actionSheet([
      { label: 'In Chat suchen', icon: 'search', onClick: () => setSearchOpen(true) },
      { label: isGroup ? 'Gruppeninfo' : 'Kontaktinfo', icon: 'info', onClick: () => setInfo(true) },
      { label: 'Chat-Hintergrund ändern', icon: 'image', onClick: () => setBgEditor(true) },
      { label: muted ? 'Stummschaltung aufheben' : 'Stummschalten (8 Std.)', icon: muted ? 'bell' : 'mute', onClick: () => useChats.getState().setConversationPrefs(id, { mutedUntil: muted ? null : new Date(Date.now() + 8 * 3600e3).toISOString() }) },
      { label: conv!.pinnedAt ? 'Nicht mehr anheften' : 'Anheften', icon: 'pin', onClick: () => useChats.getState().setConversationPrefs(id, { pinned: !conv!.pinnedAt }).catch(toastError) },
      { label: conv!.archived ? 'Aus Archiv holen' : 'Archivieren', icon: 'archive', onClick: () => useChats.getState().setConversationPrefs(id, { archived: !conv!.archived }) },
    ], title);
  }

  const bubbles: React.ReactNode[] = [];
  let lastDay = '';
  items.forEach((m, i) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) { bubbles.push(<div key={`d-${m.id}`} className="day-sep">{formatDayLabel(m.createdAt)}</div>); lastDay = day; }
    const prev = items[i - 1];
    const sameDay = prev && new Date(prev.createdAt).toDateString() === day;
    const grouped = !!(prev && sameDay && prev.kind !== 'system' && m.kind !== 'system' && prev.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000);
    bubbles.push(
      <MessageBubble key={m.clientMsgId && m.local ? `l-${m.clientMsgId}` : m.id} m={m} myId={me.id} isGroup={isGroup} members={members} nameOf={nameOf}
        grouped={grouped} first={!grouped} highlighted={highlightId === m.id}
        onMenu={openMenu} onReply={(x) => setReplyTo(x)} onJump={(mid) => void useChats.getState().jumpTo(id, mid).catch(() => toast('Nachricht nicht mehr verfügbar'))}
        onOpenMedia={(x) => x.media && setLightbox({ src: x.media.url, kind: x.media.kind === 'video' ? 'video' : 'image' })}
        onRetry={(x) => useChats.getState().retry(id, x.clientMsgId!)} onDiscard={(x) => useChats.getState().discard(id, x.clientMsgId!)}
        onReact={(x, e) => void useChats.getState().react(x, e || null).catch(toastError)} />,
    );
  });

  return (
    <section className="chat" aria-label={`Chat mit ${title}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); toast('Dateien bitte über die Büroklammer anhängen.'); } }}>
      {bg && <>
        <div className="chat-bg" style={{ backgroundImage: bg.image, filter: bg.filter, transform: 'scale(1.05)' }} />
        <div className="chat-bg-overlay" style={{ opacity: bg.overlay }} />
      </>}
      <header className="chat-header">
        <button className="icon-btn back-btn mobile-only" onClick={() => navigate('/chats')} aria-label="Zurück zur Chatliste"><Icon name="back" size={24} /></button>
        <button className="row grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => setInfo(true)} aria-label={`${title} – Info öffnen`}>
          <Avatar name={title} src={convAvatar(conv)} size={40} online={!isGroup ? presence.online : null} />
          <span className="who"><b className="ellipsis">{title}</b><small className={`ellipsis ${subOn ? 'on' : ''}`}>{subtitle}</small></span>
        </button>
        {!isGroup && conv.peer && !disabledReason && (
          <>
            <button className="icon-btn" onClick={() => startCall(conv.peer!, 'video')} aria-label="Videoanruf"><Icon name="video" /></button>
            <button className="icon-btn" onClick={() => startCall(conv.peer!, 'audio')} aria-label="Sprachanruf"><Icon name="phone" /></button>
          </>
        )}
        <button className="icon-btn" onClick={headerMenu} aria-label="Weitere Optionen"><Icon name="more" /></button>
      </header>

      {searchOpen && (
        <>
          <div className="search-bar">
            <Icon name="search" size={18} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="In diesem Chat suchen" aria-label="In Chat suchen" />
            <button className="icon-btn" onClick={() => { setSearchOpen(false); setQuery(''); setResults(null); }} aria-label="Suche schließen"><Icon name="x" /></button>
          </div>
          {results && (
            <div className="search-results">
              {results.length === 0 && <p className="muted-text" style={{ padding: 14 }}>Keine Treffer</p>}
              {results.map((r) => (
                <button key={r.id} onClick={() => { setResults(null); setSearchOpen(false); void useChats.getState().jumpTo(id, r.id); }}>
                  <small className="muted-text">{nameOf(r.senderId)} · {new Date(r.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small>
                  <div>{highlight(messagePreview(r), query)}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="msgs" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
        {thread?.hasMore && <div style={{ alignSelf: 'center', padding: 8 }}>{thread.loading ? <Spinner /> : <button className="btn btn-ghost btn-sm" onClick={() => useChats.getState().loadOlder(id)}>Ältere Nachrichten laden</button>}</div>}
        {!thread?.loaded && <div style={{ margin: 'auto' }}><Spinner size={30} /></div>}
        {thread?.loaded && items.length === 0 && (
          <div className="sys-msg" style={{ margin: 'auto' }}>{isGroup ? 'Noch keine Nachrichten in dieser Gruppe.' : `Schreibe ${title} die erste Nachricht 👋`}</div>
        )}
        {bubbles}
        {typers.length > 0 && <div className="msg-row in first"><div className="bubble" aria-label="schreibt"><span className="typing-indicator"><i /><i /><i /></span></div></div>}
      </div>

      {(!atBottom || thread?.detached) && (
        <button className="to-bottom" onClick={toBottom} aria-label="Zu den neuesten Nachrichten">
          <Icon name="chevron" />{newBelow > 0 && <span className="badge">{newBelow}</span>}
        </button>
      )}

      <Composer convId={id} replyTo={replyTo} editing={editing} nameOf={nameOf} disabledReason={disabledReason}
        onCancelReply={() => setReplyTo(null)} onCancelEdit={() => setEditing(null)}
        onSent={() => { stick.current = true; requestAnimationFrame(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }); }} />

      {info && <ChatInfo conv={conv} onClose={() => setInfo(false)} onBackground={() => setBgEditor(true)} />}
      {bgEditor && <BackgroundEditor conversationId={id} conversationTitle={title} onClose={() => setBgEditor(false)} />}
      {forwardId && <ForwardDialog messageId={forwardId} onClose={() => setForwardId(null)} onDone={(cid) => navigate(`/chats/${cid}`)} />}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {desktop && null}
    </section>
  );
}

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0 || !q.trim()) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.trim().length)}</mark>{text.slice(i + q.trim().length)}</>;
}
