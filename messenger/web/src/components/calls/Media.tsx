import { useEffect, useRef } from 'react';
import { supportsSinkId } from '../../lib/webrtc';
import { useCalls } from '../../store/calls';
import { toast } from '../../store/ui';

/** Spielt den Ton der Gegenseite ab (und wendet das gewählte Ausgabegerät an). Bleibt auch minimiert bestehen. */
export function RemoteAudio() {
  const stream = useCalls((s) => s.remoteStream);
  const outputId = useCalls((s) => s.outputId);
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [stream]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el || !supportsSinkId() || !el.setSinkId) return;
    el.setSinkId(outputId === 'default' ? '' : outputId).catch(() => toast('Das Ausgabegerät konnte nicht gewechselt werden.', 'error'));
  }, [outputId, stream]);
  return <audio ref={ref} autoPlay data-testid="remote-audio" />;
}

/** Video-Element für einen MediaStream (immer stumm – der Ton läuft über <RemoteAudio>). */
export function VideoView({ stream, mirror, className, label }: { stream: MediaStream | null; mirror?: boolean; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={className} muted playsInline autoPlay aria-label={label} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}
