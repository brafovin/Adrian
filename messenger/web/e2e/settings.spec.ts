import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { connect, signUp, type User } from './helpers';

const SHOT = (name: string) => `e2e/shots/settings-${name}.png`;

/** Buntes Testbild (Verlauf + Formen), damit Verschieben/Zoomen sichtbar ist. */
async function testImage(w = 1200, h = 1800): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".5" stop-color="#feca57"/><stop offset="1" stop-color="#48dbfb"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.25}" cy="${h * 0.2}" r="${w * 0.18}" fill="#5f27cd"/>
    <circle cx="${w * 0.75}" cy="${h * 0.55}" r="${w * 0.22}" fill="#10ac84"/>
    <rect x="${w * 0.1}" y="${h * 0.75}" width="${w * 0.8}" height="${h * 0.08}" fill="#222f3e"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const png = (buffer: Buffer, name = 'foto.png') => ({ name, mimeType: 'image/png', buffer });

async function me(page: Page) {
  return (await (await page.request.get('/api/me')).json()).user;
}

/** Zweites Gerät: neuer Browserkontext, Anmeldung über die Oberfläche. */
async function secondDevice(browser: Browser, u: User): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('E-Mail oder @Benutzername').fill(u.email);
  await page.getByLabel('Passwort', { exact: true }).fill(u.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  return page;
}

async function openChatWith(page: Page, name: string) {
  await page.goto('/chats');
  const row = page.locator('.chat-row', { hasText: name }).first();
  await row.click();
  await expect(page.getByRole('region', { name: `Chat mit ${name}` })).toBeVisible();
}

async function startChat(a: User, otherName: string) {
  await a.page.getByRole('button', { name: 'Neuer Chat' }).click();
  await a.page.getByRole('button', { name: new RegExp(otherName) }).first().click();
  await expect(a.page.getByRole('region', { name: `Chat mit ${otherName}` })).toBeVisible();
}

test.describe('Einstellungen', () => {
  test('Profil: Name, Bio, Benutzername, Avatar', async ({ browser }) => {
    const u = await signUp(browser, 'Paula');
    const other = await signUp(browser, 'Quirin');
    const otherUsername = (await me(other.page)).username;
    const { page } = u;

    await page.goto('/settings');
    // Desktop: Menü links, Profil rechts
    await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
    await page.screenshot({ path: SHOT('desktop-profile') });

    await page.getByLabel('Anzeigename').fill('Paula Neu');
    await page.getByLabel('Bio').fill('Ich teste die Einstellungen.');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('Profil gespeichert').first()).toBeVisible();
    let user = await me(page);
    expect(user.displayName).toBe('Paula Neu');
    expect(user.bio).toBe('Ich teste die Einstellungen.');

    // Benutzername-Konflikt
    await page.getByLabel('Benutzername').fill(otherUsername);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('Dieser Benutzername ist bereits vergeben.')).toBeVisible();
    // ungültiger Name wird clientseitig abgefangen
    await page.getByLabel('Benutzername').fill('a!');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('3–30 Zeichen')).toBeVisible();
    // gültiger neuer Name
    const fresh = `paula_${Date.now().toString(36)}`;
    await page.getByLabel('Benutzername').fill(fresh);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect.poll(async () => (await me(page)).username).toBe(fresh);

    // Avatar: falsches Format wird verständlich abgelehnt, PNG hochgeladen
    const fileInput = page.getByLabel('Profilbild auswählen');
    await fileInput.setInputFiles({ name: 'foto.heic', mimeType: 'image/heic', buffer: Buffer.from('nope') });
    await expect(page.getByRole('alert').filter({ hasText: 'HEIC' })).toBeVisible();
    await fileInput.setInputFiles(png(await testImage(900, 700), 'avatar.png'));
    await expect.poll(async () => (await me(page)).avatarUrl).toMatch(/^\/api\/media\//);
    await expect(page.locator('.set-avatar img.avatar-img')).toBeVisible();
    const av = await page.request.get((await me(page)).avatarUrl);
    expect(av.ok()).toBeTruthy();
    const meta = await sharp(await av.body()).metadata();
    expect(meta.width).toBe(meta.height); // quadratisch zugeschnitten
    await page.screenshot({ path: SHOT('desktop-profile-avatar') });

    // Avatar entfernen
    await page.getByRole('button', { name: 'Foto entfernen' }).click();
    await page.getByRole('dialog', { name: 'Profilbild entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
    await expect.poll(async () => (await me(page)).avatarUrl).toBeNull();

    // E-Mail nur Anzeige + Status
    await expect(page.getByText('Bestätigt').first()).toBeVisible();
  });

  test('Privatsphäre: Schalter wirken auf dem Server; Entblocken', async ({ browser }) => {
    const u = await signUp(browser, 'Rita');
    const v = await signUp(browser, 'Sven');
    await connect(u, v);
    const { page } = u;

    await page.goto('/settings');
    await page.locator('.pane-list').getByRole('link', { name: /Privatsphäre/ }).click();
    await expect(page).toHaveURL(/\/settings\/privacy$/);

    await page.getByLabel('Profilbild', { exact: true }).selectOption({ label: 'Niemand' });
    await expect.poll(async () => (await me(page)).privacy.avatarVis).toBe('nobody');
    await page.getByLabel('Zuletzt online', { exact: true }).selectOption({ label: 'Meine Kontakte' });
    await expect.poll(async () => (await me(page)).privacy.lastSeenVis).toBe('contacts');
    await page.locator('.set-pane').getByLabel('Status', { exact: true }).selectOption({ label: 'Niemand' });
    await expect.poll(async () => (await me(page)).privacy.statusVis).toBe('nobody');
    await page.getByLabel('Nachrichten von Fremden').selectOption({ label: 'Nur Kontakte' });
    await expect.poll(async () => (await me(page)).privacy.dmFrom).toBe('contacts');
    await page.locator('.set-pane').getByLabel('Anrufe', { exact: true }).selectOption({ label: 'Niemand' });
    await expect.poll(async () => (await me(page)).privacy.callsFrom).toBe('nobody');

    const discover = page.getByRole('switch', { name: 'Auffindbar' });
    await expect(discover).toBeChecked();
    await discover.uncheck();
    await expect.poll(async () => (await me(page)).privacy.discoverable).toBe(false);
    const receipts = page.getByRole('switch', { name: 'Lesebestätigungen senden' });
    await receipts.uncheck();
    await expect.poll(async () => (await me(page)).privacy.readReceipts).toBe(false);
    await expect(page.getByText('siehst du auch selbst nicht, wer deine Status-Beiträge angesehen hat')).toBeVisible();

    // Persistenz nach Neuladen
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Lesebestätigungen senden' })).not.toBeChecked();
    await expect(page.getByLabel('Profilbild', { exact: true })).toHaveValue('nobody');
    await page.screenshot({ path: SHOT('desktop-privacy'), fullPage: false });

    // Blockieren per API → Liste → Entblocken
    const origin = new URL(page.url()).origin;
    const bl = await page.request.post('/api/blocks', { data: { userId: v.id }, headers: { origin } });
    expect(bl.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByText('@' + (await me(v.page)).username)).toBeVisible();
    await page.getByRole('button', { name: 'Sven entblocken' }).click();
    await expect(page.getByText('Du hast niemanden blockiert.')).toBeVisible();
    expect((await (await page.request.get('/api/blocks')).json()).blocked).toEqual([]);
  });

  test('Benachrichtigungen und Push-Hinweis', async ({ browser }) => {
    const u = await signUp(browser, 'Tina');
    const { page } = u;
    await page.goto('/settings/notifications');
    const calls = page.getByRole('switch', { name: 'Anrufe' });
    await expect(calls).toBeChecked();
    await calls.uncheck();
    await expect.poll(async () => (await me(page)).settings.notify.calls).toBe(false);
    await page.getByRole('switch', { name: 'Status' }).check();
    await expect.poll(async () => (await me(page)).settings.notify.status).toBe(true);
    await page.getByRole('switch', { name: /Sperrbildschirm/ }).check();
    await expect.poll(async () => (await me(page)).settings.notify.hidePreviews).toBe(true);
    // Test-Server hat kein VAPID-Schlüsselpaar → ehrlicher Hinweis, kein toter Knopf
    await expect(page.locator('#push-info')).toHaveAttribute('data-state', 'server-off');
    await expect(page.locator('#push-info')).toContainText('nicht eingerichtet');
    await expect(page.getByRole('button', { name: 'Aktivieren' })).toHaveCount(0);
    await page.screenshot({ path: SHOT('desktop-notifications') });
  });

  test('Darstellung: Theme, Akzentfarbe, Enter sendet', async ({ browser }) => {
    const u = await signUp(browser, 'Uwe');
    const { page } = u;
    await page.goto('/settings/appearance');
    await page.getByRole('button', { name: 'Dunkel' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => (await me(page)).settings.theme).toBe('dark');
    await page.getByRole('button', { name: 'Hell' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Orange' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#ef6a3d');
    await expect.poll(async () => (await me(page)).settings.accent).toBe('#ef6a3d');

    await page.getByLabel('Eigene Akzentfarbe').fill('#12ab34');
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#12ab34');
    await expect.poll(async () => (await me(page)).settings.accent).toBe('#12ab34');

    const enter = page.getByRole('switch', { name: 'Enter sendet' });
    await expect(enter).toBeChecked();
    await enter.uncheck();
    await expect.poll(async () => (await me(page)).settings.enterToSend).toBe(false);

    // bleibt nach Neuladen erhalten
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#12ab34');
    await page.getByRole('button', { name: 'Dunkel' }).click();
    await page.screenshot({ path: SHOT('desktop-appearance-dark') });
  });

  test('Passwort ändern meldet andere Geräte ab; Sitzungen verwalten', async ({ browser }) => {
    const u = await signUp(browser, 'Vera');
    const dev2 = await secondDevice(browser, u);
    const { page } = u;

    await page.goto('/settings/sessions');
    await expect(page.locator('.set-pill', { hasText: 'Dieses Gerät' })).toBeVisible();
    await expect(page.locator('.settings-row[data-current]')).toHaveCount(1);
    await expect.poll(async () => (await (await page.request.get('/api/me/sessions')).json()).sessions.length).toBe(2);
    await page.reload();
    await expect(page.locator('[data-session]:not([data-current]) button')).toBeVisible();
    await page.screenshot({ path: SHOT('desktop-sessions') });

    await page.goto('/settings/account');
    await page.getByLabel('Aktuelles Passwort').fill('falsch-falsch-falsch');
    await page.getByLabel('Neues Passwort', { exact: true }).fill('ein-ganz-neues-passwort-42');
    await page.getByLabel('Neues Passwort wiederholen').fill('ein-ganz-neues-passwort-42');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Das aktuelle Passwort ist falsch.' })).toBeVisible();

    await page.getByLabel('Aktuelles Passwort').fill(u.password);
    await page.getByLabel('Neues Passwort wiederholen').fill('ganz-anderes-passwort-77');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    await expect(page.getByText('stimmen nicht überein')).toBeVisible();

    await page.getByLabel('Neues Passwort wiederholen').fill('ein-ganz-neues-passwort-42');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    await expect(page.getByText('Passwort geändert. Alle anderen Geräte wurden abgemeldet.')).toBeVisible();

    // zweites Gerät wird abgemeldet
    await expect(dev2).toHaveURL(/\/login/, { timeout: 20_000 });
    // dieses Gerät bleibt angemeldet
    expect((await page.request.get('/api/me')).ok()).toBeTruthy();
    // Anmeldung mit neuem Passwort funktioniert
    const dev3 = await browser.newContext();
    const p3 = await dev3.newPage();
    await p3.goto('/login');
    await p3.getByLabel('E-Mail oder @Benutzername').fill(u.email);
    await p3.getByLabel('Passwort', { exact: true }).fill('ein-ganz-neues-passwort-42');
    await p3.getByRole('button', { name: 'Anmelden' }).click();
    await expect(p3.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();

    // einzelnes Gerät beenden
    await page.goto('/settings/sessions');
    await expect(page.locator('[data-session]')).toHaveCount(2);
    await page.locator('[data-session]:not([data-current]) button').click();
    await page.getByRole('dialog', { name: 'Gerät abmelden?' }).getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.locator('[data-session]')).toHaveCount(1);
    await expect(p3).toHaveURL(/\/login/, { timeout: 20_000 });

    // überall abmelden
    await page.getByRole('button', { name: /Überall abmelden/ }).click();
    await page.getByRole('dialog', { name: 'Überall abmelden?' }).getByRole('button', { name: 'Überall abmelden' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Datenexport und Konto löschen', async ({ browser }) => {
    const u = await signUp(browser, 'Walter');
    const { page } = u;
    await page.goto('/settings/account');

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Datenexport herunterladen/ }).click()]);
    expect(dl.suggestedFilename()).toBe('adrian-datenexport.json');
    const data = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(data.account.id).toBe(u.id);
    expect(data.exportedAt).toBeTruthy();
    await page.screenshot({ path: SHOT('desktop-account') });

    // Konto löschen: falsches Passwort → bleibt bestehen
    await page.getByRole('button', { name: 'Konto löschen…' }).click();
    const dlg = page.getByRole('dialog', { name: 'Konto endgültig löschen?' });
    await expect(dlg).toContainText('unwiderruflich');
    await dlg.getByLabel('Passwort').fill('falsches-passwort-123');
    await dlg.getByRole('button', { name: 'Konto endgültig löschen' }).click();
    await expect(page.getByText('Das Passwort ist falsch. Das Konto wurde nicht gelöscht.')).toBeVisible();
    expect((await page.request.get('/api/me')).ok()).toBeTruthy();

    // richtiges Passwort
    await page.getByRole('button', { name: 'Konto löschen…' }).click();
    const dlg2 = page.getByRole('dialog', { name: 'Konto endgültig löschen?' });
    await dlg2.getByLabel('Passwort').fill(u.password);
    await dlg2.getByRole('button', { name: 'Konto endgültig löschen' }).click();
    await expect(page).toHaveURL(/\/login/);
    const origin = new URL(page.url()).origin;
    const again = await page.request.post('/api/auth/login', { data: { identifier: u.email, password: u.password }, headers: { origin } });
    expect(again.status()).toBe(401);
  });

  test('Info-Seite ist ehrlich zur Verschlüsselung', async ({ browser }) => {
    const u = await signUp(browser, 'Xaver');
    await u.page.goto('/settings/about');
    await expect(u.page.getByText('Verbindungen sind per TLS verschlüsselt. Ende-zu-Ende-Verschlüsselung ist geplant (siehe docs/E2EE-PLAN.md) und noch nicht aktiv.')).toBeVisible();
    await expect(u.page.getByText(/Version \d+\.\d+\.\d+/)).toBeVisible();
    // nirgends wird E2EE behauptet
    const text = (await u.page.locator('.set-pane').innerText()).toLowerCase();
    expect(text).not.toContain('ende-zu-ende-verschlüsselt');
  });
});

test.describe('Chat-Hintergründe', () => {
  test('Editor: wählen, zuschneiden, speichern, privat, synchron, nachbearbeiten, zurücksetzen', async ({ browser }) => {
    const a = await signUp(browser, 'Anna');
    const b = await signUp(browser, 'Ben');
    await connect(a, b);
    await startChat(a, 'Ben');
    const box = a.page.getByRole('textbox', { name: 'Nachricht schreiben' });
    await box.fill('Hallo Ben, wie sieht mein Hintergrund aus?');
    await box.press('Enter');
    await expect(a.page.locator('.msgs').getByText('Hallo Ben, wie sieht mein Hintergrund aus?')).toBeVisible();
    await expect(a.page.locator('.chat-bg')).toHaveCount(0);

    // --- Editor öffnen
    await a.page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await a.page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const dialog = a.page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Nur für dich sichtbar')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Zurücksetzen' })).toHaveCount(0);

    // ungültige Dateien werden verständlich abgelehnt
    const file = dialog.getByTestId('bge-file');
    await file.setInputFiles({ name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('x') });
    await expect(dialog.getByRole('alert')).toContainText('HEIC');
    await file.setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(dialog.getByRole('alert')).toContainText('nicht unterstützt');
    await file.setInputFiles({ name: 'riesig.png', mimeType: 'image/png', buffer: Buffer.alloc(16 * 1024 * 1024, 1) });
    await expect(dialog.getByRole('alert')).toContainText('zu groß');
    await file.setInputFiles({ name: 'kaputt.png', mimeType: 'image/png', buffer: Buffer.from('das ist kein bild') });
    await expect(dialog.getByRole('alert')).toContainText('konnte nicht gelesen werden');

    // gültiges Bild
    await file.setInputFiles(png(await testImage(1200, 1800), 'galerie.png'));
    const img = dialog.getByTestId('bge-image');
    await expect(img).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await a.page.screenshot({ path: SHOT('desktop-bg-editor') });

    // Zoom per Schieberegler, Ziehen, Tastatur
    const t0 = await img.evaluate((e) => (e as HTMLElement).style.transform);
    await dialog.getByLabel('Zoom', { exact: true }).fill('1.5');
    await expect(dialog.getByText('1.5×')).toBeVisible();
    const frame = dialog.getByTestId('bge-frame');
    const fb = (await frame.boundingBox())!;
    const t1 = await img.evaluate((e) => (e as HTMLElement).style.transform);
    expect(t1).not.toBe(t0);
    await a.page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await a.page.mouse.down();
    await a.page.mouse.move(fb.x + fb.width / 2 - 40, fb.y + fb.height / 2 - 60, { steps: 6 });
    await a.page.mouse.up();
    const t2 = await img.evaluate((e) => (e as HTMLElement).style.transform);
    expect(t2).not.toBe(t1);
    await frame.focus();
    await frame.press('ArrowRight');
    const t3 = await img.evaluate((e) => (e as HTMLElement).style.transform);
    expect(t3).not.toBe(t2);
    // Mausrad zoomt
    await a.page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await a.page.mouse.wheel(0, -200);
    await expect(dialog.getByLabel('Zoom', { exact: true })).not.toHaveValue('1.5');
    await dialog.getByLabel('Zoom', { exact: true }).fill('1.5');

    // Helligkeit / Abdunkeln / Weichzeichnen
    await dialog.getByLabel('Helligkeit').fill('0.9');
    await dialog.getByLabel('Abdunkeln').fill('0.4');
    await dialog.getByLabel('Weichzeichnen').fill('2');
    await expect(dialog.locator('.bge-overlay')).toHaveCSS('opacity', '0.4');
    await expect(dialog.locator('.bge-layer')).toHaveCSS('filter', /brightness\(0\.9\)/);

    // „Alle Chats“ vs. „Nur dieser Chat“
    await expect(dialog.getByRole('button', { name: 'Nur dieser Chat' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Alle Chats (Standard)' })).toBeVisible();
    await a.page.screenshot({ path: SHOT('desktop-bg-editor-edited') });

    // Speichern
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(a.page.locator('.chat-bg')).toHaveCSS('background-image', /\/api\/media\//);
    await a.page.screenshot({ path: SHOT('desktop-chat-bg') });

    const bgs = (await (await a.page.request.get('/api/chat-backgrounds')).json()).backgrounds;
    expect(bgs).toHaveLength(1);
    const first = bgs[0];
    expect(first.params.zoom).toBeCloseTo(1.5, 2);
    expect(first.params.brightness).toBeCloseTo(0.9, 2);
    expect(first.params.overlay).toBeCloseTo(0.4, 2);
    expect(first.params.blur).toBeCloseTo(2, 1);
    expect(first.sourceMediaId).toBeTruthy();
    expect(first.sourceMediaId).not.toBe(first.mediaId);
    // zugeschnittener Ausschnitt hat Hochformat 9 : 19,5 und wurde ohne Effekte gerendert
    const cropped = await sharp(await (await a.page.request.get(first.url)).body()).metadata();
    expect(cropped.width! / cropped.height!).toBeCloseTo(1170 / 2532, 2);
    expect(cropped.width!).toBeLessThanOrEqual(1170);
    expect(cropped.height!).toBeLessThanOrEqual(2532);
    const original = await sharp(await (await a.page.request.get(first.sourceUrl)).body()).metadata();
    expect(original.width).toBe(1200);

    // --- Privatsphäre: Ben sieht nichts
    await openChatWith(b.page, 'Anna');
    await expect(b.page.locator('.chat-bg')).toHaveCount(0);
    expect((await (await b.page.request.get('/api/chat-backgrounds')).json()).backgrounds).toEqual([]);
    expect((await b.page.request.get(first.url)).status()).toBe(404);

    // --- Persistenz: Neuladen
    await a.page.reload();
    await expect(a.page.locator('.chat-bg')).toHaveCSS('background-image', /\/api\/media\//);

    // --- Sync: zweites Gerät von Anna
    const dev2 = await secondDevice(browser, a);
    await openChatWith(dev2, 'Ben');
    await expect(dev2.locator('.chat-bg')).toHaveCSS('background-image', /\/api\/media\//);

    // --- Nachbearbeiten: lädt Original und Parameter, nur Effekte ändern → gleiche Dateien
    await a.page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await a.page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const edit = a.page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await expect(edit.getByTestId('bge-image')).toBeVisible();
    await expect(edit.getByLabel('Zoom', { exact: true })).toHaveValue('1.5');
    await expect(edit.getByLabel('Abdunkeln')).toHaveValue('0.4');
    await expect(edit.getByRole('button', { name: 'Zurücksetzen' })).toBeVisible();
    await edit.getByLabel('Helligkeit').fill('1.2');
    await edit.getByRole('button', { name: 'Speichern' }).click();
    await expect(edit).toHaveCount(0, { timeout: 30_000 });
    const bgs2 = (await (await a.page.request.get('/api/chat-backgrounds')).json()).backgrounds;
    expect(bgs2[0].mediaId).toBe(first.mediaId);
    expect(bgs2[0].sourceMediaId).toBe(first.sourceMediaId);
    expect(bgs2[0].params.brightness).toBeCloseTo(1.2, 2);
    await expect(dev2.locator('.chat-bg')).toHaveCSS('filter', /brightness\(1\.2\)/);

    // Abbrechen mit ungespeicherten Änderungen fragt nach
    await a.page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await a.page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const cancel = a.page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await expect(cancel.getByTestId('bge-image')).toBeVisible();
    await cancel.getByLabel('Weichzeichnen').fill('9');
    await cancel.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(a.page.getByRole('dialog', { name: 'Änderungen verwerfen?' })).toBeVisible();
    await a.page.keyboard.press('Escape'); // schließt nur die Rückfrage
    await expect(a.page.getByRole('dialog', { name: 'Änderungen verwerfen?' })).toHaveCount(0);
    await expect(cancel).toBeVisible();
    await cancel.getByRole('button', { name: 'Abbrechen' }).click();
    await a.page.getByRole('dialog', { name: 'Änderungen verwerfen?' }).getByRole('button', { name: 'Verwerfen' }).click();
    await expect(cancel).toHaveCount(0);

    // --- Zurücksetzen
    await a.page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await a.page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const rst = a.page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await rst.getByRole('button', { name: 'Zurücksetzen' }).click();
    await a.page.getByRole('dialog', { name: 'Hintergrund zurücksetzen?' }).getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(rst).toHaveCount(0);
    await expect(a.page.locator('.chat-bg')).toHaveCount(0);
    await expect(dev2.locator('.chat-bg')).toHaveCount(0);
    expect((await (await a.page.request.get('/api/chat-backgrounds')).json()).backgrounds).toEqual([]);
    expect((await a.page.request.get(first.url)).status()).toBe(404);
  });

  test('Standard-Hintergrund über Einstellungen, Chat-Hintergrund mit Vorrang', async ({ browser }) => {
    const a = await signUp(browser, 'Clara');
    const b = await signUp(browser, 'Dirk');
    await connect(a, b);
    await startChat(a, 'Dirk');
    const { page } = a;

    await page.goto('/settings/backgrounds');
    await expect(page.getByText('nur für dich sichtbar')).toBeVisible();
    await expect(page.getByText('Noch keine Chats mit eigenem Hintergrund.')).toBeVisible();
    await page.getByRole('button', { name: 'Festlegen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Standard-Hintergrund' });
    await expect(dlg.getByRole('button', { name: 'Nur dieser Chat' })).toHaveCount(0);
    await dlg.getByTestId('bge-file').setInputFiles(png(await testImage(900, 900), 'quadrat.png'));
    await expect(dlg.getByTestId('bge-image')).toBeVisible();
    await dlg.getByRole('button', { name: 'Speichern' }).click();
    await expect(dlg).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('bg-default').getByRole('button', { name: 'Ändern' })).toBeVisible();
    await expect(page.locator('.set-bgthumb-img')).toBeVisible();
    await page.screenshot({ path: SHOT('desktop-backgrounds') });

    // gilt in jedem Chat
    await openChatWith(page, 'Dirk');
    const defUrl = (await (await page.request.get('/api/chat-backgrounds')).json()).backgrounds[0].url;
    await expect(page.locator('.chat-bg')).toHaveCSS('background-image', new RegExp(defUrl.replace(/\//g, '\\/')));

    // eigener Hintergrund für den Chat hat Vorrang und wird in der Liste angezeigt
    await page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const chatDlg = page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await expect(chatDlg.getByTestId('bge-image')).toBeVisible(); // startet mit dem Standard-Bild
    await chatDlg.getByTestId('bge-file').setInputFiles(png(await testImage(1000, 1400), 'eigen.png'));
    await chatDlg.getByRole('button', { name: 'Speichern' }).click();
    await expect(chatDlg).toHaveCount(0, { timeout: 30_000 });
    const bgs = (await (await page.request.get('/api/chat-backgrounds')).json()).backgrounds;
    expect(bgs).toHaveLength(2);
    const own = bgs.find((x: any) => x.conversationId !== null);
    await expect(page.locator('.chat-bg')).toHaveCSS('background-image', new RegExp(own.url.replace(/\//g, '\\/')));

    await page.goto('/settings/backgrounds');
    await expect(page.getByRole('button', { name: 'Hintergrund von Dirk ändern' })).toBeVisible();
    await page.getByRole('button', { name: 'Hintergrund von Dirk zurücksetzen' }).click();
    await page.getByRole('dialog', { name: 'Hintergrund zurücksetzen?' }).getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(page.getByText('Noch keine Chats mit eigenem Hintergrund.')).toBeVisible();
    // Standard zurücksetzen
    await page.getByTestId('bg-default').getByRole('button', { name: 'Zurücksetzen' }).click();
    await page.getByRole('dialog', { name: 'Hintergrund zurücksetzen?' }).getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect.poll(async () => (await (await page.request.get('/api/chat-backgrounds')).json()).backgrounds.length).toBe(0);
  });

  test('Handy-Ansicht (390×844): Einstellungen und Editor', async ({ browser }) => {
    const a = await signUp(browser, 'Emma');
    const b = await signUp(browser, 'Finn');
    await connect(a, b);
    await startChat(a, 'Finn');
    const { page } = a;
    await page.setViewportSize({ width: 390, height: 844 });

    // Menü als eigene Seite, Detail mit Zurück-Pfeil
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
    await expect(page.locator('.pane-detail')).toBeHidden();
    await page.screenshot({ path: SHOT('mobile-menu') });
    await page.getByRole('link', { name: /^Privatsphäre/ }).click();
    await expect(page).toHaveURL(/\/settings\/privacy/);
    await page.screenshot({ path: SHOT('mobile-privacy') });
    await page.getByRole('button', { name: 'Zurück zu den Einstellungen' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    for (const [path, name] of [['profile', 'profile'], ['appearance', 'appearance'], ['backgrounds', 'backgrounds'], ['sessions', 'sessions'], ['account', 'account'], ['notifications', 'notifications'], ['about', 'about']] as const) {
      await page.goto(`/settings/${path}`);
      await expect(page.locator('.set-pane')).toBeVisible();
      await page.screenshot({ path: SHOT(`mobile-${name}`) });
      // kein horizontales Scrollen
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }

    // Editor am Handy
    await openChatWith(page, 'Finn');
    await page.getByRole('button', { name: 'Weitere Optionen' }).click();
    await page.getByRole('button', { name: 'Chat-Hintergrund ändern' }).click();
    const dialog = page.getByRole('dialog', { name: /Chat-Hintergrund/ });
    await page.screenshot({ path: SHOT('mobile-editor-empty') });
    await dialog.getByTestId('bge-file').setInputFiles(png(await testImage(1600, 1200), 'quer.png'));
    await expect(dialog.getByTestId('bge-image')).toBeVisible();
    await dialog.getByLabel('Abdunkeln').fill('0.45');
    await dialog.getByLabel('Weichzeichnen').fill('1');
    // Touch-Pinch-Geste ist per Pointer-Events umgesetzt; Ziehen per Maus-Events zählt hier gleich
    const fb = (await dialog.getByTestId('bge-frame').boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(fb.x + fb.width / 2 + 30, fb.y + fb.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.screenshot({ path: SHOT('mobile-editor') });
    expect(await dialog.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(800);
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.chat-bg')).toHaveCSS('background-image', /\/api\/media\//);
    // Ein paar Nachrichten, damit die Lesbarkeit der Blasen beurteilt werden kann
    const box = page.getByRole('textbox', { name: 'Nachricht schreiben' });
    for (const t of ['Hi Finn!', 'Schau mal, mein neuer Hintergrund – gut lesbar?']) { await box.fill(t); await box.press('Enter'); }
    await expect(page.locator('.msgs').getByText('gut lesbar?')).toBeVisible();
    await page.screenshot({ path: SHOT('mobile-chat-bg') });
  });
});
