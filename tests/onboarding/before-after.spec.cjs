const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

async function fixture(page, request, authored = true) {
  let project = await (await request.post('/api/projects', { data: { title: 'Synthetic comparison' } })).json();
  async function change(method, suffix, options) {
    const response = await request[method](`/api/projects/${project.id}${suffix}`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` }, ...options,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json();
  }
  await change('post', '/scenes', { data: { title: 'Before and after' } });
  const images = [];
  for (const [name, width, height, color] of [['before', 240, 120, '#17be57'], ['after', 120, 240, '#e65b11']]) {
    const png = await page.evaluate(({ width, height, color }) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { width, height, color });
    await change('post', '/assets', { multipart: { file: { name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } } });
    const asset = project.storyboard.assets.find(item => item.filename === `${name}.png`);
    await change('patch', `/assets/${asset.id}/attribution`, { data: { attributionText: `Synthetic ${name} credit`, attributionStatus: 'complete' } });
    images.push(asset);
  }
  const activity = { kind: 'before-after', id: 'comparison', title: 'Inspect the change', instruction: 'Inspect both states.',
    before: { imageAssetId: images[0].id, label: 'Original state', altText: 'A green landscape.', description: 'The original state is green.' },
    after: { imageAssetId: images[1].id, label: 'Revised state', altText: 'An orange portrait.', description: 'The revised state is orange.' },
    explanation: 'The state and aspect ratio changed.' };
  const experience = { version: 1, heading: 'Compare states', introduction: 'Inspect the differences.', flow: [], reveals: [],
    activities: [activity], conclusion: 'Consider why the change matters.', motion: false, background: '#100818', foreground: '#E8E5EA',
    accent: '#FF32AA', accentText: '#100818', diagramAccent: '#8542E8' };
  if (authored) await change('patch', `/scenes/${project.storyboard.scenes[0].id}`, { data: { experience } });
  return { project, images, experience };
}
async function open(page, project) {
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
}
async function verifyImage(image, ratio) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  const size = await image.evaluate(node => { const r = node.getBoundingClientRect(); return r.width / r.height; });
  expect(size).toBeCloseTo(ratio, 2);
}
async function keyboardReview(host) {
  const select = host.getByRole('combobox', { name: 'Image to inspect', exact: true });
  await expect(select).toHaveValue('before');
  await verifyImage(host.locator(':scope > div img'), 2);
  await select.focus();
  await select.press('ArrowDown');
  await select.press('Enter');
  await expect(select).toHaveValue('after');
  await verifyImage(host.locator(':scope > div img'), 0.5);
  await expect(host.locator(':scope > div')).toContainText('Synthetic after credit');
  await host.getByRole('button', { name: 'Mark comparison reviewed', exact: true }).focus();
  await host.getByRole('button', { name: 'Mark comparison reviewed', exact: true }).press('Enter');
  await expect(host.getByRole('status')).toHaveText('Comparison reviewed.');
}

test('comparison can be authored without providers, saved, reopened and previewed', async ({ page, request }) => {
  const { project, images } = await fixture(page, request, false);
  let providerCalls = 0;
  page.on('request', req => { if (req.method() === 'POST' && /experience-treatment$|media-generation-jobs$/.test(req.url())) providerCalls++; });
  await open(page, project);
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: 'Start native experience without Pythia', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove activity 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add before/after comparison', exact: true }).click();
  const editor = dialog.getByRole('group', { name: 'Activity 1: before-after', exact: true });
  await editor.getByLabel('Activity title', { exact: true }).fill('Inspect the change');
  await editor.getByRole('combobox', { name: 'Before project image', exact: true }).selectOption(images[0].id);
  await editor.getByRole('combobox', { name: 'After project image', exact: true }).selectOption(images[1].id);
  await editor.getByRole('textbox', { name: 'after alternative text', exact: true }).fill('An orange portrait.');
  const preview = dialog.getByRole('region', { name: 'Executable experience preview' });
  await keyboardReview(preview.getByRole('group', { name: 'Inspect the change', exact: true }));
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Save reviewed native scene edits', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Native scene edits saved.' })).toBeVisible();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].experience.activities[0].after.altText).toBe('An orange portrait.');
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  await expect(page.getByRole('dialog').last().getByRole('textbox', { name: 'after alternative text', exact: true })).toHaveValue('An orange portrait.');
  expect(providerCalls).toBe(0);
});

test('preview retains review, rejects changed image identities, resets and exposes static alternatives', async ({ page, request }, testInfo) => {
  const { project } = await fixture(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, project);
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const host = page.getByRole('dialog').last().locator('.native-experience').getByRole('group', { name: 'Inspect the change', exact: true });
  await keyboardReview(host);
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await expect(host.getByRole('status')).toHaveText('Comparison reviewed.');
  await expect(host.getByRole('combobox')).toHaveValue('before');
  const details = host.locator('.experience-static');
  await details.locator('summary').click();
  await expect(details.getByRole('img')).toHaveCount(2);
  await expect(details).toContainText('Synthetic before credit');
  await expect(details).toContainText('Synthetic after credit');
  await page.getByRole('dialog').last().screenshot({ path: testInfo.outputPath('comparison-mobile.png') });
  const accessibility = await new AxeBuilder({ page }).include('.course-preview-shell .native-experience').analyze();
  expect(accessibility.violations).toEqual([]);
  await host.getByRole('button', { name: 'Restart comparison', exact: true }).click();
  await expect(host.getByRole('status')).toHaveText('Comparison not yet marked reviewed.');
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.evaluate(({ id, scene }) => {
    const key = `chimera.preview.${id}`, state = JSON.parse(localStorage.getItem(key));
    state.experienceProgress[scene].comparison = { reviewedImages: ['wrong-before', 'wrong-after'], reviewed: true };
    localStorage.setItem(key, JSON.stringify(state));
  }, { id: project.id, scene: project.storyboard.scenes[0].id });
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await expect(host.getByRole('status')).toHaveText('Comparison not yet marked reviewed.');
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(host.locator('.experience-static')).toHaveAttribute('open');
});

test('unavailable images retain alternative text, descriptions and credits', async ({ page, request }) => {
  const { project, images } = await fixture(page, request);
  await page.route(`**/api/projects/${project.id}/assets/${images[0].id}`, route => route.abort());
  await open(page, project);
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const host = page.getByRole('dialog').last().locator('.native-experience').getByRole('group', { name: 'Inspect the change', exact: true });
  const content = host.locator(':scope > div');
  await expect(content).toContainText('Image could not be loaded. A green landscape.');
  await expect(content).toContainText('The original state is green.');
  await expect(content).toContainText('Synthetic before credit');
  await host.getByRole('combobox').selectOption('after');
  await verifyImage(content.getByRole('img'), 0.5);
});

for (const profile of ['standalone', 'scorm-12', 'scorm-2004']) {
  test(`${profile} includes both images and preserves formative review/resume/reset`, async ({ page, request }, testInfo) => {
    const { project, images } = await fixture(page, request);
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const archive = testInfo.outputPath('course.zip'), directory = testInfo.outputPath('course');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(archive, await response.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    await page.route('http://comparison.test/**', async route => {
      const filename = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!['index.html', 'player.js', 'storyboard.json', ...images.map(asset => asset.path)].includes(filename)) return route.abort();
      await route.fulfill({ body: await fs.readFile(path.join(directory, filename)), contentType:
        filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : filename.endsWith('.png') ? 'image/png' : 'text/html' });
    });
    if (profile !== 'standalone') await page.addInitScript(legacy => {
      const data = JSON.parse(localStorage.getItem('comparison-lms') || '{}'), api = {};
      api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
      api[legacy ? 'LMSGetValue' : 'GetValue'] = key => data[key] || '';
      api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { data[key] = value; return 'true'; };
      api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('comparison-lms', JSON.stringify(data)); return 'true'; };
      api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
      window[legacy ? 'API' : 'API_1484_11'] = api;
    }, profile === 'scorm-12');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(profile === 'standalone' ? pathToFileURL(path.join(directory, 'index.html')).href : 'http://comparison.test/index.html');
    const host = page.locator('.native-experience').getByRole('group', { name: 'Inspect the change', exact: true });
    if (profile !== 'standalone') await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('comparison-lms') || '{}')['cmi.suspend_data'])).toBeTruthy();
    const initial = profile === 'standalone' ? null : await page.evaluate(() => JSON.parse(localStorage.getItem('comparison-lms')));
    await keyboardReview(host);
    if (profile !== 'standalone') {
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('comparison-lms')));
      expect(JSON.parse(saved['cmi.suspend_data']).experiences[project.storyboard.scenes[0].id].comparison.reviewedImages).toEqual(images.map(asset => asset.id));
      for (const key of ['cmi.core.score.raw', 'cmi.score.raw', 'cmi.core.lesson_status', 'cmi.completion_status', 'cmi.success_status']) expect(saved[key]).toBe(initial[key]);
      expect(Buffer.byteLength(saved['cmi.suspend_data'])).toBeLessThan(4096);
      await page.reload();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(host.getByRole('status')).toHaveText('Comparison reviewed.');
      await expect(host.getByRole('combobox')).toHaveValue('before');
      await page.reload();
      await page.getByRole('button', { name: 'Start over', exact: true }).click();
    } else await page.reload();
    await expect(host.getByRole('status')).toHaveText('Comparison not yet marked reviewed.');
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    const details = host.locator('.experience-static');
    await expect(details).toHaveAttribute('open');
    await verifyImage(details.getByRole('img').nth(0), 2);
    await verifyImage(details.getByRole('img').nth(1), 0.5);
    expect(errors).toEqual([]);
  });
}
