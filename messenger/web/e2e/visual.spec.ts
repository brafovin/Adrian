import { expect, test } from '@playwright/test';
import { connect, signUp } from './helpers';

// Erzeugt Screenshots der Kernansichten (Hell/Dunkel, Mobil/Desktop) zur visuellen Kontrolle.
test('Screenshots der Kernansichten', async ({ browser }) => {
  const a = await signUp(browser, 'Alice');
  const b = await signUp(browser, 'Bob');
  await connect(a, b);
  const origin = new URL(a.page.url()).origin;
  const conv = (await (await a.page.request.post('/api/conversations/direct', { data: { userId: b.id }, headers: { origin } })).json()).conversation.id;
  for (const t of ['Hallo Bob!', 'Wie geht es dir? 😊', 'Hast du die Bilder von gestern gesehen? Ich finde sie richtig gut geworden.']) {
    await a.page.request.post(`/api/conversations/${conv}/messages`, { data: { clientMsgId: `seed-${Math.random().toString(16).slice(2)}-x`, body: t }, headers: { origin } });
  }
  await b.page.request.post(`/api/conversations/${conv}/messages`, { data: { clientMsgId: `seed-${Math.random().toString(16).slice(2)}-y`, body: 'Alles gut, danke! Und selbst?' }, headers: { origin } });
  await a.page.request.post('/api/conversations/group', { data: { title: 'Familie', memberIds: [b.id] }, headers: { origin } });
  await a.page.goto('/chats/' + conv);
  await expect(a.page.getByText('Alles gut, danke!').first()).toBeVisible();
  await a.page.screenshot({ path: 'e2e/shots/v-desktop-light.png' });
  await a.page.getByRole('button', { name: /Info öffnen/ }).click();
  await a.page.screenshot({ path: 'e2e/shots/v-info-direct.png' });
  await a.page.keyboard.press('Escape');
  await a.page.emulateMedia({ colorScheme: 'dark' });
  await a.page.screenshot({ path: 'e2e/shots/v-desktop-dark.png' });
  await a.page.getByRole('button', { name: 'Neue Gruppe' }).click();
  await a.page.screenshot({ path: 'e2e/shots/v-new-group.png' });
  await a.page.keyboard.press('Escape');
  await a.page.getByRole('button', { name: /^Familie/ }).click();
  await a.page.getByRole('button', { name: /Familie – Info öffnen/ }).click();
  await a.page.screenshot({ path: 'e2e/shots/v-info-group.png' });
  await a.page.close();
  const m = await a.ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto('/login');
  await m.screenshot({ path: 'e2e/shots/v-mobile-start.png' });
});

test('Anmeldeseiten', async ({ page }) => {
  await page.goto('/login');
  await page.screenshot({ path: 'e2e/shots/v-login.png' });
  await page.goto('/register');
  await page.screenshot({ path: 'e2e/shots/v-register.png' });
});
