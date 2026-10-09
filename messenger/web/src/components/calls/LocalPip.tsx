import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useCalls } from '../../store/calls';
import { Icon } from '../Icon';
import { VideoView } from './Media';

/** Kleines, verschiebbares Bild der eigenen Kamera. */
export function LocalPip() {
  const stream = useCalls((s) => s.localStream);
  const cameraOff = useCalls((s) => s.cameraOff);
  const facing = useCalls((s) => s.facing);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const clamp = (x: number, y: number) => {
    const el = ref.current, parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return { x, y };
    return { x: Math.min(Math.max(8, x), parent.clientWidth - el.offsetWidth - 8), y: Math.min(Math.max(8, y), parent.clientHeight - el.offsetHeight - 8) };
  };
  function down(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy));
  }
  function up() { drag.current = null; }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const step = 24;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setPos(clamp((pos?.x ?? el.offsetLeft) + v[0], (pos?.y ?? el.offsetTop) + v[1]));
  }
  return (
    <div ref={ref} className="call-pip" role="group" tabIndex={0} aria-label="Eigenes Kamerabild – mit Pfeiltasten oder Ziehen verschiebbar"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      {cameraOff ? (
        <div className="call-pip-off"><Icon name="video-off" size={22} /><span>Kamera aus</span></div>
      ) : (
        <VideoView stream={stream} mirror={facing === 'user'} className="call-pip-video" label="Eigenes Kamerabild" />
      )}
    </div>
  );
}
