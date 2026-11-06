const { test, expect } = require('@playwright/test');
const { mockMediaConnections, mediaCapability } = require('./media-connection-fixtures.cjs');

async function openEditor(page, request) {
  await mockMediaConnections(page);
  let project = await (await request.post('/api/projects', { data: { title: 'Scene media authoring' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Fair competition', extractedText: ['Performance leads to results.'], narration: 'Original narration.' },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  await page.route('**/media-generation-capability', route => route.fulfill({ json: mediaCapability({ providerConfigured: true, canGenerate: true, imageConfigured: true }) }));
  await page.route('**/generated-candidates', route => route.fulfill({ json: [] }));
  const submissions = [];
  await page.route('**/media-generation-jobs', route => {
    if (route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { id: 'media-fixture', sceneId: project.storyboard.scenes[0].id, kind: 'image', status: 'queued' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  return { project, submissions, editor: page.getByRole('dialog').last() };
}

test('scene editor saves current context without closing and retains media requests across tabs', async ({ page, request }) => {
  const { project, submissions, editor } = await openEditor(page, request);
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Narration', exact: true }).fill('Updated explanation of fair play.');
  await editor.getByRole('tab', { name: 'Media', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Save scene for media', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Generate candidate', exact: true })).not.toBeVisible();
  await editor.getByRole('button', { name: 'Save scene for media', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save scene for media', exact: true })).toHaveCount(0);
  const persisted = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(persisted.storyboard.scenes[0].narration).toBe('Updated explanation of fair play.');
  await editor.locator('.generation-creator > summary').click();
  await editor.getByRole('combobox', { name: 'Media type', exact: true }).selectOption('narration');
  await expect(editor.getByRole('textbox', { name: 'Narration script', exact: true })).toHaveValue('Updated explanation of fair play.');
  await editor.getByRole('combobox', { name: 'Media type', exact: true }).selectOption('image');
  await editor.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Explain the relationship between performance and results');
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('A clear performance to results infographic.');
  await editor.getByRole('tab', { name: 'Stage', exact: true }).click();
  await editor.getByRole('tab', { name: 'Media', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue('A clear performance to results infographic.');
  await editor.getByRole('button', { name: 'Generate candidate', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ sceneId: project.storyboard.scenes[0].id, kind: 'image', prompt: 'A clear performance to results infographic.' });
  await expect(editor).toBeVisible();
});

test('a failed context save keeps scene edits and blocks media requests', async ({ page, request }) => {
  const { project, submissions, editor } = await openEditor(page, request);
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Narration', exact: true }).fill('Unsaved context.');
  await page.route(`**/api/projects/${project.id}/scenes/*`, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 409, json: { detail: 'Revision conflict' } }) : route.continue());
  await editor.getByRole('tab', { name: 'Media', exact: true }).click();
  await editor.getByRole('button', { name: 'Save scene for media', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save scene for media', exact: true })).toBeVisible();
  expect(submissions).toEqual([]);
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Narration', exact: true })).toHaveValue('Unsaved context.');
});

test('candidate approval refreshes editor assets and explicit placement persists', async ({ page, request }) => {
  const { project, editor } = await openEditor(page, request);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
  const uploaded = await request.post(`/api/projects/${project.id}/assets`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    multipart: { file: { name: 'performance.png', mimeType: 'image/png', buffer: image } },
  });
  expect(uploaded.ok()).toBe(true);
  const approvedProject = await uploaded.json();
  const asset = approvedProject.storyboard.assets[0];
  let approved = false;
  const candidate = { id: 'candidate-fixture', jobId: 'fixture-job', sceneId: project.storyboard.scenes[0].id,
    kind: 'image', status: 'pending', filename: 'performance.png', purpose: 'Show performance', prompt: 'A diagram',
    script: '', altText: 'Performance diagram', provider: 'fixture', model: 'fixture' };
  await page.route('**/generated-candidates', route => route.fulfill({ json: approved ? [] : [candidate] }));
  await page.route('**/generated-candidates/candidate-fixture/asset', route => route.fulfill({ contentType: 'image/png', body: image }));
  await page.route('**/generated-candidates/candidate-fixture/approve', route => {
    approved = true;
    return route.fulfill({ json: { project: approvedProject } });
  });
  await editor.getByRole('tab', { name: 'Media', exact: true }).click();
  await editor.getByRole('button', { name: 'Approve asset', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Asset approved and saved' })).toBeVisible();
  await editor.getByText('Placement, captions, and shared media', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Placement description', exact: true }).fill('Performance leads to results.');
  await editor.getByRole('button', { name: 'Save placement', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Saved locally.' })).toBeVisible();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].mediaPlacements).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: asset.id, altText: 'Performance leads to results.' })]));
  await editor.getByRole('tab', { name: 'Stage', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Save scene', exact: true })).toBeVisible();
});
