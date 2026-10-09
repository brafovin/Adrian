import { expect, test, type Page } from '@playwright/test';
import { signUp, type User } from './helpers';

const origin = (u: User) => new URL(u.page.url()).origin;
const handle = (u: User) => u.email; // helpers.signUp legt den Benutzernamen im Feld `email` ab

/** Kontakt per API herstellen – nur als Vorbereitung für Tests, die nicht die Anfrage-Oberfläche prüfen. */
async function befriend(a: User, b: User) {
  const r = await a.page.request.post('/api/contact-requests', { data: { userId: b.id }, headers: { origin: origin(a) } });
  expect(r.ok()).toBeTruthy();
  const inc = await (await b.page.request.get('/api/contact-requests')).json();
  const ok = await b.page.request.post(`/api/contact-requests/${inc.incoming[0].id}/accept`, { data: {}, headers: { origin: origin(b) } });
  expect(ok.ok()).toBeTruthy();
}
async function requestViaApi(from: User, to: User) {
  const r = await from.page.request.post('/api/contact-requests', { data: { userId: to.id }, headers: { origin: origin(from) } });
  expect(r.ok()).toBeTruthy();
}

const navLink = (p: Page, name: string) => p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: new RegExp(`^${name}`) });
const tab = (p: Page, name: string) => p.getByRole('tab', { name: new RegExp(`^${name}`) });
async function openContacts(p: Page) {
  await navLink(p, 'Kontakte').click();
  await expect(p.getByRole('tablist', { name: 'Kontaktbereiche' })).toBeVisible();
}
async function search(p: Page, q: string) {
  await tab(p, 'Suchen').click();
  await p.getByRole('searchbox', { name: 'Personen suchen' }).fill(q);
}
const confirmButton = (p: Page, name: string) => p.getByRole('dialog').getByRole('button', { name, exact: true });

test.describe('Kontakte und Profil', () => {
  test('Suche per @Handle, Anfrage senden, live sehen, annehmen, schreiben', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Kontakt');
    const ben = await signUp(browser, 'Ben Kontakt');

    // Mindestlänge und Leerzustand
    await openContacts(anna.page);
    await expect(anna.page.getByText('Noch keine Kontakte')).toBeVisible();
    await anna.page.getByRole('button', { name: 'Personen suchen' }).click();
    await expect(tab(anna.page, 'Suchen')).toHaveAttribute('aria-selected', 'true');
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).fill('b');
    await expect(anna.page.getByText('Bitte mindestens 2 Zeichen eingeben.')).toBeVisible();

    // Suche per @Benutzername
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).fill(`@${handle(ben)}`);
    const row = anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByRole('listitem').filter({ hasText: 'Ben Kontakt' });
    await expect(row).toBeVisible();
    await expect(row.getByText(`@${handle(ben)}`)).toBeVisible();
    await row.getByRole('button', { name: 'Kontaktanfrage an Ben Kontakt senden' }).click();
    await expect(row.getByText('Angefragt')).toBeVisible();

    // Ben sieht die Anfrage live: Badge in der Navigation und im Tab
    await expect(ben.page.getByRole('navigation', { name: 'Hauptnavigation' }).getByLabel('1 neu')).toBeVisible();
    await openContacts(ben.page);
    await expect(tab(ben.page, 'Anfragen').getByLabel('1 eingehende Anfragen')).toBeVisible();
    await tab(ben.page, 'Anfragen').click();
    await expect(ben.page.getByText('Eingehend (1)')).toBeVisible();
    await expect(ben.page.getByRole('listitem').filter({ hasText: 'Anna Kontakt' })).toBeVisible();
    await ben.page.getByRole('button', { name: 'Anfrage von Anna Kontakt annehmen' }).click();
    await expect(ben.page.getByText('Keine offenen Anfragen')).toBeVisible();
    await expect(tab(ben.page, 'Anfragen').getByLabel('1 eingehende Anfragen')).toHaveCount(0);

    // Beide sehen sich unter „Kontakte“
    await tab(ben.page, 'Kontakte').click();
    await expect(ben.page.getByRole('listitem').filter({ hasText: 'Anna Kontakt' })).toBeVisible();
    await tab(anna.page, 'Kontakte').click();
    await expect(anna.page.getByRole('listitem').filter({ hasText: 'Ben Kontakt' })).toBeVisible();

    // Annas Suche zeigt nun „Chat“ statt „Anfragen“
    await tab(anna.page, 'Suchen').click();
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByRole('button', { name: 'Chat mit Ben Kontakt' })).toBeVisible();

    // Profil öffnen und „Schreiben“
    await tab(anna.page, 'Kontakte').click();
    await anna.page.getByRole('button', { name: 'Profil von Ben Kontakt öffnen' }).click();
    await expect(anna.page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
    const profile = anna.page.getByRole('region', { name: 'Profil' });
    await expect(profile.getByRole('heading', { name: 'Ben Kontakt', level: 2 })).toBeVisible();
    await expect(profile.getByText(`@${handle(ben)}`)).toBeVisible();
    await expect(profile.getByText('Kontakt', { exact: true })).toBeVisible();
    await profile.getByRole('button', { name: 'Schreiben' }).click();
    await expect(anna.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
    await expect(anna.page.getByRole('region', { name: /Chat mit Ben/ })).toBeVisible();

    // Schnellaktion „Chat“ in der Kontaktliste
    await openContacts(ben.page);
    await ben.page.getByRole('button', { name: 'Chat mit Anna Kontakt' }).click();
    await expect(ben.page.getByRole('region', { name: /Chat mit Anna/ })).toBeVisible();
  });

  test('Ablehnen und Zurückziehen', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Ablehnen');
    const ben = await signUp(browser, 'Ben Ablehnen');
    const cem = await signUp(browser, 'Cem Ablehnen');
    await requestViaApi(anna, ben);
    await requestViaApi(anna, cem);

    // Anna: beide Anfragen unter „Gesendet“
    await openContacts(anna.page);
    await tab(anna.page, 'Anfragen').click();
    await expect(anna.page.getByText('Gesendet (2)')).toBeVisible();

    // Ben lehnt ab → Annas Liste aktualisiert sich live
    await openContacts(ben.page);
    await tab(ben.page, 'Anfragen').click();
    await ben.page.getByRole('button', { name: 'Anfrage von Anna Ablehnen ablehnen' }).click();
    await expect(ben.page.getByText('Keine offenen Anfragen')).toBeVisible();
    await expect(anna.page.getByText('Gesendet (1)')).toBeVisible();

    // Anna zieht die Anfrage an Cem zurück → Cems Badge verschwindet
    await openContacts(cem.page);
    await expect(tab(cem.page, 'Anfragen').getByLabel('1 eingehende Anfragen')).toBeVisible();
    await anna.page.getByRole('button', { name: 'Anfrage an Cem Ablehnen zurückziehen' }).click();
    await expect(anna.page.getByText('Keine offenen Anfragen')).toBeVisible();
    await expect(tab(cem.page, 'Anfragen').getByLabel('1 eingehende Anfragen')).toHaveCount(0);
    await tab(cem.page, 'Anfragen').click();
    await expect(cem.page.getByText('Keine offenen Anfragen')).toBeVisible();

    // Nach Ablehnen/Zurückziehen kann erneut angefragt werden
    await search(anna.page, `@${handle(ben)}`);
    const row = anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByRole('listitem').filter({ hasText: 'Ben Ablehnen' });
    await expect(row.getByRole('button', { name: /Kontaktanfrage an Ben Ablehnen senden/ })).toBeVisible();
  });

  test('Profil: Anfrage vom Profil aus, Live-Aktualisierung, Entfernen', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Profil');
    const ben = await signUp(browser, 'Ben Profil');
    await ben.page.request.patch('/api/me', { data: { bio: 'Hallo, ich bin Ben und baue Fahrräder.' }, headers: { origin: origin(ben) } });

    // Profil per @Handle öffnen (Deep-Link)
    await anna.page.goto(`/contacts/@${handle(ben)}`);
    const profile = anna.page.getByRole('region', { name: 'Profil' });
    await expect(profile.getByRole('heading', { name: 'Ben Profil', level: 2 })).toBeVisible();
    await expect(profile.getByText('Hallo, ich bin Ben und baue Fahrräder.')).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Sprachanruf' })).toHaveCount(0); // kein Kontakt, Anrufe nur von Kontakten
    await expect(profile.getByRole('button', { name: 'Kontakt entfernen' })).toHaveCount(0);

    // Anfrage senden → „Anfrage zurückziehen“ → erneut senden
    await profile.getByRole('button', { name: 'Kontakt hinzufügen' }).click();
    await expect(profile.getByText('Anfrage gesendet – wartet auf Antwort')).toBeVisible();
    await profile.getByRole('button', { name: 'Anfrage zurückziehen' }).click();
    await expect(profile.getByRole('button', { name: 'Kontakt hinzufügen' })).toBeVisible();
    await profile.getByRole('button', { name: 'Kontakt hinzufügen' }).click();
    await expect(profile.getByText('Anfrage gesendet – wartet auf Antwort')).toBeVisible();

    // Ben hat Annas Profil offen und sieht die Anfrage live, ohne Neuladen
    await ben.page.goto(`/contacts/@${handle(anna)}`);
    const benProfile = ben.page.getByRole('region', { name: 'Profil' });
    await expect(benProfile.getByText('Anna Profil möchte dein Kontakt sein')).toBeVisible();
    await benProfile.getByRole('button', { name: 'Annehmen' }).click();

    // Beide Profile wechseln live zu „Kontakt“ mit Anrufbuttons
    await expect(benProfile.getByRole('button', { name: 'Sprachanruf' })).toBeVisible();
    await expect(benProfile.getByRole('button', { name: 'Videoanruf' })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Sprachanruf' })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Kontakt entfernen' })).toBeVisible();

    // Anna entfernt den Kontakt (mit Bestätigung)
    await profile.getByRole('button', { name: 'Kontakt entfernen' }).click();
    await confirmButton(anna.page, 'Abbrechen').click();
    await expect(profile.getByRole('button', { name: 'Kontakt entfernen' })).toBeVisible();
    await profile.getByRole('button', { name: 'Kontakt entfernen' }).click();
    await confirmButton(anna.page, 'Entfernen').click();
    await expect(profile.getByRole('button', { name: 'Kontakt hinzufügen' })).toBeVisible();
    // … und Ben sieht es live
    await expect(benProfile.getByRole('button', { name: 'Sprachanruf' })).toHaveCount(0);
    await expect(benProfile.getByRole('button', { name: 'Kontakt hinzufügen' })).toBeVisible();

    // Eigenes Profil
    await anna.page.goto(`/contacts/@${handle(anna)}`);
    await expect(anna.page.getByText('Das bist du.')).toBeVisible();
    await expect(anna.page.getByRole('link', { name: /Einstellungen/ })).toHaveAttribute('href', '/settings');
  });

  test('Profil-Link kopieren und Gemeinsame Gruppen', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Link');
    const ben = await signUp(browser, 'Ben Link');
    await befriend(anna, ben);
    await anna.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const g = await anna.page.request.post('/api/conversations/group', { data: { title: 'Radtouren', memberIds: [ben.id] }, headers: { origin: origin(anna) } });
    expect(g.ok()).toBeTruthy();
    const groupId = (await g.json()).conversation.id;

    await anna.page.goto(`/contacts/@${handle(ben)}`);
    const profile = anna.page.getByRole('region', { name: 'Profil' });
    await expect(profile.getByText('Gemeinsame Gruppen (1)')).toBeVisible();
    await profile.getByRole('button', { name: 'Profil-Link kopieren' }).click();
    await expect(anna.page.getByText('Profil-Link kopiert.')).toBeVisible();
    const clip = await anna.page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(`${origin(anna)}/contacts/@${handle(ben)}`);

    // Ben setzt „Gruppen“ auf privat → Abschnitt verschwindet beim Neuladen
    await profile.getByRole('button', { name: 'Radtouren' }).click();
    await expect(anna.page).toHaveURL(new RegExp(`/chats/${groupId}$`));
    await ben.page.request.patch('/api/me/privacy', { data: { groupsVis: 'nobody' }, headers: { origin: origin(ben) } });
    await anna.page.goto(`/contacts/@${handle(ben)}`);
    await expect(profile.getByRole('heading', { name: 'Ben Link', level: 2 })).toBeVisible();
    await expect(profile.getByText(/Gemeinsame Gruppen/)).toHaveCount(0);

    // Anrufe nur für Kontakte → „nobody“ blendet die Anrufbuttons aus
    await expect(profile.getByRole('button', { name: 'Sprachanruf' })).toBeVisible();
    await ben.page.request.patch('/api/me/privacy', { data: { callsFrom: 'nobody' }, headers: { origin: origin(ben) } });
    await anna.page.reload();
    await expect(profile.getByRole('button', { name: 'Schreiben' })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Sprachanruf' })).toHaveCount(0);
  });

  test('Blockieren: Gegenseite findet und sieht den Blockierenden nicht mehr; Entblocken', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Block');
    const ben = await signUp(browser, 'Ben Block');
    await befriend(anna, ben);

    await anna.page.goto(`/contacts/@${handle(ben)}`);
    const profile = anna.page.getByRole('region', { name: 'Profil' });
    await profile.getByRole('button', { name: 'Blockieren' }).click();
    await confirmButton(anna.page, 'Abbrechen').click();
    await expect(profile.getByRole('button', { name: 'Blockieren' })).toBeVisible();
    await profile.getByRole('button', { name: 'Blockieren' }).click();
    await confirmButton(anna.page, 'Blockieren').click();
    await expect(profile.getByText(/Du hast diese Person blockiert/)).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Entblocken' })).toBeVisible();

    // Ben: Kontakt weg, Suche leer, Profil nicht verfügbar
    await openContacts(ben.page);
    await expect(ben.page.getByText('Noch keine Kontakte')).toBeVisible();
    await search(ben.page, `@${handle(anna)}`);
    await expect(ben.page.getByText('Niemand gefunden')).toBeVisible();
    await ben.page.goto(`/contacts/@${handle(anna)}`);
    await expect(ben.page.getByText('Profil nicht verfügbar')).toBeVisible();

    // Anna sieht Ben auch nicht in der Suche, hat aber den Entblocken-Weg
    await openContacts(anna.page);
    await search(anna.page, `@${handle(ben)}`);
    await expect(anna.page.getByText('Niemand gefunden')).toBeVisible();

    await anna.page.goto(`/contacts/@${handle(ben)}`);
    await anna.page.getByRole('button', { name: 'Entblocken' }).click();
    await confirmButton(anna.page, 'Entblocken').click();
    await expect(anna.page.getByRole('region', { name: 'Profil' }).getByRole('button', { name: 'Kontakt hinzufügen' })).toBeVisible();

    // Danach finden sie sich wieder (Kontakt bleibt entfernt)
    await ben.page.goto('/contacts');
    await search(ben.page, `@${handle(anna)}`);
    await expect(ben.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Anna Block')).toBeVisible();
  });

  test('Melden', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Melden');
    const ben = await signUp(browser, 'Ben Melden');
    await anna.page.goto(`/contacts/@${handle(ben)}`);
    const profile = anna.page.getByRole('region', { name: 'Profil' });
    await profile.getByRole('button', { name: 'Melden' }).click();
    const dlg = anna.page.getByRole('dialog', { name: 'Ben Melden melden' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Melden', exact: true })).toBeDisabled();
    await dlg.getByRole('radio', { name: /Belästigung/ }).check();
    await dlg.getByLabel('Details (optional)').fill('Test-Meldung aus dem E2E-Test');
    const req = anna.page.waitForRequest((r) => r.url().endsWith('/api/reports') && r.method() === 'POST');
    await dlg.getByRole('button', { name: 'Melden', exact: true }).click();
    const body = (await req).postDataJSON();
    expect(body).toMatchObject({ userId: ben.id, reason: 'harassment', details: 'Test-Meldung aus dem E2E-Test' });
    await expect(anna.page.getByText('Meldung gesendet. Danke für deinen Hinweis.')).toBeVisible();
    await expect(dlg).toHaveCount(0);
  });

  test('Privatsphäre: nicht auffindbare Nutzer fehlen in der Suche; Rate-Limit und Fehler', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Privat');
    const ben = await signUp(browser, 'Ben Privat');

    await openContacts(anna.page);
    await search(anna.page, `@${handle(ben)}`);
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Ben Privat')).toBeVisible();

    const r = await ben.page.request.patch('/api/me/privacy', { data: { discoverable: false }, headers: { origin: origin(ben) } });
    expect(r.ok()).toBeTruthy();
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).fill(`@${handle(ben)} `);
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).press('Enter');
    await expect(anna.page.getByText('Niemand gefunden')).toBeVisible();
    await expect(anna.page.getByText(/Auffindbarkeit einschränken/)).toBeVisible();
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' })).toHaveCount(0);

    // Auch das Profil ist ohne Beziehung nicht erreichbar
    await anna.page.goto(`/contacts/@${handle(ben)}`);
    await expect(anna.page.getByText('Profil nicht verfügbar')).toBeVisible();

    // Anzeigename-Suche (Teilstring) findet auffindbare Nutzer
    await ben.page.request.patch('/api/me/privacy', { data: { discoverable: true }, headers: { origin: origin(ben) } });
    await anna.page.goto('/contacts');
    await search(anna.page, 'en Privat');
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Ben Privat')).toBeVisible();

    // 429 wird freundlich angezeigt, dann klappt „Erneut suchen“
    let limited = true;
    await anna.page.route('**/api/users/search*', (route) => {
      if (limited) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many' } }) });
      return route.continue();
    });
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).fill(`@${handle(ben)}`);
    await expect(anna.page.getByText(/Zu viele Suchanfragen/)).toBeVisible();
    limited = false;
    await anna.page.getByRole('button', { name: 'Erneut suchen' }).click();
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Ben Privat')).toBeVisible();
  });

  test('Person nimmt keine Anfragen an', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Zu');
    const ben = await signUp(browser, 'Ben Zu');
    await ben.page.request.patch('/api/me/privacy', { data: { contactRequests: 'nobody' }, headers: { origin: origin(ben) } });

    await openContacts(anna.page);
    await search(anna.page, `@${handle(ben)}`);
    const row = anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByRole('listitem').filter({ hasText: 'Ben Zu' });
    await expect(row.getByText('Keine Anfragen')).toBeVisible();
    await expect(row.getByRole('button', { name: /Kontaktanfrage/ })).toHaveCount(0);
    await row.getByRole('button', { name: 'Profil von Ben Zu öffnen' }).click();
    await expect(anna.page.getByText('Diese Person nimmt keine Kontaktanfragen an.')).toBeVisible();
    await expect(anna.page.getByRole('button', { name: 'Kontakt hinzufügen' })).toHaveCount(0);
  });

  test('Eingehende Anfrage in der Suche annehmen', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Such');
    const ben = await signUp(browser, 'Ben Such');
    await requestViaApi(ben, anna);
    await openContacts(anna.page);
    await search(anna.page, 'Ben Such');
    const row = anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByRole('listitem').filter({ hasText: 'Ben Such' });
    await expect(row.getByRole('button', { name: 'Anfrage von Ben Such annehmen' })).toBeVisible();
    await row.getByRole('button', { name: 'Anfrage von Ben Such annehmen' }).click();
    await expect(row.getByRole('button', { name: 'Chat mit Ben Such' })).toBeVisible();
  });

  test('Barrierefreiheit: Tabs per Tastatur', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Tastatur');
    await openContacts(anna.page);
    await tab(anna.page, 'Kontakte').focus();
    await anna.page.keyboard.press('ArrowRight');
    await expect(tab(anna.page, 'Anfragen')).toBeFocused();
    await expect(tab(anna.page, 'Anfragen')).toHaveAttribute('aria-selected', 'true');
    await anna.page.keyboard.press('ArrowRight');
    await expect(tab(anna.page, 'Suchen')).toHaveAttribute('aria-selected', 'true');
    await expect(anna.page.getByRole('tabpanel')).toBeVisible();
    await anna.page.keyboard.press('Home');
    await expect(tab(anna.page, 'Kontakte')).toHaveAttribute('aria-selected', 'true');
  });

  test('Screenshots Desktop und Handy', async ({ browser }) => {
    const anna = await signUp(browser, 'Anna Shots');
    const ben = await signUp(browser, 'Ben Shots');
    const cem = await signUp(browser, 'Cem Shots');
    const dora = await signUp(browser, 'Dora Shots');
    await ben.page.request.patch('/api/me', { data: { bio: 'Fahrradbauer, Kaffee-Fan und leidenschaftlicher Wanderer.' }, headers: { origin: origin(ben) } });
    await befriend(anna, ben);
    await befriend(anna, cem);
    await requestViaApi(dora, anna);
    const ev = await signUp(browser, 'Eva Shots');
    await requestViaApi(anna, ev);
    await anna.page.request.post('/api/conversations/group', { data: { title: 'Radtouren', memberIds: [ben.id] }, headers: { origin: origin(anna) } });

    const shot = (p: Page, n: string) => p.screenshot({ path: `e2e/shots/contacts-${n}.png` });

    // Desktop
    await anna.page.setViewportSize({ width: 1280, height: 800 });
    await anna.page.goto('/contacts');
    await expect(anna.page.getByRole('listitem').filter({ hasText: 'Ben Shots' })).toBeVisible();
    await shot(anna.page, 'desktop-liste');
    await tab(anna.page, 'Anfragen').click();
    await expect(anna.page.getByText('Eingehend (1)')).toBeVisible();
    await shot(anna.page, 'desktop-anfragen');
    await search(anna.page, 'shots');
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Dora Shots')).toBeVisible();
    await shot(anna.page, 'desktop-suche');
    await tab(anna.page, 'Kontakte').click();
    await anna.page.getByRole('button', { name: 'Profil von Ben Shots öffnen' }).click();
    await expect(anna.page.getByText('Gemeinsame Gruppen (1)')).toBeVisible();
    await shot(anna.page, 'desktop-profil');

    // Handy
    await anna.page.setViewportSize({ width: 390, height: 844 });
    await anna.page.goto('/contacts');
    await expect(anna.page.getByRole('listitem').filter({ hasText: 'Ben Shots' })).toBeVisible();
    await shot(anna.page, 'mobil-liste');
    await tab(anna.page, 'Anfragen').click();
    await expect(anna.page.getByText('Eingehend (1)')).toBeVisible();
    await shot(anna.page, 'mobil-anfragen');
    await search(anna.page, 'shots');
    await expect(anna.page.getByRole('list', { name: 'Suchergebnisse' }).getByText('Dora Shots')).toBeVisible();
    await shot(anna.page, 'mobil-suche');
    await anna.page.getByRole('searchbox', { name: 'Personen suchen' }).fill('zzzzqq');
    await expect(anna.page.getByText('Niemand gefunden')).toBeVisible();
    await shot(anna.page, 'mobil-suche-leer');
    await anna.page.goto(`/contacts/@${handle(ben)}`);
    await expect(anna.page.getByText('Gemeinsame Gruppen (1)')).toBeVisible();
    await shot(anna.page, 'mobil-profil');
    await anna.page.getByRole('button', { name: 'Zurück zu den Kontakten' }).click();
    await expect(anna.page).toHaveURL(/\/contacts$/);
    await anna.page.goto(`/contacts/@${handle(dora)}`);
    await expect(anna.page.getByRole('button', { name: 'Annehmen' })).toBeVisible();
    await shot(anna.page, 'mobil-profil-anfrage');
    await anna.page.getByRole('button', { name: 'Melden' }).click();
    await expect(anna.page.getByRole('dialog', { name: 'Dora Shots melden' })).toBeVisible();
    await anna.page.waitForTimeout(500);
    await shot(anna.page, 'mobil-melden');
  });
});
