import { memo, useMemo, useRef, useState } from 'react';
import { formatBytes, formatDuration, formatTime, hashHue } from '../../lib/format';
import { linkify, messageStatus, type MsgStatus } from '../../lib/chat';
import { systemText } from '../../store/chats';
import type { LocalMessage, Member, Message } from '../../types';
import { Icon } from '../Icon';
import { Spinner } from '../ui';

interface Props {
  m: LocalMessage;
  myId: string;
  isGroup: boolean;
  members: Member[] | undefined;
  nameOf: (id: string | null) => string;
  grouped: boolean;
  first: boolean;
  highlighted: boolean;
  onMenu: (m: LocalMessage) => void;
  onReply: (m: LocalMessage) => void;
  onJump: (id: string) => void;
  onOpenMedia: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  onDiscard: (m: LocalMessage) => void;
  onReact: (m: LocalMessage, emoji: string) => void;
}

function Ticks({ status }: { status: MsgStatus }) {
  if (status === 'sending') return <Icon name="clock" size={14} />;
  if (status === 'failed') return <Icon name="x" size={14} />;
  if (status === 'sent') return <Icon name="check" size={15} />;
  return <span className={status === 'read' ? 'read' : ''}><Icon name="check-all" size={16} /></span>;
}

function bars(seed: string, n = 30): number[] {
  let h = hashHue(seed) + 7;
  return Array.from({ length: n }, () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return 25 + (h % 75); });
}

function VoicePlayer({ m }: { m: LocalMessage }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState((m.media?.durationMs ?? 0) / 1000);
  const heights = useMemo(() => bars(m.id), [m.id]);
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) { document.querySelectorAll('audio').forEach((x) => x !== a && x.pause()); void a.play(); } else a.pause(); };
  return (
    <div className="voice">
      <audio ref={ref} src={m.media?.url} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)} />
      <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Abspielen'}><Icon name={playing ? 'pause' : 'play'} size={18} fill /></button>
      <div className="wave" role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        onClick={(e) => { const a = ref.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * dur; }}>
        {heights.map((h, i) => <i key={i} className={dur && i / heights.length < t / dur ? 'on' : ''} style={{ height: `${h}%` }} />)}
      </div>
      <time>{formatDuration(playing || t ? t : dur)}</time>
    </div>
  );
}

function MediaContent({ m, onOpen }: { m: LocalMessage; onOpen: () => void }) {
  const media = m.media!;
  const uploading = m.local?.status === 'sending';
  const progress = m.local?.progress;
  const ratio = media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined;
  if (m.kind === 'image' || media.kind === 'image') {
    return (
      <span className="media-frame">
        <img className="media" src={media.thumbUrl && !m.local ? media.thumbUrl : media.url} alt={m.body || media.name || 'Bild'} loading="lazy" style={ratio} onClick={onOpen} />
        {uploading && <span className="progress">{progress ? `${Math.round(progress * 100)}%` : <Spinner />}</span>}
      </span>
    );
  }
  if (m.kind === 'video' || media.kind === 'video') {
    return (
      <span className="media-frame">
        <video className="media" src={media.url} controls preload="metadata" playsInline style={ratio} />
        {uploading && <span className="progress">{progress ? `${Math.round(progress * 100)}%` : <Spinner />}</span>}
      </span>
    );
  }
  if (m.kind === 'voice' || m.kind === 'audio') {
    return m.kind === 'voice' ? <VoicePlayer m={m} /> : <audio controls src={media.url} preload="metadata" style={{ maxWidth: '100%' }} />;
  }
  return (
    <a className="file-card" href={m.local ? undefined : media.url} download={media.name} style={{ color: 'inherit', textDecoration: 'none' }}>
      <span className="ico"><Icon name="file" /></span>
      <span className="grow"><b className="ellipsis" style={{ display: 'block', maxWidth: 220 }}>{media.name || 'Datei'}</b><small>{formatBytes(media.size)}</small></span>
      {!m.local && <Icon name="download" size={20} />}
    </a>
  );
}

function ReplyQuote({ m, nameOf, onJump }: { m: Message; nameOf: Props['nameOf']; onJump: (id: string) => void }) {
  const r = m.replyTo!;
  const label = r.deleted ? 'Nachricht gelöscht' : r.kind === 'text' ? r.body : r.kind === 'image' ? '📷 Foto' : r.kind === 'video' ? '🎬 Video' : r.kind === 'voice' ? '🎤 Sprachnachricht' : r.kind === 'file' ? '📎 Datei' : r.body || '…';
  return (
    <button className="quote" onClick={() => onJump(r.id)}>
      <b>{nameOf(r.senderId)}</b>
      <span>{label}</span>
    </button>
  );
}

export const MessageBubble = memo(function MessageBubble(p: Props) {
  const { m, myId } = p;
  const mine = m.senderId === myId;
  const touch = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  if (m.kind === 'system') return <div className="sys-msg">{systemText(m, (id) => p.nameOf(id))}</div>;

  const deleted = !!m.deletedAt;
  const status = mine ? messageStatus(m, p.members, myId) : null;
  const mediaOnly = !deleted && !!m.media && (m.kind === 'image' || m.kind === 'video') && !m.body && !m.replyTo && !m.forwarded;
  const hue = hashHue(m.senderId ?? 'x');

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    touch.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { navigator.vibrate?.(15); p.onMenu(m); touch.current = null; }, 420) };
  };
  const cancel = () => { if (touch.current) { clearTimeout(touch.current.t); touch.current = null; } };
  const move = (e: React.PointerEvent) => { if (touch.current && Math.hypot(e.clientX - touch.current.x, e.clientY - touch.current.y) > 10) cancel(); };

  return (
    <>
      <div className={`msg-row ${mine ? 'out' : 'in'} ${p.grouped ? 'grouped' : ''} ${p.first ? 'first' : ''}`} data-mid={m.id}
        onContextMenu={(e) => { e.preventDefault(); p.onMenu(m); }}
        onDoubleClick={() => !deleted && !m.local && p.onReact(m, '❤️')}>
        {mine && !m.local && !deleted && <button className="icon-btn msg-actions" onClick={() => p.onMenu(m)} aria-label="Nachrichtenoptionen"><Icon name="more" size={18} /></button>}
        <div className={`bubble ${mediaOnly ? 'media-only' : ''} ${deleted ? 'deleted' : ''} ${p.highlighted ? 'highlight' : ''}`}
          onPointerDown={down} onPointerUp={cancel} onPointerLeave={cancel} onPointerMove={move} onPointerCancel={cancel}>
          {p.isGroup && !mine && p.first && <div className="sender" style={{ color: `hsl(${hue} 70% 55%)` }}>{p.nameOf(m.senderId)}</div>}
          {deleted ? (
            <span className="text"><Icon name="ban" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{mine ? 'Du hast diese Nachricht gelöscht' : 'Diese Nachricht wurde gelöscht'}</span>
          ) : (
            <>
              {m.forwarded && <div className="fwd"><Icon name="share" size={13} />Weitergeleitet</div>}
              {m.replyTo && <ReplyQuote m={m} nameOf={p.nameOf} onJump={p.onJump} />}
              {m.media && <MediaContent m={m} onOpen={() => p.onOpenMedia(m)} />}
              {m.body && <div className="text">{linkify(m.body)}</div>}
            </>
          )}
          <span className="foot">
            {m.editedAt && !deleted && <span>bearbeitet</span>}
            <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
            {status && !deleted && <Ticks status={status} />}
          </span>
          {m.reactions.length > 0 && !deleted && (
            <div className="reactions">
              {Object.entries(m.reactions.reduce<Record<string, string[]>>((a, r) => ((a[r.emoji] ??= []).push(r.userId), a), {})).map(([emoji, users]) => (
                <button key={emoji} className={`reaction-chip ${users.includes(myId) ? 'mine' : ''}`} onClick={() => p.onReact(m, users.includes(myId) ? '' : emoji)}
                  aria-label={`${emoji} von ${users.length}`}>
                  {emoji}{users.length > 1 && <small>{users.length}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
        {!mine && !m.local && !deleted && <button className="icon-btn msg-actions" onClick={() => p.onMenu(m)} aria-label="Nachrichtenoptionen"><Icon name="more" size={18} /></button>}
      </div>
      {m.local?.status === 'failed' && (
        <div className="msg-failed" role="alert">
          <span>Senden fehlgeschlagen{m.local.error ? `: ${m.local.error}` : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => p.onRetry(m)}>Erneut senden</button>
          <button className="btn btn-ghost btn-sm btn-text-danger" onClick={() => p.onDiscard(m)}>Verwerfen</button>
        </div>
      )}
    </>
  );
});
