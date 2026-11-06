const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

const activity = { kind: 'external-link', id: 'external', title: 'Synthetic external practice',
  url: 'https://practice.example.invalid/activity', instruction: 'Consider the example and return here.',
  privacyNotice: 'Synthetic service; do not enter personal information.',
  offlineAlternative: 'Identify the goal, compare two actions and explain your choice.', authorReviewed: true };
const experience = { version: 1, heading: 'Connected practice', introduction: 'Explore an external example.', flow: [], reveals: [],
  activities: [activity], conclusion: 'Consider why your choice matters.', motion: false, background: '#100818', foreground: '#E8E5EA',
  accent: '#FF32AA', accentText: '#100818', diagramAccent: '#8542E8' };
const consentName = "I understand the external service's privacy notice and choose to leave Chimera.";

async function fixture(request, authored = true) {
  let project = await (await request.post('/api/projects', { data: { title: 'Synthetic connected delivery' } })).json();
  async function change(method, suffix, data) {
    const response = await request[method](`/api/projects/${project.id}${suffix}`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` }, data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json();
  }
  await change('post', '/scenes', { title: 'External practice' });
  if (authored) await change('patch', `/scenes/${project.storyboard.scenes[0].id}`, { experience });
  return project;
}
async function open(page, project) {
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
}
async function consent(host) {
  await expect(host.getByRole('link')).toHaveCount(0);
  const checkbox = host.getByRole('checkbox', { name: consentName, exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await checkbox.press('Space');
  const link = host.getByRole('link', { name: /Open external experience/ });
  await expect(link).toHaveAttribute('href', activity.url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  return link;
}

test('author reviews a provider-free external link, edits invalidate review, saves and reopens', async ({ page, request }) => {
  const project = await fixture(request, false);
  let providerCalls = 0;
  page.on('request', req => { if (req.method() === 'POST' && /experience-treatment$|media-generation-jobs$/.test(req.url())) providerCalls++; });
  await open(page, project);
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: 'Start native experience without Pythia', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove activity 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add external launch link', exact: true }).click();
  const editor = dialog.getByRole('group', { name: 'Activity 1: external-link', exact: true });
  await editor.getByLabel('Activity title', { exact: true }).fill(activity.title);
  await editor.getByLabel('External HTTPS URL', { exact: true }).fill(activity.url);
  await editor.getByLabel('External activity instruction', { exact: true }).fill(activity.instruction);
  await editor.getByRole('textbox', { name: 'Destination privacy notice', exact: true }).fill(activity.privacyNotice);
  await editor.getByLabel('Offline learning alternative', { exact: true }).fill(activity.offlineAlternative);
  const review = editor.getByRole('checkbox', { name: /I reviewed this destination/ });
  const preview = dialog.getByRole('region', { name: 'Executable experience preview' });
  await expect(preview.getByRole('checkbox', { name: consentName })).toHaveCount(0);
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await expect(dialog.getByRole('button', { name: 'Save reviewed native scene edits', exact: true })).toBeDisabled();
  await review.check();
  await consent(preview.getByRole('group', { name: activity.title, exact: true }));
  await editor.getByRole('textbox', { name: 'Destination privacy notice', exact: true }).fill(activity.privacyNotice + ' Updated.');
  await expect(review).not.toBeChecked();
  await expect(preview.getByRole('link')).toHaveCount(0);
  await review.check();
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Save reviewed native scene edits', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Native scene edits saved.' })).toBeVisible();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].experience.activities[0].authorReviewed).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.visual-authoring-surface .native-experience')).toContainText(activity.offlineAlternative);
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  await expect(page.getByRole('dialog').last().getByLabel('External HTTPS URL', { exact: true })).toHaveValue(activity.url);
  expect(providerCalls).toBe(0);
});

test('mobile course preview launches only after consent, isolates the new tab, resets and prints offline text', async ({ page, request, context }, testInfo) => {
  const project = await fixture(request);
  const launches = [];
  await context.route('https://practice.example.invalid/**', route => {
    launches.push(route.request().headers());
    return route.fulfill({ body: '<!doctype html><title>Inert destination</title><p>Synthetic destination</p>', contentType: 'text/html' });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, project);
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const host = page.getByRole('dialog').last().locator('.native-experience').getByRole('group', { name: activity.title, exact: true });
  expect(launches).toHaveLength(0);
  const link = await consent(host);
  const popupPromise = page.waitForEvent('popup');
  await link.focus(); await link.press('Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(launches).toHaveLength(1); expect(launches[0].referer).toBeUndefined();
  await popup.close();
  await host.getByRole('button', { name: 'Reset external consent' }).click();
  await expect(host.getByRole('link')).toHaveCount(0);
  await expect(host.getByRole('checkbox')).toBeFocused();
  await page.context().setOffline(true);
  await expect(host.locator(':scope > div')).toContainText(activity.offlineAlternative);
  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(host.locator('.experience-static')).toHaveAttribute('open');
  await expect(host.locator('.experience-static')).toContainText(activity.url);
  await expect(host.locator('.experience-static')).toContainText(activity.offlineAlternative);
  expect((await new AxeBuilder({ page }).include('.course-preview-shell .native-experience').analyze()).violations).toEqual([]);
  await page.getByRole('dialog').last().screenshot({ path: testInfo.outputPath('external-mobile.png') });
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await expect(host.getByRole('checkbox')).not.toBeChecked();
  await expect(host.getByRole('link')).toHaveCount(0);
});

test('runtime rejects tampered URLs and unreviewed links and discards restored consent/results', async ({ page }) => {
  await page.goto('/');
  const source = (await fs.readFile('backend/app/static/scene-experience.js', 'utf8')).replace('export function', 'function');
  await page.addScriptTag({ content: source + ';window.testMount = mountExperience;' });
  const unsafe = ['javascript:alert(1)', 'http://example.invalid', 'https://127.0.0.1/', 'https://host.local/',
    'https://user@example.invalid/', 'https://example.invalid/?token=x', 'https://example.invalid/#x', 'https://example.invalid:443/',
    'https://example.invalid/%41', 'https://example.invalid/\n'];
  for (const change of [...unsafe.map(url => ({ url })), { authorReviewed: false }]) {
    const result = await page.evaluate(({ experience, change }) => {
      const root = document.createElement('div');
      const data = structuredClone(experience); Object.assign(data.activities[0], change);
      const progress = { external: { consent: true, completed: true, score: 100 } };
      window.testMount(root, data, { progress });
      return { links: root.querySelectorAll('a').length, inputs: root.querySelectorAll('input').length,
        text: root.textContent, progress };
    }, { experience, change });
    expect(result.links).toBe(0); expect(result.inputs).toBe(0); expect(result.progress).toEqual({});
    expect(result.text).toContain(activity.offlineAlternative);
  }
});

for (const profile of ['standalone', 'scorm-12', 'scorm-2004']) {
  test(`${profile} preserves offline text, ephemeral consent and unchanged grades on Continue/Start over`, async ({ page, request, context }, testInfo) => {
    const project = await fixture(request);
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const archive = testInfo.outputPath('course.zip'), directory = testInfo.outputPath('course');
    await fs.mkdir(directory, { recursive: true }); await fs.writeFile(archive, await response.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    await page.route('http://external.test/**', async route => {
      const filename = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!['index.html', 'player.js', 'storyboard.json'].includes(filename)) return route.abort();
      await route.fulfill({ body: await fs.readFile(path.join(directory, filename)), contentType:
        filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html' });
    });
    if (profile !== 'standalone') await page.addInitScript(legacy => {
      const data = JSON.parse(localStorage.getItem('external-lms') || '{}'), api = {};
      api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
      api[legacy ? 'LMSGetValue' : 'GetValue'] = key => data[key] || '';
      api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { data[key] = value; return 'true'; };
      api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('external-lms', JSON.stringify(data)); return 'true'; };
      api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
      window[legacy ? 'API' : 'API_1484_11'] = api;
    }, profile === 'scorm-12');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(profile === 'standalone' ? pathToFileURL(path.join(directory, 'index.html')).href : 'http://external.test/index.html');
    const host = page.locator('.native-experience').getByRole('group', { name: activity.title, exact: true });
    if (profile !== 'standalone') await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('external-lms') || '{}')['cmi.suspend_data'])).toBeTruthy();
    const initial = profile === 'standalone' ? null : await page.evaluate(() => JSON.parse(localStorage.getItem('external-lms')));
    await context.route('https://practice.example.invalid/**', route => route.fulfill({
      body: '<!doctype html><title>Inert destination</title><p>Synthetic external service</p>', contentType: 'text/html',
    }));
    const link = await consent(host);
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    if (profile !== 'standalone') {
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('external-lms')));
      expect(saved).toEqual(initial);
      expect(saved['cmi.suspend_data']).not.toContain('consent');
      expect(Buffer.byteLength(saved['cmi.suspend_data'])).toBeLessThan(4096);
      await page.reload(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(host.getByRole('checkbox')).not.toBeChecked();
      await consent(host);
      await page.reload(); await page.getByRole('button', { name: 'Start over', exact: true }).click();
    } else await page.reload();
    await expect(host.getByRole('checkbox')).not.toBeChecked();
    await expect(host.getByRole('link')).toHaveCount(0);
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    await expect(host.locator('.experience-static')).toHaveAttribute('open');
    await expect(host.locator('.experience-static')).toContainText(activity.offlineAlternative);
    expect(errors).toEqual([]);
  });
}
