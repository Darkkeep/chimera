const { test, expect } = require('@playwright/test');
const { mockMediaConnections } = require('./media-connection-fixtures.cjs');

test('scene duration accepts keyboard replacement and text layer insertion is labeled and persisted', async ({ page, request }) => {
  await mockMediaConnections(page);
  let project = await (await request.post('/api/projects', { data: { title: 'Keyboard timeline authoring' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Keyboard scene', extractedText: ['A stable starting scene.'] },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  let editor = page.getByRole('dialog').last();
  let duration = editor.getByRole('spinbutton', { name: 'Scene duration (s)', exact: true });
  await duration.focus();
  await duration.press('Control+a');
  await duration.press('Backspace');
  await expect(duration).toHaveValue('');
  await duration.pressSequentially('5.25');
  await duration.press('Enter');
  await expect(duration).toHaveValue('5.25');
  await duration.fill('0');
  await duration.press('Enter');
  await expect(duration).toHaveAttribute('aria-invalid', 'true');
  await expect(editor.getByRole('alert')).toContainText('between 0.1 and 3600');
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('alert').filter({ hasText: 'before saving' })).toBeVisible();
  await duration.focus();
  await duration.press('Escape');
  await expect(editor).toBeVisible();
  await expect(duration).toHaveValue('5.25');
  await duration.fill('75');
  await duration.press('Tab');
  await expect(duration).toHaveValue('75');
  const elementsBefore = await editor.locator('.visual-editable').count();
  const layers = editor.getByRole('group', { name: 'Add layers', exact: true });
  await expect(layers.getByRole('combobox', { name: 'Insert shape', exact: true })).toBeVisible();
  await layers.getByRole('button', { name: 'Add text layer', exact: true }).click();
  await expect(editor.locator('.visual-editable')).toHaveCount(elementsBefore + 1);
  await expect(editor.locator('.visual-editable.is-selected')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('.visual-editable')).toHaveCount(elementsBefore);
  await editor.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('.visual-editable')).toHaveCount(elementsBefore + 1);
  await editor.getByRole('spinbutton', { name: 'Object end (s)', exact: true }).fill('70');
  await duration.fill('60');
  await duration.press('Enter');
  await expect(editor.getByRole('status').filter({ hasText: 'must contain all objects' })).toBeVisible();
  await expect(duration).toHaveValue('75');
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].visualLayout.timeline.durationMs).toBe(75000);
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  editor = page.getByRole('dialog').last();
  duration = editor.getByRole('spinbutton', { name: 'Scene duration (s)', exact: true });
  await expect(duration).toHaveValue('75');
  await expect(editor.locator('.visual-editable')).toHaveCount(elementsBefore + 1);
  await duration.fill('3601');
  await duration.press('Enter');
  await expect(duration).toHaveAttribute('aria-invalid', 'true');
  await duration.press('Escape');
  await expect(duration).toHaveValue('75');
  await page.screenshot({ path: test.info().outputPath('text-layer-and-duration.png') });
});

test('failed question save does not display a success cue', async ({ page, request }) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Question save failure' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Question save check', sceneType: 'assessment' },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Create question', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Question save check', exact: true });
  await editor.getByRole('textbox', { name: 'Question prompt', exact: true }).fill('Choose the correct answer.');
  await editor.getByRole('textbox', { name: 'Text for CHOICE_A', exact: true }).fill('First answer');
  await editor.getByRole('textbox', { name: 'Text for CHOICE_B', exact: true }).fill('Second answer');
  await editor.getByRole('button', { name: 'Save question', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Question saved', exact: true })).toBeVisible();
  await editor.getByRole('textbox', { name: 'Question prompt', exact: true }).fill('An unsaved revision.');
  await page.route(`**/api/projects/${project.id}/scenes/*`, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, json: { detail: 'Synthetic save failure' } })
    : route.continue());
  await editor.getByRole('button', { name: 'Save question', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Synthetic save failure');
  await expect(editor.getByText(/^Saved to/)).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Question saved', exact: true })).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'Question prompt', exact: true })).toHaveValue('An unsaved revision.');
});
