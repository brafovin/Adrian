import { Icon } from '../Icon';
import { Group, PaneShell } from './parts';

/** Entspricht der Version in web/package.json. */
export const APP_VERSION = '0.1.0';

export function AboutPane({ onBack }: { onBack: () => void }) {
  return (
    <PaneShell title="Info" onBack={onBack}>
      <div className="set-about">
        <img src="/icon.svg" alt="" width={72} height={72} />
        <h2>Adrian Messenger</h2>
        <span className="muted-text">Version {APP_VERSION}</span>
      </div>

      <Group title="Sicherheit & Datenschutz">
        <div className="settings-row set-text">
          <span className="icon-wrap"><Icon name="lock" size={18} /></span>
          <div className="label">
            <span>Verschlüsselung</span>
            <small id="about-e2ee">Verbindungen sind per TLS verschlüsselt. Ende-zu-Ende-Verschlüsselung ist geplant (siehe docs/E2EE-PLAN.md) und noch nicht aktiv.</small>
          </div>
        </div>
        <div className="settings-row set-text">
          <span className="icon-wrap"><Icon name="shield" size={18} /></span>
          <div className="label">
            <span>Was gespeichert wird</span>
            <small>Nachrichten, Medien und Kontakte liegen auf dem Server, damit sie auf all deinen Geräten verfügbar sind. Hochgeladene Bilder werden neu kodiert, dabei werden Metadaten wie der Aufnahmeort entfernt.</small>
          </div>
        </div>
        <div className="settings-row set-text">
          <span className="icon-wrap"><Icon name="eye-off" size={18} /></span>
          <div className="label">
            <span>Deine Kontrolle</span>
            <small>Unter „Privatsphäre“ legst du fest, wer Profilbild, Online-Status und Status sieht. Chat-Hintergründe sind nur für dich sichtbar. Unter „Konto & Daten“ kannst du alle Daten exportieren oder dein Konto löschen.</small>
          </div>
        </div>
      </Group>
    </PaneShell>
  );
}
