const { test, expect } = require('@playwright/test');
const { mockMediaConnections } = require('./media-connection-fixtures.cjs');
test('canvas selection synchronizes handles and layer indicators', async ({ page, request }) => {
  await mockMediaConnections(page);
  let project = await (await request.post('/api/projects', { data: { title: 'Layer focus regression' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Focus scene' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  project = await (await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, { data: { visualLayout: {
    enabled: true, width: 1280, height: 720, elements: [
      { id: 'first', kind: 'text', name: 'First layer', text: 'First object', x: 80, y: 100, width: 300, height: 100, fontSize: 28 },
      { id: 'second', kind: 'text', name: 'Second layer', text: 'Second object', x: 500, y: 300, width: 300, height: 100, fontSize: 28 }
    ]
  } }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog').last();
  await expect(editor.getByRole('button', { name: 'Enable scene timeline', exact: true })).toHaveCount(0);
  await expect(editor.getByRole('spinbutton', { name: 'Scene duration (s)', exact: true })).toHaveValue('30');
  const handles = editor.locator('.visual-resize-handle-se');
  await expect(handles).toHaveCount(0);
  await editor.getByRole('button', { name: 'First object element', exact: true }).click();
  await expect(handles).toHaveCount(1);
  await editor.locator('.visual-inspector summary').filter({ hasText: /^Layers$/ }).click();
  const layers = editor.locator('.visual-layers');
  await expect(layers.getByRole('button', { name: /First layer/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.locator('.visual-layer-checks').getByLabel('First layer', { exact: true })).toBeChecked();
  await editor.getByRole('button', { name: 'Second object element', exact: true }).click({ modifiers: ['Control'] });
  await expect(handles).toHaveCount(2);
  await expect(editor.locator('.visual-layer-checks input:checked')).toHaveCount(2);
  await expect(layers.locator('[aria-pressed="true"]')).toHaveCount(2);
  await editor.getByRole('button', { name: 'First object element', exact: true }).click({ modifiers: ['Control'] });
  await expect(handles).toHaveCount(1);
  await expect(editor.locator('.visual-layer-checks input:checked')).toHaveCount(1);
  await layers.getByRole('button', { name: /First layer/ }).click({ modifiers: ['Control'] });
  await expect(handles).toHaveCount(2);
  const positions = () => editor.locator('.visual-editable').evaluateAll(nodes => nodes.map(node => node.parentElement.style.transform));
  const beforeMove = await positions();
  await editor.getByRole('button', { name: 'Second object element', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const afterMove = await positions();
  expect(afterMove[0]).not.toBe(beforeMove[0]);
  expect(afterMove[1]).not.toBe(beforeMove[1]);
  await expect(handles).toHaveCount(2);
  await page.keyboard.press('Control+z');
  expect(await positions()).toEqual(beforeMove);
  await page.keyboard.press('Control+Shift+z');
  expect(await positions()).toEqual(afterMove);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  expect(await positions()).toEqual(afterMove);
  await layers.getByRole('button', { name: /Second layer/ }).click();
  await expect(editor.getByRole('button', { name: 'Second object element', exact: true })).toHaveClass(/is-selected/);
  await expect(editor.getByRole('button', { name: 'First object element', exact: true })).not.toHaveClass(/is-selected/);
  await expect(editor.locator('.visual-layer-checks').getByLabel('First layer', { exact: true })).not.toBeChecked();
  await expect(editor.locator('.visual-layer-checks').getByLabel('Second layer', { exact: true })).toBeChecked();
  await expect(handles).toHaveCount(1);
  await editor.locator('.visual-stage').click({ position: { x: 10, y: 10 } });
  await expect(handles).toHaveCount(0);
  await expect(layers.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(editor.locator('.visual-layer-checks input:checked')).toHaveCount(0);
  await layers.getByRole('button', { name: /First layer/ }).click();
  await layers.getByRole('button', { name: /Second layer/ }).click({ modifiers: ['Control'] });
  await editor.locator('.visual-inspector summary').filter({ hasText: /^Animation$/ }).click();
  await editor.getByLabel('entrance effect', { exact: true }).selectOption('fade');
  await editor.getByLabel('entrance duration (ms)', { exact: true }).fill('1200');
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].visualLayout.timeline.durationMs).toBe(30000);
  for (const element of saved.storyboard.scenes[0].visualLayout.elements) {
    expect(element.animations.entrance).toMatchObject({ effect: 'fade', durationMs: 1200 });
  }

});

test('default timelines contain existing timing and preserve authored timelines', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { withSceneTimeline } = await import('/src/scene-timeline.ts');
    const existing = { version: 1, durationMs: 45000, printTimeMs: 1200, clips: [{ id: 'retained' }], cues: [{ id: 'cue' }] };
    const empty = withSceneTimeline({ elements: [] });
    const long = withSceneTimeline({ elements: [{ timing: { startMs: 0, endMs: 65000 } }] });
    const preserved = withSceneTimeline({ elements: [], timeline: existing });
    return { empty: empty.timeline.durationMs, long: long.timeline.durationMs, preserved: preserved.timeline, same: preserved.timeline === existing };
  });
  expect(result.empty).toBe(30000);
  expect(result.long).toBe(65000);
  expect(result.same).toBe(true);
  expect(result.preserved).toMatchObject({ durationMs: 45000, printTimeMs: 1200, clips: [{ id: 'retained' }], cues: [{ id: 'cue' }] });
});
