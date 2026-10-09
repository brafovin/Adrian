import type { IceServer } from '../types';

/* ------------------------------------------------------------------ *
 *  Medienzugriff (Mikrofon / Kamera) mit verständlichen Fehlermeldungen
 * ------------------------------------------------------------------ */

export type MediaErrorCode = 'denied' | 'no_device' | 'in_use' | 'insecure' | 'unsupported' | 'unknown';

export class MediaError extends Error {
  constructor(public code: MediaErrorCode, message: string) {
    super(message);
  }
}

function toMediaError(e: unknown, what: 'camera' | 'microphone' | 'both'): MediaError {
  const name = (e as DOMException | undefined)?.name ?? '';
  const label = what === 'both' ? 'Kamera und Mikrofon' : what === 'camera' ? 'Kamera' : 'Mikrofon';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new MediaError('denied', `Der Zugriff auf ${label} wurde verweigert. Erlaube ihn in den Browser- bzw. Systemeinstellungen und versuche es erneut.`);
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new MediaError('no_device', what === 'both' ? 'Es wurde keine Kamera bzw. kein Mikrofon gefunden.' : `Es wurde ${what === 'camera' ? 'keine Kamera' : 'kein Mikrofon'} gefunden.`);
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return new MediaError('in_use', `${label} ${what === 'both' ? 'werden' : 'wird'} bereits von einer anderen App verwendet oder ${what === 'both' ? 'sind' : 'ist'} nicht verfügbar.`);
  }
  return new MediaError('unknown', `${label} konnte nicht gestartet werden.`);
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const videoConstraints = (facing: 'user' | 'environment'): MediaTrackConstraints => ({ facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });

export interface LocalMedia {
  stream: MediaStream;
  /** Tatsächlich erhaltene Art: kann bei Kamera-Problemen 'audio' statt 'video' sein */
  kind: 'audio' | 'video';
  /** Gesetzt, wenn ein Videoanruf gewünscht war, die Kamera aber nicht verfügbar ist (Fallback auf Audio möglich). */
  cameraProblem: MediaError | null;
}

function ensureMediaApi() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError(window.isSecureContext ? 'unsupported' : 'insecure',
      window.isSecureContext ? 'Dieser Browser unterstützt keine Anrufe.' : 'Anrufe funktionieren nur über eine sichere Verbindung (HTTPS).');
  }
}

/** Holt Mikrofon (und bei Video die Kamera). Bei Kamera-Problemen wird ein reiner Audio-Stream samt Hinweis geliefert. */
export async function getLocalMedia(kind: 'audio' | 'video'): Promise<LocalMedia> {
  ensureMediaApi();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: kind === 'video' ? videoConstraints('user') : false });
    return { stream, kind, cameraProblem: null };
  } catch (e) {
    if (kind === 'audio') throw toMediaError(e, 'microphone');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      return { stream, kind: 'audio', cameraProblem: toMediaError(e, 'camera') };
    } catch (e2) {
      const first = toMediaError(e, 'both');
      const second = toMediaError(e2, 'microphone');
      throw first.code === 'denied' || second.code === 'denied' ? toMediaError({ name: 'NotAllowedError' }, 'both') : second;
    }
  }
}

export const supportsSinkId = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export async function listAudioOutputs(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
  } catch {
    return [];
  }
}
export async function countVideoInputs(): Promise<number> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

/** Verhindert, dass der Bildschirm während des Anrufs gesperrt wird. Gibt eine Freigabe-Funktion zurück. */
export function keepScreenAwake(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  const acquire = async () => {
    try {
      if (released || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
      sentinel = await navigator.wakeLock.request('screen');
    } catch { /* nicht verfügbar oder abgelehnt */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire(); };
  document.addEventListener('visibilitychange', onVisible);
  void acquire();
  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
  };
}

/* ------------------------------------------------------------------ *
 *  PeerConnection-Engine
 * ------------------------------------------------------------------ */

export type PeerLink = 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type Quality = 'good' | 'fair' | 'poor';
export interface PeerMedia { audio: boolean; video: boolean }

export interface EngineHandlers {
  onLink(link: PeerLink): void;
  onRemote(stream: MediaStream): void;
  onLocal(stream: MediaStream): void;
  onPeerMedia(m: PeerMedia): void;
  onQuality(q: Quality | null): void;
}
export interface EngineConfig {
  role: 'caller' | 'callee';
  iceServers: IceServer[];
  stream: MediaStream;
  facing?: 'user' | 'environment';
  /** Sendet Signalisierungsdaten über den Server an die Gegenseite (`call.signal`). */
  send(data: Record<string, unknown>): void;
}

/** Wie lange (ms) ein Verbindungsproblem anhalten darf, bevor der Anruf endgültig abgebrochen wird. */
const RECOVER_TIMEOUT = 45_000;
const FIRST_CONNECT_TIMEOUT = 30_000;
const RESTART_INTERVAL = 8_000;

/**
 * Eine Instanz pro Anruf. Der Anrufer erstellt alle Offers (auch bei ICE-Restart), der Angerufene antwortet.
 * Signale werden strikt der Reihe nach verarbeitet; ICE-Kandidaten, die vor der Remote-Description eintreffen, werden gepuffert.
 */
export class CallEngine {
  readonly pc: RTCPeerConnection;
  private local: MediaStream;
  private remote = new MediaStream();
  private videoSender: RTCRtpSender | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private chain: Promise<void> = Promise.resolve();
  private making = false;
  private offerSeq = 0;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private wantRestart = false;
  private link: PeerLink = 'connecting';
  private everConnected = false;
  private trouble: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastIn = { received: 0, lost: 0 };
  private closed = false;
  facing: 'user' | 'environment';

  constructor(private cfg: EngineConfig, private h: EngineHandlers) {
    this.facing = cfg.facing ?? 'user';
    this.local = cfg.stream;
    this.pc = new RTCPeerConnection({ iceServers: cfg.iceServers as RTCIceServer[], bundlePolicy: 'max-bundle' });
    for (const t of cfg.stream.getTracks()) {
      const sender = this.pc.addTrack(t, cfg.stream);
      if (t.kind === 'video') this.videoSender = sender;
    }
    this.pc.onicecandidate = (e) => {
      if (e.candidate) cfg.send({ type: 'candidate', candidate: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.h.onRemote(new MediaStream(this.remote.getTracks()));
      e.track.addEventListener('ended', () => this.remote.removeTrack(e.track));
    };
    this.pc.oniceconnectionstatechange = () => this.onIceState();
    this.pc.onconnectionstatechange = () => { if (this.pc.connectionState === 'failed') this.onIceState(); };
    queueMicrotask(() => { if (!this.closed) this.h.onLocal(new MediaStream(this.local.getTracks())); }); // nach der Zuweisung im Aufrufer
    window.addEventListener('online', this.onOnline);
    this.deadline = setTimeout(() => { if (!this.everConnected) this.fail(); }, FIRST_CONNECT_TIMEOUT + 15_000);
  }

  /* ---- Signalisierung ---- */

  /** Anrufer: erstes Offer (nach `call.accepted`) bzw. ICE-Restart. */
  async negotiate(restart = false): Promise<void> {
    if (this.cfg.role !== 'caller' || this.closed) return;
    if (this.making) { this.wantRestart ||= restart; return; }
    this.making = true;
    try {
      if (this.pc.signalingState === 'have-local-offer') {
        if (!restart) return; // Antwort steht noch aus
        await this.pc.setLocalDescription({ type: 'rollback' });
      }
      if (restart) this.pc.restartIce();
      const offer = await this.pc.createOffer(restart ? { iceRestart: true } : undefined);
      await this.pc.setLocalDescription(offer);
      this.cfg.send({ type: 'offer', id: ++this.offerSeq, sdp: this.pc.localDescription!.sdp });
    } catch (e) {
      console.warn('Offer fehlgeschlagen', e);
    } finally {
      this.making = false;
      if (this.wantRestart) { this.wantRestart = false; void this.negotiate(true); }
    }
  }

  /** Eingehende Signalisierungsdaten der Gegenseite. */
  handleSignal(data: any): void {
    this.chain = this.chain.then(() => this.process(data)).catch((e) => console.warn('Signal-Fehler', e));
  }

  private async process(data: any): Promise<void> {
    if (this.closed || !data || typeof data !== 'object') return;
    switch (data.type) {
      case 'offer': {
        if (this.cfg.role !== 'callee') return;
        await this.pc.setRemoteDescription({ type: 'offer', sdp: String(data.sdp) });
        await this.flushCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.cfg.send({ type: 'answer', id: data.id, sdp: this.pc.localDescription!.sdp });
        break;
      }
      case 'answer': {
        if (this.cfg.role !== 'caller' || this.pc.signalingState !== 'have-local-offer') return;
        if (data.id !== undefined && data.id !== this.offerSeq) return; // Antwort auf ein überholtes Offer
        await this.pc.setRemoteDescription({ type: 'answer', sdp: String(data.sdp) });
        await this.flushCandidates();
        break;
      }
      case 'candidate': {
        const c = data.candidate as RTCIceCandidateInit | null;
        if (!c) return;
        if (!this.pc.remoteDescription) { this.pending.push(c); return; }
        try { await this.pc.addIceCandidate(c); } catch { /* veralteter Kandidat (z. B. nach ICE-Restart) */ }
        break;
      }
      case 'media-state':
        this.h.onPeerMedia({ audio: data.audio !== false, video: data.video !== false });
        break;
      case 'restart-request':
        if (this.cfg.role === 'caller') void this.negotiate(true);
        break;
    }
  }

  private async flushCandidates() {
    const list = this.pending.splice(0);
    for (const c of list) { try { await this.pc.addIceCandidate(c); } catch { /* ignorieren */ } }
  }

  /* ---- Verbindungsüberwachung / ICE-Restart ---- */

  private setLink(l: PeerLink) {
    if (this.link === l) return;
    this.link = l;
    this.h.onLink(l);
  }

  private onIceState() {
    if (this.closed) return;
    const s = this.pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') {
      this.clearTrouble();
      const first = !this.everConnected;
      this.everConnected = true;
      if (this.deadline) { clearTimeout(this.deadline); this.deadline = null; }
      this.setLink('connected');
      this.startStats();
      if (first) this.sendMediaState();
    } else if (s === 'disconnected') {
      if (this.everConnected) this.setLink('reconnecting');
      if (!this.trouble) this.trouble = setTimeout(() => { this.trouble = null; this.recover(); }, 2500);
      this.armDeadline();
    } else if (s === 'failed') {
      if (this.everConnected) this.setLink('reconnecting');
      this.recover();
      this.armDeadline();
    }
  }

  private armDeadline() {
    if (this.deadline) return;
    this.deadline = setTimeout(() => { this.deadline = null; if (this.link !== 'connected') this.fail(); }, RECOVER_TIMEOUT);
  }
  private clearTrouble() {
    if (this.trouble) { clearTimeout(this.trouble); this.trouble = null; }
    if (this.retry) { clearInterval(this.retry); this.retry = null; }
    if (this.deadline) { clearTimeout(this.deadline); this.deadline = null; }
  }

  private recover() {
    if (this.closed) return;
    const attempt = () => {
      if (this.closed || this.link === 'connected') return;
      if (this.cfg.role === 'caller') void this.negotiate(true);
      else this.cfg.send({ type: 'restart-request' });
    };
    attempt();
    if (!this.retry) this.retry = setInterval(attempt, RESTART_INTERVAL);
  }

  private fail() {
    if (this.closed) return;
    this.setLink('failed');
  }

  private onOnline = () => {
    if (this.everConnected && this.link !== 'connected') this.recover();
  };

  /**
   * Die Gegenseite bzw. der eigene WebSocket ist zurückgekehrt: währenddessen können Signale verloren gegangen sein.
   * Steht die Verbindung nach kurzer Zeit nicht, wird sie per ICE-Restart neu ausgehandelt.
   */
  onPeerReconnected() { this.afterSignalingGap(); }
  onRejoined() { this.afterSignalingGap(); }
  private afterSignalingGap() {
    this.sendMediaState();
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      this.checkTimer = null;
      if (!this.closed && this.link !== 'connected') this.recover();
    }, 4000);
  }

  /* ---- Qualität (getStats) ---- */

  private startStats() {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(() => void this.sampleQuality(), 2000);
  }
  private async sampleQuality() {
    if (this.closed || this.link !== 'connected') return;
    try {
      let rtt: number | null = null;
      let received = 0, lost = 0;
      (await this.pc.getStats()).forEach((r: any) => {
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime;
        if (r.type === 'inbound-rtp') { received += r.packetsReceived ?? 0; lost += r.packetsLost ?? 0; }
      });
      const dR = received - this.lastIn.received, dL = lost - this.lastIn.lost;
      this.lastIn = { received, lost };
      const loss = dR + dL > 20 ? Math.max(0, dL) / (dR + dL) : 0;
      let q: Quality = 'good';
      if ((rtt ?? 0) > 0.5 || loss > 0.1) q = 'poor';
      else if ((rtt ?? 0) > 0.25 || loss > 0.03) q = 'fair';
      this.h.onQuality(q);
    } catch { /* ignorieren */ }
  }

  /** Nur lesend: Kennzahlen für Diagnose/Tests. */
  async summary() {
    const out = {
      link: this.link, ice: this.pc.iceConnectionState, connection: this.pc.connectionState, signaling: this.pc.signalingState,
      audioIn: { bytes: 0, packets: 0, energy: 0 }, videoIn: { bytes: 0, frames: 0, width: 0, height: 0 },
      audioOut: { bytes: 0 }, videoOut: { bytes: 0 },
    };
    (await this.pc.getStats()).forEach((r: any) => {
      if (r.type === 'inbound-rtp' && r.kind === 'audio') { out.audioIn.bytes += r.bytesReceived ?? 0; out.audioIn.packets += r.packetsReceived ?? 0; out.audioIn.energy += r.totalAudioEnergy ?? 0; }
      if (r.type === 'inbound-rtp' && r.kind === 'video') { out.videoIn.bytes += r.bytesReceived ?? 0; out.videoIn.frames += r.framesDecoded ?? 0; out.videoIn.width = r.frameWidth ?? out.videoIn.width; out.videoIn.height = r.frameHeight ?? out.videoIn.height; }
      if (r.type === 'outbound-rtp' && r.kind === 'audio') out.audioOut.bytes += r.bytesSent ?? 0;
      if (r.type === 'outbound-rtp' && r.kind === 'video') out.videoOut.bytes += r.bytesSent ?? 0;
    });
    return out;
  }
  trackInfo() {
    const info = (t: MediaStreamTrack) => ({ kind: t.kind, enabled: t.enabled, muted: t.muted, readyState: t.readyState });
    return { local: this.local.getTracks().map(info), remote: this.remote.getTracks().map(info) };
  }

  /* ---- Steuerung ---- */

  get hasVideoSender() { return !!this.videoSender; }
  get micMuted() { return this.local.getAudioTracks().every((t) => !t.enabled); }
  get cameraOn() { const t = this.videoSender?.track; return !!t && t.readyState === 'live' && t.enabled; }

  sendMediaState() {
    this.cfg.send({ type: 'media-state', audio: !this.micMuted, video: this.cameraOn });
  }

  setMuted(muted: boolean) {
    this.local.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    this.sendMediaState();
  }

  private publishLocal() {
    this.h.onLocal(new MediaStream(this.local.getTracks()));
    this.sendMediaState();
  }

  private async captureVideo(facing: 'user' | 'environment', deviceId?: string): Promise<MediaStreamTrack> {
    const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : videoConstraints(facing) });
    return s.getVideoTracks()[0]!;
  }

  /** Kamera ein-/ausschalten: beim Ausschalten wird die Kamera wirklich freigegeben (LED aus), beim Einschalten neu geholt. */
  async setCamera(on: boolean): Promise<void> {
    if (!this.videoSender) throw new MediaError('no_device', 'In diesem Anruf ist keine Kamera verfügbar.');
    if (on) {
      let track: MediaStreamTrack;
      try { track = await this.captureVideo(this.facing); } catch (e) { throw toMediaError(e, 'camera'); }
      await this.videoSender.replaceTrack(track);
      this.local.addTrack(track);
    } else {
      const old = this.videoSender.track;
      await this.videoSender.replaceTrack(null);
      if (old) { old.stop(); this.local.removeTrack(old); }
    }
    this.publishLocal();
  }

  /** Front-/Rückkamera wechseln (facingMode bzw. nächstes Gerät) und per replaceTrack austauschen. */
  async switchCamera(): Promise<'user' | 'environment'> {
    if (!this.videoSender?.track) throw new MediaError('no_device', 'Schalte zuerst die Kamera ein.');
    const old = this.videoSender.track;
    const next = this.facing === 'user' ? 'environment' : 'user';
    let track: MediaStreamTrack;
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const curId = old.getSettings().deviceId;
      const other = cams.find((c) => c.deviceId && c.deviceId !== curId);
      const touch = matchMedia('(pointer: coarse)').matches;
      old.stop(); // manche Geräte erlauben nur eine aktive Kamera
      track = touch || !other ? await this.captureVideo(next) : await this.captureVideo(next, other.deviceId);
    } catch (e) {
      // alte Kamera wiederherstellen
      try { const back = await this.captureVideo(this.facing); await this.videoSender.replaceTrack(back); this.local.removeTrack(old); this.local.addTrack(back); this.publishLocal(); } catch { /* */ }
      throw toMediaError(e, 'camera');
    }
    await this.videoSender.replaceTrack(track);
    this.local.removeTrack(old);
    this.local.addTrack(track);
    this.facing = next;
    this.publishLocal();
    return next;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearTrouble();
    if (this.checkTimer) clearTimeout(this.checkTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    window.removeEventListener('online', this.onOnline);
    this.pc.onicecandidate = this.pc.ontrack = this.pc.oniceconnectionstatechange = this.pc.onconnectionstatechange = null;
    this.local.getTracks().forEach((t) => t.stop());
    this.videoSender?.track?.stop();
    try { this.pc.close(); } catch { /* */ }
  }
}
