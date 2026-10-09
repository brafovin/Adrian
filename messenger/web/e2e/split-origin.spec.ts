import { expect, test } from '@playwright/test';
import { connect, signUp } from './helpers';

// Beweist die Vercel-Architektur: Registrierung/Login über den statischen Host (ohne 405) und Echtzeit per WebSocket-Ticket.
test('statischer Host + separates Backend: Registrierung, Login und Echtzeit-Chat', async ({ browser, request }) => {
  // Ein reiner statischer Host lehnt POST ab – genau das war der 405-Fehler; /api wird hier jedoch weitergeleitet
  expect((await request.post('/', { data: {} })).status()).toBe(405);
  expect((await request.get('/api/health')).ok()).toBe(true);

  const anna = await signUp(browser, 'Anna');
  const ben = await signUp(browser, 'Ben');
  await connect(anna, ben);
  await anna.page.getByRole('button', { name: 'Neuer Chat' }).click();
  await anna.page.getByRole('dialog').getByRole('button', { name: /Ben/ }).first().click();
  const box = anna.page.getByRole('textbox', { name: 'Nachricht schreiben' });
  await box.fill('Hallo über zwei Ursprünge');
  await box.press('Enter');
  await ben.page.goto('/chats');
  await expect(ben.page.getByText('Hallo über zwei Ursprünge').first()).toBeVisible();
  await ben.page.getByRole('button', { name: /Anna/ }).first().click();
  const b = ben.page.getByRole('textbox', { name: 'Nachricht schreiben' });
  await b.fill('Antwort live');
  await b.press('Enter');
  // Live-Zustellung kommt über den WebSocket (Ticket-Anmeldung, kein Cookie)
  await expect(anna.page.locator('.msgs').getByText('Antwort live')).toBeVisible();
  await expect(anna.page.locator('.bubble', { hasText: 'Hallo über zwei Ursprünge' }).locator('.foot .read')).toBeVisible();
});

test('ohne Backend: verständliche Fehlermeldung statt „405“', async ({ page }) => {
  await page.route('**/api/auth/register', (route) => route.fulfill({ status: 405, contentType: 'text/plain', body: 'Method Not Allowed' }));
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test');
  await page.getByLabel('Benutzername').fill('testuser99');
  await page.getByLabel('E-Mail').fill('t@example.test');
  await page.getByLabel('Passwort', { exact: true }).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await expect(page.getByRole('alert')).toContainText('Backend fehlt oder ist falsch eingebunden');
});
