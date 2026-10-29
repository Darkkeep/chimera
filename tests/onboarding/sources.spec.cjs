const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('source intake persists all four inputs and distinguishes a link from page text', async ({ page, request }, testInfo) => {
  const response = await request.post('/api/projects', { data: { title: `Sources ${testInfo.project.name}` } });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Switch project', exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Sources', exact: true });
  await dialog.getByLabel('Source document', { exact: true }).setInputFiles({ name: 'procedure.txt', mimeType: 'text/plain', buffer: Buffer.from('Document procedure evidence.') });
  await dialog.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved procedure.txt');
  await dialog.getByRole('button', { name: /^Pasted text/ }).click();
  await dialog.getByLabel('Source title', { exact: true }).fill('Workshop notes');
  await dialog.getByLabel('Source text', { exact: true }).fill('Inspection precedes operation.');
  await dialog.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved Workshop notes');
  await dialog.getByRole('button', { name: /^Web pages and links/ }).click();
  await dialog.getByLabel('Source title', { exact: true }).fill('Policy bookmark');
  await dialog.getByLabel('Page URL', { exact: true }).fill('https://example.com/policy');
  await dialog.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('no usable text yet');
  await dialog.getByText('Policy bookmark · web · 0 passages', { exact: true }).click();
  await expect(dialog.getByText(/Link saved only/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Pythia conversations and outputs/ }).click();
  await dialog.getByLabel('Source title', { exact: true }).fill('Pythia planning excerpt');
  await dialog.getByLabel('Conversation or output text', { exact: true }).fill('User: Build a lesson.\nPythia: Start with an observable objective.');
  await dialog.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved Pythia planning excerpt');
  expect((await new AxeBuilder({ page }).include('.sources-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sources-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close sources', exact: true }).click();
  await page.reload();
  // The top Storyboard Source step opens saved sources and supports adding more.
  await page.getByRole('button', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: '01 Source', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sources', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Saved sources · 4', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Source document', { exact: true })).toBeEnabled();
  const saved = await (await request.get(`/api/projects/${project.id}/reference-resources`)).json();
  expect(saved.map(source => source.versions[0].sourceKind)).toEqual(['document', 'text', 'web', 'pythia']);
  expect(saved[2].versions[0].passages).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('sources-mobile.png'), fullPage: true });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Pythia settings verifies and saves a local Engine address', async ({ page }) => {
  let connected = false;
  await page.route('**/api/intelligence-engine', route => route.fulfill({ json: { available: true, canViewUsage: true, endpoint: connected ? 'http://127.0.0.1:8010' : 'http://127.0.0.1:8001', health: { status: 'ok', version: 'test' }, capabilities: {}, providerRegistry: {}, telemetry: {} } }));
  await page.route('**/api/intelligence-engine/local-connection', route => {
    expect(route.request().postDataJSON()).toEqual({ baseUrl: 'http://127.0.0.1:8010' });
    connected = true;
    return route.fulfill({ json: { available: true, endpoint: 'http://127.0.0.1:8010' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#workspace-settings').getByRole('button', { name: 'Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pythia', exact: true });
  const address = dialog.getByLabel('Local Pythia Engine address');
  await expect(address).toBeEnabled();
  await address.fill('http://127.0.0.1:8010');
  await dialog.getByRole('button', { name: 'Connect local Pythia', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'verified and connection saved' })).toBeVisible();
  await expect(address).toHaveValue('http://127.0.0.1:8010');
});
