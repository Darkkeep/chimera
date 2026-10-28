const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function openConnections(page, options = {}, provider = 'ElevenLabs') {
  let collection = { revision: 'r0', canManage: true, storageAvailable: true, connections: [], legacyConfigured: false, ...options };
  const actions = [];
  await page.route('**/api/ai-connection', route => route.fulfill({ json: {
    configured: false, keyConfigured: false, storageAvailable: true, credentialError: false, canManage: true,
    revision: 'legacy', source: 'none', provider: 'openai', textModel: 'gpt-4.1-mini', textModels: ['gpt-4.1-mini'],
    imageModel: 'gpt-image-1', imageModels: ['gpt-image-1'], audioModel: 'gpt-4o-mini-tts', audioModels: ['gpt-4o-mini-tts'],
    maxRequestsPerDay: 20, maxConcurrentRequests: 1,
  } }));
  await page.route('**/api/narration-connections**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: collection });
    const path = new URL(route.request().url()).pathname;
    const data = route.request().postDataJSON();
    actions.push({ path, data });
    if (options.failSave) return route.fulfill({ status: 503, json: { detail: 'Narration credentials could not be saved securely.' } });
    if (path.endsWith('/test')) return route.fulfill({ json: {
      connected: true, message: 'Discovery succeeded; only the first 100 voices were requested.', has_more: true, voices: [{ id: 'discovered-voice', name: 'Discovered voice', language: 'en-US' }],
      models: [{ id: 'discovered-model', name: 'Discovered model' }],
    } });
    if (path.endsWith('/disconnect')) collection = { ...collection, revision: 'disconnected', connections: [] };
    else {
      const { apiKey, expectedRevision, ...settings } = data;
      const saved = { ...settings, id: data.id || 'stable-narration-id', configured: true, credentialError: false };
      collection = { ...collection, revision: 'saved', connections: [...collection.connections.filter(item => item.id !== saved.id), saved] };
    }
    return route.fulfill({ json: collection });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'AI connection', exact: true }).click();
  await page.getByRole('tab', { name: provider, exact: true }).click();
  const section = page.getByRole('region', { name: ['Synthesia', 'Shotstack'].includes(provider) ? 'Video connections' : 'Narration connections', exact: true });
  await expect(section).toBeVisible();
  if (collection.canManage) await expect(section.getByLabel('Connection name', { exact: true })).toBeVisible();
  return { section, actions };
}

test('ElevenLabs stores a write-only key, discovers choices, and confirms disconnect', async ({ page }) => {
  const { section, actions } = await openConnections(page);
  await section.getByLabel('Connection name', { exact: true }).fill('Course narrator');
  await section.getByLabel('ElevenLabs API key', { exact: true }).fill('fixture-secret-not-real');
  await expect(section.getByRole('button', { name: 'Save narration connection', exact: true })).toBeEnabled();
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Narration connection saved.');
  expect(actions[0].data).toEqual({
    expectedRevision: 'r0', name: 'Course narrator', provider: 'elevenlabs', credentialSource: 'secure-store',
    apiKey: 'fixture-secret-not-real', voice: '', model: 'eleven_multilingual_v2', language: 'en-US', projectId: '',
  });
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveValue('');
  await expect(section.getByRole('combobox', { name: 'Saved narration connection', exact: true })).toHaveValue('stable-narration-id');
  expect(await section.textContent()).not.toContain('fixture-secret-not-real');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('fixture-secret-not-real');
  await section.getByRole('button', { name: 'Test narration connection', exact: true }).click();
  await expect(section.getByText('Discovered voices and models', { exact: true })).toBeVisible();
  await expect(section.getByRole('status')).toContainText('Discovery succeeded; only the first 100 voices were requested.');
  await expect(section.getByRole('status')).toContainText('more voices are available');
  await expect(section.getByRole('status')).toContainText('does not generate audio or prove synthesis access');
  expect(actions[1]).toEqual({ path: '/api/narration-connections/stable-narration-id/test', data: { expectedRevision: 'saved' } });
  await section.getByLabel('Narration voice', { exact: true }).fill('discovered-voice');
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Narration connection saved.');
  expect(actions[2].data.id).toBe('stable-narration-id');
  expect(actions[2].data.voice).toBe('discovered-voice');
  expect(actions[2].data).not.toHaveProperty('apiKey');
  page.once('dialog', dialog => dialog.dismiss());
  await section.getByRole('button', { name: 'Disconnect narration connection', exact: true }).click();
  expect(actions).toHaveLength(3);
  page.once('dialog', dialog => dialog.accept());
  await section.getByRole('button', { name: 'Disconnect narration connection', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Narration connection disconnected.');
  expect(actions[3].data).toEqual({ expectedRevision: 'saved' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('Google uses ADC only and optional quota project without a key', async ({ page }) => {
  const { section, actions } = await openConnections(page);
  await section.getByLabel('ElevenLabs API key', { exact: true }).fill('discard-this-fixture-key');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('tab', { name: 'Google Cloud', exact: true }).click();
  await expect(section.getByRole('combobox', { name: 'Credential source', exact: true }).locator('option')).toHaveCount(1);
  await expect(section.getByRole('combobox', { name: 'Credential source', exact: true })).toHaveValue('adc');
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveCount(0);
  await expect(section.getByLabel('Narration model', { exact: true })).toHaveCount(0);
  await section.getByLabel('Connection name', { exact: true }).fill('Google narrator');
  await section.getByLabel('Narration voice', { exact: true }).fill('en-US-Neural2-A');
  await section.getByLabel('Project / quota project ID (optional)', { exact: true }).fill('quota-project');
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Narration connection saved.');
  expect(actions[0].data).toEqual({
    expectedRevision: 'r0', name: 'Google narrator', provider: 'google-cloud', credentialSource: 'adc',
    voice: 'en-US-Neural2-A', model: '', language: 'en-US', projectId: 'quota-project',
  });
});

test('Cartesia saves and discovers without retaining its key', async ({ page }) => {
  const { section, actions } = await openConnections(page, {}, 'Cartesia');
  await section.getByLabel('Connection name', { exact: true }).fill('Cartesia narrator');
  await section.getByLabel('Cartesia API key', { exact: true }).fill('cartesia-fixture-only');
  await expect(section.getByLabel('Narration model', { exact: true })).toHaveValue('sonic-3.6');
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Narration connection saved.');
  expect(actions[0].data.provider).toBe('cartesia');
  expect(actions[0].data.apiKey).toBe('cartesia-fixture-only');
  await expect(section.getByLabel('Cartesia API key', { exact: true })).toHaveValue('');
  await section.getByRole('button', { name: 'Test narration connection', exact: true }).click();
  await expect(section.getByText('Discovered voices and models', { exact: true })).toBeVisible();
  expect(actions[1].path).toMatch(/\/test$/);
});

for (const provider of ['Synthesia', 'Shotstack']) {
  test(`${provider} connection setup is explicitly video-only and uses safe credentials`, async ({ page }) => {
    const { section, actions } = await openConnections(page, {}, provider);
    await expect(section.getByText(/Video generation is not yet available/)).toBeVisible();
    await expect(section.getByLabel('Narration voice', { exact: true })).toHaveCount(0);
    await section.getByLabel('Connection name', { exact: true }).fill(`${provider} video`);
    await section.getByRole('combobox', { name: 'Credential source', exact: true }).selectOption('environment');
    const variable = provider === 'Synthesia' ? 'SYNTHESIA_API_KEY' : 'SHOTSTACK_SANDBOX_API_KEY';
    await expect(section.getByRole('combobox', { name: 'Credential source', exact: true })).toContainText(variable);
    if (provider === 'Shotstack') {
      await section.getByRole('combobox', { name: 'Shotstack environment', exact: true }).selectOption('v1');
      await expect(section.getByRole('combobox', { name: 'Credential source', exact: true })).toContainText('SHOTSTACK_PRODUCTION_API_KEY');
    }
    await section.getByRole('button', { name: 'Save video connection', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Video connection saved.');
    expect(actions[0].data.provider).toBe(provider.toLowerCase());
    expect(actions[0].data).not.toHaveProperty('apiKey');
    expect(actions[0].data.voice).toBe('');
    expect(actions[0].data.model).toBe('');
    if (provider === 'Shotstack') expect(actions[0].data.environment).toBe('v1');
    await section.getByRole('button', { name: 'Test video connection', exact: true }).click();
    expect(actions[1].path).toMatch(/\/test$/);
    page.once('dialog', dialog => dialog.accept());
    await section.getByRole('button', { name: 'Disconnect video connection', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Video connection disconnected.');
  });
}

test('provider tabs support keyboard navigation and confirm before discarding secrets', async ({ page }) => {
  const { section } = await openConnections(page);
  await section.getByLabel('ElevenLabs API key', { exact: true }).fill('discard-on-tab-fixture');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('tab', { name: 'Cartesia', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'ElevenLabs', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveValue('discard-on-tab-fixture');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('tab', { name: 'Cartesia', exact: true }).click();
  await page.getByRole('tab', { name: 'Cartesia', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Synthesia', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Synthesia', exact: true }).press('Home');
  await expect(page.getByRole('tab', { name: 'OpenAI', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'ElevenLabs', exact: true }).click();
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('discard-on-tab-fixture');
});

test('provider tabs filter saved connections and keep non-admins read-only', async ({ page }) => {
  const connections = [
    { id: 'cartesia-one', name: 'Audio connection', provider: 'cartesia', configured: true },
    { id: 'synthesia-one', name: 'Video connection', provider: 'synthesia', configured: true },
  ];
  await openConnections(page, { canManage: false, connections }, 'Cartesia');
  await expect(page.getByRole('tabpanel', { name: 'Cartesia', exact: true })).toContainText('Audio connection');
  await expect(page.getByRole('tabpanel', { name: 'Cartesia', exact: true })).not.toContainText('Video connection');
  for (const provider of ['Cartesia', 'Synthesia', 'Shotstack', 'ElevenLabs', 'Google Cloud']) {
    await page.getByRole('tab', { name: provider, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: provider, exact: true });
    await expect(panel.getByText(/Only installation administrators/)).toBeVisible();
    await expect(panel.locator('input[type="password"]')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Save / })).toHaveCount(0);
  }
});

for (const theme of ['light', 'dark']) {
  test(`all provider tabs fit desktop/mobile in ${theme} and remain accessible`, async ({ page }) => {
    test.setTimeout(90000); // Twelve full Axe scans across provider tabs and viewport sizes.
    await page.addInitScript(value => localStorage.setItem('chimera.appearance', value), theme);
    await openConnections(page);
    const dialog = page.getByRole('dialog', { name: 'AI connection', exact: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const provider of ['OpenAI', 'ElevenLabs', 'Google Cloud', 'Cartesia', 'Synthesia', 'Shotstack']) {
        await page.getByRole('tab', { name: provider, exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: provider, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('.ai-connection-dialog').analyze()).violations).toEqual([]);
      }
    }
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('environment source is fixed and failed saves clear passwords with safe errors', async ({ page }) => {
  const { section, actions } = await openConnections(page, { failSave: true });
  await section.getByLabel('Connection name', { exact: true }).fill('Environment narrator');
  await section.getByLabel('Narration voice', { exact: true }).fill('voice-one');
  await section.getByRole('combobox', { name: 'Credential source', exact: true }).selectOption('environment');
  await expect(section.getByText('Server environment (ELEVENLABS_API_KEY)', { exact: true })).toHaveCount(1);
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect(section.getByRole('alert')).toHaveText('Narration credentials could not be saved securely.');
  expect(actions[0].data.credentialSource).toBe('environment');
  expect(actions[0].data).not.toHaveProperty('apiKey');
  await section.getByRole('combobox', { name: 'Credential source', exact: true }).selectOption('secure-store');
  await section.getByLabel('ElevenLabs API key', { exact: true }).fill('failed-fixture-key');
  await section.getByRole('button', { name: 'Save narration connection', exact: true }).click();
  await expect.poll(() => actions.length).toBe(2);
  await expect(section.getByLabel('ElevenLabs API key', { exact: true })).toHaveValue('');
  await expect(section.getByRole('alert')).toHaveText('Narration credentials could not be saved securely.');
});

async function openCreator(page, request, capability) {
  const created = await request.post('/api/projects', { data: { title: `Narration selector ${Date.now()}` } });
  let project = await created.json();
  const scene = await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Narration scene' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  project = await scene.json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.route('**/media-generation-capability', route => route.fulfill({ json: capability }));
  await page.route('**/generated-candidates', route => route.fulfill({ json: [] }));
  const submissions = [];
  await page.route('**/media-generation-jobs', route => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: { id: 'narration-job', status: 'queued' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(page.locator('.generation-creator summary')).toHaveAttribute('aria-disabled', 'false');
  await page.locator('.generation-creator summary').click();
  await expect(page.getByRole('group', { name: 'Media candidate settings', exact: true })).toBeVisible();
  return { creator: page.getByRole('group', { name: 'Media candidate settings', exact: true }), submissions };
}

test('narration-only capability requires explicit connection selection and sends voice override and language', async ({ page, request }) => {
  const { creator, submissions } = await openCreator(page, request, {
    providerConfigured: true, imageConfigured: false, canGenerate: true,
    narrationConnections: [{ id: 'google-id', name: 'Course voice', provider: 'google-cloud', voice: 'en-US-Neural2-A', model: '', language: 'en-US' }],
  });
  await expect(creator.getByRole('combobox', { name: 'Media type', exact: true })).toHaveValue('narration');
  await expect(creator.getByRole('combobox', { name: 'Media type', exact: true }).locator('option[value="image"]')).toHaveAttribute('disabled', '');
  await expect(creator.getByRole('combobox', { name: 'Narration connection', exact: true })).toHaveValue('');
  await creator.getByLabel('Purpose', { exact: true }).fill('Explain the topic');
  await creator.getByLabel('Narration script', { exact: true }).fill('A short narration.');
  await expect(creator.getByRole('button', { name: 'Generate candidate', exact: true })).toBeDisabled();
  await creator.getByRole('combobox', { name: 'Narration connection', exact: true }).selectOption('google-id');
  await expect(creator.getByLabel('Voice', { exact: true })).toHaveValue('en-US-Neural2-A');
  await creator.getByLabel('Voice', { exact: true }).fill('en-GB-Neural2-B');
  await creator.getByLabel('Language', { exact: true }).fill('en-GB');
  await creator.getByRole('button', { name: 'Generate candidate', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ kind: 'narration', narrationConnectionId: 'google-id', voice: 'en-GB-Neural2-B', language: 'en-GB', script: 'A short narration.' });
});

test('old capability mocks retain image access and explicit legacy narration selection', async ({ page, request }) => {
  const { creator, submissions } = await openCreator(page, request, { providerConfigured: true, canGenerate: true });
  await expect(creator.getByRole('combobox', { name: 'Media type', exact: true })).toHaveValue('image');
  await creator.getByRole('combobox', { name: 'Media type', exact: true }).selectOption('narration');
  await expect(creator.getByRole('combobox', { name: 'Narration connection', exact: true })).toHaveValue('');
  await creator.getByRole('combobox', { name: 'Narration connection', exact: true }).selectOption('legacy-openai');
  await expect(creator.getByLabel('Voice', { exact: true })).toHaveValue('alloy');
  await creator.getByLabel('Purpose', { exact: true }).fill('Legacy narration');
  await creator.getByLabel('Narration script', { exact: true }).fill('Legacy script.');
  await creator.getByRole('button', { name: 'Generate candidate', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ narrationConnectionId: 'legacy-openai', language: 'en-US', voice: 'alloy' });
});
