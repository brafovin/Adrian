import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, uploadMedia } from '../api';
import { DEFAULT_BG_PARAMS, useBackgrounds } from '../store/backgrounds';
import { confirmDialog, toast, useConfirm } from '../store/ui';
import type { Background, BackgroundParams } from '../types';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { checkImageFile, IMAGE_ACCEPT, imageMime, loadImage } from './settings/imageFile';
import './background-editor.css';

/** Ausgabegröße des Zuschnitts (Hochformat-Chatfenster, ca. 9 : 19,5). */
const OUT_W = 1170;
const OUT_H = 2532;
const FRAME_ASPECT = OUT_W / OUT_H;
const MAX_SOURCE = 2400;
const MAX_MB = 15;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
/** Referenzbreite eines Handy-Chatfensters, um die Unschärfe in der Vorschau maßstabsgetreu zu zeigen. */
const REF_W = 390;

interface Crop { zoom: number; x: number; y: number }
interface Dims { iw: number; ih: number; fw: number; fh: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Geometrie des Zuschnitts: Das Bild füllt den Rahmen („cover“) und wird um `zoom` vergrößert.
 * x/y ∈ [-1, 1] verschieben den sichtbaren Ausschnitt relativ zum Überstand (-1 = linker/oberer Rand, 1 = rechter/unterer Rand).
 */
function geom(d: Dims, zoom: number, x: number, y: number) {
  const s = Math.max(d.fw / d.iw, d.fh / d.ih) * zoom;
  const dw = d.iw * s;
  const dh = d.ih * s;
  const ox = Math.max(0, dw - d.fw);
  const oy = Math.max(0, dh - d.fh);
  return { s, dw, dh, ox, oy, left: -(ox / 2) * (1 + x), top: -(oy / 2) * (1 + y) };
}

/** Ändert den Zoom und hält dabei die Bildmitte des Ausschnitts fest. */
function applyZoom(c: Crop, zoom: number, d: Dims | null): Crop {
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  if (!d) return { ...c, zoom: z };
  const g0 = geom(d, c.zoom, c.x, c.y);
  const g1 = geom(d, z, 0, 0);
  const cx = (-g0.left + d.fw / 2) / g0.dw;
  const cy = (-g0.top + d.fh / 2) / g0.dh;
  const x = g1.ox > 0.5 ? clamp((cx * g1.dw - d.fw / 2) / (g1.ox / 2) - 1, -1, 1) : 0;
  const y = g1.oy > 0.5 ? clamp((cy * g1.dh - d.fh / 2) / (g1.oy / 2) - 1, -1, 1) : 0;
  return { zoom: z, x, y };
}

/** Verschiebt den Ausschnitt um (dx, dy) Bildschirmpixel – das Bild folgt dem Finger/der Maus. */
function applyDrag(c: Crop, dx: number, dy: number, d: Dims | null): Crop {
  if (!d) return c;
  const g = geom(d, c.zoom, c.x, c.y);
  return {
    ...c,
    x: g.ox > 0.5 ? clamp(c.x - dx / (g.ox / 2), -1, 1) : c.x,
    y: g.oy > 0.5 ? clamp(c.y - dy / (g.oy / 2), -1, 1) : c.y,
  };
}

function canvasBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Bild konnte nicht verarbeitet werden.'))), type, q));
}

/** Rendert den gewählten Ausschnitt (ohne Helligkeit/Overlay/Unschärfe – die werden zur Laufzeit angewendet). */
async function renderCrop(img: HTMLImageElement, c: Crop): Promise<{ blob: Blob; width: number; height: number }> {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const g = geom({ iw, ih, fw: OUT_W, fh: OUT_H }, c.zoom, c.x, c.y);
  const sw = OUT_W / g.s;
  const sh = OUT_H / g.s;
  const sx = clamp(-g.left / g.s, 0, Math.max(0, iw - sw));
  const sy = clamp(-g.top / g.s, 0, Math.max(0, ih - sh));
  const k = Math.min(1, sw / OUT_W); // nie hochskalieren
  const width = Math.max(2, Math.round(OUT_W * k));
  const height = Math.max(2, Math.round(OUT_H * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Dein Browser kann das Bild nicht zuschneiden.');
  ctx.fillStyle = '#fff'; // transparente PNGs
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.88);
  canvas.width = canvas.height = 0;
  return { blob, width, height };
}

/** Original für späteres Nachbearbeiten: höchstens 2400 px an der langen Seite. */
async function prepareSource(img: HTMLImageElement, file: File): Promise<{ blob: Blob; name: string }> {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const type = imageMime(file);
  if (Math.max(iw, ih) <= MAX_SOURCE && ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)) {
    return { blob: file, name: file.name || 'original' };
  }
  const k = Math.min(1, MAX_SOURCE / Math.max(iw, ih));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(iw * k));
  canvas.height = Math.max(1, Math.round(ih * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Dein Browser kann das Bild nicht verarbeiten.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
  canvas.width = canvas.height = 0;
  return { blob, name: 'original.jpg' };
}

interface Loaded { el: HTMLImageElement; url: string; revoke: boolean }

const pct = (v: number) => `${Math.round(v * 100)} %`;

interface Props {
  /** null = Standard-Hintergrund für alle Chats */
  conversationId: string | null;
  conversationTitle?: string;
  onClose: () => void;
}

/** Editor für individuelle Chat-Hintergründe (Galerie, Zuschneiden, Vorschau, Helligkeit/Overlay, Zurücksetzen). */
export function BackgroundEditor({ conversationId, conversationTitle, onClose }: Props) {
  const list = useBackgrounds((s) => s.list);
  // Ausgangszustand: vorhandener Hintergrund dieses Chats, sonst der Standard-Hintergrund (als Ausgangspunkt)
  const initial = useMemo<Background | null>(() => {
    const own = list.find((b) => b.conversationId === conversationId);
    return own ?? (conversationId ? list.find((b) => b.conversationId === null) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [scope, setScope] = useState<'chat' | 'all'>('chat');
  const target = conversationId === null || scope === 'all' ? 'default' : conversationId;
  const existing = list.find((b) => b.conversationId === (target === 'default' ? null : target)) ?? null;
  const chatSpecific = conversationId ? list.find((b) => b.conversationId === conversationId) ?? null : null;

  const [image, setImage] = useState<Loaded | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(!!initial);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [look, setLook] = useState({ brightness: DEFAULT_BG_PARAMS.brightness, overlay: DEFAULT_BG_PARAMS.overlay, blur: DEFAULT_BG_PARAMS.blur });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ label: string; progress: number } | null>(null);
  const [showBubbles, setShowBubbles] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [fs, setFs] = useState({ w: 0, h: 0 });

  const initialCrop = useRef<Crop>({ zoom: 1, x: 0, y: 0 });
  const initialLook = useRef(look);
  const frameRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dimsRef = useRef<Dims | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const objectUrls = useRef(new Set<string>());
  // Bereits hochgeladene Dateien, damit ein erneuter Versuch nach einem Fehler nichts doppelt hochlädt
  const uploaded = useRef<{ cropKey?: string; cropId?: string; sourceFor?: File; sourceId?: string }>({});

  // ---------- vorhandenes Bild laden (Nachbearbeiten)
  useEffect(() => {
    if (!initial) return;
    let dead = false;
    const src = initial.sourceUrl ?? initial.url;
    loadImage(src)
      .then((el) => {
        if (dead) return;
        setImage({ el, url: src, revoke: false });
        if (initial.sourceUrl) {
          const c = { zoom: initial.params.zoom, x: initial.params.x, y: initial.params.y };
          setCrop(c);
          initialCrop.current = c;
        }
        const lk = { brightness: initial.params.brightness, overlay: initial.params.overlay, blur: initial.params.blur };
        setLook(lk);
        initialLook.current = lk;
      })
      .catch(() => !dead && setError('Das gespeicherte Bild konnte nicht geladen werden. Wähle ein neues Bild aus.'))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };
  }, []);

  // ---------- Rahmengröße messen
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFs({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dims: Dims | null = image && fs.w > 0 ? { iw: image.el.naturalWidth, ih: image.el.naturalHeight, fw: fs.w, fh: fs.h } : null;
  dimsRef.current = dims;
  const g = dims ? geom(dims, crop.zoom, crop.x, crop.y) : null;

  const cropChanged = !!file || crop.zoom !== initialCrop.current.zoom || crop.x !== initialCrop.current.x || crop.y !== initialCrop.current.y;
  const lookChanged = look.brightness !== initialLook.current.brightness || look.overlay !== initialLook.current.overlay || look.blur !== initialLook.current.blur;
  dirtyRef.current = !!image && (cropChanged || lookChanged || (!!initial && initial.conversationId !== (target === 'default' ? null : target)));
  busyRef.current = !!saving;

  // ---------- Schließen (mit Rückfrage bei ungespeicherten Änderungen)
  const requestClose = useCallback(async () => {
    if (busyRef.current || useConfirm.getState().current) return;
    if (dirtyRef.current) {
      const ok = await confirmDialog({ title: 'Änderungen verwerfen?', message: 'Dein Hintergrund wurde noch nicht gespeichert.', confirmLabel: 'Verwerfen', cancelLabel: 'Weiter bearbeiten', danger: true });
      if (!ok) return;
    }
    onCloseRef.current();
  }, []);

  // ---------- Bedienung: Ziehen, Pinch, Mausrad, Tastatur
  const updateCrop = (fn: (c: Crop, d: Dims | null) => Crop) => setCrop((c) => fn(c, dimsRef.current));

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!image || saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: crop.zoom };
      last.current = null;
    } else last.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      const z = pinch.current.zoom * (dist / pinch.current.dist);
      updateCrop((c, d) => applyZoom(c, z, d));
    } else if (last.current) {
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      updateCrop((c, d) => applyDrag(c, dx, dy, d));
    }
  }
  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    const rest = [...pointers.current.values()][0];
    last.current = rest ? { ...rest } : null;
    if (!pointers.current.size) setDragging(false);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!image || saving) return;
    const step = e.shiftKey ? 0.25 : 0.06;
    const move = (dx: number, dy: number) => { e.preventDefault(); updateCrop((c) => ({ ...c, x: clamp(c.x + dx, -1, 1), y: clamp(c.y + dy, -1, 1) })); };
    switch (e.key) {
      case 'ArrowLeft': return move(-step, 0);
      case 'ArrowRight': return move(step, 0);
      case 'ArrowUp': return move(0, -step);
      case 'ArrowDown': return move(0, step);
      case '+': case '=': e.preventDefault(); return updateCrop((c, d) => applyZoom(c, c.zoom * 1.1, d));
      case '-': case '_': e.preventDefault(); return updateCrop((c, d) => applyZoom(c, c.zoom / 1.1, d));
    }
  }
  // Mausrad / Trackpad-Pinch: braucht einen nicht-passiven Listener
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!dimsRef.current || busyRef.current) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      setCrop((c) => applyZoom(c, c.zoom * f, dimsRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- Bild auswählen
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    const problem = checkImageFile(f, MAX_MB);
    if (problem) { setError(problem); return; }
    const url = URL.createObjectURL(f);
    try {
      const el = await loadImage(url);
      if (el.naturalWidth * el.naturalHeight > 150e6) throw new Error('Das Bild hat zu viele Pixel. Bitte wähle ein kleineres Bild.');
      objectUrls.current.add(url);
      setImage((old) => { if (old?.revoke) { URL.revokeObjectURL(old.url); objectUrls.current.delete(old.url); } return { el, url, revoke: true }; });
      setFile(f);
      setCrop({ zoom: 1, x: 0, y: 0 });
    } catch (err) {
      URL.revokeObjectURL(url);
      setError(errorMessage(err));
    }
  }

  // ---------- Speichern
  async function save() {
    if (!image || saving) return;
    setError(null);
    const bgTarget = target;
    const params: BackgroundParams = { zoom: round3(crop.zoom), x: round3(crop.x), y: round3(crop.y), brightness: round3(look.brightness), overlay: round3(look.overlay), blur: round3(look.blur) };
    try {
      let mediaId: string;
      let sourceMediaId: string | null;
      if (!cropChanged && initial) {
        // nur Helligkeit/Overlay/Unschärfe geändert: vorhandene Bilder wiederverwenden
        mediaId = initial.mediaId;
        sourceMediaId = initial.sourceMediaId;
        setSaving({ label: 'Speichere…', progress: 0.9 });
      } else {
        setSaving({ label: 'Ausschnitt wird erstellt…', progress: 0.02 });
        const needSource = !!file;
        const share = needSource ? 0.45 : 0.9;
        const cropKey = JSON.stringify([crop, file?.name, file?.size, file?.lastModified]);
        if (uploaded.current.cropKey === cropKey && uploaded.current.cropId) mediaId = uploaded.current.cropId;
        else {
          const { blob, width, height } = await renderCrop(image.el, crop);
          setSaving({ label: 'Lade Ausschnitt hoch…', progress: 0.05 });
          const media = await uploadMedia(blob, 'background.jpg', { purpose: 'background', width, height }, (p) => setSaving({ label: 'Lade Ausschnitt hoch…', progress: 0.05 + p * share }));
          mediaId = media.id;
          uploaded.current.cropKey = cropKey;
          uploaded.current.cropId = media.id;
        }
        if (needSource) {
          if (uploaded.current.sourceFor === file && uploaded.current.sourceId) sourceMediaId = uploaded.current.sourceId;
          else {
            setSaving({ label: 'Lade Original hoch…', progress: 0.5 });
            const src = await prepareSource(image.el, file!);
            const media = await uploadMedia(src.blob, src.name, { purpose: 'background' }, (p) => setSaving({ label: 'Lade Original hoch…', progress: 0.5 + p * 0.4 }));
            sourceMediaId = media.id;
            uploaded.current.sourceFor = file!;
            uploaded.current.sourceId = media.id;
          }
        } else sourceMediaId = initial?.sourceMediaId ?? null;
        setSaving({ label: 'Speichere…', progress: 0.95 });
      }
      await useBackgrounds.getState().set(bgTarget, { mediaId, sourceMediaId, params });
      toast('Hintergrund gespeichert', 'success');
      busyRef.current = false;
      dirtyRef.current = false;
      onCloseRef.current();
    } catch (err) {
      setSaving(null);
      setError(errorMessage(err));
    }
  }

  async function reset() {
    if (!existing || saving) return;
    const isDefault = target === 'default';
    const ok = await confirmDialog({
      title: 'Hintergrund zurücksetzen?',
      message: isDefault
        ? 'Der Standard-Hintergrund wird entfernt. Chats ohne eigenen Hintergrund zeigen wieder die normale Chatfarbe.'
        : 'Der Hintergrund dieses Chats wird entfernt. Es gilt wieder der Standard-Hintergrund (falls vorhanden).',
      confirmLabel: 'Zurücksetzen',
      danger: true,
    });
    if (!ok) return;
    setSaving({ label: 'Setze zurück…', progress: 0.5 });
    try {
      await useBackgrounds.getState().clear(target);
      toast('Hintergrund zurückgesetzt', 'success');
      busyRef.current = false;
      dirtyRef.current = false;
      onCloseRef.current();
    } catch (err) {
      setSaving(null);
      setError(errorMessage(err));
    }
  }

  const title = conversationId === null ? 'Standard-Hintergrund' : `Chat-Hintergrund${conversationTitle ? ` – ${conversationTitle}` : ''}`;
  const layerStyle = image && g ? {
    filter: `brightness(${look.brightness}) blur(${(look.blur * fs.w) / REF_W}px)`,
  } : undefined;
  const set = (patch: Partial<typeof look>) => setLook((l) => ({ ...l, ...patch }));

  const footer = (
    <div className="bge-foot">
      {existing ? (
        <button className="btn btn-ghost btn-text-danger" onClick={reset} disabled={!!saving}>
          <Icon name="trash" size={18} />Zurücksetzen
        </button>
      ) : <span />}
      <div className="bge-foot-main">
        <button className="btn btn-secondary" onClick={() => void requestClose()} disabled={!!saving}>Abbrechen</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={!image || !!saving || loading}>{saving ? 'Speichert…' : 'Speichern'}</button>
      </div>
    </div>
  );

  return (
    <Modal title={title} onClose={requestClose} variant="full" className="bge" footer={footer} closeOnBackdrop={false}>
      <div className="bge-layout">
        <div className="bge-stage">
          <div
            ref={frameRef}
            className={`bge-frame ${image ? 'has-image' : ''} ${dragging ? 'dragging' : ''}`}
            style={{ aspectRatio: String(FRAME_ASPECT) }}
            tabIndex={0}
            role="group"
            aria-label="Bildausschnitt. Mit den Pfeiltasten verschieben, mit Plus und Minus vergrößern."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            data-testid="bge-frame"
          >
            {image && g && (
              <div className="bge-layer" style={layerStyle}>
                <img src={image.url} alt="" draggable={false} style={{ width: g.dw, height: g.dh, transform: `translate(${g.left}px, ${g.top}px)` }} data-testid="bge-image" />
              </div>
            )}
            {image && <div className="bge-overlay" style={{ opacity: look.overlay }} />}
            {!image && (
              <div className="bge-empty">
                {loading ? <span className="spinner" aria-label="Lädt" role="progressbar" /> : (
                  <>
                    <Icon name="image" size={30} />
                    <span>Noch kein Bild gewählt</span>
                  </>
                )}
              </div>
            )}
            {showBubbles && (
              <div className="bge-chat" aria-hidden="true">
                <div className="day-sep">Heute</div>
                <div className="msg-row in first"><div className="bubble"><div className="text">Hey! Schon den neuen Hintergrund gesehen? 👀</div><div className="foot"><span>12:41</span></div></div></div>
                <div className="msg-row out first"><div className="bubble"><div className="text">Sieht richtig gut aus!</div><div className="foot"><span>12:42</span></div></div></div>
                <div className="msg-row out grouped"><div className="bubble"><div className="text">Und alles bleibt gut lesbar 😍</div><div className="foot"><span>12:42</span></div></div></div>
                <div className="msg-row in first"><div className="bubble"><div className="text">Perfekt.</div><div className="foot"><span>12:43</span></div></div></div>
              </div>
            )}
            {dragging && <div className="bge-grid" aria-hidden="true" />}
          </div>
          <div className="bge-stage-actions">
            <button className="chip" aria-pressed={showBubbles} onClick={() => setShowBubbles((v) => !v)}>
              <Icon name={showBubbles ? 'eye' : 'eye-off'} size={16} />Beispielnachrichten
            </button>
            <button className="chip" onClick={() => setCrop({ zoom: 1, x: 0, y: 0 })} disabled={!image || (crop.zoom === 1 && crop.x === 0 && crop.y === 0)}>
              <Icon name="crop" size={16} />Ausschnitt zentrieren
            </button>
          </div>
        </div>

        <div className="bge-controls">
          <p className="bge-private"><Icon name="lock" size={18} /><span><b>Nur für dich sichtbar</b> – andere Teilnehmer sehen ihn nicht.</span></p>

          {conversationId !== null && (
            <div className="bge-scope">
              <div className="segmented" role="group" aria-label="Gilt für">
                <button aria-pressed={scope === 'chat'} onClick={() => setScope('chat')}>Nur dieser Chat</button>
                <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Alle Chats (Standard)</button>
              </div>
              <small className="muted-text">
                {scope === 'chat'
                  ? 'Gilt nur für diesen Chat und hat Vorrang vor dem Standard-Hintergrund.'
                  : chatSpecific
                    ? 'Wird der Standard für alle Chats ohne eigenen Hintergrund – dieser Chat behält seinen eigenen.'
                    : 'Gilt für alle Chats ohne eigenen Hintergrund.'}
              </small>
            </div>
          )}

          <div className="bge-pick">
            <button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={!!saving}>
              <Icon name="image" size={20} />{image ? 'Anderes Bild wählen' : 'Bild aus der Galerie wählen'}
            </button>
            <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onPick} aria-label="Bilddatei auswählen" data-testid="bge-file" />
            <small className="muted-text">JPEG, PNG, WebP, GIF oder AVIF, höchstens {MAX_MB} MB.</small>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {saving && (
            <div className="bge-progress" role="status">
              <span>{saving.label}</span>
              <progress max={1} value={saving.progress} aria-label="Fortschritt" />
            </div>
          )}

          <fieldset className="bge-sliders" disabled={!image || !!saving}>
            <legend className="sr-only">Anpassungen</legend>
            <Slider id="bge-zoom" label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={crop.zoom} text={`${crop.zoom.toFixed(1)}×`}
              onChange={(v) => updateCrop((c, d) => applyZoom(c, v, d))} />
            <Slider id="bge-brightness" label="Helligkeit" min={0.3} max={1.7} step={0.01} value={look.brightness} text={pct(look.brightness)} onChange={(v) => set({ brightness: v })} />
            <Slider id="bge-overlay" label="Abdunkeln" min={0} max={0.85} step={0.01} value={look.overlay} text={pct(look.overlay)} onChange={(v) => set({ overlay: v })} />
            <Slider id="bge-blur" label="Weichzeichnen" min={0} max={20} step={0.5} value={look.blur} text={look.blur === 0 ? 'aus' : `${look.blur}`} onChange={(v) => set({ blur: v })} />
          </fieldset>
          <p className="bge-tip muted-text">
            Ziehe das Bild mit Finger oder Maus, zoome per Schieberegler, Mausrad oder Zwei-Finger-Geste. Mit der Tastatur verschieben die Pfeiltasten den Ausschnitt.
            Abdunkeln und Weichzeichnen verbessern die Lesbarkeit der Nachrichten.
          </p>
          <p className="bge-tip bge-desktop-note muted-text">
            Hinweis: Der Ausschnitt wird im Hochformat gewählt (wie auf dem Handy). In breiten Chatfenstern am Computer wird der Hintergrund mittig angezeigt und oben/unten zugeschnitten.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Slider({ id, label, min, max, step, value, text, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; text: string; onChange: (v: number) => void }) {
  return (
    <div className="bge-slider">
      <div className="bge-slider-head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{text}</output></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={text} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
