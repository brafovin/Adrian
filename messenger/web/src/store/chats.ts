import { create } from 'zustand';
import { ApiError, del, errorMessage, get, patch, post, put, uploadMedia } from '../api';
import { newId } from '../lib/format';
import type { Conversation, LocalMessage, Media, Member, Message, MessageKind } from '../types';
import { useSession } from './session';
import { toast } from './ui';

export interface Thread {
  items: LocalMessage[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  /** true, wenn der Verlauf nicht bis zur neuesten Nachricht geladen ist (Sprung zu Suchtreffer) */
  detached?: boolean;
}
const emptyThread = (): Thread => ({ items: [], hasMore: false, loading: false, loaded: false });
const PENDING_SEQ = Number.MAX_SAFE_INTEGER;

interface PendingSend {
  convId: string;
  clientMsgId: string;
  kind: MessageKind;
  body: string;
  replyToId?: string;
  file?: { blob: Blob; name: string; asVoice?: boolean; durationMs?: number; width?: number; height?: number };
}
const outbox = new Map<string, PendingSend>();

interface ChatsState {
  conversations: Conversation[];
  loaded: boolean;
  threads: Record<string, Thread>;
  members: Record<string, Member[]>;
  typing: Record<string, Record<string, number>>;
  activeId: string | null;
  /** Nachricht, die im Verlauf hervorgehoben werden soll (Suchtreffer) */
  highlightId: string | null;

  loadConversations(): Promise<void>;
  upsertConversation(c: Conversation): void;
  refreshConversation(id: string): Promise<void>;
  loadMembers(id: string): Promise<void>;
  setActive(id: string | null): void;
  openThread(id: string): Promise<void>;
  loadOlder(id: string): Promise<void>;
  jumpTo(id: string, messageId: string): Promise<void>;
  jumpToLatest(id: string): Promise<void>;
  sendText(id: string, body: string, replyToId?: string): void;
  sendFile(id: string, file: Blob, name: string, kind: Exclude<MessageKind, 'text' | 'system'>, extra?: { caption?: string; durationMs?: number; width?: number; height?: number; replyToId?: string }): void;
  retry(id: string, clientMsgId: string): void;
  discard(id: string, clientMsgId: string): void;
  retryAllFailed(): void;
  edit(messageId: string, body: string): Promise<void>;
  remove(msg: Message, scope: 'me' | 'all'): Promise<void>;
  react(msg: Message, emoji: string | null): Promise<void>;
  forward(messageId: string, convIds: string[]): Promise<void>;
  markRead(id: string): Promise<void>;
  startDirect(userId: string): Promise<Conversation>;
  createGroup(title: string, memberIds: string[], avatarMediaId?: string): Promise<Conversation>;
  setConversationPrefs(id: string, p: { archived?: boolean; pinned?: boolean; mutedUntil?: string | null }): Promise<void>;
  // Ereignisse
  applyIncoming(m: Message): void;
  applyUpdated(m: Message): void;
  removeLocal(convId: string, messageId: string): void;
  setReceipt(convId: string, userId: string, kind: 'delivered' | 'read', seq: number): void;
  setTyping(convId: string, userId: string, typing: boolean): void;
  reset(): void;
}

function sortItems(items: LocalMessage[]): LocalMessage[] {
  return [...items].sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
}

export const useChats = create<ChatsState>((set, getState) => {
  const patchThread = (id: string, fn: (t: Thread) => Thread) =>
    set((s) => ({ threads: { ...s.threads, [id]: fn(s.threads[id] ?? emptyThread()) } }));

  const patchConv = (id: string, fn: (c: Conversation) => Conversation) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }));

  const sortConvs = (list: Conversation[]) =>
    [...list].sort(
      (a, b) =>
        Number(!!b.pinnedAt) - Number(!!a.pinnedAt) ||
        (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
    );

  async function deliver(p: PendingSend) {
    const { convId, clientMsgId } = p;
    const setLocal = (local: LocalMessage['local'] | undefined, extra: Partial<LocalMessage> = {}) =>
      patchThread(convId, (t) => ({ ...t, items: t.items.map((m) => (m.clientMsgId === clientMsgId && m.local ? { ...m, ...extra, local } : m)) }));
    try {
      let media: Media | undefined = (p as PendingSend & { uploaded?: Media }).uploaded;
      if (p.file && !media) {
        media = await uploadMedia(
          p.file.blob, p.file.name,
          { purpose: 'message', asVoice: p.file.asVoice, durationMs: p.file.durationMs, width: p.file.width, height: p.file.height },
          (pr) => setLocal({ status: 'sending', progress: pr }),
        );
        (p as PendingSend & { uploaded?: Media }).uploaded = media;
      }
      const { message } = await post<{ message: Message }>(`/api/conversations/${convId}/messages`, {
        clientMsgId, kind: p.kind, body: p.body, mediaId: media?.id, replyToId: p.replyToId,
      });
      outbox.delete(clientMsgId);
      getState().applyIncoming(message);
    } catch (e) {
      // Netzwerkfehler → später automatisch erneut versuchen (gleiche clientMsgId = idempotent)
      const retriable = e instanceof ApiError ? e.status === 0 || e.status >= 500 : true;
      if (!retriable) outbox.set(clientMsgId, p);
      setLocal({ status: 'failed', error: errorMessage(e) });
    }
  }

  return {
    conversations: [],
    loaded: false,
    threads: {},
    members: {},
    typing: {},
    activeId: null,
    highlightId: null,

    async loadConversations() {
      const { conversations } = await get<{ conversations: Conversation[] }>('/api/conversations');
      set({ conversations, loaded: true });
    },
    upsertConversation(c) {
      set((s) => ({
        conversations: sortConvs(s.conversations.some((x) => x.id === c.id) ? s.conversations.map((x) => (x.id === c.id ? c : x)) : [c, ...s.conversations]),
      }));
    },
    async refreshConversation(id) {
      try {
        const { conversation, members } = await get<{ conversation: Conversation; members: Member[] }>(`/api/conversations/${id}`);
        getState().upsertConversation(conversation);
        set((s) => ({ members: { ...s.members, [id]: members } }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
        }
      }
    },
    async loadMembers(id) {
      const { members } = await get<{ members: Member[] }>(`/api/conversations/${id}`);
      set((s) => ({ members: { ...s.members, [id]: members } }));
    },
    setActive(id) {
      set({ activeId: id });
    },

    async openThread(id) {
      const t = getState().threads[id];
      if (t?.loading) return;
      patchThread(id, (x) => ({ ...x, loading: true }));
      try {
        // Bereits geladene Nachrichten behalten und nur Neues nachladen (Sync nach Verbindungsabbruch).
        const confirmed = t?.items.filter((m) => !m.local) ?? [];
        const lastSeq = confirmed.length && !t?.detached ? Math.max(...confirmed.map((m) => m.seq)) : null;
        const url = lastSeq !== null ? `/api/conversations/${id}/messages?after=${lastSeq}&limit=100` : `/api/conversations/${id}/messages?limit=50`;
        const { messages, hasMore } = await get<{ messages: Message[]; hasMore: boolean }>(url);
        patchThread(id, (x) => {
          const have = new Map(x.items.filter((m) => !m.local).map((m) => [m.id, m]));
          for (const m of messages) have.set(m.id, m);
          const pending = x.items.filter((m) => m.local && !messages.some((n) => n.clientMsgId === m.clientMsgId));
          const base = lastSeq !== null ? x.hasMore : hasMore;
          return { ...x, items: sortItems([...have.values(), ...pending]), loaded: true, loading: false, hasMore: base, detached: false };
        });
        // Lücke größer als eine Seite → alles nachladen
        if (lastSeq !== null && hasMore) await getState().openThread(id);
      } catch (e) {
        patchThread(id, (x) => ({ ...x, loading: false }));
        throw e;
      }
      void getState().loadMembers(id).catch(() => {});
    },

    async loadOlder(id) {
      const t = getState().threads[id];
      if (!t || t.loading || !t.hasMore) return;
      const first = t.items.find((m) => !m.local);
      if (!first) return;
      patchThread(id, (x) => ({ ...x, loading: true }));
      try {
        const { messages, hasMore } = await get<{ messages: Message[]; hasMore: boolean }>(`/api/conversations/${id}/messages?before=${first.seq}&limit=50`);
        patchThread(id, (x) => ({ ...x, loading: false, hasMore, items: sortItems([...messages.filter((m) => !x.items.some((i) => i.id === m.id)), ...x.items]) }));
      } catch {
        patchThread(id, (x) => ({ ...x, loading: false }));
      }
    },

    async jumpTo(id, messageId) {
      const t = getState().threads[id];
      if (t?.items.some((m) => m.id === messageId)) { set({ highlightId: messageId }); return; }
      const { messages } = await get<{ messages: Message[] }>(`/api/conversations/${id}/messages?around=${messageId}&limit=60`);
      patchThread(id, () => ({ items: sortItems(messages), hasMore: true, loading: false, loaded: true, detached: true }));
      set({ highlightId: messageId });
    },
    async jumpToLatest(id) {
      patchThread(id, () => emptyThread());
      await getState().openThread(id);
    },

    sendText(id, body, replyToId) {
      const text = body.trim();
      if (!text) return;
      const p: PendingSend = { convId: id, clientMsgId: newId(), kind: 'text', body: text, replyToId };
      queueLocal(p);
    },
    sendFile(id, file, name, kind, extra = {}) {
      const p: PendingSend = {
        convId: id, clientMsgId: newId(), kind, body: extra.caption ?? '', replyToId: extra.replyToId,
        file: { blob: file, name, asVoice: kind === 'voice', durationMs: extra.durationMs, width: extra.width, height: extra.height },
      };
      queueLocal(p);
    },
    retry(id, clientMsgId) {
      const p = outbox.get(clientMsgId);
      if (!p) return;
      patchThread(id, (t) => ({ ...t, items: t.items.map((m) => (m.clientMsgId === clientMsgId ? { ...m, local: { status: 'sending' as const } } : m)) }));
      void deliver(p);
    },
    discard(id, clientMsgId) {
      outbox.delete(clientMsgId);
      patchThread(id, (t) => ({ ...t, items: t.items.filter((m) => m.clientMsgId !== clientMsgId) }));
    },
    retryAllFailed() {
      for (const p of outbox.values()) getState().retry(p.convId, p.clientMsgId);
    },

    async edit(messageId, body) {
      const { message } = await patch<{ message: Message }>(`/api/messages/${messageId}`, { body });
      getState().applyUpdated(message);
    },
    async remove(msg, scope) {
      await del(`/api/messages/${msg.id}?scope=${scope}`);
      if (scope === 'me') getState().removeLocal(msg.conversationId, msg.id);
    },
    async react(msg, emoji) {
      const { message } = await put<{ message: Message }>(`/api/messages/${msg.id}/reaction`, { emoji });
      getState().applyUpdated(message);
    },
    async forward(messageId, convIds) {
      const { messages } = await post<{ messages: Message[] }>(`/api/messages/${messageId}/forward`, { conversationIds: convIds });
      messages.forEach((m) => getState().applyIncoming(m));
    },
    async markRead(id) {
      const c = getState().conversations.find((x) => x.id === id);
      if (!c || c.unreadCount === 0) return;
      patchConv(id, (x) => ({ ...x, unreadCount: 0 }));
      try { await post(`/api/conversations/${id}/read`, {}); } catch { /* wird beim nächsten Öffnen erneut versucht */ }
    },

    async startDirect(userId) {
      const { conversation } = await post<{ conversation: Conversation }>('/api/conversations/direct', { userId });
      getState().upsertConversation(conversation);
      return conversation;
    },
    async createGroup(title, memberIds, avatarMediaId) {
      const { conversation } = await post<{ conversation: Conversation }>('/api/conversations/group', { title, memberIds, avatarMediaId });
      getState().upsertConversation(conversation);
      return conversation;
    },
    async setConversationPrefs(id, p) {
      const { conversation } = await patch<{ conversation: Conversation }>(`/api/conversations/${id}/me`, p);
      getState().upsertConversation(conversation);
    },

    applyIncoming(m) {
      const s = getState();
      const t = s.threads[m.conversationId];
      if (t?.loaded && !t.detached) {
        patchThread(m.conversationId, (x) => {
          const exists = x.items.some((i) => i.id === m.id && !i.local);
          const items = x.items.filter((i) => !(i.local && i.clientMsgId && i.clientMsgId === m.clientMsgId));
          return { ...x, items: sortItems(exists ? items.map((i) => (i.id === m.id ? m : i)) : [...items, m]) };
        });
      }
      const conv = s.conversations.find((c) => c.id === m.conversationId);
      if (!conv) { void s.loadConversations(); return; }
      const fromMe = m.senderId === selfId();
      const alreadyCounted = conv.lastSeq >= m.seq;
      const visibleHere = s.activeId === m.conversationId && document.visibilityState === 'visible';
      patchConv(m.conversationId, (c) => ({
        ...c,
        lastSeq: Math.max(c.lastSeq, m.seq),
        lastMessageAt: m.createdAt,
        lastMessage: (c.lastMessage as LocalMessage | null)?.local || m.seq >= (c.lastMessage?.seq ?? 0) ? m : c.lastMessage,
        unreadCount: fromMe || alreadyCounted || m.kind === 'system' || visibleHere ? c.unreadCount : c.unreadCount + 1,
      }));
      set((st) => ({ conversations: sortConvs(st.conversations) }));
      if (visibleHere && !fromMe && m.kind !== 'system') void getState().markRead(m.conversationId);
    },
    applyUpdated(m) {
      patchThread(m.conversationId, (t) => ({ ...t, items: t.items.map((i) => (i.id === m.id ? m : i)) }));
      patchConv(m.conversationId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c));
    },
    removeLocal(convId, messageId) {
      patchThread(convId, (t) => ({ ...t, items: t.items.filter((i) => i.id !== messageId) }));
      const c = getState().conversations.find((x) => x.id === convId);
      if (c?.lastMessage?.id === messageId) void getState().refreshConversation(convId);
    },
    setReceipt(convId, userId, kind, seq) {
      // Chatliste: Zusammenfassung für Einzelchats direkt fortschreiben (Gruppen: aus Mitgliederliste, sobald geladen)
      const conv = getState().conversations.find((c) => c.id === convId);
      if (conv?.type === 'direct') {
        patchConv(convId, (c) => ({
          ...c,
          receipts: {
            deliveredSeq: Math.max(c.receipts.deliveredSeq, seq),
            readSeq: kind === 'read' ? Math.max(c.receipts.readSeq ?? 0, seq) : c.receipts.readSeq,
          },
        }));
      }
      set((s) => ({
        members: {
          ...s.members,
          [convId]: (s.members[convId] ?? []).map((m) =>
            m.id !== userId ? m : kind === 'delivered' ? { ...m, deliveredSeq: Math.max(m.deliveredSeq, seq) } : { ...m, deliveredSeq: Math.max(m.deliveredSeq, seq), readSeq: Math.max(m.readSeq ?? 0, seq) },
          ),
        },
      }));
    },
    setTyping(convId, userId, typing) {
      set((s) => {
        const cur = { ...(s.typing[convId] ?? {}) };
        if (typing) cur[userId] = Date.now() + 6000;
        else delete cur[userId];
        return { typing: { ...s.typing, [convId]: cur } };
      });
    },
    reset() {
      outbox.clear();
      set({ conversations: [], loaded: false, threads: {}, members: {}, typing: {}, activeId: null, highlightId: null });
    },
  };

  function queueLocal(p: PendingSend) {
    const me = selfId();
    const now = new Date().toISOString();
    const local: LocalMessage = {
      id: `local-${p.clientMsgId}`, conversationId: p.convId, seq: PENDING_SEQ, senderId: me, clientMsgId: p.clientMsgId,
      kind: p.kind, body: p.body,
      media: p.file ? { id: '', kind: p.kind === 'image' ? 'image' : p.kind === 'video' ? 'video' : p.kind === 'file' ? 'file' : 'audio', mime: p.file.blob.type, size: p.file.blob.size, name: p.file.name, width: p.file.width ?? null, height: p.file.height ?? null, durationMs: p.file.durationMs ?? null, url: URL.createObjectURL(p.file.blob), thumbUrl: null } : null,
      replyTo: null, forwarded: false, system: null, editedAt: null, deletedAt: null, createdAt: now, reactions: [],
      local: { status: 'sending', progress: 0 },
    };
    const reply = p.replyToId ? getState().threads[p.convId]?.items.find((m) => m.id === p.replyToId) : undefined;
    if (reply) local.replyTo = { id: reply.id, senderId: reply.senderId, kind: reply.kind, body: reply.body.slice(0, 140), deleted: !!reply.deletedAt };
    outbox.set(p.clientMsgId, p);
    set((s) => {
      const t = s.threads[p.convId] ?? emptyThread();
      return { threads: { ...s.threads, [p.convId]: { ...t, loaded: true, detached: false, items: sortItems([...t.items, local]) } } };
    });
    patchConv(p.convId, (c) => ({ ...c, lastMessageAt: now, lastMessage: local }));
    set((st) => ({ conversations: sortConvs(st.conversations) }));
    void deliver(p);
  }
});

const selfId = () => useSession.getState().me?.id ?? '';

export const messagePreview = (m: Message | null | undefined, ownId?: string): string => {
  if (!m) return '';
  if (m.deletedAt) return 'Nachricht gelöscht';
  const prefix = m.senderId === ownId ? 'Du: ' : '';
  switch (m.kind) {
    case 'system': return systemText(m, undefined, ownId);
    case 'image': return `${prefix}📷 ${m.body || 'Foto'}`;
    case 'video': return `${prefix}🎬 ${m.body || 'Video'}`;
    case 'voice': return `${prefix}🎤 Sprachnachricht`;
    case 'audio': return `${prefix}🎵 Audio`;
    case 'file': return `${prefix}📎 ${m.body || m.media?.name || 'Datei'}`;
    default: return prefix + m.body;
  }
};

export function systemText(m: Message, names?: (id: string) => string, myId?: string): string {
  const n = (id?: string) => (id === myId && myId ? 'Du' : id && names ? names(id) : 'Jemand');
  const has = (id?: string) => (id === myId && myId ? 'hast' : 'hat');
  const e = m.system ?? {};
  switch (e.type) {
    case 'group_created': return `${n(e.by)} ${has(e.by)} die Gruppe erstellt`;
    case 'member_added': return `${n(e.by)} ${has(e.by)} ${n(e.userId)} hinzugefügt`;
    case 'member_removed': return `${n(e.by)} ${has(e.by)} ${n(e.userId)} entfernt`;
    case 'member_left': return `${n(e.userId)} ${has(e.userId)} die Gruppe verlassen`;
    case 'member_joined_via_link': return `${n(e.userId)} ${e.userId === myId ? 'bist' : 'ist'} per Einladungslink beigetreten`;
    case 'title_changed': return `${n(e.by)} ${has(e.by)} die Gruppe in „${e.title}“ umbenannt`;
    default: return 'Systemnachricht';
  }
}

export { toast };
