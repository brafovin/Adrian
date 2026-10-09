/** Klingeltöne per WebAudio (keine Audiodateien nötig): Rufton für eingehende Anrufe, Freiton beim Anrufer. */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Browser erlauben Ton erst nach einer Nutzerinteraktion – daher beim ersten Klick/Tastendruck vorbereiten. */
export function armAudioUnlock(): () => void {
  const unlock = () => { audioContext(); };
  const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
  evs.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  return () => evs.forEach((e) => window.removeEventListener(e, unlock));
}

function tone(c: AudioContext, freqs: number[], at: number, dur: number, vol: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.03);
  gain.gain.setValueAtTime(vol, at + Math.max(0.04, dur - 0.06));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  gain.connect(c.destination);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(gain);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

type Mode = 'incoming' | 'ringback' | null;
let mode: Mode = null;
let timer: ReturnType<typeof setInterval> | null = null;

function cycle() {
  const c = audioContext();
  if (mode === 'incoming') {
    try { navigator.vibrate?.([500, 250, 500]); } catch { /* */ }
  }
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  if (mode === 'incoming') {
    // zwei kurze Doppeltöne
    tone(c, [523.25, 659.25], t, 0.35, 0.12);
    tone(c, [523.25, 659.25], t + 0.45, 0.35, 0.12);
    tone(c, [587.33, 783.99], t + 1.1, 0.35, 0.12);
    tone(c, [587.33, 783.99], t + 1.55, 0.35, 0.12);
  } else if (mode === 'ringback') {
    // Freiton 425 Hz, 1 s an / 4 s aus
    tone(c, [425], t, 1, 0.1);
  }
}

export const ringer = {
  start(m: 'incoming' | 'ringback') {
    if (mode === m) return;
    this.stop();
    mode = m;
    cycle();
    timer = setInterval(cycle, m === 'incoming' ? 3200 : 5000);
  },
  stop() {
    mode = null;
    if (timer) clearInterval(timer);
    timer = null;
    try { navigator.vibrate?.(0); } catch { /* */ }
  },
  /** Kurzer Signalton beim Auflegen/Verbinden. */
  beep(kind: 'connected' | 'ended') {
    const c = audioContext();
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + 0.01;
    if (kind === 'connected') tone(c, [880], t, 0.12, 0.08);
    else { tone(c, [480], t, 0.18, 0.08); tone(c, [380], t + 0.22, 0.25, 0.08); }
  },
};
