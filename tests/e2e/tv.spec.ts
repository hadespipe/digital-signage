import { test, expect } from '@playwright/test';
const tv = 'http://127.0.0.1:3188';
test.beforeEach(async ({ request }) => {
  await request.post('/api/auth/login', { headers: { Origin: 'http://127.0.0.1:3187' }, data: { password: 'test-password' } });
  const session = await (await request.get('/api/auth/session')).json();
  const playlist = await (await request.get('/api/playlist')).json();
  for (const image of playlist.images) await request.delete(image.path, { headers: { Origin: 'http://127.0.0.1:3187', 'X-CSRF-Token': session.csrfToken } });
});
async function setup(page: import('@playwright/test').Page, token = 'tv-e2e-token') {
  await page.goto(tv);
  await page.getByLabel('Server URL').fill('http://127.0.0.1:3187');
  await page.getByLabel('TV token').fill(token);
  await page.getByLabel('Allow HTTP for LAN testing only').check();
  await page.getByRole('button', { name: 'Save and play' }).click();
}
test('remote navigation, persisted settings and long OK/Back', async ({ page }) => {
  await page.goto(tv);
  await expect(page.getByLabel('Server URL')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('TV token')).toBeFocused();
  await page.getByLabel('Server URL').fill('http://127.0.0.1:3187');
  await page.getByLabel('TV token').fill('tv-e2e-token');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Allow HTTP for LAN testing only')).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Please upload', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.getByText('Please upload', { exact: true })).toBeVisible();
  await page.keyboard.down('Enter'); await page.waitForTimeout(1600); await page.keyboard.up('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('TV token')).toHaveAttribute('type', 'password');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true })));
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('TV token')).not.toBeFocused();
});
test('invalid URL, production HTTP and rejected token recover in settings', async ({ page }) => {
  await page.goto(tv);
  await page.getByLabel('Server URL').fill('nonsense');
  await page.getByLabel('TV token').fill('secret-rejected');
  await page.getByRole('button', { name: 'Save and play' }).click();
  await expect(page.getByRole('alert')).toContainText('valid');
  await page.getByLabel('Server URL').fill('http://127.0.0.1:3187');
  await page.getByRole('button', { name: 'Save and play' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS');
  await page.getByLabel('Allow HTTP for LAN testing only').check();
  await page.getByRole('button', { name: 'Save and play' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('connection and TV token');
  await expect(page.getByRole('alert')).not.toContainText('secret-rejected');
  await page.getByLabel('TV token').fill('tv-e2e-token');
  await page.getByRole('button', { name: 'Save and play' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
test('storage failures are recoverable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw Error('private'); }; });
  await setup(page);
  await expect(page.getByRole('alert')).toContainText('storage');
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('changing settings stops pending old downloads', async ({ page }) => {
  await setup(page);
  await page.route('**/api/playlist', route => route.fulfill({ json: { version: 50, images: [{ id: 'pending', path: '/api/images/pending' }] } }));
  let requested = false, aborted = false;
  page.on('requestfailed', request => { if (request.url().endsWith('/api/images/pending')) aborted = true; });
  await page.route('**/api/images/pending', async route => { requested = true; await new Promise(resolve => setTimeout(resolve, 3000)); await route.abort().catch(() => {}); });
  await expect.poll(() => requested, { timeout: 8000 }).toBe(true);
  await page.keyboard.down('Enter'); await page.waitForTimeout(1600); await page.keyboard.up('Enter');
  await page.unroute('**/api/playlist');
  await page.getByLabel('TV token').fill('wrong-new-token');
  await page.getByRole('button', { name: 'Save and play' }).click();
  await expect(page.getByRole('alert')).toContainText('connection and TV token');
  await expect.poll(() => aborted).toBe(true);
  await expect(page.getByRole('img')).toBeHidden();
});

test('rejected saved credentials reopen recoverable settings on initial load', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('digital-signage-settings', JSON.stringify({ serverUrl: 'http://127.0.0.1:3187', token: 'invalid-saved-token', allowLanHttp: true })));
  await page.goto(tv);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('connection and TV token');
  await expect(page.getByRole('alert')).not.toContainText('invalid-saved-token');
});
