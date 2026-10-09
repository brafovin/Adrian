import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api';
import { EMOJI_GROUPS, prepareImage, videoMeta } from '../../lib/chat';
import { formatDuration } from '../../lib/format';
import { realtime } from '../../realtime';
import { useChats } from '../../store/chats';
import { useSession } from '../../store/session';
import { toast, toastError } from '../../store/ui';
import type { LocalMessage } from '../../types';
import { Icon } from '../Icon';
import { Modal } from '../Modal';

interface Props {
  convId: string;
  replyTo: LocalMessage | null;
  editing: LocalMessage | null;
  nameOf: (id: string | null) => string;
  disabledReason: string | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSent: () => void;
}

const draftKey = (id: string) => `adrian:draft:${id}`;

function pickRecorderType(): string | undefined {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
}

interface Pending { file: File; url: string; kind: 'image' | 'video' | 'file'; caption: string }

export function Composer({ convId, replyTo, editing, nameOf, disabledReason, onCancelReply, onCancelEdit, onSent }: Props) {
  const enterToSend = useSession((s) => s.me?.settings.enterToSend ?? true);
  const [text, setText] = useState(() => localStorage.getItem(draftKey(convId)) ?? '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [rec, setRec] = useState<{ start: number; secs: number } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const recorder = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; cancelled: boolean } | null>(null);
  const fileInputs = { media: useRef<HTMLInputElement>(null), camera: useRef<HTMLInputElement>(null), doc: useRef<HTMLInputElement>(null) };

  // Entwurf pro Chat speichern
  useEffect(() => {
    const t = setTimeout(() => { try { text ? localStorage.setItem(draftKey(convId), text) : localStorage.removeItem(draftKey(convId)); } catch { /* voll */ } }, 300);
    return () => clearTimeout(t);
  }, [text, convId]);

  useEffect(() => { if (editing) { setText(editing.body); ta.current?.focus(); } }, [editing]);
  useEffect(() => { if (replyTo) ta.current?.focus(); }, [replyTo]);
  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);
  useEffect(() => () => { stopTyping(); recorder.current?.stream.getTracks().forEach((t) => t.stop()); }, []); // eslint-disable-line

  const stopTyping = useCallback(() => { if (lastTyping.current) { realtime.send({ type: 'typing', conversationId: convId, typing: false }); lastTyping.current = 0; } }, [convId]);
  const onInput = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 3000) { lastTyping.current = now; realtime.send({ type: 'typing', conversationId: convId, typing: true }); }
    if (!v) stopTyping();
  };

  async function submit() {
    const body = text.trim();
    if (!body) return;
    stopTyping();
    if (editing) {
      try { await useChats.getState().edit(editing.id, body); onCancelEdit(); setText(''); } catch (e) { toastError(e); }
      return;
    }
    useChats.getState().sendText(convId, body, replyTo?.id);
    setText(''); onCancelReply(); setEmojiOpen(false); onSent();
    localStorage.removeItem(draftKey(convId));
  }

  const onKey = (e: React.KeyboardEvent) => {
    const touch = matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && enterToSend && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
    if (e.key === 'Escape' && editing) onCancelEdit();
  };

  function insertEmoji(e: string) {
    const el = ta.current;
    if (!el) { setText((t) => t + e); return; }
    const s = el.selectionStart ?? text.length, en = el.selectionEnd ?? text.length;
    const next = text.slice(0, s) + e + text.slice(en);
    setText(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + e.length; });
  }

  function addFiles(files: FileList | File[] | null, kindHint?: 'doc') {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, 10).map<Pending>((f) => ({
      file: f, url: URL.createObjectURL(f), caption: '',
      kind: kindHint === 'doc' ? 'file' : f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file',
    }));
    setPending(list); setAttachOpen(false);
  }

  async function sendPending() {
    const list = pending; setPending(null);
    if (!list) return;
    for (const [i, p] of list.entries()) {
      const caption = i === 0 ? p.caption : '';
      const replyToId = i === 0 ? replyTo?.id : undefined;
      if (p.kind === 'image') {
        const img = await prepareImage(p.file);
        useChats.getState().sendFile(convId, img.blob, img.name, 'image', { caption, width: img.width, height: img.height, replyToId });
      } else if (p.kind === 'video') {
        const meta = await videoMeta(p.file);
        useChats.getState().sendFile(convId, p.file, p.file.name, 'video', { caption, ...meta, replyToId });
      } else useChats.getState().sendFile(convId, p.file, p.file.name, 'file', { caption, replyToId });
      URL.revokeObjectURL(p.url);
    }
    onCancelReply(); onSent();
  }

  // Einfügen (Strg+V) von Bildern
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Sprachaufnahme wird von diesem Browser nicht unterstützt.', 'error'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = pickRecorderType();
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const state = { mr, chunks, stream, cancelled: false };
      recorder.current = state;
      const start = Date.now();
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - start;
        setRec(null);
        if (state.cancelled || durationMs < 600) return;
        const mime = mr.mimeType || type || 'audio/webm';
        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        useChats.getState().sendFile(convId, new Blob(chunks, { type: mime }), `sprachnachricht.${ext}`, 'voice', { durationMs, replyToId: replyTo?.id });
        onCancelReply(); onSent();
      };
      mr.start(250);
      setRec({ start, secs: 0 });
    } catch (e) {
      toast((e as DOMException).name === 'NotAllowedError' ? 'Zugriff auf das Mikrofon wurde verweigert.' : errorMessage(e), 'error');
    }
  }
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setRec((r) => (r ? { ...r, secs: (Date.now() - r.start) / 1000 } : r)), 250);
    return () => clearInterval(t);
  }, [rec?.start]); // eslint-disable-line
  const finishRecording = (cancel: boolean) => { const r = recorder.current; if (!r) return; r.cancelled = cancel; if (r.mr.state !== 'inactive') r.mr.stop(); };

  if (disabledReason) {
    return <div className="composer-wrap"><div className="composer"><div className="recording" style={{ color: 'var(--text-dim)', fontWeight: 500, justifyContent: 'center' }}><Icon name="lock" size={18} />{disabledReason}</div></div></div>;
  }

  return (
    <div className="composer-wrap">
      {replyTo && !editing && (
        <div className="reply-bar">
          <div className="grow"><b>Antwort an {nameOf(replyTo.senderId)}</b><span className="ellipsis" style={{ display: 'block' }}>{replyTo.body || (replyTo.media ? '📎 Anhang' : '')}</span></div>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Antwort abbrechen"><Icon name="x" size={18} /></button>
        </div>
      )}
      {editing && (
        <div className="edit-bar">
          <div className="grow"><b>Nachricht bearbeiten</b><span className="ellipsis" style={{ display: 'block' }}>{editing.body}</span></div>
          <button className="icon-btn" onClick={() => { onCancelEdit(); setText(''); }} aria-label="Bearbeiten abbrechen"><Icon name="x" size={18} /></button>
        </div>
      )}
      {emojiOpen && (
        <div className="emoji-panel" role="listbox" aria-label="Emojis">
          {EMOJI_GROUPS.flatMap((g) => Array.from(new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(g.list), (s) => s.segment)).map((e, i) => (
            <button key={i} onClick={() => insertEmoji(e)} aria-label={e}>{e}</button>
          ))}
        </div>
      )}
      <div className="composer">
        {rec ? (
          <>
            <button className="icon-btn" onClick={() => finishRecording(true)} aria-label="Aufnahme verwerfen"><Icon name="trash" /></button>
            <div className="recording"><span className="rec-dot" /> {formatDuration(rec.secs)} <span className="muted-text" style={{ fontWeight: 500 }}>Aufnahme läuft…</span></div>
            <button className="send" onClick={() => finishRecording(false)} aria-label="Sprachnachricht senden"><Icon name="send" size={20} /></button>
          </>
        ) : (
          <>
            <div className="box">
              <button className={`icon-btn ${emojiOpen ? 'active' : ''}`} onClick={() => setEmojiOpen((v) => !v)} aria-label="Emojis" aria-pressed={emojiOpen}><Icon name="smile" /></button>
              <textarea ref={ta} rows={1} value={text} placeholder="Nachricht" aria-label="Nachricht schreiben" onChange={(e) => onInput(e.target.value)} onKeyDown={onKey} onPaste={onPaste} onBlur={stopTyping} />
              {!editing && <button className="icon-btn" onClick={() => setAttachOpen(true)} aria-label="Anhang"><Icon name="paperclip" /></button>}
            </div>
            {text.trim() || editing ? (
              <button className="send" onClick={submit} aria-label={editing ? 'Änderung speichern' : 'Senden'}><Icon name={editing ? 'check' : 'send'} size={20} /></button>
            ) : (
              <button className="send" onClick={startRecording} aria-label="Sprachnachricht aufnehmen"><Icon name="mic" size={22} /></button>
            )}
          </>
        )}
      </div>

      <input ref={fileInputs.media} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={fileInputs.camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={fileInputs.doc} type="file" hidden multiple onChange={(e) => { addFiles(e.target.files, 'doc'); e.target.value = ''; }} />

      {attachOpen && (
        <Modal title="Anhang" onClose={() => setAttachOpen(false)}>
          <div className="attach-menu">
            <button onClick={() => fileInputs.media.current?.click()}><span className="ico" style={{ background: 'linear-gradient(135deg,#4f7cff,#7a5cff)' }}><Icon name="image" size={26} /></span>Foto / Video</button>
            <button onClick={() => fileInputs.camera.current?.click()}><span className="ico" style={{ background: 'linear-gradient(135deg,#ff7a59,#ff4f8b)' }}><Icon name="camera" size={26} /></span>Kamera</button>
            <button onClick={() => fileInputs.doc.current?.click()}><span className="ico" style={{ background: 'linear-gradient(135deg,#2fb26a,#1c8f8f)' }}><Icon name="file" size={26} /></span>Dokument</button>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal title={`${pending.length} Datei${pending.length > 1 ? 'en' : ''} senden`} onClose={() => { pending.forEach((p) => URL.revokeObjectURL(p.url)); setPending(null); }}
          footer={<><button className="btn btn-ghost" onClick={() => { pending.forEach((p) => URL.revokeObjectURL(p.url)); setPending(null); }}>Abbrechen</button><button className="btn btn-primary" onClick={sendPending}><Icon name="send" size={18} />Senden</button></>}>
          <div className="col">
            {pending.map((p, i) => (
              <div key={p.url} className="col" style={{ gap: 6 }}>
                {p.kind === 'image' && <img src={p.url} alt={p.file.name} style={{ borderRadius: 14, maxHeight: 280, objectFit: 'contain', background: 'var(--surface-2)' }} />}
                {p.kind === 'video' && <video src={p.url} controls style={{ borderRadius: 14, maxHeight: 280, background: '#000' }} />}
                {p.kind === 'file' && <div className="row"><span className="icon-wrap" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center' }}><Icon name="file" /></span><b className="ellipsis">{p.file.name}</b></div>}
                {i === 0 && <input className="input" placeholder="Beschriftung hinzufügen…" value={p.caption} maxLength={1000} aria-label="Beschriftung"
                  onChange={(e) => setPending((l) => l && l.map((x, j) => (j === 0 ? { ...x, caption: e.target.value } : x)))} />}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
