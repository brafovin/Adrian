import type { ReactNode } from 'react';
import { createElement, Fragment } from 'react';
import type { Conversation, LocalMessage, Member, Message } from '../types';

export const convTitle = (c: Conversation) => (c.type === 'group' ? c.title ?? 'Gruppe' : c.peer?.displayName ?? 'Gelöschter Nutzer');
export const convAvatar = (c: Conversation) => (c.type === 'group' ? c.avatarUrl : c.peer?.avatarUrl ?? null);

export type MsgStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/** Zustellstatus einer eigenen Nachricht anhand der Empfangsbestätigungen aller anderen Mitglieder. */
export function messageStatus(m: LocalMessage, members: Member[] | undefined, myId: string): MsgStatus {
  if (m.local) return m.local.status;
  const others = (members ?? []).filter((x) => x.id !== myId);
  if (!others.length) return 'sent';
  if (!others.every((o) => o.deliveredSeq >= m.seq)) return 'sent';
  // Mitglieder ohne Lesebestätigung (readSeq === null) können nur „zugestellt“ erreichen.
  const withReceipts = others.filter((o) => o.readSeq !== null);
  if (withReceipts.length && withReceipts.every((o) => (o.readSeq ?? 0) >= m.seq)) return 'read';
  return 'delivered';
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;
/** Macht http(s)-Links klickbar (ohne HTML einzufügen). */
export function linkify(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(createElement('a', { key: i, href: m[0], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[0]));
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return createElement(Fragment, null, ...parts);
}

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const EMOJI_GROUPS: { name: string; list: string }[] = [
  { name: 'Smileys', list: '😀😃😄😁😆😅😂🤣🥲😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕' },
  { name: 'Gesten', list: '👍👎👌🤌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️✋🤚🖐️🖖👋🤝🙏✍️💪🦾👏🙌👐🤲🫶🫡🫠' },
  { name: 'Herzen', list: '❤️🧡💛💚💙💜🖤🤍🤎💔❤️‍🔥💕💞💓💗💖💘💝💟☮️✨⭐🌟💫🔥💥🎉🎊🎈🎁🏆🥇' },
  { name: 'Natur & Essen', list: '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🦄🐝🦋🌸🌹🌻🌈☀️🌙⛅🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🥑🍕🍔🍟🌭🍿🍩🍪🎂🍫☕🍺🍷' },
  { name: 'Aktivität', list: '⚽🏀🏈⚾🎾🏐🎱🏓🥊🎮🎯🎲🎸🎹🎤🎧🎬📷💻📱⌚🚗🚕🚌🚀✈️🏠🏖️🗺️💡📚💰💎🔑🔔✅❌⚠️❓❗' },
];

export function splitEmojis(s: string): string[] {
  return Array.from(new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
}

/** Verkleinert große Bilder vor dem Upload (spart Datenvolumen). */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 2560;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 || file.type === 'image/gif') { const r = { blob: file as Blob, name: file.name, width: bmp.width, height: bmp.height }; bmp.close(); return r; }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.88));
    return { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg', width: w, height: h };
  } catch {
    return { blob: file, name: file.name, width: 0, height: 0 };
  }
}

export function videoMeta(file: File): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight, durationMs: Math.round(v.duration * 1000) || 0 }); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve({ width: 0, height: 0, durationMs: 0 });
    v.src = URL.createObjectURL(file);
  });
}

export const canEdit = (m: Message, myId: string, windowMin = 24 * 60) =>
  m.senderId === myId && !m.deletedAt && m.kind !== 'system' && Date.now() - new Date(m.createdAt).getTime() < windowMin * 60_000;
