import { useEffect, useRef } from 'react';
import { listAudioOutputs, supportsSinkId } from '../../lib/webrtc';
import { confirmAudioFallback, hangup, setMinimized, setOutputDevice, switchCamera, toggleCamera, toggleMute, useCalls } from '../../store/calls';
import { actionSheet, toast } from '../../store/ui';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { IssuePrompt } from './IssuePrompt';
import { LocalPip } from './LocalPip';
import { VideoView } from './Media';
import { CallTimer } from './Timer';

async function pickOutput() {
  const outs = supportsSinkId() ? await listAudioOutputs() : [];
  if (outs.length < 2) {
    toast('Dein Browser bzw. Gerät erlaubt hier keine Auswahl des Ausgabegeräts. Wechsle zwischen Lautsprecher und Hörer in den Systemeinstellungen.');
    return;
  }
  const cur = useCalls.getState().outputId;
  actionSheet(outs.map((d, i) => ({
    label: `${d.label || `Gerät ${i + 1}`}${d.deviceId === cur || (cur === 'default' && d.deviceId === 'default') ? ' (aktiv)' : ''}`,
    icon: 'speaker',
    onClick: () => setOutputDevice(d.deviceId),
  })), 'Audioausgabe');
}

function Ctl({ label, short, icon, onClick, on, className = '', disabled }: { label: string; short: string; icon: string; onClick(): void; on?: boolean; className?: string; disabled?: boolean }) {
  return (
    <div className="call-btn-wrap">
      <button className={`call-btn ${on ? 'on' : ''} ${className}`} onClick={onClick} aria-label={label} disabled={disabled}><Icon name={icon} size={26} /></button>
      <span aria-hidden="true">{short}</span>
    </div>
  );
}

export function ActiveCall() {
  const c = useCalls();
  const rootRef = useRef<HTMLDivElement>(null);
  const name = c.peer?.displayName ?? 'Unbekannt';
  const isVideo = c.kind === 'video';
  const live = c.state === 'active' || c.state === 'reconnecting';
  const remoteHasVideo = isVideo && live && !c.peerCameraOff && (c.remoteStream?.getVideoTracks().length ?? 0) > 0;
  const status =
    c.state === 'calling' ? (c.callId ? 'Klingelt…' : 'Anruf wird gestartet…')
    : c.state === 'connecting' ? 'Verbinde…'
    : c.state === 'reconnecting' ? 'Verbindung wird wiederhergestellt…'
    : null;

  useEffect(() => { if (!c.minimized) rootRef.current?.focus(); }, [c.minimized]);

  const statusNode = (
    <span className="call-status" role="status" aria-live="polite">
      {status ?? <CallTimer startedAt={c.startedAt} />}
    </span>
  );

  if (c.minimized) {
    return (
      <div className="call-mini" role="region" aria-label="Laufender Anruf">
        <button className="call-mini-main" onClick={() => setMinimized(false)} aria-label="Anruf wieder vergrößern">
          <Avatar name={name} src={c.peer?.avatarUrl} size={34} />
          <span className="grow"><b className="ellipsis">{name}</b><small>{statusNode}</small></span>
          <Icon name="maximize" size={20} />
        </button>
        <button className="call-btn hangup small" onClick={hangup} aria-label="Auflegen"><Icon name="phone" size={20} style={{ transform: 'rotate(135deg)' }} /></button>
      </div>
    );
  }

  return (
    <div ref={rootRef} tabIndex={-1} className={`call-overlay ${isVideo ? 'video' : 'audio'} ${c.state}`} role="dialog" aria-modal="true" aria-label={`Anruf mit ${name}`}>
      <div className="call-stage">
        {remoteHasVideo ? (
          <VideoView stream={c.remoteStream} className="call-remote" label={`Videobild von ${name}`} />
        ) : (
          <div className="call-center">
            <div className={`call-pulse ${c.state === 'calling' ? 'on' : ''}`}><Avatar name={name} src={c.peer?.avatarUrl} size={isVideo ? 112 : 148} /></div>
            <h2 className="call-name">{name}</h2>
            {isVideo && live && c.peerCameraOff && <p className="call-hint">Kamera ist aus</p>}
          </div>
        )}
        {isVideo && c.localVideo && <LocalPip />}
      </div>

      <header className="call-head">
        <button className="call-icon" onClick={() => setMinimized(true)} aria-label="Anruf minimieren"><Icon name="minimize" size={22} /></button>
        <div className="call-title">
          {remoteHasVideo && <b className="ellipsis">{name}</b>}
          {statusNode}
        </div>
        <div className="call-flags">
          {c.peerMuted && <span className="call-flag" role="status"><Icon name="mic-off" size={14} /> Mikrofon aus</span>}
          {c.quality && c.quality !== 'good' && live && <span className={`call-flag ${c.quality}`} role="status">{c.quality === 'poor' ? 'Schlechte Verbindung' : 'Schwache Verbindung'}</span>}
        </div>
      </header>

      {c.issue ? (
        <IssuePrompt message={c.issue.message} confirmLabel={c.issue.confirmLabel} onConfirm={confirmAudioFallback} onCancel={hangup} />
      ) : (
        <div className="call-controls">
          <Ctl icon={c.muted ? 'mic-off' : 'mic'} label={c.muted ? 'Stummschaltung aufheben' : 'Stummschalten'} short={c.muted ? 'Stumm' : 'Mikrofon'} onClick={toggleMute} on={c.muted} />
          {isVideo && c.localVideo && <Ctl icon={c.cameraOff ? 'video-off' : 'video'} label={c.cameraOff ? 'Kamera einschalten' : 'Kamera ausschalten'} short={c.cameraOff ? 'Kamera aus' : 'Kamera'} onClick={() => void toggleCamera()} on={c.cameraOff} />}
          {isVideo && c.localVideo && c.canSwitchCamera && <Ctl icon="flip" label="Kamera wechseln" short="Wechseln" onClick={() => void switchCamera()} disabled={c.cameraOff} />}
          <Ctl icon="speaker" label="Audioausgabe" short="Ausgabe" onClick={() => void pickOutput()} />
          <div className="call-btn-wrap">
            <button className="call-btn hangup" onClick={hangup} aria-label="Auflegen"><Icon name="phone" size={28} style={{ transform: 'rotate(135deg)' }} /></button>
            <span aria-hidden="true">Auflegen</span>
          </div>
        </div>
      )}
    </div>
  );
}
