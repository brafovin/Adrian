import { useMemo, useState } from 'react';
import { errorMessage } from '../../api';
import { convAvatar, convTitle } from '../../lib/chat';
import { useChats } from '../../store/chats';
import { useContacts } from '../../store/contacts';
import { toast } from '../../store/ui';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { EmptyState } from '../ui';

/** Nachricht an einen oder mehrere Chats weiterleiten. */
export function ForwardDialog({ messageId, onClose, onDone }: { messageId: string; onClose: () => void; onDone?: (convId: string) => void }) {
  const convs = useChats((s) => s.conversations);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => convs.filter((c) => convTitle(c).toLowerCase().includes(q.toLowerCase())), [convs, q]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]));
  async function go() {
    setBusy(true);
    try {
      await useChats.getState().forward(messageId, sel);
      toast(`An ${sel.length} Chat${sel.length > 1 ? 's' : ''} weitergeleitet`, 'success');
      onClose();
      if (sel.length === 1) onDone?.(sel[0]!);
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Weiterleiten an…" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={!sel.length || busy} onClick={go}><Icon name="send" size={18} />Senden{sel.length ? ` (${sel.length})` : ''}</button></>}>
      <label className="search-box" style={{ margin: 0 }}><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" aria-label="Chats durchsuchen" /></label>
      <ul className="list" style={{ maxHeight: '45vh', overflowY: 'auto', margin: '0 -20px' }}>
        {list.map((c) => (
          <li key={c.id}>
            <button className="list-item" onClick={() => toggle(c.id)} aria-pressed={sel.includes(c.id)}>
              <Avatar name={convTitle(c)} src={convAvatar(c)} size={40} />
              <span className="grow ellipsis title">{convTitle(c)}</span>
              {sel.includes(c.id) && <Icon name="check" style={{ color: 'var(--accent)' }} />}
            </button>
          </li>
        ))}
        {!list.length && <EmptyState icon="chat" title="Keine Chats gefunden" />}
      </ul>
    </Modal>
  );
}

/** Neuen Chat starten (Kontakt wählen) oder Gruppe erstellen. */
export function NewChatDialog({ onClose, onOpen, initialMode = 'direct' }: { onClose: () => void; onOpen: (convId: string) => void; initialMode?: 'direct' | 'group' }) {
  const contacts = useContacts((s) => s.contacts);
  const [mode, setMode] = useState<'direct' | 'group'>(initialMode);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = contacts.filter((c) => (c.displayName + c.username).toLowerCase().includes(q.toLowerCase().replace(/^@/, '')));

  async function direct(userId: string) {
    setBusy(true); setError('');
    try { const c = await useChats.getState().startDirect(userId); onClose(); onOpen(c.id); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function group() {
    setBusy(true); setError('');
    try { const c = await useChats.getState().createGroup(title.trim(), sel); onClose(); onOpen(c.id); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={mode === 'direct' ? 'Neuer Chat' : 'Neue Gruppe'} onClose={onClose}
      footer={mode === 'group' ? <><button className="btn btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !title.trim()} onClick={group}>Gruppe erstellen{sel.length ? ` (${sel.length + 1})` : ''}</button></> : undefined}>
      <div className="segmented" role="tablist" style={{ alignSelf: 'flex-start' }}>
        <button role="tab" aria-pressed={mode === 'direct'} onClick={() => setMode('direct')}>Einzelchat</button>
        <button role="tab" aria-pressed={mode === 'group'} onClick={() => setMode('group')}>Gruppe</button>
      </div>
      {mode === 'group' && <label className="field"><span>Gruppenname</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="z. B. Familie" /></label>}
      <label className="search-box" style={{ margin: 0 }}><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kontakte durchsuchen" aria-label="Kontakte durchsuchen" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <ul className="list" style={{ maxHeight: '42vh', overflowY: 'auto', margin: '0 -20px' }}>
        {list.map((c) => (
          <li key={c.id}>
            <button className="list-item" disabled={busy} onClick={() => (mode === 'direct' ? direct(c.id) : setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])))}>
              <Avatar name={c.displayName} src={c.avatarUrl} size={40} />
              <span className="grow"><span className="title ellipsis" style={{ display: 'block' }}>{c.displayName}</span><span className="muted-text" style={{ fontSize: 13 }}>@{c.username}</span></span>
              {mode === 'group' && sel.includes(c.id) && <Icon name="check" style={{ color: 'var(--accent)' }} />}
            </button>
          </li>
        ))}
        {!list.length && <EmptyState icon="users" title={contacts.length ? 'Keine Treffer' : 'Noch keine Kontakte'}>{contacts.length ? '' : 'Füge im Bereich „Kontakte“ Personen über ihren Benutzernamen hinzu.'}</EmptyState>}
      </ul>
    </Modal>
  );
}

export function Lightbox({ src, kind, onClose }: { src: string; kind: 'image' | 'video'; onClose: () => void }) {
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Medienansicht" onClick={onClose}>
      <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
      {kind === 'image' ? <img src={src} alt="" onClick={(e) => e.stopPropagation()} /> : <video src={src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />}
      <a className="icon-btn" style={{ position: 'absolute', top: 'calc(12px + var(--safe-t))', right: 60, color: '#fff', background: 'rgba(255,255,255,.12)' }} href={src} download aria-label="Herunterladen" onClick={(e) => e.stopPropagation()}><Icon name="download" /></a>
    </div>
  );
}
