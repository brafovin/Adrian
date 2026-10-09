import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, del, errorMessage, get, put } from '../../api';
import { useSession } from '../../store/session';
import { confirmDialog, toast } from '../../store/ui';
import { Icon } from '../Icon';
import { Group, PaneShell } from './parts';

export function AccountPane({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwOk(false);
    if (next.length < 10) return setPwError('Das neue Passwort muss mindestens 10 Zeichen lang sein.');
    if (next !== repeat) return setPwError('Die beiden neuen Passwörter stimmen nicht überein.');
    if (next === cur) return setPwError('Das neue Passwort muss sich vom aktuellen unterscheiden.');
    setPwError(null);
    setPwBusy(true);
    try {
      await put('/api/me/password', { currentPassword: cur, newPassword: next });
      setCur(''); setNext(''); setRepeat('');
      setPwOk(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_credentials') setPwError('Das aktuelle Passwort ist falsch.');
      else if (err instanceof ApiError && err.code === 'validation_error') setPwError(`Das neue Passwort ist nicht zulässig: ${err.message.replace(/^[\w.]+:\s*/, '')}`);
      else setPwError(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await get('/api/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'adrian-datenexport.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('Datenexport heruntergeladen', 'success');
    } catch (err) {
      setExportError(err instanceof ApiError && err.status === 429 ? 'Du hast den Export zu oft angefordert. Bitte versuche es später erneut.' : errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    const password = await confirmDialog({
      title: 'Konto endgültig löschen?',
      message: 'Dein Konto, dein Profil, deine Kontakte und alle hochgeladenen Dateien werden unwiderruflich gelöscht. Deine gesendeten Nachrichten werden unkenntlich gemacht. Das kann nicht rückgängig gemacht werden. Gib zur Bestätigung dein Passwort ein.',
      confirmLabel: 'Konto endgültig löschen',
      danger: true,
      input: { label: 'Passwort', type: 'password', placeholder: 'Dein aktuelles Passwort' },
    });
    if (!password) return;
    setDeleting(true);
    try {
      await del('/api/me', { password });
      useSession.getState().reset();
      navigate('/login', { replace: true });
      toast('Dein Konto wurde gelöscht.', 'success');
    } catch (err) {
      toast(err instanceof ApiError && err.code === 'invalid_credentials' ? 'Das Passwort ist falsch. Das Konto wurde nicht gelöscht.' : errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PaneShell title="Konto & Daten" onBack={onBack}>
      <Group title="Passwort ändern">
        <form className="set-form set-form-in" onSubmit={changePassword} noValidate>
          <label className="field"><span>Aktuelles Passwort</span><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
          <label className="field"><span>Neues Passwort</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="Neues Passwort" aria-describedby="pw-hint" /><span className="hint" id="pw-hint">Mindestens 10 Zeichen. Verwende kein verbreitetes Passwort.</span></label>
          <label className="field"><span>Neues Passwort wiederholen</span><input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" /></label>
          {pwError && <div className="form-error" role="alert">{pwError}</div>}
          {pwOk && <div className="form-ok" role="status">Passwort geändert. Alle anderen Geräte wurden abgemeldet.</div>}
          <button className="btn btn-primary" type="submit" disabled={pwBusy || !cur || !next || !repeat}>{pwBusy ? 'Speichert…' : 'Passwort ändern'}</button>
        </form>
      </Group>

      <Group title="Deine Daten" note="Der Export enthält dein Profil, Kontakte, Chats und Nachrichten, Status, Anrufliste, Dateiliste, Geräte und das Sicherheitsprotokoll als JSON-Datei. Aus Sicherheitsgründen ist er pro Stunde nur wenige Male möglich.">
        <button className="settings-row" onClick={() => void exportData()} disabled={exporting}>
          <span className="icon-wrap"><Icon name="download" size={18} /></span>
          <span className="label">{exporting ? 'Export wird erstellt…' : 'Datenexport herunterladen'}<small>Eine Kopie deiner Daten (DSGVO Art. 20)</small></span>
        </button>
        {exportError && <div className="form-error set-inline-error" role="alert">{exportError}</div>}
      </Group>

      <div className="set-section">
        <h2 className="section-title set-section-title set-danger-title">Gefahrenbereich</h2>
        <div className="set-danger-zone">
          <div className="set-danger-head"><Icon name="ban" size={20} /><b>Konto löschen</b></div>
          <p>Löscht dein Konto <b>endgültig</b> und sofort. Profil, Kontakte, Hintergründe und hochgeladene Dateien gehen unwiderruflich verloren; du wirst aus allen Gruppen entfernt und alle Geräte werden abgemeldet. Es gibt keine Wiederherstellung.</p>
          <button className="btn btn-danger" onClick={() => void deleteAccount()} disabled={deleting}>{deleting ? 'Wird gelöscht…' : 'Konto löschen…'}</button>
        </div>
      </div>
    </PaneShell>
  );
}
