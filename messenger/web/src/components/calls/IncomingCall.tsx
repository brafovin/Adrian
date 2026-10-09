import { useEffect, useRef } from 'react';
import { acceptCall, confirmAudioFallback, declineCall, useCalls } from '../../store/calls';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { IssuePrompt } from './IssuePrompt';

export function IncomingCall() {
  const peer = useCalls((s) => s.peer);
  const kind = useCalls((s) => s.kind);
  const accepting = useCalls((s) => s.accepting);
  const issue = useCalls((s) => s.issue);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const name = peer?.displayName ?? 'Unbekannt';
  useEffect(() => { acceptRef.current?.focus(); }, []);
  return (
    <div className="call-overlay incoming" role="alertdialog" aria-modal="true" aria-label="Eingehender Anruf" aria-describedby="call-in-desc">
      <div className="call-stage">
        <div className="call-center">
          <div className="call-pulse"><Avatar name={name} src={peer?.avatarUrl} size={132} /></div>
          <h2 className="call-name">{name}</h2>
          <p className="call-sub" id="call-in-desc">{kind === 'video' ? 'Eingehender Videoanruf' : 'Eingehender Sprachanruf'}</p>
          {kind === 'video' && <p className="call-hint">Beim Annehmen werden deine Kamera und dein Mikrofon aktiviert.</p>}
          {accepting && <p className="call-hint" role="status">Wird verbunden…</p>}
        </div>
      </div>
      {issue ? (
        <IssuePrompt message={issue.message} confirmLabel={issue.confirmLabel} onConfirm={confirmAudioFallback} onCancel={declineCall} cancelLabel="Ablehnen" />
      ) : (
        <div className="call-controls incoming-controls">
          <div className="call-btn-wrap">
            <button className="call-btn decline" onClick={declineCall} aria-label="Ablehnen"><Icon name="phone" size={28} style={{ transform: 'rotate(135deg)' }} /></button>
            <span aria-hidden="true">Ablehnen</span>
          </div>
          <div className="call-btn-wrap">
            <button ref={acceptRef} className="call-btn accept" onClick={acceptCall} disabled={accepting} aria-label="Annehmen"><Icon name={kind === 'video' ? 'video' : 'phone'} size={28} /></button>
            <span aria-hidden="true">Annehmen</span>
          </div>
        </div>
      )}
    </div>
  );
}
