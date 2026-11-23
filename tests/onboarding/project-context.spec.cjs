const { test, expect } = require('@playwright/test');
const { openWorkspaceMenu } = require('./helpers.cjs');

// All content stays in the disposable test workspace. No Pythia/provider calls.
test('PB&J project never inherits Sporting Merit references or suggestion target', async ({ page, request }) => {
  const sporting = await (await request.post('/api/projects',
    { data: { title: 'Sporting Merit isolated source' } })).json();
  const pbj = await (await request.post('/api/projects',
    { data: { title: 'PB&J separate course' } })).json();
  const uploaded = await request.post(`/api/projects/${sporting.id}/reference-resources`, {
    multipart: {
      file: { name: 'sporting.txt', mimeType: 'text/plain',
        buffer: Buffer.from('Sporting Merit reference text, not a sandwich instruction.') },
      title: 'Sporting Merit Presentation',
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), sporting.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Storyboard suggestions' });
  await expect(dialog.getByText('Sporting Merit Presentation')).toBeVisible();
  await expect(dialog.getByText('Sporting Merit isolated source', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close suggestion review' }).click();

  await openWorkspaceMenu(page);
  await page.getByRole('combobox', { name: 'Switch project' }).selectOption(pbj.id);
  await expect(page.getByRole('combobox', { name: 'Switch project' })).toHaveValue(pbj.id);
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Storyboard suggestions' });
  await expect(dialog.getByText('PB&J separate course', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Sporting Merit Presentation')).toHaveCount(0);
  await expect(dialog.getByText('No references added')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close suggestion review' }).click();
  const [left, right] = await Promise.all([
    request.get(`/api/projects/${sporting.id}`),
    request.get(`/api/projects/${pbj.id}`),
  ]);
  expect((await left.json()).storyboard.projectId).toBe(sporting.id);
  expect((await right.json()).storyboard.projectId).toBe(pbj.id);
});

test('New Project opens an independently identified course, not the previous storyboard', async ({ page, request }) => {
  let sporting = await (await request.post('/api/projects',
    { data: { title: 'Sporting Merit original' } })).json();
  sporting = await (await request.post(`/api/projects/${sporting.id}/scenes`, {
    data: { title: 'Sporting Merit lesson', extractedText: ['Performance data'] },
    headers: { 'If-Match': `"${sporting.storyboard.revision}"` },
  })).json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), sporting.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Project' }).getByRole('button', { name: 'Start with an idea' }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill('The Big-Top PB&J Show');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  const selectedId = await page.getByRole('combobox', { name: 'Switch project' }).inputValue();
  expect(selectedId).not.toBe(sporting.id);
  const fresh = await (await request.get(`/api/projects/${selectedId}`)).json();
  expect(fresh.title).toBe('The Big-Top PB&J Show');
  expect(fresh.storyboard.scenes).toHaveLength(0);
  expect(fresh.storyboard.projectId).toBe(selectedId);
  const old = await (await request.get(`/api/projects/${sporting.id}`)).json();
  expect(old.storyboard.scenes.map(scene => scene.title)).toEqual(['Sporting Merit lesson']);
});
