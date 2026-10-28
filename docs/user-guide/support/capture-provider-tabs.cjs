const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

(async () => {
  const fixtureDir = path.resolve(process.env.CHIMERA_GUIDE_DIR || 'workspace/user-guide-20261027');
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, 'fixture.json'), 'utf8'));
  const baseURL = process.env.GUIDE_URL || 'http://127.0.0.1:5178';
  if (!['http://127.0.0.1:5178', 'http://localhost:5178'].includes(baseURL)) {
    throw new Error('Provider documentation capture requires the isolated documentation frontend on port 5178.');
  }
  const browser = await chromium.launch();
  const captures = [];
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 1500, height: 1400 }, colorScheme: 'light' });
    const response = await page.request.get('/api/projects');
    expect(response.ok()).toBe(true);
    const projects = await response.json();
    if (projects.length !== 1 || projects[0].id !== fixture.projectId) {
      throw new Error('Requires the isolated documentation fixture, never a user workspace.');
    }
    await page.route('https://**', route => route.abort());
    await page.route('**/api/**', route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET') return route.abort();
      if (pathname === '/api/ai-connection') return route.fulfill({ json: {
        configured: false, keyConfigured: false, storageAvailable: true, credentialError: false,
        canManage: true, revision: 'documentation-only', source: 'none', provider: 'openai',
        textModel: 'gpt-4.1-mini', textModels: ['gpt-4.1-mini'],
        imageModel: 'gpt-image-1', imageModels: ['gpt-image-1'],
        audioModel: 'gpt-4o-mini-tts', audioModels: ['gpt-4o-mini-tts'],
        maxRequestsPerDay: 20, maxConcurrentRequests: 1,
      } });
      if (pathname === '/api/narration-connections') return route.fulfill({ json: {
        revision: 'documentation-only', canManage: true, storageAvailable: true, connections: [], legacyConfigured: false,
      } });
      if (pathname.endsWith('/media-generation-capability')) return route.fulfill({ json: {
        providerConfigured: true, imageConfigured: false, canGenerate: true,
        narrationConnections: [{
          id: 'narration-000000000001', name: 'Documentation narrator (fixture)', provider: 'cartesia',
          voice: 'documentation-voice-id', model: 'sonic-3.6', language: 'en-US',
        }],
      } });
      if (pathname.startsWith('/api/pythia/') || pathname === '/api/intelligence-engine') return route.abort();
      return route.continue();
    });
    await page.addInitScript(id => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', 'light');
    }, fixture.projectId);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'AI connection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI connection', exact: true });
    for (const [provider, file] of [
      ['OpenAI', 'ai-connection-current.png'], ['ElevenLabs', 'ai-provider-elevenlabs.png'],
      ['Google Cloud', 'ai-provider-google-cloud.png'], ['Cartesia', 'ai-provider-cartesia.png'],
      ['Synthesia', 'ai-provider-synthesia.png'], ['Shotstack', 'ai-provider-shotstack.png'],
    ]) {
      await page.getByRole('tab', { name: provider, exact: true }).click();
      const panel = page.getByRole('tabpanel', { name: provider, exact: true });
      await expect(panel).toBeVisible();
      if (provider === 'OpenAI') {
        await expect(panel.getByRole('combobox', { name: 'Image model', exact: true })).toBeVisible();
      } else {
        await expect(panel.getByLabel('Connection name', { exact: true })).toBeVisible();
        if (['Synthesia', 'Shotstack'].includes(provider)) {
          await expect(panel.getByText(/Video generation is not yet available/)).toBeVisible();
        }
      }
      await dialog.screenshot({ path: path.resolve('docs/user-guide/images', file) });
      captures.push({ file, provider, state: 'Unconfigured; no credentials entered or actions submitted.' });
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Media library', exact: true }).click();
    const creator = page.locator('.generation-creator');
    await expect(creator.locator('summary')).toHaveAttribute('aria-disabled', 'false');
    await creator.locator('summary').click();
    await creator.getByRole('combobox', { name: 'Narration connection', exact: true }).selectOption('narration-000000000001');
    await creator.getByLabel('Purpose', { exact: true }).fill('Introduce the demonstration objectives');
    await creator.getByLabel('Narration script', { exact: true }).fill('Identify the purpose of a storyboard and review a scene before publishing.');
    await expect(creator.getByLabel('Voice', { exact: true })).toHaveValue('documentation-voice-id');
    await creator.screenshot({ path: path.resolve('docs/user-guide/images/media-narration-form.png') });
    captures.push({ file: 'media-narration-form.png', provider: 'Cartesia', state: 'Inert capability/voice fixture; generation not submitted.' });
    await fs.writeFile(path.resolve('docs/user-guide/refresh-providers-2026-10-27.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      workingTree: 'Includes uncommitted provider tabs, adapters, and documentation updates.',
      fixture: path.basename(fixtureDir),
      scope: 'Six provider tabs and explicit narration selection in the actual UI. Credential-store availability, connection status and narration capability are inert browser fixtures. No user data, secrets, provider calls, or generation.',
      captures,
    }, null, 2) + '\n');
    console.log(`Captured ${captures.length} provider/narration controls with inert status fixtures.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
