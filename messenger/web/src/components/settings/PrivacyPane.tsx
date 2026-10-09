import { useEffect, useState } from 'react';
import { patch } from '../../api';
import { useContacts } from '../../store/contacts';
import { useSession } from '../../store/session';
import { toastError } from '../../store/ui';
import type { Privacy, Vis3 } from '../../types';
import { Avatar } from '../Avatar';
import { Group, PaneShell, SelectRow, SwitchRow } from './parts';

const VIS3: { value: Vis3; label: string }[] = [
  { value: 'everyone', label: 'Alle' },
  { value: 'contacts', label: 'Meine Kontakte' },
  { value: 'nobody', label: 'Niemand' },
];

export function PrivacyPane({ onBack }: { onBack: () => void }) {
  const me = useSession((s) => s.me)!;
  const p = me.privacy;
  const blocked = useContacts((s) => s.blocked);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    useContacts.getState().loadBlocked().catch(toastError).finally(() => setBlockedLoaded(true));
  }, []);

  /** Optimistisch ändern, bei Fehler zurücksetzen. */
  async function update(change: Partial<Privacy>) {
    const { setMe } = useSession.getState();
    const before = useSession.getState().me!;
    setMe({ ...before, privacy: { ...before.privacy, ...change } });
    try {
      const { privacy } = await patch<{ privacy: Privacy }>('/api/me/privacy', change);
      const now = useSession.getState().me;
      if (now) setMe({ ...now, privacy });
    } catch (e) {
      const now = useSession.getState().me;
      if (now) setMe({ ...now, privacy: { ...now.privacy, ...Object.fromEntries(Object.keys(change).map((k) => [k, before.privacy[k as keyof Privacy]])) } });
      toastError(e);
    }
  }

  async function unblock(id: string) {
    setBusyId(id);
    try { await useContacts.getState().unblock(id); } catch (e) { toastError(e); } finally { setBusyId(null); }
  }

  return (
    <PaneShell title="Privatsphäre" onBack={onBack}>
      <Group title="Profil" note="„Meine Kontakte“ sind Personen, mit denen du verbunden bist.">
        <SelectRow title="Profilbild" sub="Wer dein Profilbild sehen darf." value={p.avatarVis} options={VIS3} onChange={(v) => void update({ avatarVis: v })} />
        <SelectRow title="Info (Bio)" sub="Wer deinen Info-Text sehen darf." value={p.bioVis} options={VIS3} onChange={(v) => void update({ bioVis: v })} />
        <SelectRow title="Gemeinsame Gruppen" sub="Wer sehen darf, in welchen Gruppen ihr beide Mitglied seid." value={p.groupsVis} options={VIS3} onChange={(v) => void update({ groupsVis: v })} />
      </Group>

      <Group title="Aktivität">
        <SelectRow title="Online-Status" sub="Wer sehen darf, wenn du gerade online bist." value={p.onlineVis} options={VIS3} onChange={(v) => void update({ onlineVis: v })} />
        <SelectRow title="Zuletzt online" sub="Wer sehen darf, wann du zuletzt aktiv warst." value={p.lastSeenVis} options={VIS3} onChange={(v) => void update({ lastSeenVis: v })} />
        <SelectRow title="Status" sub="Wer deine Status-Beiträge sehen darf. Einzelne Beiträge kannst du beim Erstellen weiter einschränken."
          value={p.statusVis} options={[{ value: 'contacts', label: 'Meine Kontakte' }, { value: 'nobody', label: 'Niemand' }]} onChange={(v) => void update({ statusVis: v })} />
      </Group>

      <Group title="Kontakt aufnehmen">
        <SelectRow title="Kontaktanfragen" sub="Wer dir eine Kontaktanfrage senden darf." value={p.contactRequests}
          options={[{ value: 'everyone', label: 'Alle' }, { value: 'nobody', label: 'Niemand' }]} onChange={(v) => void update({ contactRequests: v })} />
        <SelectRow title="Nachrichten von Fremden" sub="Wer dir direkt schreiben darf, auch wenn ihr noch keine Kontakte seid." value={p.dmFrom}
          options={[{ value: 'everyone', label: 'Alle' }, { value: 'contacts', label: 'Nur Kontakte' }]} onChange={(v) => void update({ dmFrom: v })} />
        <SelectRow title="Anrufe" sub="Wer dich anrufen darf." value={p.callsFrom} options={VIS3} onChange={(v) => void update({ callsFrom: v })} />
        <SelectRow title="Gruppeneinladungen" sub="Wer dich zu Gruppen hinzufügen darf." value={p.groupAddFrom}
          options={[{ value: 'everyone', label: 'Alle' }, { value: 'contacts', label: 'Nur Kontakte' }]} onChange={(v) => void update({ groupAddFrom: v })} />
        <SwitchRow title="Auffindbar" sub="Andere können dich über die Suche nach Benutzernamen finden. Bestehende Kontakte sehen dich weiterhin."
          checked={p.discoverable} onChange={(v) => void update({ discoverable: v })} />
      </Group>

      <Group title="Lesebestätigungen">
        <SwitchRow title="Lesebestätigungen senden" sub="Andere sehen, wann du ihre Nachrichten gelesen hast, und wer ihren Status angesehen hat. Ist die Option aus, siehst du auch selbst nicht, wer deine Status-Beiträge angesehen hat."
          checked={p.readReceipts} onChange={(v) => void update({ readReceipts: v })} />
      </Group>

      <Group title="Blockierte Nutzer" note="Blockierte Nutzer können dir nicht schreiben, dich nicht anrufen und dein Profil nicht sehen.">
        {!blockedLoaded && blocked.length === 0 && <div className="settings-row muted-text">Lädt…</div>}
        {blockedLoaded && blocked.length === 0 && <div className="settings-row muted-text">Du hast niemanden blockiert.</div>}
        {blocked.map((u) => (
          <div className="settings-row" key={u.id}>
            <Avatar name={u.displayName} src={u.avatarUrl} size={40} />
            <div className="label"><span className="ellipsis" style={{ display: 'block' }}>{u.displayName}</span><small>@{u.username}</small></div>
            <button className="btn btn-secondary btn-sm" onClick={() => void unblock(u.id)} disabled={busyId === u.id} aria-label={`${u.displayName} entblocken`}>Entblocken</button>
          </div>
        ))}
      </Group>
    </PaneShell>
  );
}
