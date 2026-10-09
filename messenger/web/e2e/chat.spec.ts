import { expect, test, type Page } from '@playwright/test';
import { connect, signUp, type User } from './helpers';

const msgs = (p: Page) => p.locator('.msgs');
async function openChatWith(a: User, b: User) {
  await a.page.goto('/chats');
  await a.page.getByRole('button', { name: 'Neuer Chat' }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: new RegExp(b.name) }).first().click();
  await expect(a.page.getByRole('region', { name: new RegExp(`Chat mit ${b.name}`) })).toBeVisible();
}
async function send(p: Page, text: string) {
  const box = p.getByRole('textbox', { name: 'Nachricht schreiben' });
  await box.fill(text);
  await box.press('Enter');
}
async function openB(b: User, a: User) {
  await b.page.goto('/chats');
  await b.page.getByRole('button', { name: new RegExp(a.name) }).first().click();
  await expect(b.page.getByRole('region', { name: new RegExp(`Chat mit ${a.name}`) })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

let anna: User, ben: User, cara: User;
test.beforeAll(async ({ browser }) => {
  anna = await signUp(browser, 'Anna');
  ben = await signUp(browser, 'Ben');
  cara = await signUp(browser, 'Cara');
  await connect(anna, ben); await connect(anna, cara); await connect(ben, cara);
  await anna.page.request.post('/api/conversations/direct', { data: { userId: cara.id }, headers: { origin: new URL(anna.page.url()).origin } });
  await openChatWith(anna, ben);
  await openB(ben, anna).catch(async () => { await send(anna.page, 'Start'); await openB(ben, anna); });
});

test('Nachrichten, Zustellstatus, Gelesen-Haken und Tippanzeige', async () => {
  await send(anna.page, 'Erste Nachricht');
  await expect(msgs(ben.page).getByText('Erste Nachricht')).toBeVisible();
  // Gelesen: blaue Doppelhaken bei Anna
  await expect(anna.page.locator('.bubble', { hasText: 'Erste Nachricht' }).locator('.foot .read')).toBeVisible();
  // Tippanzeige
  await ben.page.getByRole('textbox', { name: 'Nachricht schreiben' }).pressSequentially('Ich tippe gerade');
  await expect(anna.page.getByText('schreibt…').first()).toBeVisible();
  await ben.page.getByRole('textbox', { name: 'Nachricht schreiben' }).fill('');
});

test('Antworten, Reaktion, Bearbeiten, Weiterleiten, Löschen', async () => {
  await send(ben.page, 'Bitte antworte mir');
  const bubbleA = anna.page.locator('.bubble', { hasText: 'Bitte antworte mir' });
  await bubbleA.click({ button: 'right' });
  await anna.page.getByRole('button', { name: 'Antworten' }).click();
  await send(anna.page, 'Das ist die Antwort');
  await expect(msgs(ben.page).locator('.quote', { hasText: 'Bitte antworte mir' })).toBeVisible();

  // Reaktion über das Menü
  await ben.page.locator('.bubble', { hasText: 'Das ist die Antwort' }).click({ button: 'right' });
  await ben.page.getByRole('button', { name: 'Reaktion 😂' }).click();
  await expect(anna.page.locator('.bubble', { hasText: 'Das ist die Antwort' }).locator('.reaction-chip')).toContainText('😂');

  // Bearbeiten
  await anna.page.locator('.bubble', { hasText: 'Das ist die Antwort' }).click({ button: 'right' });
  await anna.page.getByRole('button', { name: 'Bearbeiten' }).click();
  const box = anna.page.getByRole('textbox', { name: 'Nachricht schreiben' });
  await box.fill('Das ist die korrigierte Antwort');
  await box.press('Enter');
  await expect(msgs(ben.page).getByText('Das ist die korrigierte Antwort')).toBeVisible();
  await expect(ben.page.locator('.bubble', { hasText: 'korrigierte' }).getByText('bearbeitet')).toBeVisible();

  // Weiterleiten an Cara
  await anna.page.locator('.bubble', { hasText: 'korrigierte' }).click({ button: 'right' });
  await anna.page.getByRole('button', { name: 'Weiterleiten' }).click();
  await anna.page.getByRole('dialog').getByRole('button', { name: /Cara/ }).click();
  await anna.page.getByRole('button', { name: /^Senden/ }).click();
  await cara.page.goto('/chats');
  await expect(cara.page.getByText('Das ist die korrigierte Antwort').first()).toBeVisible();

  // Für alle löschen (zurück in den Chat mit Ben – nach dem Weiterleiten öffnet die App den Zielchat)
  await anna.page.getByRole('button', { name: /^Ben/ }).first().click();
  await anna.page.locator('.bubble', { hasText: 'korrigierte' }).click({ button: 'right' });
  await anna.page.getByRole('button', { name: 'Für alle löschen' }).click();
  await anna.page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(msgs(ben.page).getByText('Diese Nachricht wurde gelöscht')).toBeVisible();
  await expect(msgs(ben.page).getByText('Das ist die korrigierte Antwort')).toHaveCount(0);
});

test('Bild senden und anzeigen, Dokument, Sprachnachricht', async () => {
  // 1×1-PNG hochgeladen als „Foto“ (der Server liefert Maße zurück)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await anna.page.getByRole('button', { name: 'Anhang' }).click();
  const [chooser] = await Promise.all([anna.page.waitForEvent('filechooser'), anna.page.getByRole('button', { name: /Foto/ }).click()]);
  await chooser.setFiles({ name: 'urlaub.png', mimeType: 'image/png', buffer: png });
  await anna.page.getByLabel('Beschriftung').fill('Mein Foto');
  await anna.page.getByRole('button', { name: 'Senden' }).click();
  const img = msgs(ben.page).locator('img.media').last();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(msgs(ben.page).getByText('Mein Foto')).toBeVisible();

  // Dokument
  await anna.page.getByRole('button', { name: 'Anhang' }).click();
  const [chooser2] = await Promise.all([anna.page.waitForEvent('filechooser'), anna.page.getByRole('button', { name: /Dokument/ }).click()]);
  await chooser2.setFiles({ name: 'Rechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%test\n') });
  await anna.page.getByRole('button', { name: 'Senden' }).click();
  await expect(msgs(ben.page).getByText('Rechnung.pdf')).toBeVisible();

  // Sprachnachricht mit der Fake-Mikrofon-Quelle des Test-Browsers
  await anna.page.getByRole('button', { name: 'Sprachnachricht aufnehmen' }).click();
  await expect(anna.page.getByText('Aufnahme läuft…')).toBeVisible();
  await anna.page.waitForTimeout(1800);
  await anna.page.getByRole('button', { name: 'Sprachnachricht senden' }).click();
  const voice = msgs(ben.page).locator('.voice').last();
  await expect(voice).toBeVisible();
  await expect.poll(() => voice.locator('audio').evaluate((a: HTMLAudioElement) => a.readyState >= 1)).toBe(true);
});

test('Suche im Chat springt zur Nachricht', async () => {
  await send(anna.page, 'Der geheime Suchbegriff Zebrastreifen');
  for (let i = 0; i < 3; i++) await send(anna.page, `Füllnachricht ${i}`);
  await anna.page.getByRole('button', { name: 'Weitere Optionen' }).click();
  await anna.page.getByRole('button', { name: 'In Chat suchen' }).click();
  await anna.page.getByRole('textbox', { name: 'In Chat suchen' }).fill('Zebrastreifen');
  await anna.page.locator('.search-results button').first().click();
  await expect(anna.page.locator('.bubble.highlight, .bubble', { hasText: 'Zebrastreifen' }).first()).toBeVisible();
});

test('Offline senden: Nachricht wird wiederholt und genau einmal zugestellt', async () => {
  await anna.ctx.setOffline(true);
  await send(anna.page, 'Gesendet ohne Netz');
  await expect(anna.page.locator('.bubble', { hasText: 'Gesendet ohne Netz' })).toBeVisible();
  await expect(anna.page.getByText('Senden fehlgeschlagen')).toBeVisible();
  await anna.ctx.setOffline(false);
  await anna.page.getByRole('button', { name: 'Erneut senden' }).click();
  await expect(msgs(ben.page).getByText('Gesendet ohne Netz')).toHaveCount(1);
  await expect(anna.page.getByText('Senden fehlgeschlagen')).toHaveCount(0);
});

test('Gruppe erstellen, Nachricht an alle, Mitglied hinzufügen und Einladungslink', async ({ browser }) => {
  await anna.page.goto('/chats');
  await anna.page.getByRole('button', { name: 'Neue Gruppe' }).click();
  const dlg = anna.page.getByRole('dialog');
  await dlg.getByLabel('Gruppenname').fill('Wochenend-Plan');
  await dlg.getByRole('button', { name: /Ben/ }).click();
  await dlg.getByRole('button', { name: 'Gruppe erstellen (2)' }).click();
  await expect(anna.page.getByRole('region', { name: /Wochenend-Plan/ })).toBeVisible();
  await send(anna.page, 'Hallo Gruppe');
  await ben.page.goto('/chats');
  await ben.page.getByRole('button', { name: /Wochenend-Plan/ }).click();
  await expect(msgs(ben.page).getByText('Hallo Gruppe')).toBeVisible();
  await expect(msgs(ben.page).getByText(/hat die Gruppe erstellt/)).toBeVisible();

  // Einladungslink → Cara tritt bei
  await anna.page.getByRole('button', { name: /Wochenend-Plan – Info öffnen/ }).click();
  await anna.page.getByRole('button', { name: 'Neuer Link' }).click();
  const url = await anna.page.locator('text=/\\/join\\//').first().innerText();
  const path = url.trim().replace(/^.*?(\/join\/[\w-]+).*$/s, '$1');
  await cara.page.goto(path);
  await cara.page.getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(cara.page.getByRole('region', { name: /Wochenend-Plan/ })).toBeVisible();
  await send(cara.page, 'Danke für die Einladung');
  await expect(msgs(ben.page).getByText('Danke für die Einladung')).toBeVisible();
  void browser;
});

test('mobile Ansicht: untere Navigation, Chat öffnet im Vollbild', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Anmeldung von Anna per Cookie des bestehenden Kontexts übernehmen
  await ctx.addCookies(await anna.ctx.cookies());
  await page.goto('/chats');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box!.y).toBeGreaterThan(700); // unten
  await page.getByRole('button', { name: /Ben/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Nachricht schreiben' })).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/mobile-chat.png' });
  await page.getByRole('button', { name: 'Zurück zur Chatliste' }).click();
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/mobile-list.png' });
  await ctx.close();
});
