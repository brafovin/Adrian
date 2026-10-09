import { useEffect, useRef } from 'react';
import '../screens/calls.css';
import { useCalls } from '../store/calls';
import { ActiveCall } from './calls/ActiveCall';
import { IncomingCall } from './calls/IncomingCall';
import { RemoteAudio } from './calls/Media';
import { Icon } from './Icon';

function EndedCall() {
  const text = useCalls((s) => s.endText);
  const tone = useCalls((s) => s.endTone);
  return (
    <div className="call-overlay ended" role="dialog" aria-modal="true" aria-label="Anruf beendet">
      <div className="call-stage">
        <div className="call-center">
          <div className={`call-ended-icon ${tone}`}><Icon name="phone" size={34} style={{ transform: 'rotate(135deg)' }} /></div>
          <p className="call-ended-text" role="status" aria-live="assertive">{text}</p>
        </div>
      </div>
    </div>
  );
}

/** Globale Anruf-Oberfläche: eingehend, laufend, Abschlussmeldung. Wird in App.tsx gerendert. */
export function CallOverlay() {
  const state = useCalls((s) => s.state);
  const prevFocus = useRef<HTMLElement | null>(null);
  const idle = state === 'idle';

  useEffect(() => {
    if (!idle) {
      prevFocus.current ??= document.activeElement as HTMLElement | null;
      document.body.classList.add('in-call');
    } else {
      document.body.classList.remove('in-call');
      prevFocus.current?.focus?.();
      prevFocus.current = null;
    }
  }, [idle]);

  if (idle) return null;
  return (
    <>
      <RemoteAudio />
      {state === 'ringing' ? <IncomingCall /> : state === 'ended' ? <EndedCall /> : <ActiveCall />}
    </>
  );
}
