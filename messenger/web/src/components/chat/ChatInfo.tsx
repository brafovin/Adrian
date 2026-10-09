import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { del, errorMessage, get, patch, post, put, uploadMedia } from '../../api';
import { convAvatar, convTitle } from '../../lib/chat';
import { useChats } from '../../store/chats';
import { useContacts } from '../../store/contacts';
import { usePeerPresence } from '../../store/presence';
import { useSession } from '../../store/session';
import { confirmDialog, toast, toastError } from '../../store/ui';
import { formatLastSeen } from '../../lib/format';
import type { Conversation, Member } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Spinner } from '../ui';
import { actionSheet } from '../../store/ui';

interface Invite { code: string; url: string; expiresAt: string | null; maxUses: number | null; uses: number }

/** Info-Dialog für Einzelchat (Profil) und Gruppe (Mitglieder, Rollen, Einladungslinks). */
export function ChatInfo({ conv, onClose, onBackground }: { conv: Conversation; onClose: () => void; onBackground: () => void }) {
  const me = useSession((s) => s.me)!;
  const navigate = useNavigate();
  const members = useChats((s) => s.members[conv.id]);
  const contacts = useContacts((s) => s.contacts);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(conv.title ?? '');
  const [desc, setDesc] = useState(conv.description);
  const fileRef = useRef<HTMLInputElement>(null);
  const isGroup = conv.type === 'group';
  const isAdmin = conv.myRole !== 'member';
  const canEditInfo = isGroup && (!conv.infoAdminsOnly || isAdmin);
  const presence = usePeerPresence(conv.peer);

  useEffect(() => { void useChats.getState().loadMembers(conv.id); }, [conv.id]);
  useEffect(() => {
    if (isGroup && isAdmin) get<{ invites: Invite[] }>(`/api/conversations/${conv.id}/invites`).then((r) => setInvites(r.invites)).catch(() => setInvites([]));
  }, [conv.id, isGroup, isAdmin]);

  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { toastError(e); } };

  async function saveInfo() {
    await run(async () => {
      const { conversation } = await patch<{ conversation: Conversation }>(`/api/conversations/${conv.id}`, { title: title.trim(), description: desc });
      useChats.getState().upsertConversation(conversation);
      toast('Gespeichert', 'success');
    });
  }
  async function changeAvatar(file: File) {
    await run(async () => {
      const media = await uploadMedia(file, file.name, { purpose: 'group_avatar' });
      const { conversation } = await patch<{ conversation: Conversation }>(`/api/conversations/${conv.id}`, { avatarMediaId: media.id });
      useChats.getState().upsertConversation(conversation);
    });
  }
  async function newInvite() {
    await run(async () => {
      const r = await post<Invite & { url: string }>(`/api/conversations/${conv.id}/invites`, { expiresInHours: 24 * 7, maxUses: 50 });
      setInvites((l) => [{ code: r.code, url: r.url, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), maxUses: 50, uses: 0 }, ...(l ?? [])]);
    });
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('Link kopiert', 'success'); } catch { toast(text); }
  }
  function memberMenu(m: Member) {
    if (m.id === me.id) return;
    const items = [{ label: 'Profil ansehen', icon: 'user', onClick: () => { onClose(); navigate(`/contacts/${m.id}`); } }];
    if (isAdmin && m.role !== 'owner' && (m.role !== 'admin' || conv.myRole === 'owner')) {
      items.push({ label: m.role === 'admin' ? 'Admin-Rechte entziehen' : 'Zum Admin machen', icon: 'shield', onClick: () => run(async () => { await patch(`/api/conversations/${conv.id}/members/${m.id}`, { role: m.role === 'admin' ? 'member' : 'admin' }); }) });
      items.push({ label: 'Aus Gruppe entfernen', icon: 'user-x', danger: true, onClick: async () => { if (await confirmDialog({ title: `${m.displayName} entfernen?`, danger: true, confirmLabel: 'Entfernen' })) await run(() => del(`/api/conversations/${conv.id}/members/${m.id}`)); } } as never);
    }
    actionSheet(items as never, m.displayName);
  }
  async function leave() {
    if (!(await confirmDialog({ title: 'Gruppe verlassen?', message: 'Du erhältst keine Nachrichten mehr aus dieser Gruppe.', danger: true, confirmLabel: 'Verlassen' }))) return;
    await run(async () => { await del(`/api/conversations/${conv.id}/members/${me.id}`); onClose(); navigate('/chats'); await useChats.getState().loadConversations(); });
  }
  async function clearChat() {
    if (!(await confirmDialog({ title: 'Chat leeren?', message: 'Alle Nachrichten werden nur auf deinen Geräten entfernt.', danger: true, confirmLabel: 'Leeren' }))) return;
    await run(async () => { await post(`/api/conversations/${conv.id}/clear`); useChats.setState((s) => ({ threads: { ...s.threads, [conv.id]: { items: [], hasMore: false, loading: false, loaded: true } } })); await useChats.getState().refreshConversation(conv.id); onClose(); });
  }
  async function toggleBlock() {
    const p = conv.peer; if (!p) return;
    if (p.blockedByMe) { await run(async () => { await useContacts.getState().unblock(p.id); await useChats.getState().loadConversations(); }); return; }
    if (await confirmDialog({ title: `${p.displayName} blockieren?`, message: 'Blockierte Personen können dir keine Nachrichten senden oder dich anrufen.', danger: true, confirmLabel: 'Blockieren' })) {
      await run(async () => { await useContacts.getState().block(p.id); await useChats.getState().loadConversations(); onClose(); });
    }
  }
  async function report() {
    const p = conv.peer; if (!p) return;
    actionSheet(['spam', 'harassment', 'illegal', 'impersonation', 'other'].map((reason) => ({
      label: ({ spam: 'Spam', harassment: 'Belästigung', illegal: 'Illegale Inhalte', impersonation: 'Identitätsmissbrauch', other: 'Sonstiges' } as Record<string, string>)[reason]!, icon: 'flag',
      onClick: () => run(async () => { await post('/api/reports', { userId: p.id, conversationId: conv.id, reason }); toast('Danke, die Meldung wurde gesendet.', 'success'); }),
    })), 'Warum meldest du diese Person?');
  }
  async function setPref(p: { archived?: boolean; pinned?: boolean; mutedUntil?: string | null }) { await run(() => useChats.getState().setConversationPrefs(conv.id, p)); }

  const muted = !!conv.mutedUntil && new Date(conv.mutedUntil) > new Date();
  const contactIds = new Set((members ?? []).map((m) => m.id));
  const addable = contacts.filter((c) => !contactIds.has(c.id));

  return (
    <Modal title={isGroup ? 'Gruppeninfo' : 'Kontaktinfo'} onClose={onClose} variant="sheet">
      <div className="profile-head">
        <span style={{ position: 'relative' }}>
          <Avatar name={convTitle(conv)} src={convAvatar(conv)} size={96} online={!isGroup ? presence.online : null} />
          {canEditInfo && <button className="icon-btn accent" style={{ position: 'absolute', right: -6, bottom: -6 }} onClick={() => fileRef.current?.click()} aria-label="Gruppenbild ändern"><Icon name="camera" size={18} /></button>}
        </span>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void changeAvatar(f); e.target.value = ''; }} />
        {isGroup ? (
          canEditInfo ? (
            <div className="col" style={{ width: '100%' }}>
              <label className="field"><span>Gruppenname</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field"><span>Beschreibung</span><textarea value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} /></label>
              <button className="btn btn-secondary" disabled={!title.trim() || (title === conv.title && desc === conv.description)} onClick={saveInfo}>Speichern</button>
            </div>
          ) : (<><h2>{conv.title}</h2><p className="muted-text">{conv.description}</p></>)
        ) : (
          <>
            <h2>{convTitle(conv)}</h2>
            {conv.peer && <p className="muted-text">@{conv.peer.username}</p>}
            {conv.peer?.bio && <p>{conv.peer.bio}</p>}
            {presence.online === true ? <p style={{ color: 'var(--success)' }}>online</p> : presence.lastSeenAt && <p className="muted-text">{formatLastSeen(presence.lastSeenAt)}</p>}
          </>
        )}
      </div>

      <div className="grid-actions">
        {!isGroup && conv.peer && <button className="btn" onClick={() => { onClose(); navigate(`/contacts/${conv.peer!.id}`); }}><Icon name="user" />Profil</button>}
        <button className="btn" onClick={() => { onClose(); onBackground(); }}><Icon name="image" />Hintergrund</button>
        <button className="btn" onClick={() => setPref({ pinned: !conv.pinnedAt })}><Icon name="pin" />{conv.pinnedAt ? 'Lösen' : 'Anheften'}</button>
        <button className="btn" onClick={() => setPref({ mutedUntil: muted ? null : new Date(Date.now() + 8 * 3600e3).toISOString() })}><Icon name={muted ? 'bell' : 'mute'} />{muted ? 'Laut' : 'Stumm'}</button>
        <button className="btn" onClick={() => { void setPref({ archived: !conv.archived }); onClose(); }}><Icon name="archive" />{conv.archived ? 'Zurückholen' : 'Archiv'}</button>
      </div>

      {isGroup && (
        <section>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <b>{conv.memberCount} Mitglieder</b>
            {(!conv.addAdminsOnly || isAdmin) && <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}><Icon name="user-plus" size={18} />Hinzufügen</button>}
          </div>
          {!members ? <Spinner /> : (
            <ul className="list members-list">
              {members.map((m) => (
                <li key={m.id}>
                  <button className="list-item" onClick={() => memberMenu(m)}>
                    <Avatar name={m.displayName} src={m.avatarUrl} size={40} online={m.online} />
                    <span className="grow"><span className="title ellipsis" style={{ display: 'block' }}>{m.id === me.id ? 'Du' : m.displayName}</span><span className="muted-text" style={{ fontSize: 13 }}>@{m.username}</span></span>
                    {m.role !== 'member' && <span className="role-pill">{m.role === 'owner' ? 'Inhaber' : 'Admin'}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isGroup && isAdmin && (
        <section className="col" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><b>Einladungslinks</b><button className="btn btn-ghost btn-sm" onClick={newInvite}><Icon name="link" size={18} />Neuer Link</button></div>
          {invites?.length === 0 && <p className="muted-text" style={{ fontSize: 14 }}>Links laufen nach 7 Tagen oder 50 Beitritten ab und können jederzeit widerrufen werden.</p>}
          {invites?.map((i) => (
            <div key={i.code} className="settings-row card" style={{ borderRadius: 12 }}>
              <div className="label"><span className="ellipsis" style={{ display: 'block', maxWidth: 220 }}>{i.url.replace(/^https?:\/\//, '')}</span>
                <small>{i.uses}{i.maxUses ? `/${i.maxUses}` : ''} Beitritte{i.expiresAt ? ` · bis ${new Date(i.expiresAt).toLocaleDateString('de-DE')}` : ''}</small></div>
              <button className="icon-btn" onClick={() => copy(i.url)} aria-label="Link kopieren"><Icon name="copy" size={18} /></button>
              <button className="icon-btn" onClick={() => run(async () => { await del(`/api/conversations/${conv.id}/invites/${i.code}`); setInvites((l) => l!.filter((x) => x.code !== i.code)); })} aria-label="Link widerrufen"><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </section>
      )}

      <div className="col" style={{ gap: 0 }}>
        <button className="sheet-item" onClick={clearChat}><Icon name="trash" size={20} />Chat leeren</button>
        {isGroup ? <button className="sheet-item danger" onClick={leave}><Icon name="logout" size={20} />Gruppe verlassen</button> : conv.peer && (
          <>
            <button className="sheet-item danger" onClick={toggleBlock}><Icon name="ban" size={20} />{conv.peer.blockedByMe ? `${conv.peer.displayName} entblocken` : `${conv.peer.displayName} blockieren`}</button>
            <button className="sheet-item danger" onClick={report}><Icon name="flag" size={20} />Melden</button>
          </>
        )}
      </div>

      {adding && (
        <Modal title="Mitglieder hinzufügen" onClose={() => setAdding(false)}>
          {addable.length === 0 ? <p className="muted-text">Alle deine Kontakte sind schon in der Gruppe.</p> : (
            <ul className="list" style={{ margin: '0 -20px', maxHeight: '50vh', overflowY: 'auto' }}>
              {addable.map((c) => (
                <li key={c.id}><button className="list-item" onClick={() => run(async () => { await post(`/api/conversations/${conv.id}/members`, { userIds: [c.id] }); setAdding(false); })}>
                  <Avatar name={c.displayName} src={c.avatarUrl} size={40} /><span className="grow title">{c.displayName}</span><Icon name="plus" /></button></li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </Modal>
  );
}
void put; void errorMessage;
