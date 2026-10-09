import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { NewChatDialog } from '../components/chat/Dialogs';
import { Icon } from '../components/Icon';
import { EmptyState, PaneHeader, Spinner } from '../components/ui';
import { convAvatar, convTitle, messageStatus } from '../lib/chat';
import { formatListTime } from '../lib/format';
import { useConnection } from '../realtime';
import { messagePreview, useChats } from '../store/chats';
import { usePeerPresence } from '../store/presence';
import { useSession } from '../store/session';
import { actionSheet, toastError } from '../store/ui';
import type { Conversation } from '../types';
import { ChatView } from './ChatView';

function ChatRow({ c, active, onOpen }: { c: Conversation; active: boolean; onOpen: () => void }) {
  const me = useSession((s) => s.me)!;
  const typing = useChats((s) => s.typing[c.id]);
  const members = useChats((s) => s.members[c.id]);
  const presence = usePeerPresence(c.peer);
  const muted = !!c.mutedUntil && new Date(c.mutedUntil) > new Date();
  const isTyping = Object.values(typing ?? {}).some((e) => e > Date.now());
  const last = c.lastMessage;
  const mine = last?.senderId === me.id && last.kind !== 'system';
  const status = mine && last ? messageStatus(last, members, me.id, c) : null;
  const title = convTitle(c);
  const senderPrefix = c.type === 'group' && last && !mine && last.kind !== 'system' && last.senderId ? '' : '';

  function menu(e: React.MouseEvent) {
    e.preventDefault();
    actionSheet([
      { label: c.pinnedAt ? 'Nicht mehr anheften' : 'Anheften', icon: 'pin', onClick: () => useChats.getState().setConversationPrefs(c.id, { pinned: !c.pinnedAt }).catch(toastError) },
      { label: muted ? 'Stummschaltung aufheben' : 'Stummschalten (8 Std.)', icon: muted ? 'bell' : 'mute', onClick: () => useChats.getState().setConversationPrefs(c.id, { mutedUntil: muted ? null : new Date(Date.now() + 8 * 3600e3).toISOString() }) },
      { label: c.archived ? 'Aus Archiv holen' : 'Archivieren', icon: 'archive', onClick: () => useChats.getState().setConversationPrefs(c.id, { archived: !c.archived }) },
      ...(c.unreadCount ? [{ label: 'Als gelesen markieren', icon: 'check-all', onClick: () => useChats.getState().markRead(c.id) }] : []),
    ], title);
  }
  return (
    <li>
      <button className={`list-item chat-row ${active ? 'active' : ''}`} onClick={onOpen} onContextMenu={menu} aria-current={active ? 'true' : undefined}>
        <Avatar name={title} src={convAvatar(c)} size={52} online={c.type === 'direct' ? presence.online : null} />
        <span className="grow">
          <span className="title-row"><span className={`grow ellipsis ${c.unreadCount ? 'unread-title' : ''}`}>{title}</span>{c.pinnedAt && <Icon name="pin" size={14} style={{ color: 'var(--text-faint)' }} />}{muted && <Icon name="mute" size={14} style={{ color: 'var(--text-faint)' }} />}</span>
          <span className="sub">
            {isTyping ? <span className="typing-text">schreibt…</span> : (
              <>
                {status && <span className={`tick ${status === 'read' ? 'read' : ''}`}><Icon name={status === 'sent' || status === 'sending' ? 'check' : status === 'failed' ? 'x' : 'check-all'} size={16} /></span>}
                <span className="ellipsis" style={{ fontWeight: c.unreadCount ? 650 : 400, color: c.unreadCount ? 'var(--text)' : undefined }}>{senderPrefix}{last ? messagePreview(last, me.id) : c.type === 'group' ? 'Gruppe erstellt' : 'Noch keine Nachrichten'}</span>
              </>
            )}
          </span>
        </span>
        <span className="meta">
          <span style={{ color: c.unreadCount ? 'var(--accent)' : undefined, fontWeight: c.unreadCount ? 700 : 400 }}>{formatListTime(c.lastMessageAt)}</span>
          {c.unreadCount > 0 && <span className={`badge ${muted ? 'muted' : ''}`} aria-label={`${c.unreadCount} ungelesen`}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
        </span>
      </button>
    </li>
  );
}

export function ChatsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const convs = useChats((s) => s.conversations);
  const loaded = useChats((s) => s.loaded);
  const conn = useConnection((s) => s.state);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [newChat, setNewChat] = useState<false | 'direct' | 'group'>(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return convs.filter((c) => c.archived === showArchived && (!term || convTitle(c).toLowerCase().includes(term) || (c.lastMessage?.body ?? '').toLowerCase().includes(term) || (c.peer?.username ?? '').toLowerCase().includes(term)));
  }, [convs, q, showArchived]);
  const archivedCount = convs.filter((c) => c.archived).length;

  return (
    <div className={`split ${id ? 'has-detail' : ''}`}>
      <div className="pane-list">
        <PaneHeader title={showArchived ? 'Archiv' : 'Chats'}
          left={showArchived ? <button className="icon-btn" onClick={() => setShowArchived(false)} aria-label="Zurück"><Icon name="back" /></button> : undefined}
          right={<>
            <button className={`icon-btn ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived((v) => !v)} aria-label="Archiv anzeigen" aria-pressed={showArchived}><Icon name="archive" />{!showArchived && archivedCount > 0 && <span className="sr-only">{archivedCount} archiviert</span>}</button>
            <button className="icon-btn" onClick={() => setNewChat('group')} aria-label="Neue Gruppe"><Icon name="users" /></button>
          </>} />
        {conn === 'offline' && <div className="conn-banner" role="status">Keine Verbindung – verbinde neu…</div>}
        <label className="search-box"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chats durchsuchen" aria-label="Chats durchsuchen" /></label>
        <div className="pane-body">
          {!loaded ? <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner size={30} /></div> : filtered.length === 0 ? (
            <EmptyState icon="chat" title={q ? 'Keine Treffer' : showArchived ? 'Kein archivierter Chat' : 'Noch keine Chats'}
              action={!q && !showArchived ? <button className="btn btn-primary" onClick={() => setNewChat('direct')}>Chat starten</button> : undefined}>
              {!q && !showArchived ? 'Suche unter „Kontakte“ nach einem Benutzernamen, um loszulegen.' : ''}
            </EmptyState>
          ) : (
            <ul className="list">{filtered.map((c) => <ChatRow key={c.id} c={c} active={c.id === id} onOpen={() => navigate(`/chats/${c.id}`)} />)}</ul>
          )}
          {!showArchived && archivedCount > 0 && !q && <button className="list-item" onClick={() => setShowArchived(true)}><Icon name="archive" /><span className="grow">Archiviert</span><span className="badge muted">{archivedCount}</span></button>}
        </div>
        <button className="fab" onClick={() => setNewChat('direct')} aria-label="Neuer Chat"><Icon name="plus" size={26} /></button>
      </div>
      <div className="pane-detail">
        {id ? <ChatView key={id} id={id} /> : <div className="placeholder-pane"><EmptyState icon="chat" title="Adrian">Wähle einen Chat aus oder starte einen neuen.</EmptyState></div>}
      </div>
      {newChat && <NewChatDialog initialMode={newChat} onClose={() => setNewChat(false)} onOpen={(cid) => navigate(`/chats/${cid}`)} />}
    </div>
  );
}
