import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../../api';
import { EMOJI_GROUPS, prepareImage, splitEmojis, videoMeta } from '../../lib/chat';
import { formatBytes } from '../../lib/format';
import { useContacts } from '../../store/contacts';
import { useStatus, type StatusInput, type Visibility } from '../../store/status';
import { confirmDialog, toast } from '../../store/ui';
import type { Media, StatusItem } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { BG_COLORS, DEFAULT_BG, FONTS, StatusCanvas, TEXT_COLORS } from './StatusCanvas';

const MAX_BODY = 700;
const EMOJIS = EMOJI_GROUPS.flatMap((g) => splitEmojis(g.list));

type Align = NonNullable<StatusItem['style']['align']>;
const ALIGNS: { id: Align; label: string }[] = [{ id: 'left', label: 'Links' }, { id: 'center', label: 'Mitte' }, { id: 'right', label: 'Rechts' }];
const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: 'contacts', label: 'Meine Kontakte', hint: 'Alle deine Kontakte sehen den Status.' },
  { id: 'only', label: 'Nur ausgewählte Kontakte', hint: 'Nur die Auswahl sieht den Status.' },
  { id: 'except', label: 'Alle außer …', hint: 'Alle Kontakte außer der Auswahl.' },
];

function friendly(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'status_limit') return 'Du hast bereits 30 aktive Status. Lösche einen Status, um einen neuen zu veröffentlichen – oder speichere ihn als Entwurf (Entwürfe zählen mit).';
    if (e.code === 'type_not_allowed' || e.code === 'invalid_media') return 'Dieser Dateityp wird nicht unterstützt. Status können nur Bilder und Videos enthalten.';
    if (e.status === 413) return `${e.message} Wähle eine kleinere Datei.`;
    if (e.status === 429) return 'Zu viele Status in kurzer Zeit. Bitte warte einen Moment.';
    if (e.status === 0) return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.';
  }
  return errorMessage(e);
}

interface Props {
  /** Entwurf bearbeiten; ohne Angabe wird ein neuer Status erstellt */
  draft?: StatusItem;
  initialMode?: 'text' | 'media';
  onClose: () => void;
}

export function StatusComposer({ draft, initialMode = 'text', onClose }: Props) {
  const contacts = useContacts((s) => s.contacts);
  const contactsLoaded = useContacts((s) => s.loaded);
  const [mode, setMode] = useState<'text' | 'media'>(draft ? (draft.kind === 'text' ? 'text' : 'media') : initialMode);
  const [text, setText] = useState(draft?.kind === 'text' ? draft.body : '');
  const [caption, setCaption] = useState(draft && draft.kind !== 'text' ? draft.body : '');
  const [bg, setBg] = useState(draft?.style.bg ?? DEFAULT_BG);
  const [color, setColor] = useState(draft?.style.color ?? '#ffffff');
  const [font, setFont] = useState<NonNullable<StatusItem['style']['font']>>(draft?.style.font ?? 'sans');
  const [align, setAlign] = useState<Align>(draft?.style.align ?? 'center');
  const [emoji, setEmoji] = useState(draft?.style.emoji ?? '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<Media | null>(draft?.media ?? null);
  const [visibility, setVisibility] = useState<Visibility>(draft?.visibility ?? 'contacts');
  const [audience, setAudience] = useState<Set<string>>(() => new Set(draft?.audienceIds ?? []));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<null | 'draft' | 'publish'>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const confirming = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const uploaded = useRef<{ file: File; media: Media } | null>(null);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { dirty.current = true; set(v); };

  useEffect(() => { if (mode === 'text') textRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest' }); }, [error]);
  useEffect(() => { if (!contactsLoaded) void useContacts.getState().load().catch(() => {}); }, [contactsLoaded]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Stabil, damit das Modal seinen Fokus nicht bei jedem Tastendruck neu setzt
  const close = useCallback(async () => {
    if (confirming.current) return;
    if (dirty.current) {
      confirming.current = true;
      const discard = await confirmDialog({ title: 'Änderungen verwerfen?', message: 'Dein Status wurde noch nicht gespeichert.', confirmLabel: 'Verwerfen', cancelLabel: 'Weiter bearbeiten', danger: true });
      confirming.current = false;
      if (!discard) return;
    }
    onCloseRef.current();
  }, []);

  const shownContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => !q || c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
  }, [contacts, query]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!/^(image|video)\//.test(f.type)) { setError('Dieser Dateityp wird nicht unterstützt. Bitte wähle ein Bild oder Video.'); return; }
    const kind = f.type.startsWith('video/') ? 'video' : 'image';
    if (draft && draft.kind !== kind) { setError(`Dieser Entwurf enthält ${draft.kind === 'video' ? 'ein Video' : 'ein Foto'} – du kannst es nur durch ${draft.kind === 'video' ? 'ein anderes Video' : 'ein anderes Foto'} ersetzen.`); return; }
    dirty.current = true;
    setFile(f);
  }

  const kindOfCurrent: 'image' | 'video' | null = file ? (file.type.startsWith('video/') ? 'video' : 'image') : existing ? (existing.kind === 'video' ? 'video' : 'image') : null;

  async function submit(publish: boolean) {
    setError(null);
    if (mode === 'text' && !text.trim()) { setError('Bitte gib einen Text ein.'); return; }
    if (mode === 'media' && !file && !existing) { setError('Bitte wähle ein Foto oder Video aus.'); return; }
    if (visibility === 'only' && audience.size === 0) { setError('Bitte wähle mindestens einen Kontakt aus.'); return; }
    if (visibility === 'except' && audience.size === 0) { setError('Bitte wähle mindestens einen Kontakt aus, der den Status nicht sehen soll – oder wähle „Meine Kontakte“.'); return; }
    setBusy(publish ? 'publish' : 'draft');
    try {
      let input: StatusInput;
      if (mode === 'text') {
        input = {
          kind: 'text', body: text.trim(), mediaId: undefined, visibility, audienceIds: [...audience],
          style: { bg, color, font, align, ...(emoji ? { emoji } : {}) },
        };
      } else {
        let media = existing;
        if (file) {
          if (uploaded.current?.file === file) media = uploaded.current.media;
          else {
            setProgress(0);
            const isVideo = file.type.startsWith('video/');
            const prepared = isVideo ? { blob: file as Blob, name: file.name, ...(await videoMeta(file)) } : { ...(await prepareImage(file)), durationMs: 0 };
            media = await useStatus.getState().upload(prepared.blob, prepared.name, { width: prepared.width, height: prepared.height, durationMs: prepared.durationMs }, setProgress);
            uploaded.current = { file, media };
          }
        }
        if (!media || (media.kind !== 'image' && media.kind !== 'video')) throw new ApiError(400, 'type_not_allowed', 'Status unterstützt nur Bilder und Videos.');
        input = { kind: media.kind, body: caption.trim(), style: {}, mediaId: media.id, visibility, audienceIds: [...audience] };
      }
      const st = useStatus.getState();
      if (draft) {
        await st.update(draft.id, input);
        if (publish) await st.publish(draft.id);
      } else await st.create(input, publish);
      toast(publish ? 'Status veröffentlicht – er ist 24 Stunden sichtbar.' : 'Entwurf gespeichert.', 'success');
      dirty.current = false;
      onCloseRef.current();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const toggleAudience = (id: string) => {
    dirty.current = true;
    setAudience((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const style: StatusItem['style'] = { bg, color, font, align, ...(emoji ? { emoji } : {}) };
  const disabled = busy !== null;
  const mediaSrc = previewUrl ?? existing?.url ?? null;
  const canSubmit = mode === 'text' ? !!text.trim() : !!(file || existing);

  return (
    <Modal variant="full" className="modal-st" title={draft ? 'Entwurf bearbeiten' : 'Neuer Status'} onClose={close} closeOnBackdrop={false}
      footer={
        <>
          <button className="btn btn-secondary" disabled={disabled || !canSubmit} onClick={() => submit(false)}>{busy === 'draft' ? 'Speichern …' : 'Als Entwurf speichern'}</button>
          <button className="btn btn-primary" disabled={disabled || !canSubmit} onClick={() => submit(true)}>{busy === 'publish' ? 'Wird veröffentlicht …' : 'Veröffentlichen'}</button>
        </>
      }>
      <div className="stc">
        {!draft && (
          <div className="segmented stc-mode" role="group" aria-label="Art des Status">
            <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Icon name="type" size={16} /> Text</button>
            <button type="button" aria-pressed={mode === 'media'} onClick={() => setMode('media')}><Icon name="image" size={16} /> Foto / Video</button>
          </div>
        )}
        <div className="stc-cols">
        <div className="stc-preview">
          <div className="stc-frame" role="group" aria-label="Vorschau">
            {mode === 'text' ? (
              <StatusCanvas style={style} body={text || 'Dein Text'} className={text ? '' : 'stc-placeholder'} />
            ) : mediaSrc ? (
              <>
                {kindOfCurrent === 'video' ? <video src={mediaSrc} className="stc-media" muted playsInline controls aria-label="Videovorschau" /> : <img src={mediaSrc} className="stc-media" alt="Bildvorschau" />}
                {caption.trim() && <p className="sv-caption stc-caption">{caption}</p>}
              </>
            ) : (
              <button className="stc-pick" type="button" onClick={() => fileInput.current?.click()}>
                <Icon name="image" size={40} />
                <b>Foto oder Video wählen</b>
                <small>aus der Galerie</small>
              </button>
            )}
          </div>
        </div>

        <div className="stc-controls">
          {mode === 'text' ? (
            <>
              <label className="field">
                <span>Text</span>
                <textarea value={text} maxLength={MAX_BODY} rows={4} placeholder="Was gibt es Neues?" aria-label="Statustext" ref={textRef} onChange={(e) => touch(setText)(e.target.value)} />
                <span className="hint stc-count" aria-live="off">{text.length}/{MAX_BODY}</span>
              </label>
              <div className="field">
                <span id="stc-bg">Hintergrund</span>
                <div className="stc-swatches" role="group" aria-labelledby="stc-bg">
                  {BG_COLORS.map((c) => (
                    <button key={c.hex} type="button" className="stc-sw" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${c.hex}, white 16%), color-mix(in oklab, ${c.hex}, black 38%))` }}
                      aria-label={`Hintergrund ${c.name}`} aria-pressed={bg === c.hex} onClick={() => touch(setBg)(c.hex)} />
                  ))}
                </div>
              </div>
              <div className="field">
                <span id="stc-fg">Textfarbe</span>
                <div className="stc-swatches" role="group" aria-labelledby="stc-fg">
                  {TEXT_COLORS.map((c) => (
                    <button key={c.hex} type="button" className="stc-sw stc-sw-text" style={{ background: c.hex }} aria-label={`Textfarbe ${c.name}`} aria-pressed={color === c.hex} onClick={() => touch(setColor)(c.hex)} />
                  ))}
                </div>
              </div>
              <div className="field">
                <span id="stc-font">Schriftart</span>
                <div className="segmented stc-wrap" role="group" aria-labelledby="stc-font">
                  {FONTS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={font === f.id} style={{ fontFamily: f.stack }} onClick={() => touch(setFont)(f.id)}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span id="stc-align">Ausrichtung</span>
                <div className="segmented" role="group" aria-labelledby="stc-align">
                  {ALIGNS.map((a) => (
                    <button key={a.id} type="button" aria-pressed={align === a.id} onClick={() => touch(setAlign)(a.id)}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span>Emoji</span>
                <div className="row">
                  <button type="button" className="btn btn-secondary btn-sm" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((o) => !o)}>
                    <Icon name="smile" size={18} /> {emoji ? <>Emoji ändern <span className="stc-emoji-cur" aria-hidden="true">{emoji}</span></> : 'Emoji wählen'}
                  </button>
                  {emoji && <button type="button" className="btn btn-ghost btn-sm" onClick={() => touch(setEmoji)('')}>Entfernen</button>}
                </div>
                {emojiOpen && (
                  <div className="emoji-panel" role="listbox" aria-label="Emoji auswählen">
                    {EMOJIS.map((e, i) => (
                      <button key={i} type="button" role="option" aria-selected={emoji === e} onClick={() => { touch(setEmoji)(e); setEmojiOpen(false); }}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <input ref={fileInput} type="file" accept="image/*,video/*" hidden aria-label="Foto oder Video auswählen" data-testid="status-file"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="field">
                <span>Datei</span>
                <div className="row">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>
                    <Icon name="image" size={18} /> {file || existing ? 'Andere Datei wählen' : 'Aus der Galerie wählen'}
                  </button>
                  {file && <small className="muted-text ellipsis">{file.name} · {formatBytes(file.size)}</small>}
                </div>
              </div>
              <label className="field">
                <span>Beschriftung (optional)</span>
                <textarea value={caption} maxLength={MAX_BODY} rows={2} placeholder="Beschriftung hinzufügen …" onChange={(e) => touch(setCaption)(e.target.value)} />
                <span className="hint stc-count">{caption.length}/{MAX_BODY}</span>
              </label>
            </>
          )}

          <fieldset className="stc-vis">
            <legend>Wer darf den Status sehen?</legend>
            {VISIBILITY.map((v) => (
              <label key={v.id} className="stc-radio">
                <input type="radio" name="status-vis" checked={visibility === v.id} onChange={() => { dirty.current = true; setVisibility(v.id); }} />
                <span className="grow"><b>{v.label}</b><small>{v.hint}</small></span>
              </label>
            ))}
            {visibility !== 'contacts' && (
              <div className="stc-audience">
                {!contacts.length ? <p className="muted-text">Du hast noch keine Kontakte.</p> : (
                  <>
                    {contacts.length > 8 && <label className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kontakte durchsuchen" aria-label="Kontakte durchsuchen" /></label>}
                    <ul className="list" aria-label={visibility === 'only' ? 'Kontakte, die den Status sehen dürfen' : 'Kontakte, die den Status nicht sehen sollen'}>
                      {shownContacts.map((c) => (
                        <li key={c.id}>
                          <label className="list-item stc-contact">
                            <Avatar name={c.displayName} src={c.avatarUrl} size={36} />
                            <span className="grow ellipsis">{c.displayName}</span>
                            <input type="checkbox" checked={audience.has(c.id)} onChange={() => toggleAudience(c.id)} aria-label={c.displayName} />
                          </label>
                        </li>
                      ))}
                    </ul>
                    <p className="hint" role="status">{audience.size} ausgewählt</p>
                  </>
                )}
              </div>
            )}
          </fieldset>

          <p className="stc-note"><Icon name="clock" size={16} /> Veröffentlichte Status sind 24 Stunden sichtbar und verschwinden danach automatisch. Danach lassen sie sich nicht mehr bearbeiten, aber jederzeit löschen. Entwürfe sieht niemand außer dir.</p>

          {progress !== null && (
            <div className="stc-progress" role="progressbar" aria-label="Hochladen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
              <span>Wird hochgeladen … {Math.round(progress * 100)} %</span>
            </div>
          )}
          {error && <div className="form-error" role="alert" ref={errorRef}>{error}</div>}
        </div>
        </div>
      </div>
    </Modal>
  );
}
