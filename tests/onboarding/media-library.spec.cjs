const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const status of ['configured', 'unconfigured', 'unavailable', 'denied']) {
  test(`candidate creation starts collapsed and respects ${status} AI status`, async ({ page, request }) => {
    const created = await request.post('/api/projects', { data: { title: `AI capability ${status} ${Date.now()}` } });
    let project = await created.json();
    const scene = await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Candidate scene' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    project = await scene.json();
    await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
    await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
    await page.route('**/media-generation-capability', route => status === 'unavailable' ? route.fulfill({ status: 503, json: { detail: 'Unavailable' } }) : route.fulfill({ json: { providerConfigured: status !== 'unconfigured', canGenerate: status !== 'denied' } }));
    let submissions = 0;
    await page.route('**/media-generation-jobs', route => {
      submissions += 1;
      return route.fulfill({ status: 202, json: { id: 'fixture-job', status: 'queued' } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Media library', exact: true }).click();
    const creator = page.locator('.generation-creator');
    await expect(creator).not.toHaveAttribute('open');
    await expect(page.getByRole('group', { name: 'Media candidate settings' })).toBeHidden();
    await creator.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(creator).toHaveAttribute('open', '');
    if (status === 'configured') {
      await expect(page.getByRole('textbox', { name: 'Purpose', exact: true })).toBeEnabled();
      await page.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Learning illustration');
      await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('An illustrative fixture');
      await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeEnabled();
      expect(submissions).toBe(0);
      await page.getByRole('button', { name: 'Generate candidate', exact: true }).click();
      await expect.poll(() => submissions).toBe(1);
    } else {
      await expect(creator).toHaveClass(/is-unavailable/);
      await expect(page.getByRole('textbox', { name: 'Purpose', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeDisabled();
      await expect(creator.locator('.generation-availability')).toHaveText(status === 'unconfigured' ? 'AI not configured' : status === 'denied' ? 'Generation access unavailable' : 'AI status unavailable');
      expect(submissions).toBe(0);
    }
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).check();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('.generated-media-panel').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `test-results/media-candidate-${status}-${theme}-${width}.png`, fullPage: true });
      }
    }
  });
}
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');

test('media project selector defaults to current project and keeps additions in the selected library', async ({ page, request }) => {
  const projects = [];
  for (const label of ['Alpha', 'Beta']) {
    const created = await request.post('/api/projects', { data: { title: `Media ${label} ${Date.now()}` } });
    expect(created.status()).toBe(201);
    let project = await created.json();
    const scene = await request.post(`/api/projects/${project.id}/scenes`, { data: { title: `${label} scene` }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(scene.ok()).toBe(true);
    project = await scene.json();
    const asset = await request.post(`/api/projects/${project.id}/assets`, { multipart: { file: { name: `${label.toLowerCase()}.png`, mimeType: 'image/png', buffer: image } }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(asset.ok()).toBe(true);
    projects.push(await asset.json());
  }
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), projects[0].id);
  await page.route('**/api/projects', route => route.request().method() === 'GET' ? route.fulfill({ json: projects }) : route.continue());
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const selector = page.getByRole('combobox', { name: 'Media library project', exact: true });
  await expect(selector).toHaveValue(projects[0].id);
  await expect(page.locator('.media-item-info')).toContainText('alpha.png');
  await expect(page.locator('.media-item-info')).not.toContainText('beta.png');
  await expect(page.getByLabel('Add media', { exact: true })).toBeEnabled();
  await selector.selectOption(projects[1].id);
  await expect(page.getByRole('heading', { name: 'Media library', exact: true })).toBeVisible();
  await expect(selector).toHaveValue(projects[1].id);
  await expect(page.getByRole('combobox', { name: 'Switch project', exact: true })).toHaveValue(projects[1].id);
  await expect(page.locator('.media-item-info')).toContainText('beta.png');
  await expect(page.locator('.media-item-info')).not.toContainText('alpha.png');
  await page.getByLabel('Add media', { exact: true }).setInputFiles({ name: 'added.png', mimeType: 'image/png', buffer: Buffer.concat([image, Buffer.from([0])]) });
  await expect(page.locator('.media-item-info')).toHaveCount(2);
  const selected = await (await request.get(`/api/projects/${projects[1].id}`)).json();
  const original = await (await request.get(`/api/projects/${projects[0].id}`)).json();
  expect(selected.storyboard.assets.map(asset => asset.filename)).toContain('added.png');
  expect(original.storyboard.assets).toHaveLength(1);
  const added = page.locator('.media-item').filter({ hasText: 'added.png' });
  await added.getByRole('button', { name: 'Attach to scene', exact: true }).click();
  await expect(added.getByRole('button', { name: 'Detach media', exact: true })).toBeVisible();
  const attached = await (await request.get(`/api/projects/${projects[1].id}`)).json();
  expect(attached.storyboard.scenes[0].imageAssets).toContain(attached.storyboard.assets.find(asset => asset.filename === 'added.png').id);
  await selector.selectOption(projects[0].id);
  await expect(page.locator('.media-item-info')).toHaveCount(1);
  await expect(page.locator('.media-item-info')).toContainText('alpha.png');
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).check();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(selector).toBeVisible();
      expect((await new AxeBuilder({ page }).include('.media-library').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `test-results/media-library-${theme}-${width}.png`, fullPage: true });
    }
  }
});