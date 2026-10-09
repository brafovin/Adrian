import { expect, test, type Page } from '@playwright/test';
import { connect, signUp, type User } from './helpers';

/* Echte Medienübertragung zwischen zwei Browser-Kontexten (Chromium mit Fake-Kamera/-Mikrofon).
   Nachgewiesen wird sie über das nur lesende Diagnose-Objekt `window.__adrianRtc` (getStats der PeerConnection). */

interface Summary {
  link: string; ice: string; connection: string;
  audioIn: { bytes: number; packets: number; energy: number };
  videoIn: { bytes: number; frames: number; width: number; height: number };
  audioOut: { bytes: number }; videoOut: { bytes: number };
}
const stats = (p: Page) => p.evaluate(() => (window as any).__adrianRtc?.stats() ?? null) as Promise<Summary | null>;
const tracks = (p: Page) => p.evaluate(() => (window as any).__adrianRtc?.tracks() ?? null) as Promise<{ local: any[]; remote: any[] } | null>;

/** Eingehende RTP-Bytes müssen innerhalb einer Sekunde weiter steigen. */
async function expectFlowing(p: Page, kind: 'audioIn' | 'videoIn') {
  await expect.poll(async () => (await stats(p))?.[kind].bytes ?? 0, { timeout: 25_000, message: `${kind}: noch keine Daten` }).toBeGreaterThan(2000);
  const before = (await stats(p))![kind].bytes;
  await expect.poll(async () => (await stats(p))![kind].bytes, { timeout: 5_000, intervals: [500, 500, 1000], message: `${kind} steigt nicht` }).toBeGreaterThan(before);
}

const overlay = (p: Page, name: string) => p.getByRole('dialog', { name: `Anruf mit ${name}` });
const incoming = (p: Page) => p.getByRole('alertdialog', { name: 'Eingehender Anruf' });

async function openChat(u: User, peer: string) {
  await u.page.goto('/chats');
  const row = u.page.locator('.chat-row', { hasText: peer }).first();
  if (await row.waitFor({ timeout: 3000 }).then(() => true, () => false)) await row.click();
  else {
    await u.page.getByRole('button', { name: 'Neuer Chat' }).click();
    await u.page.getByRole('button', { name: new RegExp(peer) }).first().click();
  }
  await expect(u.page.getByRole('region', { name: new RegExp(`Chat mit ${peer}`) })).toBeVisible();
}

async function establish(caller: User, callee: User, kind: 'audio' | 'video') {
  await openChat(caller, callee.name);
  await caller.page.getByRole('button', { name: kind === 'audio' ? 'Sprachanruf' : 'Videoanruf', exact: true }).click();
  await expect(overlay(caller.page, callee.name)).toBeVisible();
  await expect(incoming(callee.page)).toBeVisible({ timeout: 10_000 });
  await expect(incoming(callee.page).getByText(caller.name, { exact: true })).toBeVisible();
  await expect(incoming(callee.page).getByRole('button', { name: 'Annehmen' })).toBeFocused();
  await callee.page.waitForTimeout(400);
  await callee.page.screenshot({ path: `e2e/shots/calls-incoming-${kind}-desktop.png` });
  await callee.page.getByRole('button', { name: 'Annehmen' }).click();
  await expect(overlay(callee.page, caller.name)).toBeVisible();
  // aktiv = Timer läuft (kein Status-Text mehr)
  await expect(overlay(caller.page, callee.name).locator('.call-status time')).toBeVisible({ timeout: 30_000 });
  await expect(overlay(callee.page, caller.name).locator('.call-status time')).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Anrufe', () => {
  let anna: User, ben: User;
  test.beforeAll(async ({ browser }) => {
    anna = await signUp(browser, 'Anna');
    ben = await signUp(browser, 'Ben');
    await connect(anna, ben);
  });
  test.afterAll(async () => { await anna?.ctx.close(); await ben?.ctx.close(); });

  test('Sprachanruf: klingeln, annehmen, echte Audioübertragung, stumm, auflegen, Verlauf mit Dauer', async () => {
    await establish(anna, ben, 'audio');
    // Beide Seiten empfangen echte Audiodaten
    await expectFlowing(anna.page, 'audioIn');
    await expectFlowing(ben.page, 'audioIn');
    expect((await stats(anna.page))!.ice).toMatch(/connected|completed/);
    // Ton wird über das <audio>-Element abgespielt
    await expect.poll(() => ben.page.locator('audio').evaluate((a: HTMLAudioElement) => !!a.srcObject && !a.paused)).toBe(true);

    // Stummschalten: lokaler Track enabled=false, Gegenseite sieht den Hinweis
    await anna.page.getByRole('button', { name: 'Stummschalten' }).click();
    await expect(anna.page.getByRole('button', { name: 'Stummschaltung aufheben' })).toBeVisible();
    expect((await tracks(anna.page))!.local.find((t) => t.kind === 'audio').enabled).toBe(false);
    await expect(overlay(ben.page, anna.name).getByText('Mikrofon aus')).toBeVisible();
    await anna.page.getByRole('button', { name: 'Stummschaltung aufheben' }).click();
    expect((await tracks(anna.page))!.local.find((t) => t.kind === 'audio').enabled).toBe(true);
    await expect(overlay(ben.page, anna.name).getByText('Mikrofon aus')).toBeHidden();

    await anna.page.screenshot({ path: 'e2e/shots/calls-active-audio-desktop.png' });
    await ben.page.waitForTimeout(1500); // etwas Gesprächsdauer für den Verlauf
    await ben.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(overlay(ben.page, anna.name)).toBeHidden({ timeout: 8000 });
    await expect(overlay(anna.page, ben.name)).toBeHidden({ timeout: 8000 });
    expect(await stats(anna.page)).toBeNull();

    // Verlauf mit Dauer
    await anna.page.goto('/calls');
    const row = anna.page.getByRole('list', { name: 'Anrufverlauf' }).getByRole('listitem').first();
    await expect(row).toContainText('Ben');
    await expect(row).toContainText('Ausgehend · Sprache');
    await expect(row).toContainText(/\d:\d\d/);
    await ben.page.goto('/calls');
    const brow = ben.page.getByRole('list', { name: 'Anrufverlauf' }).getByRole('listitem').first();
    await expect(brow).toContainText('Eingehend · Sprache');
    await expect(brow).toContainText(/\d:\d\d/);
    await expect(brow).not.toHaveClass(/missed/);
  });

  test('Videoanruf: echtes Video, Kamera aus/an', async () => {
    await establish(anna, ben, 'video');
    await expectFlowing(anna.page, 'audioIn');
    await expectFlowing(ben.page, 'audioIn');
    await expectFlowing(anna.page, 'videoIn');
    await expectFlowing(ben.page, 'videoIn');
    for (const u of [anna, ben]) {
      await expect.poll(() => u.page.locator('video.call-remote').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(u.page.locator('video.call-pip-video')).toBeVisible();
    }
    await ben.page.screenshot({ path: 'e2e/shots/calls-active-video-desktop.png' });

    // Kamera aus: Gegenseite zeigt Hinweis statt Bild, lokale Kamera wird freigegeben
    await anna.page.getByRole('button', { name: 'Kamera ausschalten' }).click();
    await expect(anna.page.getByRole('button', { name: 'Kamera einschalten' })).toBeVisible();
    await expect(ben.page.getByText('Kamera ist aus')).toBeVisible();
    await expect(ben.page.locator('video.call-remote')).toHaveCount(0);
    expect((await tracks(anna.page))!.local.filter((t) => t.kind === 'video')).toHaveLength(0);
    // Ton läuft weiter
    const a0 = (await stats(ben.page))!.audioIn.bytes;
    await expect.poll(async () => (await stats(ben.page))!.audioIn.bytes).toBeGreaterThan(a0);

    // Kamera wieder an: neues Bild kommt an
    await anna.page.getByRole('button', { name: 'Kamera einschalten' }).click();
    await expect(anna.page.getByRole('button', { name: 'Kamera ausschalten' })).toBeVisible();
    await expect(ben.page.locator('video.call-remote')).toBeVisible();
    await expect.poll(() => ben.page.locator('video.call-remote').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    const v0 = (await stats(ben.page))!.videoIn.frames;
    await expect.poll(async () => (await stats(ben.page))!.videoIn.frames, { timeout: 8000 }).toBeGreaterThan(v0);

    // Kamera wechseln ist nur bei mehreren Kameras/Touch-Geräten sichtbar – mit der Fake-Kamera darf der Wechsel nichts zerstören
    if (await anna.page.getByRole('button', { name: 'Kamera wechseln' }).count()) {
      await anna.page.getByRole('button', { name: 'Kamera wechseln' }).click();
      await expect.poll(async () => (await tracks(anna.page))!.local.filter((t) => t.kind === 'video' && t.readyState === 'live').length).toBe(1);
    }

    await anna.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(overlay(ben.page, anna.name)).toBeHidden({ timeout: 8000 });
    await expect(overlay(anna.page, ben.name)).toBeHidden({ timeout: 8000 });
  });

  test('Ablehnen', async () => {
    await openChat(anna, 'Ben');
    await anna.page.getByRole('button', { name: 'Sprachanruf', exact: true }).click();
    await expect(incoming(ben.page)).toBeVisible({ timeout: 10_000 });
    await ben.page.getByRole('button', { name: 'Ablehnen' }).click();
    await expect(incoming(ben.page)).toBeHidden();
    await expect(anna.page.getByText('Ben hat den Anruf abgelehnt')).toBeVisible();
    await expect(anna.page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    await ben.page.goto('/calls');
    const row = ben.page.getByRole('list', { name: 'Anrufverlauf' }).getByRole('listitem').first();
    await expect(row).toContainText('Abgelehnt · Sprache');
    await expect(row).not.toHaveClass(/missed/);
  });

  test('Abbrechen: verpasster Anruf in der Liste und Badge', async () => {
    await ben.page.goto('/chats');
    await expect(ben.page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    await openChat(anna, 'Ben');
    await anna.page.getByRole('button', { name: 'Sprachanruf', exact: true }).click();
    await expect(incoming(ben.page)).toBeVisible({ timeout: 10_000 });
    await expect(overlay(anna.page, 'Ben').getByText('Klingelt…')).toBeVisible();
    await anna.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(incoming(ben.page)).toBeHidden({ timeout: 8000 });
    await expect(overlay(anna.page, 'Ben')).toBeHidden();
    // Badge an „Anrufe“
    await expect(ben.page.getByRole('link', { name: /^Anrufe/ }).getByLabel('1 neu')).toBeVisible();
    await ben.page.setViewportSize({ width: 390, height: 844 });
    await ben.page.getByRole('link', { name: /^Anrufe/ }).click();
    const row = ben.page.getByRole('list', { name: 'Anrufverlauf' }).getByRole('listitem').first();
    await expect(row).toHaveClass(/missed/);
    await expect(row).toContainText('Verpasst · Sprache');
    await expect(ben.page.getByRole('link', { name: /^Anrufe/ }).getByLabel(/neu/)).toHaveCount(0);
    await ben.page.screenshot({ path: 'e2e/shots/calls-list-mobile.png' });
    await ben.page.setViewportSize({ width: 1280, height: 800 });
    await ben.page.screenshot({ path: 'e2e/shots/calls-list-desktop.png' });
    // Rückruf aus der Liste
    await row.getByRole('button', { name: /per Sprachanruf zurückrufen/ }).click();
    await expect(incoming(anna.page)).toBeVisible({ timeout: 10_000 });
    await anna.page.getByRole('button', { name: 'Ablehnen' }).click();
    await expect(overlay(ben.page, 'Anna').or(ben.page.getByText('Anna hat den Anruf abgelehnt'))).toBeVisible();
    await expect(ben.page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    // Klick auf die Person führt zum Kontaktprofil
    await ben.page.getByRole('list', { name: 'Anrufverlauf' }).getByRole('listitem').first().getByRole('button', { name: /Kontakt öffnen/ }).click();
    await expect(ben.page).toHaveURL(new RegExp(`/contacts/${anna.id}$`));
  });

  test('Verlauf löschen mit Bestätigung', async () => {
    await ben.page.goto('/calls');
    await expect(ben.page.getByRole('list', { name: 'Anrufverlauf' })).toBeVisible();
    await ben.page.getByRole('button', { name: 'Verlauf löschen' }).click();
    await ben.page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(ben.page.getByRole('list', { name: 'Anrufverlauf' })).toBeVisible();
    await ben.page.getByRole('button', { name: 'Verlauf löschen' }).click();
    await ben.page.getByRole('dialog').getByRole('button', { name: 'Verlauf löschen' }).click();
    await expect(ben.page.getByText('Noch keine Anrufe')).toBeVisible();
  });

  test('WebSocket-Reconnect während des Anrufs sendet call.rejoin, Anruf bleibt bestehen', async () => {
    await establish(anna, ben, 'audio');
    const sent: string[] = [];
    const recv: string[] = [];
    anna.page.on('websocket', (ws) => {
      ws.on('framesent', (f) => sent.push(String(f.payload)));
      ws.on('framereceived', (f) => recv.push(String(f.payload)));
    });
    await anna.ctx.setOffline(true);
    await anna.page.waitForTimeout(1500);
    await anna.ctx.setOffline(false);
    await expect.poll(() => sent.some((s) => s.includes('call.rejoin')), { timeout: 30_000, message: 'call.rejoin wurde nicht gesendet' }).toBe(true);
    await expect.poll(() => recv.some((s) => s.includes('call.rejoined')), { timeout: 10_000 }).toBe(true);
    await expect(overlay(anna.page, ben.name).locator('.call-status time')).toBeVisible();
    await expectFlowing(anna.page, 'audioIn');
    await anna.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(overlay(ben.page, anna.name)).toBeHidden({ timeout: 8000 });
  });

  test('Mobile Screenshots (390x844): eingehend, Audio, Video', async () => {
    for (const u of [anna, ben]) await u.page.setViewportSize({ width: 390, height: 844 });
    await openChat(anna, 'Ben');
    await anna.page.getByRole('button', { name: 'Videoanruf', exact: true }).click();
    await expect(incoming(ben.page)).toBeVisible({ timeout: 10_000 });
    await ben.page.waitForTimeout(400);
    await ben.page.screenshot({ path: 'e2e/shots/calls-incoming-video-mobile.png' });
    await anna.page.waitForTimeout(400);
    await anna.page.screenshot({ path: 'e2e/shots/calls-ringing-video-mobile.png' });
    await ben.page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(overlay(ben.page, 'Anna').locator('.call-status time')).toBeVisible({ timeout: 30_000 });
    await expectFlowing(ben.page, 'videoIn');
    await expect.poll(() => ben.page.locator('video.call-remote').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await ben.page.waitForTimeout(500);
    await ben.page.screenshot({ path: 'e2e/shots/calls-active-video-mobile.png' });
    await anna.page.screenshot({ path: 'e2e/shots/calls-active-video-mobile-caller.png' });
    await ben.page.getByRole('button', { name: 'Anruf minimieren' }).click();
    await expect(ben.page.getByRole('region', { name: 'Laufender Anruf' })).toBeVisible();
    await ben.page.waitForTimeout(300);
    await ben.page.screenshot({ path: 'e2e/shots/calls-minimized-mobile.png' });
    await ben.page.getByRole('button', { name: 'Anruf wieder vergrößern' }).click();
    await ben.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(overlay(anna.page, 'Ben')).toBeHidden({ timeout: 8000 });

    await anna.page.getByRole('button', { name: 'Sprachanruf', exact: true }).click();
    await expect(incoming(ben.page)).toBeVisible({ timeout: 10_000 });
    await ben.page.waitForTimeout(400);
    await ben.page.screenshot({ path: 'e2e/shots/calls-incoming-audio-mobile.png' });
    await ben.page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(overlay(ben.page, 'Anna').locator('.call-status time')).toBeVisible({ timeout: 30_000 });
    await ben.page.waitForTimeout(700);
    await ben.page.screenshot({ path: 'e2e/shots/calls-active-audio-mobile.png' });
    await anna.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(overlay(ben.page, 'Anna')).toBeHidden({ timeout: 8000 });
    // Dunkles Farbschema: eingehender Anruf
    await ben.page.emulateMedia({ colorScheme: 'dark' });
    await anna.page.getByRole('button', { name: 'Sprachanruf', exact: true }).click();
    await expect(incoming(ben.page)).toBeVisible({ timeout: 10_000 });
    await ben.page.waitForTimeout(400);
    await ben.page.screenshot({ path: 'e2e/shots/calls-incoming-audio-mobile-dark.png' });
    await anna.page.getByRole('button', { name: 'Auflegen' }).click();
    await expect(incoming(ben.page)).toBeHidden({ timeout: 8000 });
    await ben.page.emulateMedia({ colorScheme: 'light' });
    for (const u of [anna, ben]) await u.page.setViewportSize({ width: 1280, height: 800 });
  });
});

test.describe('Verbindungsabbruch', () => {
  test.setTimeout(150_000);

  test('Tab wird geschlossen: Gegenseite wird sofort benachrichtigt', async ({ browser }) => {
    const carla = await signUp(browser, 'Carla');
    const dirk = await signUp(browser, 'Dirk');
    await connect(carla, dirk);
    await establish(carla, dirk, 'audio');
    await dirk.page.close({ runBeforeUnload: true });
    await expect(carla.page.getByText('Anruf beendet')).toBeVisible({ timeout: 10_000 });
    await expect(carla.page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    await carla.ctx.close(); await dirk.ctx.close();
  });

  test('Gegenseite stürzt ab (kein Auflegen): Wiederherstellen-Hinweis, danach beendet der Server den Anruf', async ({ browser }) => {
    const anna = await signUp(browser, 'Emil');
    const ben = await signUp(browser, 'Frieda');
    await connect(anna, ben);
    await establish(anna, ben, 'audio');
    await expectFlowing(anna.page, 'audioIn');
    // Renderer-Absturz: weder pagehide noch call.end – nur die Verbindungen reißen ab
    await ben.page.goto('chrome://crash').catch(() => {});
    await expect(overlay(anna.page, ben.name).getByText('Verbindung wird wiederhergestellt…')).toBeVisible({ timeout: 45_000 });
    await anna.page.screenshot({ path: 'e2e/shots/calls-reconnecting-desktop.png' });
    // Karenzzeit des Servers (30 s) läuft ab → Anruf wird beendet, Meldung erscheint
    await expect(anna.page.getByText('Verbindung verloren – der Anruf wurde beendet')).toBeVisible({ timeout: 60_000 });
    await expect(anna.page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
    await anna.ctx.close(); await ben.ctx.close();
  });
});
