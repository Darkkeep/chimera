const { test, expect } = require('@playwright/test');
test('approved narration appears once for its intended scene', async ({ page, request }) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Narration destination regression' } })).json();
  for (const title of ['Scene one', 'Scene two']) project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  for (const name of ['one.mp3','two.mp3']) {
    const response = await request.post(`/api/projects/${project.id}/assets`, { multipart: { file: { name, mimeType: 'audio/mpeg', buffer: Buffer.from('ID3' + name) } }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(response.ok()).toBeTruthy(); project = await response.json();
  }
  const candidates = project.storyboard.assets.map((asset, index) => ({ id: `candidate-${index}`, sceneId: project.storyboard.scenes[index].id, kind: 'audio', status: 'approved', approvedAssetId: asset.id, filename: asset.filename }));
  candidates.push({ id: 'rejected', sceneId: project.storyboard.scenes[0].id, kind: 'audio', status: 'rejected', filename: 'rejected.mp3' });
  await page.route('**/generated-candidates', route => route.fulfill({ json: candidates }));
  await page.route('**/media-generation-capability', route => route.fulfill({ json: { providerConfigured: false, canGenerate: false } }));
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const current = page.getByRole('region', { name: 'Selected scene media', exact: true });
  await expect(current.locator('audio')).toHaveCount(1);
  await expect(current).toContainText('one.mp3');
  await expect(current).toContainText('Approved, awaiting attachment');
  await expect(current.getByRole('button', { name: 'Attach to scene', exact: true })).toBeVisible();
  await expect(page.locator('.generated-candidate audio')).toHaveCount(0);
  await expect(page.locator('audio:visible')).toHaveCount(1);
  const other = page.locator('.other-project-media');
  await expect(other).not.toHaveAttribute('open');
  await other.locator('summary').click();
  await expect(other).toContainText('Generated for: Scene two');
  await expect(other.locator('audio')).toHaveCount(1);
  await current.getByRole('button', { name: 'Attach to scene', exact: true }).click();
  await expect(current.getByRole('button', { name: 'Detach media', exact: true })).toBeVisible();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].audioAssets).toEqual([project.storyboard.assets[0].id]);
  expect(saved.storyboard.scenes[1].audioAssets).toEqual([]);
  await current.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Scene one', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Close scene editor', exact: true }).click();
  await expect(current).toBeVisible();
});
