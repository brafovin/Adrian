import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { AboutPane } from '../components/settings/AboutPane';
import { AccountPane } from '../components/settings/AccountPane';
import { AppearancePane } from '../components/settings/AppearancePane';
import { BackgroundsPane } from '../components/settings/BackgroundsPane';
import { NotificationsPane } from '../components/settings/NotificationsPane';
import { PrivacyPane } from '../components/settings/PrivacyPane';
import { ProfilePane } from '../components/settings/ProfilePane';
import { SessionsPane } from '../components/settings/SessionsPane';
import { PaneHeader } from '../components/ui';
import { useIsDesktop } from '../lib/hooks';
import { useSession } from '../store/session';
import './settings.css';

interface Section { path: string; label: string; icon: string; sub: string }
const MAIN: Section[] = [
  { path: 'profile', label: 'Profil', icon: 'user', sub: 'Name, Foto, Benutzername, Bio' },
  { path: 'privacy', label: 'Privatsphäre', icon: 'lock', sub: 'Wer was sieht, blockierte Nutzer' },
  { path: 'notifications', label: 'Benachrichtigungen', icon: 'bell', sub: 'Mitteilungen und Push' },
  { path: 'appearance', label: 'Darstellung', icon: 'palette', sub: 'Design, Akzentfarbe, Eingabe' },
  { path: 'backgrounds', label: 'Chat-Hintergründe', icon: 'image', sub: 'Standard und pro Chat' },
];
const MORE: Section[] = [
  { path: 'sessions', label: 'Geräte & Sitzungen', icon: 'device', sub: 'Angemeldete Geräte verwalten' },
  { path: 'account', label: 'Konto & Daten', icon: 'key', sub: 'Passwort, Export, Konto löschen' },
  { path: 'about', label: 'Info', icon: 'info', sub: 'Version und Datenschutz' },
];
const ALL = [...MAIN, ...MORE];

export function SettingsScreen() {
  const loc = useLocation();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const me = useSession((s) => s.me)!;
  const seg = loc.pathname.replace(/^\/settings\/?/, '').split('/')[0] ?? '';
  const known = ALL.some((s) => s.path === seg);
  const activePath = known ? seg : desktop ? 'profile' : null;
  const back = () => navigate('/settings');

  const row = (s: Section) => (
    <Link key={s.path} to={`/settings/${s.path}`} className={`settings-row set-menu-row ${activePath === s.path ? 'active' : ''}`} aria-current={activePath === s.path ? 'page' : undefined}>
      <span className="icon-wrap"><Icon name={s.icon} size={18} /></span>
      <span className="label">{s.label}<small>{s.sub}</small></span>
      <Icon name="forward" size={18} className="set-chev" />
    </Link>
  );

  return (
    <div className={`split settings-split ${known ? 'has-detail' : ''}`}>
      <div className="pane-list">
        <PaneHeader title="Einstellungen" />
        <nav className="pane-body set-menu" aria-label="Einstellungen">
          <Link to="/settings/profile" className="set-usercard" aria-label={`Dein Profil: ${me.displayName}`}>
            <Avatar name={me.displayName} src={me.avatarUrl} size={60} />
            <span className="grow"><b className="ellipsis" style={{ display: 'block' }}>{me.displayName}</b><span className="muted-text ellipsis" style={{ display: 'block' }}>@{me.username}</span></span>
          </Link>
          <div className="settings-group">{MAIN.map(row)}</div>
          <div className="settings-group">{MORE.map(row)}</div>
        </nav>
      </div>
      <div className="pane-detail">
        <Routes>
          <Route index element={desktop ? <ProfilePane onBack={back} /> : null} />
          <Route path="profile" element={<ProfilePane onBack={back} />} />
          <Route path="privacy" element={<PrivacyPane onBack={back} />} />
          <Route path="notifications" element={<NotificationsPane onBack={back} />} />
          <Route path="appearance" element={<AppearancePane onBack={back} />} />
          <Route path="backgrounds" element={<BackgroundsPane onBack={back} />} />
          <Route path="sessions" element={<SessionsPane onBack={back} />} />
          <Route path="account" element={<AccountPane onBack={back} />} />
          <Route path="about" element={<AboutPane onBack={back} />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </div>
  );
}
