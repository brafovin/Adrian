import { APP } from '../config.js';
import { downloadJson, h } from '../core/util.js';
import { userData } from '../core/userdata.js';
import { auth, AuthError } from '../services/auth.js';
import { catalog } from '../data/catalog.js';
import { library } from '../services/library.js';
import { settings } from '../services/settings.js';
import { pageHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, openSheet, promptDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

function group(title, ...rows) {
  return h('section', { class: 'settings-group' }, h('h2', null, title), h('div', { class: 'settings-card' }, rows));
}

function row({ iconName, label, sub, control, onClick, danger = false }) {
  const tag = onClick ? 'button' : 'div';
  const el = h(tag, { class: `s-row${danger ? ' danger' : ''}${onClick ? ' clickable' : ''}`, type: onClick ? 'button' : null, onclick: onClick },
    iconName && h('span', { class: 's-icon' }, icon(iconName, 22)),
    h('span', { class: 's-text' }, h('span', { class: 's-label' }, label), sub && h('span', { class: 's-sub' }, sub)),
    control);
  return el;
}

function toggle(key, label, sub, iconName) {
  const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(!!settings.get(key)) }, h('span'));
  const paint = () => {
    sw.setAttribute('aria-checked', String(!!settings.get(key)));
  };
  sw.addEventListener('click', () => {
    settings.set({ [key]: !settings.get(key) });
    paint();
  });
  return row({ iconName, label, sub, control: sw });
}

function segmented(key, label, options, sub, iconName) {
  const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const paint = () => seg.replaceChildren(...options.map(([value, text]) =>
    h('button', { class: `seg${settings.get(key) === value ? ' active' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(settings.get(key) === value), onclick: () => { settings.set({ [key]: value }); paint(); } }, text)));
  paint();
  return h('div', { class: 's-row s-row-stack' },
    h('div', { class: 's-row-top' }, iconName && h('span', { class: 's-icon' }, icon(iconName, 22)), h('span', { class: 's-text' }, h('span', { class: 's-label' }, label), sub && h('span', { class: 's-sub' }, sub))),
    seg);
}

export async function settingsView(ctx) {
  const user = auth.user;
  const guest = !user || user.guest;

  const accountCard = h('div', { class: 'account-card' },
    h('div', { class: 'avatar' }, guest ? icon('person', 30) : (user.username[0] || '?').toUpperCase()),
    h('div', { class: 'account-text' },
      h('strong', null, guest ? 'Gast' : user.username),
      h('span', null, guest ? 'Daten werden nur auf diesem Gerät gespeichert.' : user.email)));

  const accountRows = guest
    ? [row({ iconName: 'person', label: 'Anmelden oder registrieren', sub: 'Playlists & Favoriten deinem Konto zuordnen', onClick: () => auth.logout() })]
    : [
      row({
        iconName: 'edit', label: 'Benutzernamen ändern', sub: user.username,
        onClick: async () => {
          const v = await promptDialog({ title: 'Benutzernamen ändern', fields: [{ name: 'username', label: 'Neuer Benutzername', value: user.username, required: true, maxlength: 24 }] });
          if (!v) return;
          try {
            await auth.updateUsername(v.username);
            toast('Benutzername geändert', { iconName: 'check' });
            ctx.refresh();
          } catch (err) {
            toast(err instanceof AuthError ? err.message : 'Das hat nicht geklappt.', { type: 'error' });
          }
        },
      }),
      row({
        iconName: 'delete', label: 'Konto löschen', sub: 'Entfernt Konto, Playlists und Favoriten', danger: true,
        onClick: async () => {
          const v = await promptDialog({
            title: 'Konto löschen',
            confirmLabel: 'Endgültig löschen',
            note: 'Alle Daten dieses Kontos werden unwiderruflich gelöscht.',
            fields: [{ name: 'password', label: 'Passwort zur Bestätigung', type: 'password', required: true }],
          });
          if (!v) return;
          try {
            await auth.deleteAccount(v.password);
          } catch (err) {
            toast(err instanceof AuthError ? err.message : 'Das hat nicht geklappt.', { type: 'error' });
          }
        },
      }),
    ];

  const privacy = group('Datenschutz',
    row({ iconName: 'shield', label: 'So gehen wir mit deinen Daten um', sub: 'Alles bleibt lokal auf deinem Gerät. Es gibt keine Konten- oder Hörverlaufs-Übertragung an einen Server und kein Tracking.' }),
    row({
      iconName: 'export', label: 'Meine Daten exportieren', sub: 'Favoriten, Playlists, Verlauf und Einstellungen als JSON',
      onClick: () => downloadJson(`rouge-daten-${new Date().toISOString().slice(0, 10)}.json`, { exportedAt: new Date().toISOString(), user: { username: user?.username, email: user?.email }, data: userData.dump() }),
    }),
    row({ iconName: 'clock', label: 'Hörverlauf löschen', onClick: () => { library.clearHistory(); toast('Verlauf gelöscht', { iconName: 'check' }); } }),
    row({
      iconName: 'delete', label: 'Alle Daten dieses Profils löschen', sub: 'Favoriten, Playlists, Verlauf, Einstellungen', danger: true,
      onClick: async () => {
        if (!(await confirmDialog({ title: 'Alle Daten löschen?', message: 'Favoriten, Playlists, Verlauf und Einstellungen werden zurückgesetzt. Das Konto bleibt bestehen.', confirmLabel: 'Löschen', danger: true }))) return;
        userData.wipe();
        location.reload();
      },
    }));

  const about = group('Über die App',
    row({ iconName: 'info', label: APP.name, sub: `Version ${APP.version} · ${APP.tagline}` }),
    row({ iconName: 'note', label: catalog.info.previews ? 'Hörproben & Cover' : 'Demo-Inhalte', sub: catalog.info.previews ? catalog.info.notice : 'Alle Songs, Cover und Bilder sind selbst erzeugte Platzhalter (CC0). Echte, lizenzierte Musik wird später über den Katalog angebunden.' }),
    row({
      iconName: 'info', label: 'Technik & Lizenzen', sub: 'Offene Webtechnik, keine Fremdbibliotheken',
      onClick: () => openSheet({
        title: 'Technik & Lizenzen',
        content: h('div', { class: 'about-sheet' },
          h('p', null, 'ROUGE ist eine installierbare Web-App (PWA) in reinem HTML, CSS und JavaScript – ohne externe Bibliotheken.'),
          h('p', null, 'Speicherung: IndexedDB. Wiedergabe: HTML5-Audio mit Media-Session-Steuerung (Sperrbildschirm).'),
          h('p', null, catalog.info.previews ? 'Metadaten, Cover und 30-Sekunden-Hörproben werden zur Laufzeit von der iTunes Search API (Apple) geladen und nicht in der App gespeichert.' : 'Demo-Audio und -Grafiken werden mit dem Skript tools/build_demo_assets.py erzeugt und stehen unter CC0.')),
      }),
    }));

  const installRow = installPrompt && row({
    iconName: 'download', label: 'App installieren', sub: 'Zum Startbildschirm hinzufügen',
    onClick: async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      ctx.refresh();
    },
  });

  return h('div', { class: 'view-settings' },
    pageHeader('Einstellungen', { back: true }),
    h('section', { class: 'settings-group' }, h('h2', null, 'Konto'), accountCard, h('div', { class: 'settings-card' }, accountRows)),
    group('Wiedergabe',
      toggle('autoplay', 'Autoplay', 'Ähnliche Songs weiterspielen, wenn die Warteschlange endet', 'play'),
      toggle('shuffle', 'Zufällige Wiedergabe', 'Neue Listen gemischt abspielen', 'shuffle'),
      segmented('repeat', 'Wiederholen', [['off', 'Aus'], ['all', 'Alle'], ['one', 'Song']], null, 'repeat')),
    group('Audioqualität',
      segmented('quality', 'Streaming-Qualität', [['auto', 'Automatisch'], ['low', 'Niedrig'], ['high', 'Hoch']], catalog.info.previews ? 'Hörproben liegen von Apple in fester Qualität vor (AAC); die Einstellung gilt für eigene Demo-Songs.' : 'Automatisch spart Daten bei langsamer Verbindung. Gilt ab dem nächsten Song.', 'tune')),
    group('Benachrichtigungen',
      toggle('toasts', 'Hinweise in der App', 'Kurze Einblendungen, z. B. „Favorisiert“', 'bell'),
      toggle('lockscreen', 'Sperrbildschirm-Steuerung', 'Titel, Cover und Tasten im Sperrbildschirm und in der Benachrichtigungsleiste', 'lock'),
      toggle('notifyReleases', 'Neue Veröffentlichungen', 'Vorbereitet für spätere Push-Mitteilungen', 'bell')),
    privacy,
    h('section', { class: 'settings-group' }, installRow && h('div', { class: 'settings-card' }, installRow)),
    about,
    h('div', { class: 'logout-wrap' },
      h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: () => auth.logout() }, icon('logout', 20), ' Abmelden')));
}
