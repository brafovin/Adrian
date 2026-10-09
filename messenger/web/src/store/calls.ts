import { create } from 'zustand';
import { get as apiGet } from '../api';
import { armAudioUnlock, ringer } from '../components/calls/ringer';
import { CallEngine, MediaError, countVideoInputs, getLocalMedia, keepScreenAwake, type PeerLink, type Quality } from '../lib/webrtc';
import { realtime } from '../realtime';
import type { CallRecord, IceServer, PublicUser } from '../types';
import { useSession } from './session';
import { toast } from './ui';

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended';

export interface CallStore {
  state: CallPhase;
  callId: string | null;
  role: 'caller' | 'callee' | null;
  peer: PublicUser | null;
  kind: 'audio' | 'video';
  /** Zeitpunkt, an dem die Medienverbindung zum ersten Mal stand (ms) */
  startedAt: number | null;
  muted: boolean;
  cameraOff: boolean;
  /** Es gibt eine lokale Kamera, die ein-/ausgeschaltet werden kann */
  localVideo: boolean;
  canSwitchCamera: boolean;
  facing: 'user' | 'environment';
  peerMuted: boolean;
  peerCameraOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  quality: Quality | null;
  minimized: boolean;
  accepting: boolean;
  /** Kamera nicht verfügbar → Rückfrage, ob nur mit Ton fortgefahren werden soll */
  issue: { message: string; confirmLabel: string } | null;
  endText: string | null;
  endTone: 'neutral' | 'error';
  outputId: string;
  /** verpasste Anrufe seit dem letzten Besuch der Anrufe-Seite */
  missed: number;
}

const INITIAL: Omit<CallStore, 'missed'> = {
  state: 'idle', callId: null, role: null, peer: null, kind: 'audio', startedAt: null,
  muted: false, cameraOff: false, localVideo: false, canSwitchCamera: false, facing: 'user', peerMuted: false, peerCameraOff: false,
  localStream: null, remoteStream: null, quality: null, minimized: false, accepting: false, issue: null,
  endText: null, endTone: 'neutral', outputId: 'default',
};

export const useCalls = create<CallStore>(() => ({ ...INITIAL, missed: 0 }));
const S = () => useCalls.getState();
const set = (p: Partial<CallStore>) => useCalls.setState(p);

/* ---------------- interner Zustand ---------------- */

let engine: CallEngine | null = null;
let epoch = 0; // macht asynchrone Schritte eines früheren Anrufs wirkungslos
let inviteSent = false; // call.invite wurde gesendet, call.invited steht noch aus
let abandonedInvite = 0; // Zeitpunkt, an dem der Nutzer aufgelegt hat, bevor call.invited eintraf → dann sofort abbrechen
let inviteTimer: ReturnType<typeof setTimeout> | null = null;
let held: { stream: MediaStream; action: 'invite' | 'accept' } | null = null;
let iceServers: IceServer[] = [];
let earlySignals: unknown[] = [];
let stopWake: (() => void) | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let savedTitle: string | null = null;
let ringTimeout: ReturnType<typeof setTimeout> | null = null;
let cameraBusy = false;

const peerName = (p: PublicUser | null = S().peer) => p?.displayName ?? 'Unbekannt';

const ERROR_TEXT: Record<string, string> = {
  not_allowed: 'Diese Person ist für Anrufe nicht erreichbar.',
  already_in_call: 'Du bist bereits in einem Anruf.',
  rate_limited: 'Zu viele Anrufversuche. Bitte warte einen Moment.',
  invalid_user: 'Du kannst dich nicht selbst anrufen.',
  call_gone: 'Der Anruf ist nicht mehr verfügbar.',
};

function endText(e: { reason?: string; state?: string }, role: 'caller' | 'callee' | null): { text: string; tone: 'neutral' | 'error'; delay: number } {
  const name = peerName();
  switch (e.reason) {
    case 'declined': return { text: role === 'caller' ? `${name} hat den Anruf abgelehnt` : 'Anruf abgelehnt', tone: 'neutral', delay: 2500 };
    case 'timeout': return { text: role === 'caller' ? `${name} antwortet nicht` : 'Verpasster Anruf', tone: 'neutral', delay: 2500 };
    case 'cancelled':
    case 'caller_left': return { text: role === 'callee' ? 'Verpasster Anruf' : 'Anruf abgebrochen', tone: 'neutral', delay: 2000 };
    case 'busy': return { text: `${name} ist gerade in einem Anruf`, tone: 'neutral', delay: 3000 };
    case 'connection_lost': return { text: 'Verbindung verloren – der Anruf wurde beendet', tone: 'error', delay: 3500 };
    case 'gone': return { text: 'Der Anruf ist bereits beendet', tone: 'neutral', delay: 2000 };
    default: return { text: 'Anruf beendet', tone: 'neutral', delay: 1800 };
  }
}

function closeNotifications(callId: string | null) {
  if (!callId || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((r) => r.getNotifications({ tag: `call-${callId}` }).then((l) => l.forEach((n) => n.close()))).catch(() => {});
}

function restoreTitle() {
  if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
}

function dropEngine() {
  engine?.close();
  engine = null;
  earlySignals = [];
}
function dropHeld() {
  held?.stream.getTracks().forEach((t) => t.stop());
  held = null;
}

/** Beendet den lokalen Anruf-Zustand. Mit `text` bleibt kurz eine Abschlussmeldung sichtbar, ohne geht es sofort zu „idle“. */
function finalize(text: string | null, tone: 'neutral' | 'error' = 'neutral', delay = 2000) {
  const callId = S().callId;
  epoch++;
  inviteSent = false;
  if (inviteTimer) clearTimeout(inviteTimer);
  if (ringTimeout) clearTimeout(ringTimeout);
  inviteTimer = ringTimeout = null;
  ringer.stop();
  dropEngine();
  dropHeld();
  stopWake?.();
  stopWake = null;
  restoreTitle();
  closeNotifications(callId);
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  if (text === null || S().state === 'idle') {
    set({ ...INITIAL });
    return;
  }
  if (S().state === 'active' || S().state === 'reconnecting') ringer.beep('ended');
  set({ state: 'ended', endText: text, endTone: tone, localStream: null, remoteStream: null, quality: null, issue: null, accepting: false, minimized: false });
  endTimer = setTimeout(() => { if (S().state === 'ended') set({ ...INITIAL }); }, delay);
}

/* ---------------- Missed-Call-Zähler ---------------- */

const seenKey = () => `adrian:calls-seen:${useSession.getState().me?.id ?? 'anon'}`;
function readSeen(): number | null {
  try { const v = localStorage.getItem(seenKey()); return v ? Number(v) : null; } catch { return null; }
}
/** Markiert alle Anrufe als gesehen (Besuch der Anrufe-Seite). */
export function markCallsSeen(latestIso?: string) {
  const t = Math.max(Date.now(), latestIso ? new Date(latestIso).getTime() : 0);
  try { localStorage.setItem(seenKey(), String(t)); } catch { /* ohne Speicher: Zähler bleibt nur für diese Sitzung korrekt */ }
  set({ missed: 0 });
}
async function refreshMissed() {
  if (location.pathname.startsWith('/calls')) { markCallsSeen(); return; }
  let seen = readSeen();
  if (seen === null) { markCallsSeen(); return; } // erster Besuch: nichts Altes als „neu“ zählen
  try {
    const { calls } = await apiGet<{ calls: CallRecord[] }>('/api/calls?limit=100');
    seen = readSeen() ?? seen;
    set({ missed: calls.filter((c) => c.missed && new Date(c.createdAt).getTime() > seen!).length });
  } catch { /* offline: Zähler unverändert */ }
}
export function useMissedCallCount(): number {
  return useCalls((s) => s.missed);
}

/* ---------------- Engine-Anbindung ---------------- */

function sendSignal(callId: string) {
  return (data: Record<string, unknown>) => { realtime.send({ type: 'call.signal', callId, data }); };
}

function startEngine(role: 'caller' | 'callee', stream: MediaStream, callId: string) {
  dropEngine();
  const hasVideo = stream.getVideoTracks().length > 0;
  const eng = new CallEngine({ role, iceServers, stream, facing: S().facing, send: sendSignal(callId) }, {
    onLink: (l: PeerLink) => {
      if (engine !== eng) return;
      const st = S().state;
      if (l === 'connected' && (st === 'connecting' || st === 'reconnecting')) {
        if (st === 'connecting') ringer.beep('connected');
        set({ state: 'active', startedAt: S().startedAt ?? Date.now() });
      } else if (l === 'reconnecting' && st === 'active') set({ state: 'reconnecting' });
      else if (l === 'failed') {
        const id = S().callId;
        if (id) realtime.send({ type: 'call.end', callId: id });
        finalize('Verbindung verloren – der Anruf wurde beendet', 'error', 3500);
      }
    },
    onRemote: (s) => { if (engine === eng) set({ remoteStream: s }); },
    onLocal: (s) => { if (engine === eng) set({ localStream: s }); },
    onPeerMedia: (m) => { if (engine === eng) set({ peerMuted: !m.audio, peerCameraOff: !m.video }); },
    onQuality: (q) => { if (engine === eng) set({ quality: q }); },
  });
  engine = eng;
  set({ localVideo: hasVideo, cameraOff: !hasVideo, muted: false, peerMuted: false, peerCameraOff: false });
  if (hasVideo) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    void countVideoInputs().then((n) => { if (engine === eng) set({ canSwitchCamera: n >= 2 || coarse }); });
  }
  const queued = earlySignals;
  earlySignals = [];
  queued.forEach((d) => eng.handleSignal(d));
  if (!stopWake) stopWake = keepScreenAwake();
  installDebugHook();
}

/* ---------------- Aktionen: Anrufer ---------------- */

/** Startet einen 1:1-Anruf (Sprache/Video). */
export function startCall(peer: PublicUser, kind: 'audio' | 'video'): void {
  const s = S();
  if (s.state !== 'idle' && s.state !== 'ended') { toast('Du bist bereits in einem Anruf.', 'error'); return; }
  if (!realtime.connected) { toast('Keine Verbindung zum Server – Anruf nicht möglich.', 'error'); return; }
  if (endTimer) clearTimeout(endTimer);
  finalize(null);
  abandonedInvite = 0;
  const my = epoch;
  armAudioUnlockOnce();
  set({ ...INITIAL, state: 'calling', role: 'caller', peer, kind });
  getLocalMedia(kind).then((m) => {
    if (my !== epoch) { m.stream.getTracks().forEach((t) => t.stop()); return; }
    if (m.cameraProblem) {
      held = { stream: m.stream, action: 'invite' };
      set({ issue: { message: `${m.cameraProblem.message} Möchtest du stattdessen einen Sprachanruf starten?`, confirmLabel: 'Sprachanruf starten' } });
      return;
    }
    sendInvite(m.stream, kind);
  }).catch((e) => {
    if (my !== epoch) return;
    finalize(e instanceof MediaError ? e.message : 'Mikrofon bzw. Kamera konnte nicht gestartet werden.', 'error', 5000);
  });
}

function sendInvite(stream: MediaStream, kind: 'audio' | 'video') {
  const peer = S().peer!;
  const my = epoch;
  held = { stream, action: 'invite' };
  set({ kind, localStream: stream, localVideo: stream.getVideoTracks().length > 0, cameraOff: stream.getVideoTracks().length === 0 });
  inviteSent = true;
  if (!realtime.send({ type: 'call.invite', toUserId: peer.id, kind })) {
    finalize('Keine Verbindung zum Server – Anruf nicht möglich.', 'error', 4000);
    return;
  }
  inviteTimer = setTimeout(() => { if (my === epoch && inviteSent) finalize('Der Server antwortet nicht. Bitte versuche es erneut.', 'error', 4000); }, 10_000);
}

/** Rückfrage „Kamera nicht verfügbar“ bestätigt: ohne Video fortfahren. */
export function confirmAudioFallback() {
  const h = held;
  if (!h || !S().issue) return;
  set({ issue: null });
  if (h.action === 'invite') sendInvite(h.stream, 'audio');
  else { held = null; proceedAccept(h.stream); }
}

/* ---------------- Aktionen: Angerufener ---------------- */

/** Eingehenden Anruf annehmen. */
export function acceptCall() {
  const s = S();
  if (s.state !== 'ringing' || s.accepting || !s.callId) return;
  const my = epoch;
  const callId = s.callId;
  ringer.stop();
  set({ accepting: true });
  getLocalMedia(s.kind).then((m) => {
    if (my !== epoch) { m.stream.getTracks().forEach((t) => t.stop()); return; }
    if (m.cameraProblem) {
      held = { stream: m.stream, action: 'accept' };
      set({ accepting: false, issue: { message: `${m.cameraProblem.message} Möchtest du den Anruf nur mit Ton annehmen?`, confirmLabel: 'Nur mit Ton annehmen' } });
      return;
    }
    proceedAccept(m.stream);
  }).catch((e) => {
    if (my !== epoch) return;
    realtime.send({ type: 'call.decline', callId });
    finalize(`${e instanceof MediaError ? e.message : 'Mikrofon bzw. Kamera konnte nicht gestartet werden.'} Der Anruf wurde abgelehnt.`, 'error', 5500);
  });
}

async function ensureIce() {
  if (iceServers.length) return;
  try { iceServers = (await apiGet<{ iceServers: IceServer[] }>('/api/calls/ice')).iceServers; } catch { /* ohne ICE-Server nur lokale Kandidaten */ }
}

function proceedAccept(stream: MediaStream) {
  const my = epoch;
  const callId = S().callId;
  if (!callId) { stream.getTracks().forEach((t) => t.stop()); return; }
  void ensureIce().then(() => {
    if (my !== epoch) { stream.getTracks().forEach((t) => t.stop()); return; }
    startEngine('callee', stream, callId);
    if (!realtime.send({ type: 'call.accept', callId })) finalize('Keine Verbindung zum Server.', 'error', 3500);
  });
}

/** Auflegen / Abbrechen / Ablehnen – je nach Zustand. */
export function hangup() {
  const s = S();
  switch (s.state) {
    case 'calling':
      if (s.callId) realtime.send({ type: 'call.cancel', callId: s.callId });
      else if (inviteSent) abandonedInvite = Date.now();
      finalize(null);
      break;
    case 'ringing':
      if (s.callId) realtime.send({ type: 'call.decline', callId: s.callId });
      finalize(null);
      break;
    case 'connecting':
    case 'active':
    case 'reconnecting':
      if (s.callId) realtime.send({ type: 'call.end', callId: s.callId });
      finalize('Anruf beendet', 'neutral', 1200);
      break;
    case 'ended':
      if (endTimer) clearTimeout(endTimer);
      set({ ...INITIAL });
      break;
  }
}
export const declineCall = hangup;

/* ---------------- Steuerung während des Anrufs ---------------- */

export function toggleMute() {
  if (!engine) return;
  const muted = !S().muted;
  engine.setMuted(muted);
  set({ muted });
}
export async function toggleCamera() {
  if (!engine || cameraBusy || !S().localVideo) return;
  cameraBusy = true;
  const turnOn = S().cameraOff;
  try {
    await engine.setCamera(turnOn);
    set({ cameraOff: !turnOn });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Die Kamera konnte nicht umgeschaltet werden.', 'error');
  } finally { cameraBusy = false; }
}
export async function switchCamera() {
  if (!engine || cameraBusy || S().cameraOff) return;
  cameraBusy = true;
  try {
    set({ facing: await engine.switchCamera() });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Die Kamera konnte nicht gewechselt werden.', 'error');
  } finally { cameraBusy = false; }
}
export const setOutputDevice = (outputId: string) => set({ outputId });
export const setMinimized = (minimized: boolean) => set({ minimized });

/* ---------------- Ereignisse vom Server ---------------- */

function notifyIncoming(id: string, peer: PublicUser | null, kind: 'audio' | 'video') {
  if (document.visibilityState === 'visible') return;
  savedTitle ??= document.title;
  document.title = `Eingehender Anruf – ${peerName(peer)}`;
  const me = useSession.getState().me;
  if (!('Notification' in window) || Notification.permission !== 'granted' || me?.settings.notify.calls === false) return;
  navigator.serviceWorker?.ready.then((r) => r.showNotification(peerName(peer), {
    body: kind === 'video' ? 'Eingehender Videoanruf' : 'Eingehender Sprachanruf',
    tag: `call-${id}`, requireInteraction: true, icon: '/icon-192.png', data: { url: `/calls?incoming=${id}` },
  } as NotificationOptions)).catch(() => {});
}

function onInvited(e: any) {
  if (abandonedInvite && Date.now() - abandonedInvite < 10_000) { // Nutzer hat aufgelegt, bevor der Server geantwortet hat
    abandonedInvite = 0;
    realtime.send({ type: 'call.cancel', callId: e.callId });
    return;
  }
  const s = S();
  if (!inviteSent || s.state !== 'calling' || s.callId) return; // Einladung stammt von einem anderen Tab/Gerät
  inviteSent = false;
  if (inviteTimer) clearTimeout(inviteTimer);
  iceServers = e.iceServers ?? [];
  const stream = held?.stream;
  held = null;
  if (!stream) { realtime.send({ type: 'call.cancel', callId: e.callId }); finalize(null); return; }
  set({ callId: e.callId, peer: e.peer ?? s.peer, kind: e.kind ?? s.kind });
  void ensureIce().then(() => {
    if (S().callId !== e.callId) { stream.getTracks().forEach((t) => t.stop()); return; }
    startEngine('caller', stream, e.callId);
    ringer.start('ringback');
  });
}

function onIncoming(e: any) {
  const s = S();
  if (s.callId === e.callId && s.state !== 'idle' && s.state !== 'ended') return; // erneute Zustellung (z. B. nach Reconnect)
  if (s.state !== 'idle' && s.state !== 'ended') return; // Server verhindert das; defensive Absicherung
  if (endTimer) clearTimeout(endTimer);
  const peer: PublicUser | null = e.peer ?? null;
  iceServers = e.iceServers ?? [];
  earlySignals = [];
  epoch++;
  set({ ...INITIAL, state: 'ringing', role: 'callee', callId: e.callId, peer, kind: e.kind === 'video' ? 'video' : 'audio' });
  ringer.start('incoming');
  notifyIncoming(e.callId, peer, e.kind);
  const ms = ((e.ringSeconds ?? 45) + 5) * 1000;
  ringTimeout = setTimeout(() => { if (S().callId === e.callId && S().state === 'ringing') finalize(null); }, ms);
}

function onAccepted(e: any) {
  const s = S();
  if (e.callId !== s.callId) return;
  if (s.role === 'caller' && (s.state === 'calling')) {
    ringer.stop();
    set({ state: 'connecting' });
    void engine?.negotiate();
  } else if (s.role === 'callee' && (s.state === 'ringing' || s.state === 'calling')) {
    set({ state: 'connecting', accepting: false });
  }
}

function onSignal(e: any) {
  if (e.callId !== S().callId) return;
  if (engine) engine.handleSignal(e.data);
  else earlySignals.push(e.data);
}

function onEnded(e: any) {
  const s = S();
  if (inviteSent && !s.callId && e.reason === 'busy') { finalize(`${peerName()} ist gerade in einem Anruf`, 'neutral', 3000); return; }
  if (!s.callId || e.callId !== s.callId || s.state === 'idle' || s.state === 'ended') return;
  const t = endText(e, s.role);
  finalize(t.text, t.tone, t.delay);
}

function onError(e: any) {
  const s = S();
  const text = ERROR_TEXT[e.code] ?? e.message ?? 'Der Anruf ist fehlgeschlagen.';
  if (inviteSent && !s.callId) { finalize(text, 'error', 4500); return; }
  if (e.callId && e.callId === s.callId && s.state !== 'idle' && s.state !== 'ended') { finalize(text, 'error', 4000); return; }
  if (e.code === 'already_in_call' && s.state === 'idle') return;
  toast(text, 'error');
}

function onHandled(e: any) {
  const s = S();
  // Wurde der Anruf hier angenommen (accepting), betrifft die Meldung nur eine weitere Verbindung desselben Tabs – ignorieren.
  if (e.callId === s.callId && s.state === 'ringing' && !s.accepting) finalize('Auf einem anderen Gerät angenommen', 'neutral', 1500);
}

function onMissed(e: any) {
  const s = S();
  if (document.visibilityState === 'visible' && s.callId !== e.callId) toast('Verpasster Anruf', 'info');
  void refreshMissed();
}

function onRejoined(e: any) {
  if (e.callId === S().callId) engine?.onRejoined();
}
function onPeerReconnected(e: any) {
  if (e.callId === S().callId) engine?.onPeerReconnected();
}

function onResync() {
  void refreshMissed();
  const s = S();
  if (!s.callId || s.state === 'idle' || s.state === 'ended' || s.state === 'ringing') {
    if (s.state === 'calling' && !s.callId && inviteSent) finalize('Die Verbindung wurde unterbrochen. Bitte versuche es erneut.', 'error', 4000);
    return;
  }
  realtime.send({ type: 'call.rejoin', callId: s.callId });
}

function onPageHide() {
  const s = S();
  if (!s.callId) return;
  if (s.state === 'calling') realtime.send({ type: 'call.cancel', callId: s.callId });
  else if (s.state === 'connecting' || s.state === 'active' || s.state === 'reconnecting') realtime.send({ type: 'call.end', callId: s.callId });
}

let unlockArmed = false;
function armAudioUnlockOnce() {
  if (unlockArmed) return;
  unlockArmed = true;
  armAudioUnlock();
}

/** Nur lesende Diagnose-Schnittstelle (E2E-Tests, Fehlersuche). */
function installDebugHook() {
  (window as unknown as { __adrianRtc?: unknown }).__adrianRtc = {
    state: () => S().state,
    stats: () => engine?.summary() ?? Promise.resolve(null),
    tracks: () => engine?.trackInfo() ?? null,
  };
}

/** Registriert alle `call.*`-Ereignisse. Gibt eine Aufräum-Funktion zurück. */
export function initCallEvents(): () => void {
  const offs: (() => void)[] = [];
  const on = (type: string, fn: (e: any) => void) => offs.push(realtime.on(type, fn));
  on('call.invited', onInvited);
  on('call.incoming', onIncoming);
  on('call.accepted', onAccepted);
  on('call.signal', onSignal);
  on('call.ended', onEnded);
  on('call.error', onError);
  on('call.handled', onHandled);
  on('call.missed', onMissed);
  on('call.rejoined', onRejoined);
  on('call.peer_reconnected', onPeerReconnected);
  on('resync', onResync);
  on('connected', () => void refreshMissed());
  armAudioUnlockOnce();
  installDebugHook();
  const onVisible = () => { if (document.visibilityState === 'visible' && S().state !== 'ringing') restoreTitle(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    offs.forEach((f) => f());
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onPageHide);
    finalize(null);
  };
}

export function resetCalls(): void {
  if (endTimer) clearTimeout(endTimer);
  finalize(null);
  abandonedInvite = 0;
  set({ missed: 0 });
}
