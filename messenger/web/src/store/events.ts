import { realtime } from '../realtime';
import { toast } from './ui';
import { useBackgrounds } from './backgrounds';
import { useChats, messagePreview } from './chats';
import { useContacts } from './contacts';
import { usePresence } from './presence';
import { useSession } from './session';
import { initCallEvents, resetCalls } from './calls';
import { initStatusEvents, resetStatus } from './status';
import type { Message } from '../types';

/** Verbindet WebSocket-Ereignisse mit den Stores. Gibt eine Funktion zum Aufräumen zurück. */
export function startRealtime(navigate: (to: string) => void): () => void {
  const chats = () => useChats.getState();
  const offs: (() => void)[] = [];
  const on = (type: string, fn: (e: any) => void) => offs.push(realtime.on(type, fn));

  on('message.new', (e: { message: Message }) => {
    const m = e.message;
    const me = useSession.getState().me;
    chats().applyIncoming(m);
    if (!me || m.senderId === me.id || m.kind === 'system') return;
    const conv = chats().conversations.find((c) => c.id === m.conversationId);
    const muted = conv?.mutedUntil && new Date(conv.mutedUntil) > new Date();
    const visibleHere = chats().activeId === m.conversationId && document.visibilityState === 'visible';
    if (muted || visibleHere || !me.settings.notify.messages) return;
    const title = conv?.type === 'group' ? conv.title ?? 'Gruppe' : conv?.peer?.displayName ?? 'Neue Nachricht';
    const body = me.settings.notify.hidePreviews ? 'Neue Nachricht' : messagePreview(m);
    if (document.visibilityState === 'visible') {
      toast(`${title}: ${body}`, 'info', { label: 'Öffnen', onClick: () => navigate(`/chats/${m.conversationId}`) });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Tab im Hintergrund, aber verbunden: der Server sendet dann keinen Push → lokal anzeigen.
      navigator.serviceWorker?.ready.then((r) => r.showNotification(title, { body, tag: `conv-${m.conversationId}`, data: { url: `/chats/${m.conversationId}` }, icon: '/icon-192.png' })).catch(() => {});
    }
  });
  on('message.updated', (e) => chats().applyUpdated(e.message));
  on('message.hidden', (e) => chats().removeLocal(e.conversationId, e.messageId));
  on('receipt', (e) => chats().setReceipt(e.conversationId, e.userId, e.kind, e.seq));
  on('typing', (e) => chats().setTyping(e.conversationId, e.userId, e.typing));
  on('conversation.updated', (e) => void chats().refreshConversation(e.conversationId).then(() => chats().loadConversations()));
  on('conversation.read', (e) => {
    const c = chats().conversations.find((x) => x.id === e.conversationId);
    if (c) chats().upsertConversation({ ...c, unreadCount: 0 });
  });
  on('presence', (e) => usePresence.getState().set(e.userId, { online: e.online, ...(e.lastSeenAt ? { lastSeenAt: e.lastSeenAt } : {}) }));
  on('contacts.changed', () => void useContacts.getState().load());
  on('contact.request', () => {
    void useContacts.getState().load();
    toast('Neue Kontaktanfrage', 'info', { label: 'Ansehen', onClick: () => navigate('/contacts') });
  });
  on('profile.updated', () => { void chats().loadConversations(); void useContacts.getState().load(); });
  on('background.updated', (e) => useBackgrounds.getState().apply(e.conversationId, e.background));
  on('settings.updated', (e) => {
    const me = useSession.getState().me;
    if (me) useSession.getState().setMe({ ...me, settings: e.settings });
  });
  on('session.revoked', () => useSession.getState().reset());
  on('auth.failed', () => useSession.getState().reset());
  on('connected', () => void bootstrap());
  on('resync', () => void resync());

  offs.push(initStatusEvents());
  offs.push(initCallEvents());

  async function bootstrap() {
    await Promise.allSettled([chats().loadConversations(), useContacts.getState().load(), useBackgrounds.getState().load()]);
  }
  async function resync() {
    await Promise.allSettled([chats().loadConversations(), useContacts.getState().load(), useBackgrounds.getState().load()]);
    const active = chats().activeId;
    if (active) await chats().openThread(active).catch(() => {});
    // Alle bereits geladenen Verläufe nachziehen, damit Geräte synchron bleiben
    for (const id of Object.keys(chats().threads)) if (id !== active) void chats().openThread(id).catch(() => {});
    chats().retryAllFailed();
  }

  realtime.start();
  const onReset = () => {
    chats().reset();
    useContacts.getState().reset();
    useBackgrounds.getState().reset();
    usePresence.getState().reset();
    resetStatus();
    resetCalls();
  };
  window.addEventListener('adrian:reset', onReset);
  return () => {
    offs.forEach((f) => f());
    window.removeEventListener('adrian:reset', onReset);
    realtime.stop();
  };
}
