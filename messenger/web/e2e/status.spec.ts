import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { connect, signUp, type User } from './helpers';

const SHOTS = process.env.STATUS_SHOTS ?? 'e2e/shots/status';
mkdirSync(SHOTS, { recursive: true });

/** Farbverlauf-PNG ohne Abhängigkeiten. */
function makePng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = (x * 255) / w; raw[o + 2 + x * 3] = (y * 255) / h; raw[o + 3 + x * 3] = 200 - (y * 120) / h; }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const nav = (p: Page) => p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Status', exact: true });
const composer = (p: Page) => p.getByRole('dialog', { name: /Neuer Status|Entwurf bearbeiten/ });
const viewer = (p: Page, who: string) => p.getByRole('dialog', { name: `Status von ${who}` });

async function openComposer(p: Page) {
  await p.getByRole('button', { name: 'Status erstellen', exact: true }).click();
  await expect(composer(p)).toBeVisible();
}
async function publishText(p: Page, text: string) {
  await openComposer(p);
  await composer(p).getByRole('textbox', { name: 'Statustext' }).fill(text);
  await composer(p).getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(composer(p)).toBeHidden();
}

async function pair(browser: Parameters<typeof signUp>[0], a: string, b: string) {
  const x = await signUp(browser, a);
  const y = await signUp(browser, b);
  await connect(x, y);
  return [x, y] as const;
}
const goStatus = async (u: User) => { await nav(u.page).click(); await expect(u.page.getByRole('heading', { name: 'Mein Status' })).toBeVisible(); };

test('Textstatus: veröffentlichen, live sehen, ansehen, reagieren, Aufrufe, löschen', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await goStatus(ben);

  // Leere Zustände
  await expect(anna.page.getByText('Tippe auf +, um einen Status zu teilen')).toBeVisible();
  await expect(ben.page.getByText('Keine neuen Status')).toBeVisible();
  await anna.page.screenshot({ path: `${SHOTS}/desktop-liste-leer.png` });

  // Anna erstellt einen Textstatus mit eigenem Stil
  await openComposer(anna.page);
  const c = composer(anna.page);
  await expect(c.getByRole('button', { name: 'Veröffentlichen' })).toBeDisabled();
  await c.getByRole('textbox', { name: 'Statustext' }).fill('Guten Morgen, Ben! ☀️');
  await c.getByRole('button', { name: 'Hintergrund Rot' }).click();
  await c.getByRole('button', { name: 'Serif' }).click();
  await c.getByRole('button', { name: 'Links' }).click();
  await c.getByRole('button', { name: 'Emoji wählen' }).click();
  await c.getByRole('option').nth(5).click();
  await expect(c.getByRole('button', { name: 'Hintergrund Rot' })).toHaveAttribute('aria-pressed', 'true');
  await expect(c.getByText('Guten Morgen, Ben! ☀️').first()).toBeVisible();
  await anna.page.screenshot({ path: `${SHOTS}/desktop-composer-text.png` });
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c).toBeHidden();
  await expect(anna.page.getByText('Status veröffentlicht – er ist 24 Stunden sichtbar.')).toBeVisible();
  await expect(anna.page.getByText(/1 Status · 0 Aufrufe/)).toBeVisible();

  // Ben sieht es live: Badge in der Navigation, Abschnitt „Neu“, Ring
  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  await expect(ben.page.getByRole('heading', { name: 'Neu' })).toBeVisible();
  const row = ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' });
  await expect(row).toBeVisible();
  await expect(row.locator('.avatar.ring-unseen')).toBeVisible();
  await expect(row).toContainText('noch 23 Std.');
  await ben.page.screenshot({ path: `${SHOTS}/desktop-liste-neu.png` });

  // Ansehen: Vollbild-Viewer, Pause, Reaktion
  await row.click();
  const v = viewer(ben.page, 'Anna');
  await expect(v).toBeVisible();
  await expect(ben.page).toHaveURL(/\/status\/[0-9a-f-]{36}$/);
  await expect(v.getByText('Guten Morgen, Ben! ☀️')).toBeVisible();
  await v.getByRole('button', { name: 'Pausieren' }).click();
  await expect(v.getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
  await ben.page.screenshot({ path: `${SHOTS}/desktop-viewer-text.png` });
  const heart = v.getByRole('button', { name: /Reaktion ❤/ });
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await expect(nav(ben.page).locator('.nav-badge')).toHaveCount(0);

  // Besitzerin sieht Aufruf + Reaktion live
  await expect(anna.page.getByText(/1 Status · 1 Aufrufe/)).toBeVisible();
  await anna.page.getByRole('button', { name: 'Meinen Status ansehen' }).click();
  const av = viewer(anna.page, 'dir');
  await expect(av).toBeVisible();
  await av.getByRole('button', { name: 'Pausieren' }).click();
  await av.getByRole('button', { name: /1 Aufrufe, 1 Reaktionen anzeigen/ }).click();
  const panel = anna.page.getByRole('region', { name: 'Aufrufe und Reaktionen' });
  await expect(panel.getByRole('list', { name: 'Aufrufer' }).getByText('Ben')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Reaktionen' }).getByText('Ben')).toBeVisible();
  await expect(panel.getByLabel(/Reaktion ❤/)).toBeVisible();
  await anna.page.screenshot({ path: `${SHOTS}/desktop-viewer-aufrufe.png` });
  await anna.page.keyboard.press('Escape'); // schließt zuerst die Liste
  await expect(panel).toBeHidden();
  await expect(av).toBeVisible();

  // Ben schließt per Esc: Status ist jetzt „Gesehen“
  await ben.page.keyboard.press('Escape');
  await expect(v).toBeHidden();
  await expect(ben.page).toHaveURL(/\/status$/);
  await expect(ben.page.getByRole('heading', { name: 'Gesehen' })).toBeVisible();
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, gesehen' }).locator('.avatar.ring-seen')).toBeVisible();
  // Reaktion bleibt beim erneuten Öffnen markiert
  await ben.page.getByRole('button', { name: 'Status von Anna, gesehen' }).click();
  await expect(viewer(ben.page, 'Anna').getByRole('button', { name: /Reaktion ❤/ })).toHaveAttribute('aria-pressed', 'true');

  // Löschen mit Bestätigung
  await av.getByRole('button', { name: 'Status löschen' }).click();
  await expect(anna.page.getByRole('dialog', { name: 'Status löschen?' })).toBeVisible();
  await anna.page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(av).toBeVisible();
  await av.getByRole('button', { name: 'Status löschen' }).click();
  await anna.page.getByRole('dialog', { name: 'Status löschen?' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(av).toBeHidden();
  await expect(anna.page.getByText('Tippe auf +, um einen Status zu teilen')).toBeVisible();
  // Bens geöffneter Viewer verschwindet, die Liste ist wieder leer
  await expect(viewer(ben.page, 'Anna')).toBeHidden();
  await expect(ben.page.getByText('Keine neuen Status')).toBeVisible();
});

test('Bildstatus: Upload, Beschriftung, automatischer Ablauf der Anzeige, Tastatur', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await goStatus(ben);

  await anna.page.getByRole('button', { name: 'Foto oder Video teilen' }).click();
  const c = composer(anna.page);
  await expect(c.getByRole('button', { name: 'Foto / Video' })).toHaveAttribute('aria-pressed', 'true');

  // Falscher Dateityp wird verständlich abgelehnt
  await c.locator('input[type=file]').setInputFiles({ name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('hallo') });
  await expect(c.getByRole('alert')).toContainText('Dateityp wird nicht unterstützt');

  await c.locator('input[type=file]').setInputFiles({ name: 'strand.png', mimeType: 'image/png', buffer: makePng(320, 480) });
  await expect(c.getByRole('img', { name: 'Bildvorschau' })).toBeVisible();
  await c.getByRole('textbox', { name: /Beschriftung/ }).fill('Strandtag 🏖️');
  await anna.page.screenshot({ path: `${SHOTS}/desktop-composer-bild.png` });
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c).toBeHidden();

  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  await ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' }).click();
  const v = viewer(ben.page, 'Anna');
  const img = v.getByRole('img', { name: 'Strandtag 🏖️' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(v.getByText('Strandtag 🏖️').last()).toBeVisible();
  await ben.page.screenshot({ path: `${SHOTS}/desktop-viewer-bild.png` });

  // Nach ca. 5 s ist der (einzige) Status durch → Viewer schließt sich
  await expect(v).toBeHidden({ timeout: 9000 });
  await expect(ben.page).toHaveURL(/\/status$/);
  await expect(ben.page.getByRole('heading', { name: 'Gesehen' })).toBeVisible();

  // Zwei weitere Status: Weiter/Zurück per Tastatur, Fortschrittsbalken
  await publishText(anna.page, 'Zweiter');
  await publishText(anna.page, 'Dritter');
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 2 neu' })).toBeVisible();
  await ben.page.getByRole('button', { name: 'Status von Anna, 2 neu' }).click();
  await expect(v.getByText('Zweiter')).toBeVisible(); // beginnt beim ersten ungesehenen
  await expect(v.locator('.sv-bar')).toHaveCount(3);
  await ben.page.keyboard.press('ArrowRight');
  await expect(v.getByText('Dritter')).toBeVisible();
  await ben.page.keyboard.press('ArrowLeft');
  await expect(v.getByText('Zweiter')).toBeVisible();
  // Tippen rechts = weiter, Tippen links = zurück
  const box = (await v.locator('.sv-surface').boundingBox())!;
  await ben.page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
  await expect(v.getByText('Dritter')).toBeVisible();
  await ben.page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await expect(v.getByText('Zweiter')).toBeVisible();
  // Halten = Pause: der Balken bleibt stehen
  await ben.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await ben.page.mouse.down();
  await ben.page.waitForTimeout(600);
  const w1 = await v.locator('.sv-bar i').nth(0).evaluate((e) => (e as HTMLElement).style.transform);
  await ben.page.waitForTimeout(700);
  const w2 = await v.locator('.sv-bar i').nth(0).evaluate((e) => (e as HTMLElement).style.transform);
  expect(w2).toBe(w1);
  await ben.page.mouse.up();
  await expect(v.getByText('Zweiter')).toBeVisible();
  await ben.page.keyboard.press('Escape');
  await expect(v).toBeHidden();
});

test('Videostatus: Wiedergabe für die Videodauer', async ({ browser }) => {
  const file = join(tmpdir(), `status-test-${process.pid}.webm`);
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=160x120:rate=10', '-c:v', 'libvpx', '-b:v', '150k', file]);
  } catch {
    test.skip(true, 'ffmpeg nicht verfügbar');
  }
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await goStatus(ben);
  await anna.page.getByRole('button', { name: 'Foto oder Video teilen' }).click();
  const c = composer(anna.page);
  await c.locator('input[type=file]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: readFileSync(file) });
  await expect(c.getByLabel('Videovorschau')).toBeVisible();
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c).toBeHidden();

  await ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' }).click();
  const v = viewer(ben.page, 'Anna');
  const video = v.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThan(1);
  await expect(v.getByRole('button', { name: /Ton (ein|aus)schalten/ })).toBeVisible();
  // Video dauert 2 s (nicht 5 s) → Viewer schließt sich danach
  const t0 = Date.now();
  await expect(v).toBeHidden({ timeout: 8000 });
  expect(Date.now() - t0).toBeLessThan(4800);
});

test('Sichtbarkeit „nur ausgewählte“: Dritte sehen nichts; Validierung', async ({ browser }) => {
  const anna = await signUp(browser, 'Anna');
  const ben = await signUp(browser, 'Ben');
  const cara = await signUp(browser, 'Cara');
  await connect(anna, ben);
  await connect(anna, cara);
  await goStatus(anna);
  await goStatus(ben);
  await goStatus(cara);

  await openComposer(anna.page);
  const c = composer(anna.page);
  await c.getByRole('textbox', { name: 'Statustext' }).fill('Nur für Ben');
  await c.getByRole('radio', { name: /Nur ausgewählte Kontakte/ }).check();
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c.getByRole('alert')).toContainText('mindestens einen Kontakt');
  await expect(c).toBeVisible();
  await c.getByRole('checkbox', { name: 'Ben' }).check();
  await expect(c.getByText('1 ausgewählt')).toBeVisible();
  await anna.page.screenshot({ path: `${SHOTS}/desktop-composer-sichtbarkeit.png` });
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c).toBeHidden();

  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();
  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  // Cara bekommt weder Eintrag noch Badge – auch nach Neuladen nicht
  await cara.page.waitForTimeout(800);
  await expect(cara.page.getByText('Keine neuen Status')).toBeVisible();
  await expect(nav(cara.page).locator('.nav-badge')).toHaveCount(0);
  await cara.page.reload();
  await expect(cara.page.getByText('Keine neuen Status')).toBeVisible();

  // „Alle außer“ schließt Ben aus, Cara sieht den Status
  await publishExcept(anna.page, 'Außer Ben', 'Ben');
  await expect(cara.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();
  await ben.page.reload();
  await ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' }).click();
  await expect(viewer(ben.page, 'Anna').getByText('Nur für Ben')).toBeVisible();
  await expect(viewer(ben.page, 'Anna').locator('.sv-bar')).toHaveCount(1);
});

async function publishExcept(p: Page, text: string, except: string) {
  await openComposer(p);
  const c = composer(p);
  await c.getByRole('textbox', { name: 'Statustext' }).fill(text);
  await c.getByRole('radio', { name: /Alle außer/ }).check();
  await c.getByRole('checkbox', { name: except }).check();
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c).toBeHidden();
}

test('Entwürfe: speichern, bearbeiten, veröffentlichen, löschen', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await goStatus(ben);

  await openComposer(anna.page);
  const c = composer(anna.page);
  await c.getByRole('textbox', { name: 'Statustext' }).fill('Noch nicht fertig');
  await c.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await expect(c).toBeHidden();
  await expect(anna.page.getByRole('heading', { name: 'Entwürfe' })).toBeVisible();
  await anna.page.waitForTimeout(500);
  await expect(ben.page.getByText('Keine neuen Status')).toBeVisible();

  // Bearbeiten
  await anna.page.getByRole('button', { name: /Entwurf bearbeiten: Noch nicht fertig/ }).click();
  await expect(composer(anna.page)).toBeVisible();
  const box = composer(anna.page).getByRole('textbox', { name: 'Statustext' });
  await expect(box).toHaveValue('Noch nicht fertig');
  await box.fill('Jetzt fertig');
  // Schließen mit Änderungen fragt nach
  await anna.page.keyboard.press('Escape');
  await expect(anna.page.getByRole('dialog', { name: 'Änderungen verwerfen?' })).toBeVisible();
  await anna.page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(box).toHaveValue('Jetzt fertig');
  await composer(anna.page).getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await expect(composer(anna.page)).toBeHidden();
  await expect(anna.page.getByRole('button', { name: /Entwurf bearbeiten: Jetzt fertig/ })).toBeVisible();

  // Aus der Liste veröffentlichen
  await anna.page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(anna.page.getByRole('heading', { name: 'Entwürfe' })).toBeHidden();
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();

  // Zweiter Entwurf: aus dem Editor veröffentlichen, dritter: löschen
  await openComposer(anna.page);
  await composer(anna.page).getByRole('textbox', { name: 'Statustext' }).fill('Zweiter Entwurf');
  await composer(anna.page).getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await anna.page.getByRole('button', { name: /Entwurf bearbeiten: Zweiter Entwurf/ }).click();
  await composer(anna.page).getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(composer(anna.page)).toBeHidden();
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 2 neu' })).toBeVisible();

  await openComposer(anna.page);
  await composer(anna.page).getByRole('textbox', { name: 'Statustext' }).fill('Wegwerf');
  await composer(anna.page).getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await anna.page.getByRole('button', { name: /Entwurf löschen: Wegwerf/ }).click();
  await anna.page.getByRole('dialog', { name: 'Entwurf löschen?' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(anna.page.getByRole('heading', { name: 'Entwürfe' })).toBeHidden();
});

test('Badge in der Navigation auch ohne geöffneten Status-Tab, auch nach Neuladen', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await expect(nav(ben.page).locator('.nav-badge')).toHaveCount(0);
  await publishText(anna.page, 'Hallo aus dem Hintergrund');
  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  await ben.page.reload();
  await expect(ben.page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  await nav(ben.page).click();
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();
});

test('Limit von 30 aktiven Status wird verständlich gemeldet', async ({ browser }) => {
  const anna = await signUp(browser, 'Anna');
  const origin = new URL(anna.page.url()).origin;
  for (let i = 0; i < 30; i++) {
    const r = await anna.page.request.post('/api/statuses', { data: { kind: 'text', body: `Status ${i}` }, headers: { origin } });
    expect(r.ok()).toBeTruthy();
  }
  await goStatus(anna);
  await expect(anna.page.getByText(/30 Status/)).toBeVisible();
  await openComposer(anna.page);
  await composer(anna.page).getByRole('textbox', { name: 'Statustext' }).fill('Nummer 31');
  await composer(anna.page).getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(composer(anna.page).getByRole('alert')).toContainText('30 aktive Status');
  await expect(composer(anna.page)).toBeVisible();
});

test('Abgelaufene Status verschwinden per Timer aus der Ansicht', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  await goStatus(anna);
  await goStatus(ben);
  await publishText(anna.page, 'Gleich weg');
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();
  // Ablaufzeit auf wenige Sekunden verschieben: der Client schaltet nach `expiresAt` selbst ab.
  await ben.page.route('**/api/statuses/feed', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    for (const g of json.groups) for (const s of g.statuses) s.expiresAt = new Date(Date.now() + 2500).toISOString();
    await route.fulfill({ response: res, json });
  });
  await ben.page.reload();
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeVisible();
  await expect(nav(ben.page).locator('.nav-badge')).toHaveText('1');
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 1 neu' })).toBeHidden({ timeout: 8000 });
  await expect(nav(ben.page).locator('.nav-badge')).toHaveCount(0);
  await expect(ben.page.getByText('Keine neuen Status')).toBeVisible();
});

test('Lesebestätigungen aus: Hinweis in der Aufrufliste', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  const origin = new URL(anna.page.url()).origin;
  const r = await anna.page.request.patch('/api/me/privacy', { data: { readReceipts: false }, headers: { origin } });
  expect(r.ok()).toBeTruthy();
  await goStatus(anna);
  await goStatus(ben);
  await publishText(anna.page, 'Ohne Bestätigung');
  await anna.page.getByRole('button', { name: 'Meinen Status ansehen' }).click();
  const av = viewer(anna.page, 'dir');
  await av.getByRole('button', { name: /Aufrufe, .* Reaktionen anzeigen/ }).click();
  await expect(anna.page.getByRole('note')).toContainText('Lesebestätigungen sind deaktiviert');
});

test('Screenshots mobil (390×844) und Desktop, hell und dunkel', async ({ browser }) => {
  const [anna, ben] = await pair(browser, 'Anna', 'Ben');
  const origin = new URL(anna.page.url()).origin;
  const png = makePng(360, 640);
  const up = await anna.page.request.post('/api/media', { multipart: { purpose: 'status', file: { name: 'a.png', mimeType: 'image/png', buffer: png } }, headers: { origin } });
  const media = (await up.json()).media;
  const post = (data: object) => anna.page.request.post('/api/statuses', { data, headers: { origin } });
  await post({ kind: 'text', body: 'Wochenende am See 🌊\nWer kommt mit?', style: { bg: '#0090ff', font: 'hand', emoji: '🏞️' } });
  await post({ kind: 'text', body: 'Montag. Kaffee. Weiter.', style: { bg: '#1b1b1f', color: '#ffe66d', font: 'mono', align: 'left' } });
  await post({ kind: 'image', mediaId: media.id, body: 'Aussicht von heute' });
  await post({ kind: 'text', body: 'Entwurf: Überraschung', publish: false });
  await goStatus(anna);
  await goStatus(ben);
  await expect(ben.page.getByRole('button', { name: 'Status von Anna, 3 neu' })).toBeVisible();
  for (const u of [anna, ben]) await u.page.addStyleTag({ content: '.toast-host { display: none !important; }' });
  const shot = async (p: Page, name: string) => { await p.waitForTimeout(400); await p.screenshot({ path: `${SHOTS}/${name}.png` }); };

  for (const [label, size, scheme] of [['mobil', { width: 390, height: 844 }, 'light'], ['mobil-dunkel', { width: 390, height: 844 }, 'dark'], ['desktop-dunkel', { width: 1280, height: 800 }, 'dark']] as const) {
    for (const u of [anna, ben]) { await u.page.setViewportSize(size); await u.page.emulateMedia({ colorScheme: scheme }); }
    await anna.page.waitForTimeout(300);
    await shot(anna.page, `${label}-liste-anna`);
    await shot(ben.page, `${label}-liste-ben`);

    await ben.page.getByRole('button', { name: /Status von Anna/ }).click();
    const v = viewer(ben.page, 'Anna');
    await expect(v).toBeVisible();
    await v.getByRole('button', { name: 'Pausieren' }).click();
    await shot(ben.page, `${label}-viewer-text`);
    await ben.page.keyboard.press('ArrowRight');
    await ben.page.waitForTimeout(150);
    await shot(ben.page, `${label}-viewer-text2`);
    await ben.page.keyboard.press('ArrowRight');
    await expect(v.getByRole('img', { name: 'Aussicht von heute' })).toBeVisible();
    await ben.page.waitForTimeout(400);
    await shot(ben.page, `${label}-viewer-bild`);
    await ben.page.keyboard.press('Escape');

    await anna.page.getByRole('button', { name: 'Meinen Status ansehen' }).click();
    const av = viewer(anna.page, 'dir');
    await av.getByRole('button', { name: 'Pausieren' }).click();
    await shot(anna.page, `${label}-viewer-eigen`);
    await anna.page.keyboard.press('Escape');

    await openComposer(anna.page);
    await composer(anna.page).getByRole('textbox', { name: 'Statustext' }).fill('Hallo Welt, das ist eine Vorschau mit etwas längerem Text.');
    await shot(anna.page, `${label}-composer-text`);
    await composer(anna.page).getByRole('radio', { name: /Alle außer/ }).check();
    await composer(anna.page).getByRole('checkbox', { name: 'Ben' }).scrollIntoViewIfNeeded();
    await shot(anna.page, `${label}-composer-sichtbarkeit`);
    await composer(anna.page).getByRole('button', { name: 'Foto / Video' }).click();
    await shot(anna.page, `${label}-composer-medien`);
    await anna.page.keyboard.press('Escape');
    await anna.page.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(composer(anna.page)).toBeHidden();
  }
});
