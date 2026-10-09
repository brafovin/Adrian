import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface User { name: string; email: string; password: string; id?: string; ctx: BrowserContext; page: Page }
const PASSWORD = 'correct-horse-battery';
let n = 0;

/** Registriert über die Oberfläche, bestätigt per E-Mail-Link und meldet an. */
export async function signUp(browser: Browser, name: string): Promise<User> {
  const unique = `${name}${Date.now().toString(36)}${++n}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `${unique}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill(name);
  await page.getByLabel('Benutzername').fill(unique);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await expect(page.getByText('Fast geschafft!')).toBeVisible();
  const res = await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
  const mail = (await res.json()).mails.at(-1);
  const link = /http:\/\/[^\s]+verify-email\?token=[\w-]+/.exec(mail.text)![0];
  await page.goto(link);
  await expect(page.getByText('Deine E-Mail-Adresse ist bestätigt.')).toBeVisible();
  await page.getByRole('link', { name: 'Jetzt anmelden' }).click();
  await page.getByLabel('E-Mail oder @Benutzername').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  return { name, email: unique, password: PASSWORD, id: me.user.id, ctx, page };
}

/** Kontakt per API-Anfrage + Annahme (Oberfläche wird in eigenen Tests geprüft). */
export async function connect(a: User, b: User) {
  const origin = new URL(a.page.url()).origin;
  const r = await a.page.request.post('/api/contact-requests', { data: { userId: b.id }, headers: { origin } });
  expect(r.ok()).toBeTruthy();
  const inc = await (await b.page.request.get('/api/contact-requests')).json();
  const ok = await b.page.request.post(`/api/contact-requests/${inc.incoming[0].id}/accept`, { data: {}, headers: { origin } });
  expect(ok.ok()).toBeTruthy();
}
