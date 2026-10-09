import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onUnauthorized } from './api';
import { CallOverlay } from './components/CallOverlay';
import { ConfirmHost, SheetHost, ToastHost } from './components/Hosts';
import { Spinner } from './components/ui';
import { AuthRoutes } from './screens/Auth';
import { Shell } from './screens/Shell';
import { startRealtime } from './store/events';
import { useSession } from './store/session';

export function App() {
  const status = useSession((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  // navigate ändert sich bei jedem Seitenwechsel – über Ref nutzen, damit die WebSocket-Verbindung nicht neu startet
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    void useSession.getState().init();
    const off = onUnauthorized(() => useSession.getState().reset());
    return () => { off(); };
  }, []);

  useEffect(() => {
    if (status !== 'authed') return;
    return startRealtime((to) => navRef.current(to));
  }, [status]);

  // Systemtheme live übernehmen
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => useSession.getState().setMe && useSession.getState().me && useSession.getState().setMe(useSession.getState().me!);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  let body;
  if (status === 'loading') {
    body = <div className="auth-wrap"><Spinner size={36} /></div>;
  } else if (status === 'anon') {
    if (!/^\/(login|register|forgot|reset-password|verify-email)/.test(location.pathname)) {
      // Ziel merken (z. B. Einladungslink), nach dem Login dorthin zurück
      if (location.pathname !== '/' && !location.pathname.startsWith('/chats')) sessionStorage.setItem('adrian:redirect', location.pathname + location.search);
      body = <Navigate to="/login" replace />;
    } else body = <AuthRoutes />;
  } else {
    body = (
      <Routes>
        <Route path="/login" element={<Navigate to={sessionStorage.getItem('adrian:redirect') ?? '/chats'} replace />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
    );
  }
  return (
    <>
      {body}
      <ToastHost />
      <ConfirmHost />
      <SheetHost />
      {status === 'authed' && <CallOverlay />}
    </>
  );
}
