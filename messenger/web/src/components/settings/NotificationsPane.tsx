import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { useSession } from '../../store/session';
import { toast, toastError } from '../../store/ui';
import type { Settings } from '../../types';
import { Icon } from '../Icon';
import { Group, PaneShell, SwitchRow } from './parts';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const PUSH_INFO: Record<PushState, string> = {
  unsupported: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.',
  denied: 'Benachrichtigungen sind für diese Seite im Browser blockiert. Erlaube sie in den Website-Einstellungen deines Browsers und lade die Seite neu.',
  disabled: 'Auf diesem Gerät sind Push-Benachrichtigungen aus. Aktiviere sie, um auch bei geschlossener App benachrichtigt zu werden.',
  enabled: 'Dieses Gerät erhält Push-Benachrichtigungen, auch wenn die App geschlossen ist.',
  'server-off': 'Push ist auf diesem Server nicht eingerichtet. Du siehst Benachrichtigungen nur, solange die App geöffnet ist.',
};

export function NotificationsPane({ onBack }: { onBack: () => void }) {
  const n = useSession((s) => s.me)!.settings.notify;
  const [push, setPush] = useState<PushState | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const iosNeedsInstall = isIos() && !isStandalone();

  useEffect(() => {
    let dead = false;
    pushState().then((s) => !dead && setPush(s)).catch(() => { if (!dead) { setPush('unsupported'); setPushError('Der Push-Status konnte nicht ermittelt werden.'); } });
    return () => { dead = true; };
  }, []);

  const set = (key: keyof Settings['notify']) => (v: boolean) => {
    useSession.getState().updateSettings({ notify: { [key]: v } }).catch(toastError);
  };

  async function togglePush() {
    setBusy(true);
    setPushError(null);
    try {
      if (push === 'enabled') {
        await disablePush();
        setPush(await pushState());
        toast('Push auf diesem Gerät deaktiviert');
      } else {
        const s = await enablePush();
        setPush(s);
        if (s === 'enabled') toast('Push auf diesem Gerät aktiviert', 'success');
      }
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Push konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  }

  const canToggle = push === 'enabled' || push === 'disabled';

  return (
    <PaneShell title="Benachrichtigungen" onBack={onBack}>
      <Group title="Benachrichtigen bei" note="Gilt für alle deine Geräte. Stummgeschaltete Chats lösen keine Benachrichtigung aus.">
        <SwitchRow icon="chat" title="Nachrichten" sub="Neue Nachrichten in deinen Chats" checked={n.messages} onChange={set('messages')} />
        <SwitchRow icon="user-plus" title="Kontaktanfragen" sub="Wenn dir jemand eine Kontaktanfrage sendet" checked={n.requests} onChange={set('requests')} />
        <SwitchRow icon="phone" title="Anrufe" sub="Eingehende Sprach- und Videoanrufe" checked={n.calls} onChange={set('calls')} />
        <SwitchRow icon="users" title="Gruppen" sub="Aktivität in deinen Gruppen" checked={n.groups} onChange={set('groups')} />
        <SwitchRow icon="status" title="Status" sub="Neue Status-Beiträge deiner Kontakte" checked={n.status} onChange={set('status')} />
      </Group>

      <Group title="Datenschutz" >
        <SwitchRow icon="eye-off" title="Inhalte auf dem Sperrbildschirm ausblenden" sub="Benachrichtigungen zeigen nur „Neue Nachricht“ statt des Nachrichtentexts."
          checked={n.hidePreviews} onChange={set('hidePreviews')} />
      </Group>

      <Group title="Push auf diesem Gerät">
        <div className="settings-row set-push">
          <span className="icon-wrap"><Icon name="bell" size={18} /></span>
          <div className="label">
            <span>Push-Benachrichtigungen</span>
            <small id="push-info" data-state={push ?? 'loading'}>{push ? PUSH_INFO[push] : 'Status wird geprüft…'}</small>
          </div>
          {canToggle && (
            <button className={`btn btn-sm ${push === 'enabled' ? 'btn-secondary' : 'btn-primary'}`} onClick={() => void togglePush()} disabled={busy} aria-describedby="push-info">
              {push === 'enabled' ? 'Deaktivieren' : 'Aktivieren'}
            </button>
          )}
        </div>
        {pushError && <div className="form-error set-inline-error" role="alert">{pushError}</div>}
        {iosNeedsInstall && (
          <div className="settings-row set-hint">
            <span className="icon-wrap"><Icon name="info" size={18} /></span>
            <div className="label"><small>Auf iPhone und iPad funktionieren Push-Benachrichtigungen nur, wenn du die App installiert hast: Tippe in Safari auf „Teilen“ und wähle „Zum Home-Bildschirm“. Öffne sie danach von dort.</small></div>
          </div>
        )}
      </Group>
    </PaneShell>
  );
}
