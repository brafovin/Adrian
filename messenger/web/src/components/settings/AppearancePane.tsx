import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../store/session';
import { toastError } from '../../store/ui';
import type { Settings } from '../../types';
import { Icon } from '../Icon';
import { Group, PaneShell, SwitchRow } from './parts';

const THEMES: { value: Settings['theme']; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'device' },
  { value: 'light', label: 'Hell', icon: 'sun' },
  { value: 'dark', label: 'Dunkel', icon: 'moon' },
];
const ACCENTS: { value: string; label: string }[] = [
  { value: '#6d5efc', label: 'Violett' },
  { value: '#2f80ed', label: 'Blau' },
  { value: '#0ea5a4', label: 'Türkis' },
  { value: '#22a55a', label: 'Grün' },
  { value: '#e8960c', label: 'Bernstein' },
  { value: '#ef6a3d', label: 'Orange' },
  { value: '#e5484d', label: 'Rot' },
  { value: '#e0489a', label: 'Pink' },
];

export function AppearancePane({ onBack }: { onBack: () => void }) {
  const s = useSession((x) => x.me)!.settings;
  const [custom, setCustom] = useState(s.accent);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Änderungen von einem anderen Gerät übernehmen
  useEffect(() => setCustom(s.accent), [s.accent]);

  const save = (patch: Partial<Settings>) => useSession.getState().updateSettings(patch).catch(toastError);

  function pickCustom(v: string) {
    setCustom(v);
    document.documentElement.style.setProperty('--accent', v); // sofortige Vorschau
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ accent: v }), 350);
  }

  return (
    <PaneShell title="Darstellung" onBack={onBack}>
      <Group title="Design">
        <div className="settings-row set-stack">
          <div className="label"><span id="theme-label">Erscheinungsbild</span><small>„System“ folgt der Einstellung deines Geräts.</small></div>
          <div className="segmented set-theme" role="group" aria-labelledby="theme-label">
            {THEMES.map((t) => (
              <button key={t.value} aria-pressed={s.theme === t.value} onClick={() => void save({ theme: t.value })}>
                <Icon name={t.icon} size={16} />{t.label}
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group title="Akzentfarbe">
        <div className="settings-row set-stack">
          <div className="label"><span id="accent-label">Farbe für Schaltflächen und eigene Nachrichten</span></div>
          <div className="set-swatches" role="group" aria-labelledby="accent-label">
            {ACCENTS.map((a) => (
              <button key={a.value} className="set-swatch" style={{ background: a.value }} aria-label={a.label} aria-pressed={s.accent.toLowerCase() === a.value} title={a.label}
                onClick={() => { clearTimeout(timer.current); setCustom(a.value); void save({ accent: a.value }); }}>
                {s.accent.toLowerCase() === a.value && <Icon name="check" size={18} />}
              </button>
            ))}
            <label className={`set-swatch set-swatch-custom ${ACCENTS.some((a) => a.value === s.accent.toLowerCase()) ? '' : 'on'}`} title="Eigene Farbe wählen">
              <Icon name="palette" size={18} />
              <input type="color" value={custom} onChange={(e) => pickCustom(e.target.value)} aria-label="Eigene Akzentfarbe" />
            </label>
          </div>
        </div>
        <div className="set-preview" aria-hidden="true">
          <div className="msg-row in first"><div className="bubble"><div className="text">So sehen Nachrichten aus.</div></div></div>
          <div className="msg-row out first"><div className="bubble"><div className="text">Und das ist deine Farbe.</div></div></div>
        </div>
      </Group>

      <Group title="Eingabe">
        <SwitchRow icon="send" title="Enter sendet" sub={s.enterToSend ? 'Enter sendet die Nachricht, Umschalt+Enter beginnt eine neue Zeile.' : 'Enter beginnt eine neue Zeile – gesendet wird mit dem Senden-Knopf.'}
          checked={s.enterToSend} onChange={(v) => void save({ enterToSend: v })} />
      </Group>
    </PaneShell>
  );
}
