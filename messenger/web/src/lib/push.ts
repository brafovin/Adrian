import { del, get, put } from '../api';

export type PushState = 'unsupported' | 'denied' | 'disabled' | 'enabled' | 'server-off';

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const { webPushPublicKey } = await get<{ webPushPublicKey: string | null }>('/api/push/config');
  if (!webPushPublicKey) return 'server-off';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'enabled' : 'disabled';
}

/** Fragt die Berechtigung ab und registriert das Gerät für Web-Push. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const { webPushPublicKey } = await get<{ webPushPublicKey: string | null }>('/api/push/config');
  if (!webPushPublicKey) return 'server-off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'disabled';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(webPushPublicKey) }));
  const json = sub.toJSON();
  await put('/api/push/subscription', { provider: 'webpush', endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
  return 'enabled';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await del('/api/push/subscription', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
