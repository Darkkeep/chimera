const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function setup(page, options = {}) {
  let status = { configured: false, keyConfigured: false, storageAvailable: true, credentialError: false, canManage: true, revision: 'unconfigured', source: 'none', provider: 'openai', textModel: 'gpt-4.1-mini', textModels: ['gpt-4.1-mini'], imageModel: 'gpt-image-1', audioModel: 'gpt-4o-mini-tts', imageModels: ['gpt-image-1', 'gpt-image-2'], audioModels: ['gpt-4o-mini-tts', 'tts-1'], maxRequestsPerDay: 20, maxConcurrentRequests: 1, ...options };
  const actions = [];
  await page.route('**/api/ai-connection**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    const data = route.request().postDataJSON();
    actions.push({ path, data });
    if (path.endsWith('/test')) return route.fulfill({ json: { connected: true, message: 'Connection verified.' } });
    if (path.endsWith('/disconnect')) status = { ...status, configured: false, keyConfigured: false, revision: 'disconnected' };
    else {
      if (options.failSave) return route.fulfill({ status: 503, json: { detail: 'AI settings could not be saved securely.' } });
      const { apiKey, expectedRevision, ...settings } = data;
      status = { ...status, ...settings, configured: true, keyConfigured: true, revision: 'saved', source: 'saved' };
    }
    return route.fulfill({ json: status });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'AI connection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'AI connection' })).toBeVisible();
  await expect(page.locator('.ai-connection-status > div').filter({ hasText: 'Media provider' })).toContainText('Not configured');
  return actions;
}

test('admin can save a write-only key, explicitly test and disconnect', async ({ page }) => {
  const actions = await setup(page);
  const dialog = page.getByRole('dialog', { name: 'AI connection' });
  await dialog.getByLabel('API key', { exact: true }).fill('test-only-not-a-real-key');
  await dialog.getByRole('combobox', { name: 'Image model', exact: true }).selectOption('gpt-image-2');
  await dialog.getByRole('combobox', { name: 'Audio model', exact: true }).selectOption('tts-1');
  await dialog.getByLabel('Daily request limit', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Save media settings', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Media provider settings saved.');
  await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('');
  expect(actions).toHaveLength(1);
  expect(actions[0].data.provider).toBe('openai');
  expect(actions[0].data.imageModel).toBe('gpt-image-2');
  expect(actions[0].data.audioModel).toBe('tts-1');
  expect(dialog.getByRole('combobox', { name: /^Text model/ })).toHaveCount(0);
  expect(actions[0].data.maxRequestsPerDay).toBe(10);
  expect(actions[0].data).not.toHaveProperty('baseUrl');
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(persisted).not.toContain('test-only-not-a-real-key');
  await dialog.getByRole('button', { name: 'Test provider', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Connection verified.');
  page.once('dialog', dialog => dialog.accept());
  await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Media provider disconnected.');
  expect(actions).toHaveLength(3);
});

test('non-admin sees connection status without editable settings', async ({ page }) => {
  await setup(page, { canManage: false });
  await expect(page.getByText('Only installation administrators can change media provider settings.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save media settings' })).toHaveCount(0);
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
});

test('missing secure storage disables saving without exposing a plaintext fallback', async ({ page }) => {
  await setup(page, { storageAvailable: false });
  await expect(page.getByLabel('API key', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save media settings', exact: true })).toBeDisabled();
  await expect(page.getByText(/Secure credential storage is unavailable/)).toBeVisible();
});

test('failed saves clear the key and report a safe error', async ({ page }) => {
  await setup(page, { failSave: true });
  await page.getByLabel('API key', { exact: true }).fill('test-only-not-a-real-key');
  await page.getByRole('button', { name: 'Save media settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved securely');
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
});

for (const theme of ['light', 'dark']) {
  test(`AI connection dialog fits ${theme} desktop/mobile and is accessible`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('chimera.appearance', value), theme);
    await setup(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('.ai-connection-dialog').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `test-results/ai-connection-${theme}-${width}.png`, fullPage: true });
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'AI connection' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI connection', exact: true })).toBeFocused();
  });
}