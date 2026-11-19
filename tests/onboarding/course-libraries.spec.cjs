const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio is opt-in');

async function setup(page, request) {
  let project = await (await request.post('/api/projects', { data: { title: 'Course library scope synthetic' } })).json();
  for (const title of ['Scene alpha', 'Scene beta']) {
    const response = await request.post(`/api/projects/${project.id}/scenes`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { title, extractedText: ['Short source content.'] },
    });
    expect(response.ok()).toBeTruthy(); project = await response.json();
  }
  for (const [title, sceneIds] of [['Shared course source', []], ['Alpha source', [project.storyboard.scenes[0].id]], ['Beta source', [project.storyboard.scenes[1].id]]]) {
    const response = await request.post(`/api/projects/${project.id}/reference-resources`, {
      multipart: { title, source_kind: 'text', scene_ids: JSON.stringify(sceneIds), file: { name: title + '.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic material for ' + title) } },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/'); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Studio 2.0 preview', exact: true }).click();
  return project;
}

test('course tools replace scene-pane actions and sources filter using existing scope', async ({ page, request }) => {
  const project = await setup(page, request);
  const tools = page.getByRole('group', { name: 'Course tools' });
  const nav = page.getByRole('navigation', { name: 'Studio scenes' });
  await expect(nav.getByRole('button', { name: 'Sources', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Media library', exact: true })).toHaveCount(0);
  await tools.getByRole('button', { name: 'Sources', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sources', exact: true });
  await expect(dialog.getByText('Shared course source', { exact: false }).first()).toBeVisible();
  await dialog.getByLabel('Filter sources by scene', { exact: true }).selectOption(project.storyboard.scenes[0].id);
  await expect(dialog.locator('.saved-sources summary')).toHaveCount(2);
  await expect(dialog.locator('.saved-sources summary').filter({ hasText: 'Shared course source' })).toBeVisible();
  await expect(dialog.locator('.saved-sources summary').filter({ hasText: 'Alpha source' })).toBeVisible();
  await expect(dialog.locator('.saved-sources summary').filter({ hasText: 'Beta source' })).toHaveCount(0);
  await dialog.getByLabel('Filter sources by scene', { exact: true }).selectOption('');
  await expect(dialog.locator('.saved-sources summary')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Pasted text', exact: false }).click();
  await dialog.getByLabel('Source scope', { exact: true }).selectOption(project.storyboard.scenes[1].id);
  await dialog.getByLabel('Source title', { exact: true }).fill('UI assigned beta source');
  await dialog.getByLabel('Source text', { exact: true }).fill('A new synthetic source scoped to beta.');
  await dialog.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(dialog.locator('.saved-sources summary')).toHaveCount(4);
  const sources = await (await request.get(`/api/projects/${project.id}/reference-resources`)).json();
  expect(sources.find(source => source.title === 'UI assigned beta source').sceneIds).toEqual([project.storyboard.scenes[1].id]);
});

test('media opens course-wide and scene filtering uses the matching attachment target', async ({ page, request }) => {
  let project = await setup(page, request);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
  let response = await request.post(`/api/projects/${project.id}/assets`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, multipart: { file: { name: 'library-synthetic.png', mimeType: 'image/png', buffer: image } },
  });
  // Authoring preparation can advance the revision after the fixture opens.
  if (response.status() === 409) {
    project = await (await request.get(`/api/projects/${project.id}`)).json();
    response = await request.post(`/api/projects/${project.id}/assets`, { headers: { 'If-Match': `"${project.storyboard.revision}"` }, multipart: { file: { name: 'library-synthetic.png', mimeType: 'image/png', buffer: image } } });
  }
  expect(response.ok()).toBeTruthy(); project = await response.json();
  await page.reload(); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Studio 2.0 preview', exact: true }).click();
  await page.getByRole('group', { name: 'Course tools' }).getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(page.getByLabel('Filter media by scene', { exact: true })).toHaveValue('');
  await expect(page.locator('.other-project-media')).toHaveAttribute('open', '');
  await page.getByLabel('Filter media by scene', { exact: true }).selectOption(project.storyboard.scenes[1].id);
  await expect(page.getByRole('region', { name: 'Selected scene media', exact: true })).toContainText('Scene beta');
  await page.locator('.other-project-media > summary').click();
  const attach = page.getByRole('button', { name: /Attach to scene/ });
  await expect(attach).toBeEnabled(); await attach.click(); await expect(page.getByRole('region', { name: 'Selected scene media', exact: true }).getByRole('button', { name: 'Detach media', exact: true })).toBeVisible();
  const stored = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes[1].imageAssets).toContain(project.storyboard.assets[0].id);
  expect(stored.storyboard.scenes[0].imageAssets).not.toContain(project.storyboard.assets[0].id);
});

test('course Sources retains the existing unsaved-scene guard', async ({ page, request }) => {
  await setup(page, request); await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.locator('.studio-inline-editor').getByRole('toolbar', { name: 'Scene menus' }).getByRole('button', { name: 'Insert', exact: true }).click();
  await page.locator('.studio-inline-editor').getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByRole('group', { name: 'Course tools' }).getByRole('button', { name: 'Sources', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Unsaved scene changes', exact: true });
  await expect(prompt).toBeVisible(); await prompt.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.locator('.studio-inline-editor')).toHaveAttribute('data-dirty', 'true');
});
