import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatRemaining } from '../../lib/format';
import { useTick } from '../../lib/hooks';
import { useStatus } from '../../store/status';
import { confirmDialog, toast, toastError, useConfirm, useSheet } from '../../store/ui';
import type { PublicUser, StatusItem } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { StatusCanvas, ago } from './StatusCanvas';
import { ViewsPanel } from './ViewsPanel';

const DURATION = 5000;
const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

interface Props {
  user: PublicUser;
  statuses: StatusItem[];
  own: boolean;
  /** Startposition: bestimmter Status, erster ungesehener (Standard) oder letzter */
  start?: { id?: string; last?: boolean };
  hasPrevUser: boolean;
  onClose: () => void;
  onNextUser: () => void;
  onPrevUser: () => void;
}

/** Vollbild-Anzeige der Status eines Kontakts (oder der eigenen). */
export function StatusViewer({ user, statuses, own, start, hasPrevUser, onClose, onNextUser, onPrevUser }: Props) {
  useTick(20000);
  const [idx, setIdx] = useState(() => {
    if (start?.id) return Math.max(0, statuses.findIndex((s) => s.id === start.id));
    if (start?.last) return Math.max(0, statuses.length - 1);
    if (own) return 0;
    const first = statuses.findIndex((s) => !s.viewed);
    return first < 0 ? 0 : first;
  });
  const [holding, setHolding] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden');
  const [panel, setPanel] = useState(false);
  const [muted, setMuted] = useState(false);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [restart, setRestart] = useState(0);
  const confirming = useConfirm((s) => !!s.current);
  const sheetOpen = useSheet((s) => !!s.items);

  const len = statuses.length;
  const item = statuses[Math.min(idx, len - 1)];
  const paused = holding || manualPause || hidden || panel || confirming || sheetOpen;

  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const marked = useRef(new Set<string>());
  const press = useRef<{ x: number; y: number; t: number } | null>(null);

  const next = useCallback(() => (idx + 1 < len ? setIdx(idx + 1) : onNextUser()), [idx, len, onNextUser]);
  const prev = useCallback(() => {
    if (idx > 0) setIdx(idx - 1);
    else if (hasPrevUser) onPrevUser();
    else setRestart((n) => n + 1);
  }, [idx, hasPrevUser, onPrevUser]);
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => { if (!item) onClose(); }, [item, onClose]);
  useEffect(() => { if (len && idx >= len) setIdx(len - 1); }, [len, idx]);

  // Fokus in den Viewer, beim Schließen zurück
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const vis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', vis);
    const lock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('visibilitychange', vis);
      document.body.style.overflow = lock;
      prevFocus?.focus?.();
    };
  }, []);

  const media = item?.media;
  const isVideo = item?.kind === 'video' && !!media;
  const ready = !!item && (item.kind === 'text' || readyId === item.id || failedId === item.id);

  // Als gesehen markieren, sobald der Inhalt angezeigt wird
  useEffect(() => {
    if (!item || own || !ready || marked.current.has(item.id)) return;
    marked.current.add(item.id);
    void useStatus.getState().markViewed(item.id);
  }, [item, own, ready]);

  // Zeitsteuerung für Text/Bild (Video: siehe unten)
  useEffect(() => {
    const bar = fill.current;
    if (bar) bar.style.transform = 'scaleX(0)';
    if (!item || !ready || (isVideo && failedId !== item.id)) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (t: number) => {
      if (!pausedRef.current) elapsed += t - last;
      last = t;
      if (bar) bar.style.transform = `scaleX(${Math.min(1, elapsed / DURATION)})`;
      if (elapsed >= DURATION) { nextRef.current(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item?.id, ready, isVideo, failedId, restart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Video: Fortschritt = Wiedergabeposition, Pause folgt dem Zustand
  useEffect(() => {
    const v = video.current;
    if (!v || !isVideo) return;
    if (restart) v.currentTime = 0;
    let raf = 0;
    const tick = () => {
      if (fill.current && v.duration) fill.current.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item?.id, isVideo, restart]);
  useEffect(() => {
    const v = video.current;
    if (!v || !isVideo || !ready) return;
    if (paused) { v.pause(); return; }
    v.play().catch(() => {
      // Autoplay mit Ton blockiert → stumm starten
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
  }, [paused, ready, isVideo, item?.id, restart]);

  const toggleReaction = async (emoji: string) => {
    if (!item) return;
    try { await useStatus.getState().react(item.id, item.myReaction === emoji ? null : emoji); } catch (e) { toastError(e); }
  };

  async function removeCurrent() {
    if (!item) return;
    const ok = await confirmDialog({ title: 'Status löschen?', message: 'Der Status wird sofort für alle entfernt. Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    try {
      await useStatus.getState().remove(item.id);
      toast('Status gelöscht', 'success');
    } catch (e) { toastError(e); }
  }

  // Tastatur
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (useConfirm.getState().current || useSheet.getState().items) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    if (e.key === 'Escape') { e.preventDefault(); if (panel) setPanel(false); else onClose(); }
    else if (typing) return;
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if ((e.key === ' ' || e.key === 'Spacebar') && t.tagName !== 'BUTTON') { e.preventDefault(); setManualPause((p) => !p); }
    else if (e.key === 'Tab' && root.current) {
      const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (!root.current.contains(document.activeElement) || (e.shiftKey && (document.activeElement === first || document.activeElement === root.current))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Zeiger: Tippen = weiter/zurück, Halten = Pause, nach unten wischen = schließen
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setHolding(true);
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setHolding(false);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, dt = performance.now() - p.t;
    if (dy > 90 && dy > Math.abs(dx) * 1.5) { onClose(); return; }
    if (dt < 320 && Math.abs(dx) < 14 && Math.abs(dy) < 14) {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 3) prev(); else next();
    }
  };
  const onCancel = () => { press.current = null; setHolding(false); };

  if (!item) return null;
  const name = own ? 'Mein Status' : user.displayName;

  return createPortal(
    <div className="sv-overlay" ref={root} role="dialog" aria-modal="true" aria-label={`Status von ${own ? 'dir' : user.displayName}`} tabIndex={-1}>
      <button className="sv-arrow sv-arrow-l" onClick={prev} aria-label="Zurück"><Icon name="back" size={26} /></button>
      <div className={`sv-stage ${holding ? 'holding' : ''}`}>
        <div className="sv-content">
          {item.kind === 'text' ? (
            <StatusCanvas style={item.style} body={item.body} className="sv-canvas" />
          ) : failedId === item.id ? (
            <div className="sv-fail" role="alert"><Icon name={item.kind === 'video' ? 'video-off' : 'image'} size={34} /><span>Der Inhalt konnte nicht geladen werden.</span></div>
          ) : item.kind === 'video' && media ? (
            <video key={item.id} ref={video} className="sv-media" src={media.url} poster={media.thumbUrl ?? undefined} playsInline muted={muted} preload="auto"
              onLoadedData={() => setReadyId(item.id)} onEnded={() => nextRef.current()} onError={() => setFailedId(item.id)} aria-label={item.body || 'Videostatus'} />
          ) : media ? (
            <img key={item.id} className="sv-media" src={media.url} alt={item.body || 'Bildstatus'} draggable={false}
              onLoad={() => setReadyId(item.id)} onError={() => setFailedId(item.id)} />
          ) : null}
          {!ready && failedId !== item.id && <div className="sv-loading" role="status"><span className="spinner" aria-label="Lädt" /></div>}
        </div>
        <div className="sv-surface" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onCancel} onContextMenu={(e) => e.preventDefault()} />

        <div className="sv-top sv-chrome">
          <div className="sv-bars" aria-hidden="true">
            {statuses.map((s, i) => (
              <span key={s.id} className="sv-bar">
                {i === idx ? <i ref={fill} /> : <i style={{ transform: i < idx ? 'scaleX(1)' : 'scaleX(0)' }} />}
              </span>
            ))}
          </div>
          <div className="sv-head">
            <Avatar name={user.displayName} src={user.avatarUrl} size={38} />
            <div className="sv-who">
              <b className="ellipsis">{name}</b>
              <small>{own && item.expiresAt ? `${ago(item.publishedAt)} · ${formatRemaining(item.expiresAt)}` : ago(item.publishedAt)}</small>
            </div>
            <span className="sr-only" aria-live="polite">Status {Math.min(idx, len - 1) + 1} von {len}</span>
            {isVideo && <button className="icon-btn sv-btn" onClick={() => { setMuted((m) => !m); }} aria-label={muted ? 'Ton einschalten' : 'Ton ausschalten'} aria-pressed={muted}><Icon name={muted ? 'mute' : 'speaker'} size={20} /></button>}
            <button className="icon-btn sv-btn" onClick={() => setManualPause((p) => !p)} aria-label={manualPause ? 'Fortsetzen' : 'Pausieren'} aria-pressed={manualPause}><Icon name={manualPause ? 'play' : 'pause'} size={20} /></button>
            {own && <button className="icon-btn sv-btn" onClick={removeCurrent} aria-label="Status löschen"><Icon name="trash" size={20} /></button>}
            <button className="icon-btn sv-btn" onClick={onClose} aria-label="Schließen"><Icon name="x" size={22} /></button>
          </div>
        </div>

        <div className="sv-bottom sv-chrome">
          {item.kind !== 'text' && item.body && <p className="sv-caption">{item.body}</p>}
          {own ? (
            <button className="sv-views-btn" onClick={() => setPanel(true)} aria-label={`${item.viewCount ?? 0} Aufrufe, ${item.reactionCount ?? 0} Reaktionen anzeigen`}>
              <Icon name="eye" size={20} /> <span>{item.viewCount ?? 0} {item.viewCount === 1 ? 'Aufruf' : 'Aufrufe'}</span>
              {!!item.reactionCount && <span className="sv-views-react">· {item.reactionCount} {item.reactionCount === 1 ? 'Reaktion' : 'Reaktionen'}</span>}
              <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
            </button>
          ) : (
            <div className="sv-reactions" role="group" aria-label="Auf den Status reagieren">
              {REACTIONS.map((e) => (
                <button key={e} className={`sv-react ${item.myReaction === e ? 'on' : ''}`} onClick={() => toggleReaction(e)} aria-pressed={item.myReaction === e} aria-label={`Reaktion ${e}`}>{e}</button>
              ))}
            </div>
          )}
        </div>
        {panel && own && <ViewsPanel statusId={item.id} onClose={() => { setPanel(false); root.current?.focus(); }} />}
      </div>
      <button className="sv-arrow sv-arrow-r" onClick={next} aria-label="Weiter"><Icon name="forward" size={26} /></button>
    </div>,
    document.body,
  );
}
