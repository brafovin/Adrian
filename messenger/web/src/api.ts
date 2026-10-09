export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Wird aufgerufen, wenn der Server 401 meldet (Sitzung abgelaufen/beendet). */
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export async function api<T = any>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Keine Verbindung zum Server.');
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    if (res.status === 401 && !path.startsWith('/api/auth/')) unauthorizedListeners.forEach((f) => f());
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Fehler ${res.status}`);
  }
  return json as T;
}

export const get = <T = any>(p: string, o?: { signal?: AbortSignal }) => api<T>('GET', p, undefined, o);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const put = <T = any>(p: string, b: unknown = {}) => api<T>('PUT', p, b);
export const patch = <T = any>(p: string, b: unknown = {}) => api<T>('PATCH', p, b);
export const del = <T = any>(p: string, b?: unknown) => api<T>('DELETE', p, b);

import type { Media } from './types';

/** Datei hochladen (mit Fortschritt). Der Server erkennt den Typ am Inhalt. */
export function uploadMedia(
  file: Blob,
  filename: string,
  fields: { purpose: 'message' | 'avatar' | 'status' | 'background' | 'group_avatar'; asVoice?: boolean; durationMs?: number; width?: number; height?: number },
  onProgress?: (p: number) => void,
): Promise<Media> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('purpose', fields.purpose);
    if (fields.asVoice) fd.append('asVoice', 'true');
    if (fields.durationMs) fd.append('durationMs', String(Math.round(fields.durationMs)));
    if (fields.width) fd.append('width', String(fields.width));
    if (fields.height) fd.append('height', String(fields.height));
    fd.append('file', file, filename);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Keine Verbindung zum Server.'));
    xhr.onload = () => {
      let json: any = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json.media as Media);
      else reject(new ApiError(xhr.status, json?.error?.code ?? 'error', json?.error?.message ?? `Fehler ${xhr.status}`));
    };
    xhr.send(fd);
  });
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Unbekannter Fehler');
