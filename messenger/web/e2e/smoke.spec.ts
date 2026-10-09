import { expect, test } from '@playwright/test';
import { connect, signUp } from './helpers';

test('zwei Benutzer chatten in Echtzeit', async ({ browser }) => {
  const anna = await signUp(browser, 'Anna');
  const ben = await signUp(browser, 'Ben');
  await connect(anna, ben);

  await anna.page.screenshot({ path: 'e2e/shots/01-anna-empty.png' });
  // Anna startet den Chat über „Neuer Chat“
  await anna.page.getByRole('button', { name: 'Neuer Chat' }).click();
  await anna.page.getByRole('button', { name: /Ben/ }).first().click();
  await expect(anna.page.getByRole('region', { name: /Chat mit Ben/ })).toBeVisible();
  const box = anna.page.getByRole('textbox', { name: 'Nachricht schreiben' });
  await box.fill('Hallo Ben, das ist ein echter Test 👋');
  await box.press('Enter');
  await expect(anna.page.locator('.msgs').getByText('Hallo Ben, das ist ein echter Test 👋')).toBeVisible();

  // Ben sieht die Nachricht live in der Chatliste
  await ben.page.goto('/chats');
  await expect(ben.page.getByText('Hallo Ben, das ist ein echter Test 👋').first()).toBeVisible();
  await ben.page.getByRole('button', { name: /Anna/ }).first().click();
  const bbox = ben.page.getByRole('textbox', { name: 'Nachricht schreiben' });
  await bbox.fill('Hi Anna, angekommen!');
  await bbox.press('Enter');
  await expect(anna.page.locator('.msgs').getByText('Hi Anna, angekommen!')).toBeVisible();
  await anna.page.screenshot({ path: 'e2e/shots/02-anna-chat.png' });
  await ben.page.screenshot({ path: 'e2e/shots/03-ben-chat.png' });
});
