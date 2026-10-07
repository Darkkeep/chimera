const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function setup(page) {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#28784a';
    context.fillRect(0, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  let response = await page.request.post('/api/projects', { data: { title: `Image descriptions ${Date.now()}` } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  const headers = () => ({ 'If-Match': `"${project.storyboard.revision}"` });
  response = await page.request.post(`/api/projects/${project.id}/assets`, {
    headers: headers(),
    multipart: { file: { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') } },
  });
  expect(response.ok()).toBeTruthy();
  project = await response.json();
  const assetId = project.storyboard.assets[0].id;
  response = await page.request.patch(`/api/projects/${project.id}/assets/${assetId}/attribution`, { headers: headers(), data: { attributionText: 'Original course artwork', attributionStatus: 'complete' } });
  expect(response.ok()).toBeTruthy();
  project = await response.json();
  for (const title of ['First diagram', 'Second diagram']) {
    response = await page.request.post(`/api/projects/${project.id}/scenes`, { headers: headers(), data: { title } });
    expect(response.ok()).toBeTruthy();
    project = await response.json();
    const scene = project.storyboard.scenes.at(-1);
    response = await page.request.patch(`/api/projects/${project.id}/scenes/${scene.id}`, { headers: headers(), data: { imageAssets: [assetId] } });
    expect(response.ok()).toBeTruthy();
    project = await response.json();
  }
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await openPanel(page);
  return project;
}

async function openPanel(page) {
  if (!await page.getByRole('button', { name: 'Check image descriptions', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Check image descriptions', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Image descriptions' })).toBeVisible();
}

test('closing saves descriptions on multiple scenes and reload preserves them', async ({ page }) => {
  const project = await setup(page);
  const panel = page.getByRole('dialog', { name: 'Image descriptions' });
  await expect(panel.getByRole('region', { name: 'Scene 1: First diagram' })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Alternative text' }).nth(0).fill('A pressure gauge showing a safe reading.');
  await panel.getByRole('textbox', { name: 'Alternative text' }).nth(1).fill('A pressure gauge showing a high reading.');
  await expect(panel.getByText('Unsaved changes', { exact: true })).toHaveCount(2);
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await expect(panel).toHaveCount(0);
  const stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes.map(scene => scene.imageAltText[project.storyboard.assets[0].id])).toEqual(['A pressure gauge showing a safe reading.', 'A pressure gauge showing a high reading.']);
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await openPanel(page);
  await expect(panel.getByRole('textbox', { name: 'Alternative text' }).nth(0)).toHaveValue('A pressure gauge showing a safe reading.');
  await expect(panel.getByText('Ready for production', { exact: true })).toHaveCount(2);
});

test('a failed close-save keeps the panel and draft open for retry', async ({ page }) => {
  await setup(page);
  const panel = page.getByRole('dialog', { name: 'Image descriptions' });
  await panel.getByRole('textbox', { name: 'Alternative text' }).first().fill('Keep this description.');
  await page.route('**/api/projects/*/scenes/*', route => route.fulfill({ status: 412, json: { detail: 'Revision conflict' } }));
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await expect(panel.getByRole('alert')).toContainText('Your draft is still here');
  await expect(panel.getByRole('textbox', { name: 'Alternative text' }).first()).toHaveValue('Keep this description.');
  await page.unroute('**/api/projects/*/scenes/*');
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await expect(panel).toHaveCount(0);
});

test('decorative designation, saved state and mobile readiness are visible', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole('dialog', { name: 'Image descriptions' });
  await expect(panel.getByText('Description needed', { exact: true })).toHaveCount(2);
  await panel.getByRole('checkbox', { name: 'Decorative image' }).first().check();
  await panel.getByRole('button', { name: 'Save all', exact: true }).click();
  await expect(panel.getByText('Ready for production', { exact: true })).toHaveCount(1);
  await expect(panel.getByRole('textbox', { name: 'Alternative text' }).first()).toBeDisabled();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('image-descriptions-mobile.png') });
  expect((await new AxeBuilder({ page }).include('.accessibility-dialog').analyze()).violations).toEqual([]);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect((await new AxeBuilder({ page }).include('.accessibility-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('image-descriptions-mobile-dark.png') });
});

test('individual saves and shared-image library readiness use every scene description', async ({ page }) => {
  await setup(page);
  const panel = page.getByRole('dialog', { name: 'Image descriptions' });
  await panel.getByRole('textbox', { name: 'Alternative text' }).first().fill('A gauge.');
  await panel.getByRole('region', { name: 'Scene 1: First diagram' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByText('Ready for production', { exact: true })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const item = page.locator('.media-item').first();
  await expect(item.getByText('Description needed', { exact: true })).toBeVisible();
  await expect(item.locator('.media-scene-references')).toHaveText('Scene 1: First diagram; Scene 2: Second diagram');
  await openPanel(page);
  await panel.getByRole('checkbox', { name: 'Decorative image' }).nth(1).check();
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await expect(item.getByText('Ready for production', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('media-production-ready.png') });
});

test('missing attribution and unavailable images never show production ready', async ({ page }) => {
  const project = await setup(page);
  const panel = page.getByRole('dialog', { name: 'Image descriptions' });
  await panel.getByRole('checkbox', { name: 'Decorative image' }).first().check();
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await expect(panel).toHaveCount(0);
  const stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  const assetId = stored.storyboard.assets[0].id;
  const response = await page.request.patch(`/api/projects/${project.id}/assets/${assetId}/attribution`, { headers: { 'If-Match': `"${stored.storyboard.revision}"` }, data: { attributionText: '', attributionStatus: 'draft' } });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await openPanel(page);
  await expect(panel.getByText('Attribution needed', { exact: true })).toHaveCount(1);
  await expect(panel.getByText('Ready for production', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await page.route(`**/api/projects/${project.id}/assets/${assetId}`, route => route.fulfill({ status: 404 }));
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(page.locator('.media-item').getByText('Media unavailable', { exact: true })).toBeVisible();
});

test('media library saves scene descriptions with credit and with attachment', async ({ page }) => {
  const project = await setup(page);
  await page.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const item = page.locator('.media-item').first();
  await expect(item.getByText('Description for: First diagram', { exact: true })).toBeVisible();
  await item.getByRole('textbox', { name: 'Alternative text' }).fill('The first gauge is in its safe range.');
  await item.getByRole('textbox', { name: 'Attribution / credit' }).fill('Original gauge artwork');
  await item.getByRole('button', { name: 'Save credit', exact: true }).click();
  await expect(item.getByText('Description not saved', { exact: true })).toHaveCount(0);
  let stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  const assetId = stored.storyboard.assets[0].id;
  expect(stored.storyboard.scenes[0].imageAltText[assetId]).toBe('The first gauge is in its safe range.');
  expect(stored.storyboard.scenes[1].imageAltText[assetId]).toBeUndefined();
  expect(stored.storyboard.assets[0].attributionText).toBe('Original gauge artwork');
  await item.getByRole('button', { name: 'Detach media', exact: true }).click();
  await expect(item.getByRole('button', { name: 'Attach to scene', exact: true })).toBeVisible();
  await item.getByRole('textbox', { name: 'Alternative text' }).fill('A newly attached gauge.');
  await item.getByRole('textbox', { name: 'Attribution / credit' }).fill('Updated original artwork credit');
  await item.getByRole('button', { name: 'Attach to scene', exact: true }).click();
  await expect(item.getByRole('button', { name: 'Detach media', exact: true })).toBeEnabled();
  stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes[0].imageAltText[assetId]).toBe('A newly attached gauge.');
  expect(stored.storyboard.assets[0].attributionText).toBe('Updated original artwork credit');
  await item.getByRole('checkbox', { name: 'Decorative image' }).check();
  await item.getByRole('button', { name: 'Save credit', exact: true }).click();
  await expect(item.getByText('Description not saved', { exact: true })).toHaveCount(0);
  stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes[0].decorativeImages).toContain(assetId);
  expect(stored.storyboard.scenes[0].imageAltText[assetId]).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('inline-image-description-mobile.png') });
  expect(await item.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await item.locator('.media-attribution-editor').screenshot({ path: test.info().outputPath('inline-image-description-controls.png') });
});

test('a failed inline description save preserves the draft and does not save credit', async ({ page }) => {
  const project = await setup(page);
  await page.getByRole('button', { name: 'Close image accessibility editor' }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const item = page.locator('.media-item').first();
  await item.getByRole('textbox', { name: 'Alternative text' }).fill('Keep this inline description.');
  await item.getByRole('textbox', { name: 'Attribution / credit' }).fill('Keep this credit draft.');
  await page.route('**/api/projects/*/scenes/*', route => route.fulfill({ status: 412 }));
  await item.getByRole('button', { name: 'Save credit', exact: true }).click();
  await expect(item.getByRole('alert')).toContainText('Your draft is still here');
  await expect(item.getByRole('textbox', { name: 'Alternative text' })).toHaveValue('Keep this inline description.');
  await expect(item.getByRole('textbox', { name: 'Attribution / credit' })).toHaveValue('Keep this credit draft.');
  const stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.assets[0].attributionText).toBe('Original course artwork');
  await page.unroute('**/api/projects/*/scenes/*');
  await item.getByRole('button', { name: 'Save credit', exact: true }).click();
  await expect(item.getByRole('alert')).toHaveCount(0);
  await expect(item.getByText('Description not saved', { exact: true })).toHaveCount(0);
});

test('audio readiness follows availability, attachment and saved attribution', async ({ page }) => {
  const project = await setup(page);
  await page.getByRole('button', { name: 'Close image accessibility editor' }).click();
  const waveform = Buffer.alloc(16044);
  waveform.write('RIFF', 0);
  waveform.writeUInt32LE(waveform.length - 8, 4);
  waveform.write('WAVEfmt ', 8);
  waveform.writeUInt32LE(16, 16);
  waveform.writeUInt16LE(1, 20);
  waveform.writeUInt16LE(1, 22);
  waveform.writeUInt32LE(8000, 24);
  waveform.writeUInt32LE(16000, 28);
  waveform.writeUInt16LE(2, 32);
  waveform.writeUInt16LE(16, 34);
  waveform.write('data', 36);
  waveform.writeUInt32LE(16000, 40);
  let stored = await (await page.request.get(`/api/projects/${project.id}`)).json();
  let response = await page.request.post(`/api/projects/${project.id}/assets`, { headers: { 'If-Match': `"${stored.storyboard.revision}"` }, multipart: { file: { name: 'narration.wav', mimeType: 'audio/wav', buffer: waveform } } });
  expect(response.ok()).toBeTruthy();
  stored = await response.json();
  const audio = stored.storyboard.assets.find(asset => asset.kind === 'audio');
  response = await page.request.patch(`/api/projects/${project.id}/scenes/${stored.storyboard.scenes[0].id}`, { headers: { 'If-Match': `"${stored.storyboard.revision}"` }, data: { audioAssets: [audio.id] } });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const item = page.locator('.media-item').filter({ has: page.getByText('narration.wav', { exact: true }) });
  await expect(item.locator('.media-scene-references')).toHaveText('Scene 1: First diagram');
  await expect(item.getByText('Attribution needed', { exact: true })).toBeVisible();
  await item.getByRole('textbox', { name: 'Attribution / credit' }).fill('Original course narration');
  await item.getByRole('combobox', { name: 'Status', exact: true }).selectOption('complete');
  await item.getByRole('button', { name: 'Save credit', exact: true }).click();
  await expect(item.getByText('Ready for production', { exact: true })).toBeVisible();
});