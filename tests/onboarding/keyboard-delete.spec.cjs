const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio opt-in');

async function setup(page, request) {
  let project = await (await request.post('/api/projects', { data: { title: 'Keyboard deletion synthetic' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'Keyboard editing', extractedText: ['Keep this instruction.'] },
  })).json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Studio 2.0 preview', exact: true }).click();
  const editor = page.locator('.studio-inline-editor');
  await expect(editor).toBeVisible();
  return { project, editor };
}
async function command(editor, group, label) {
  await editor.getByRole('toolbar', { name: 'Scene menus' }).getByRole('button', { name: group, exact: true }).click();
  await editor.getByRole('menuitem', { name: label, exact: true }).click();
}

test('Delete removes a stage object, keyboard Undo restores it, and layer Backspace persists removal', async ({ page, request }) => {
  const { project, editor } = await setup(page, request);
  const objects = editor.locator('.visual-element');
  const initial = await objects.count();
  await command(editor, 'Insert', 'Rectangle');
  const rectangle = editor.getByRole('button', { name: 'rectangle element', exact: true });
  await rectangle.focus(); await page.keyboard.press('Delete');
  await expect(objects).toHaveCount(initial);
  const editorUrl = page.url();
  await page.keyboard.press('Backspace');
  expect(page.url()).toBe(editorUrl);
  await page.keyboard.press('Control+z');
  await expect(rectangle).toBeVisible();
  await editor.locator('.scene-timeline > summary').click();
  const layer = editor.locator('.timeline-object-row').getByRole('button', { name: 'rectangle', exact: true });
  await layer.focus(); await page.keyboard.press('Backspace');
  await expect(objects).toHaveCount(initial);
  // Keep another real edit so the save is available even after undoing insertion.
  await command(editor, 'Insert', 'Ellipse');
  await expect(editor.getByRole('button', { name: 'ellipse element', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveAttribute('data-dirty', 'false');
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].visualLayout.elements.some(item => item.name === 'rectangle')).toBe(false);
  expect(saved.storyboard.scenes[0].visualLayout.elements.some(item => item.name === 'ellipse')).toBe(true);
});

test('text editing and locked objects are protected from object deletion', async ({ page, request }) => {
  const { editor } = await setup(page, request);
  await command(editor, 'Insert', 'Text');
  const objects = editor.locator('.visual-element');
  const count = await objects.count();
  await objects.last().focus(); await page.keyboard.press('Enter');
  const text = editor.getByRole('textbox', { name: 'Edit canvas text' });
  await text.fill('Edit these characters');
  await text.press('Control+a'); await text.press('Backspace');
  await expect(text).toHaveValue(''); await expect(objects).toHaveCount(count);
  await text.press('Escape');
  await command(editor, 'Format', 'Object properties…');
  const propertyText = editor.getByRole('textbox', { name: 'Studio selected text' });
  await propertyText.fill('Property field text');
  await propertyText.press('Home'); await propertyText.press('Delete');
  await expect(propertyText).toHaveValue('roperty field text');
  await expect(objects).toHaveCount(count);
  await command(editor, 'Insert', 'Rectangle');
  await command(editor, 'Layers', 'Lock');
  const rectangle = editor.getByRole('button', { name: 'rectangle element', exact: true });
  await rectangle.focus(); await page.keyboard.press('Delete'); await page.keyboard.press('Backspace');
  await page.keyboard.down('Backspace'); await page.keyboard.down('Backspace'); await page.keyboard.up('Backspace');
  expect(page.url()).not.toBe('about:blank');
  await expect(rectangle).toBeVisible(); await expect(objects).toHaveCount(count + 1);
});
