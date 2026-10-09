import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useMissedCallCount } from '../store/calls';
import { useChats } from '../store/chats';
import { useContacts } from '../store/contacts';
import { useUnseenStatusCount } from '../store/status';
import { CallsScreen } from './Calls';
import { ChatsScreen } from './Chats';
import { ContactsScreen } from './Contacts';
import { JoinScreen } from './Join';
import { SettingsScreen } from './Settings';
import { StatusScreen } from './Status';

export function Shell() {
  const loc = useLocation();
  const unread = useChats((s) => s.conversations.reduce((n, c) => n + (c.mutedUntil && new Date(c.mutedUntil) > new Date() ? 0 : c.unreadCount), 0));
  const requests = useContacts((s) => s.incoming.length);
  const missed = useMissedCallCount();
  const unseen = useUnseenStatusCount();
  const inChat = /^\/chats\/[^/]+/.test(loc.pathname);

  useEffect(() => {
    document.body.classList.toggle('in-chat', inChat);
    return () => document.body.classList.remove('in-chat');
  }, [inChat]);

  useEffect(() => {
    document.title = unread ? `(${unread}) Adrian` : 'Adrian – Messenger';
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread) nav.setAppBadge?.(unread).catch(() => {}); else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  const item = (to: string, icon: string, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={label}>
      <Icon name={icon} size={24} />
      <span>{label}</span>
      {badge ? <span className="badge nav-badge" aria-label={`${badge} neu`}>{badge > 99 ? '99+' : badge}</span> : null}
    </NavLink>
  );
  return (
    <div className="app">
      <div className="app-body">
        <nav className="nav" aria-label="Hauptnavigation">
          <div className="brand"><img src="/icon.svg" alt="Adrian" /></div>
          {item('/chats', 'chat', 'Chats', unread)}
          {item('/calls', 'phone', 'Anrufe', missed)}
          {item('/status', 'status', 'Status', unseen)}
          {item('/contacts', 'users', 'Kontakte', requests)}
          <div className="spacer" />
          {item('/settings', 'user', 'Profil')}
        </nav>
        <div className="main">
          <Routes>
            <Route path="/chats" element={<ChatsScreen />} />
            <Route path="/chats/:id" element={<ChatsScreen />} />
            <Route path="/calls" element={<CallsScreen />} />
            <Route path="/status" element={<StatusScreen />} />
            <Route path="/status/:userId" element={<StatusScreen />} />
            <Route path="/contacts" element={<ContactsScreen />} />
            <Route path="/contacts/:userId" element={<ContactsScreen />} />
            <Route path="/settings/*" element={<SettingsScreen />} />
            <Route path="/join/:code" element={<JoinScreen />} />
            <Route path="*" element={<Navigate to="/chats" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
