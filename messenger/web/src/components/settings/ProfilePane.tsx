import { useRef, useState } from 'react';
import { ApiError, del, errorMessage, patch, post, put, uploadMedia } from '../../api';
import { useSession } from '../../store/session';
import { confirmDialog, toast } from '../../store/ui';
import type { Me } from '../../types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { checkImageFile, IMAGE_ACCEPT } from './imageFile';
import { Group, PaneShell } from './parts';

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export function ProfilePane({ onBack }: { onBack: () => void }) {
  const me = useSession((s) => s.me)!;
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState(me.displayName);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; username?: string; bio?: string; form?: string }>({});
  const [avatarBusy, setAvatarBusy] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== me.displayName || username !== me.username || bio !== me.bio;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Bitte gib einen Namen ein.';
    else if (name.trim().length > 60) next.name = 'Höchstens 60 Zeichen.';
    if (!USERNAME_RE.test(username)) next.username = '3–30 Zeichen: Buchstaben, Ziffern und Unterstrich.';
    if (bio.length > 300) next.bio = 'Höchstens 300 Zeichen.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body: Record<string, string> = {};
    if (name.trim() !== me.displayName) body.displayName = name.trim();
    if (username !== me.username) body.username = username;
    if (bio !== me.bio) body.bio = bio;
    setSaving(true);
    try {
      const { user } = await patch<{ user: Me }>('/api/me', body);
      setMe(user);
      setName(user.displayName); setUsername(user.username); setBio(user.bio);
      toast('Profil gespeichert', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'username_taken') setErrors({ username: 'Dieser Benutzername ist bereits vergeben.' });
      else if (err instanceof ApiError && err.code === 'validation_error') setErrors({ form: `Bitte prüfe deine Eingaben. (${err.message})` });
      else setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setAvatarError(null);
    const problem = checkImageFile(f, 10);
    if (problem) { setAvatarError(problem); return; }
    setAvatarBusy(0);
    try {
      const media = await uploadMedia(f, f.name || 'avatar', { purpose: 'avatar' }, (p) => setAvatarBusy(p));
      const { user } = await put<{ user: Me }>('/api/me/avatar', { mediaId: media.id });
      setMe(user);
      toast('Profilbild aktualisiert', 'success');
    } catch (err) {
      setAvatarError(errorMessage(err));
    } finally {
      setAvatarBusy(null);
    }
  }

  async function removeAvatar() {
    if (!(await confirmDialog({ title: 'Profilbild entfernen?', message: 'Stattdessen werden wieder deine Initialen angezeigt.', confirmLabel: 'Entfernen', danger: true }))) return;
    setAvatarError(null);
    setAvatarBusy(0);
    try {
      const { user } = await del<{ user: Me }>('/api/me/avatar');
      setMe(user);
      toast('Profilbild entfernt', 'success');
    } catch (err) {
      setAvatarError(errorMessage(err));
    } finally {
      setAvatarBusy(null);
    }
  }

  async function resend() {
    try {
      await post('/api/auth/resend-verification', { email: me.email });
      setResent(true);
      toast('Bestätigungs-E-Mail wurde gesendet', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <PaneShell title="Profil" onBack={onBack}>
      <div className="set-avatar">
        <Avatar name={me.displayName} src={me.avatarUrl} size={96} />
        <div className="set-avatar-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={avatarBusy !== null}>
            <Icon name="camera" size={18} />{me.avatarUrl ? 'Foto ändern' : 'Foto hochladen'}
          </button>
          {me.avatarUrl && <button className="btn btn-ghost btn-sm btn-text-danger" onClick={removeAvatar} disabled={avatarBusy !== null}>Foto entfernen</button>}
          <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onPickAvatar} aria-label="Profilbild auswählen" />
        </div>
        {avatarBusy !== null && <div className="set-progress" role="status"><progress max={1} value={avatarBusy} aria-label="Fortschritt" /><span>{avatarBusy > 0 ? 'Wird hochgeladen…' : 'Einen Moment…'}</span></div>}
        {avatarError && <div className="form-error" role="alert">{avatarError}</div>}
        <small className="muted-text">Das Bild wird automatisch quadratisch zugeschnitten.</small>
      </div>

      <form className="set-form" onSubmit={save} noValidate>
        <label className="field">
          <span>Anzeigename</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" aria-invalid={!!errors.name} />
          {errors.name && <span className="err" role="alert">{errors.name}</span>}
        </label>
        <label className="field">
          <span>Benutzername</span>
          <span className="set-at"><b aria-hidden="true">@</b>
            <input value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" aria-invalid={!!errors.username} aria-label="Benutzername" />
          </span>
          {errors.username ? <span className="err" role="alert">{errors.username}</span> : <span className="hint">Andere finden dich über diesen Namen. Buchstaben, Ziffern und Unterstrich.</span>}
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} aria-label="Bio" placeholder="Etwas über dich" aria-invalid={!!errors.bio} />
          <span className="hint set-count">{bio.length}/300</span>
          {errors.bio && <span className="err" role="alert">{errors.bio}</span>}
        </label>
        {errors.form && <div className="form-error" role="alert">{errors.form}</div>}
        <button className="btn btn-primary" type="submit" disabled={!dirty || saving}>{saving ? 'Speichert…' : 'Änderungen speichern'}</button>
      </form>

      <Group title="E-Mail-Adresse">
        <div className="settings-row">
          <span className="icon-wrap"><Icon name="mail" size={18} /></span>
          <div className="label"><span className="ellipsis" style={{ display: 'block' }}>{me.email}</span>
            <small>{me.emailVerified ? 'Bestätigt' : 'Noch nicht bestätigt – bitte prüfe dein Postfach.'}</small></div>
          <span className={`set-pill ${me.emailVerified ? 'ok' : 'warn'}`}>{me.emailVerified ? 'Bestätigt' : 'Offen'}</span>
        </div>
        {!me.emailVerified && (
          <button className="settings-row" onClick={resend} disabled={resent}>
            <span className="icon-wrap"><Icon name="refresh" size={18} /></span>
            <span className="label">{resent ? 'Bestätigungs-E-Mail gesendet' : 'Bestätigungs-E-Mail erneut senden'}</span>
          </button>
        )}
      </Group>

      <Group>
        <button className="settings-row set-danger" onClick={() => void useSession.getState().logout()}>
          <span className="icon-wrap"><Icon name="logout" size={18} /></span>
          <span className="label">Abmelden</span>
        </button>
      </Group>
    </PaneShell>
  );
}
