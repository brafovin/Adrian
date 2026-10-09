import { useState } from 'react';
import { errorMessage, post } from '../../api';
import { toast } from '../../store/ui';
import { Modal } from '../Modal';

const REASONS = [
  { id: 'spam', label: 'Spam oder Werbung', hint: 'Unerwünschte Nachrichten oder Links' },
  { id: 'harassment', label: 'Belästigung', hint: 'Beleidigungen, Drohungen oder Bedrängen' },
  { id: 'illegal', label: 'Illegale Inhalte', hint: 'Rechtswidrige Inhalte oder Handlungen' },
  { id: 'impersonation', label: 'Identitätsvortäuschung', hint: 'Gibt sich als andere Person aus' },
  { id: 'other', label: 'Sonstiges', hint: 'Etwas anderes' },
] as const;
type Reason = (typeof REASONS)[number]['id'];

export function ReportDialog({ user, onClose }: { user: { id: string; displayName: string; username: string }; onClose: () => void }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError('');
    try {
      await post('/api/reports', { userId: user.id, reason, details: details.trim() });
      toast('Meldung gesendet. Danke für deinen Hinweis.', 'success');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${user.displayName} melden`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-danger" disabled={!reason || busy} onClick={() => void submit()}>{busy ? 'Sende…' : 'Melden'}</button>
        </>
      }
    >
      <p className="muted-text">Warum möchtest du @{user.username} melden? Die Person erfährt nichts davon.</p>
      <div role="radiogroup" aria-label="Grund der Meldung" className="ct-reasons">
        {REASONS.map((r) => (
          <label key={r.id} className={`ct-reason ${reason === r.id ? 'on' : ''}`}>
            <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
            <span><b>{r.label}</b><small>{r.hint}</small></span>
          </label>
        ))}
      </div>
      <label className="field">
        <span>Details (optional)</span>
        <textarea value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} placeholder="Was ist passiert?" />
        <span className="hint">{details.length} / 1000</span>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
    </Modal>
  );
}
