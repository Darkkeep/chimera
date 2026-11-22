const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio preview is opt-in');
async function setup(page, request) {
  let project = await (await request.post('/api/projects', { data: { title: 'Direct stage synthetic' } })).json();
  for (const title of ['First editing scene', 'Second editing scene']) {
    const response = await request.post(`/api/projects/${project.id}/scenes`, { headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { title, extractedText: ['A short editable instruction.'] } });
    expect(response.ok()).toBeTruthy(); project = await response.json();
  }
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/'); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Show workspace menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Chimera2 Studio', exact: true }).click();
  return project;
}
for (const width of [1440, 1100, 390]) test(`scene selection opens the actual stage directly at ${width}`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: 1000 }); const project = await setup(page, request);
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  await expect(studio.locator('.studio-inline-editor')).toHaveAttribute('data-scene-id', project.storyboard.scenes[0].id);
  await expect(studio.getByRole('button', { name: 'Edit scene properties', exact: true })).toHaveCount(0);
  await expect(studio.getByRole('complementary', { name: 'Scene inspector', exact: true })).toHaveCount(0);
  await expect(studio.getByRole('button', { name: 'Stage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.getByRole('button', { name: 'Pythia', exact: true })).toBeVisible();
  await expect(studio.getByRole('button', { name: 'Interaction', exact: true })).toBeVisible();
  const commands = studio.getByRole('toolbar', { name: 'Scene menus' });
  expect(await commands.locator('button').evaluateAll(nodes => nodes.filter(node => !node.closest('.editor-menu-popup')).slice(0, 3).map(node => node.getAttribute('aria-label') || node.textContent))).toEqual(['Undo canvas edit', 'Redo canvas edit', 'Scene']);
  await expect(studio.getByRole('button', { name: 'Add text', exact: true })).toHaveCount(0);
  await expect(studio.locator('.studio-contextual-hint')).toHaveCount(0);
  await studio.getByRole('navigation', { name: 'Studio scenes' }).getByRole('button', { name: /Second editing scene/ }).click();
  await expect(studio.locator('.studio-inline-editor')).toHaveAttribute('data-scene-id', project.storyboard.scenes[1].id);
  await expect(studio.locator('.studio-inline-editor')).toHaveAttribute('data-dirty', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath(`direct-stage-${width}.png`), fullPage: true, animations: 'disabled' });
});
test('stage Interaction switches share the dirty guard; Pythia opens without model calls', async ({ page, request }) => {
  await setup(page, request);
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  let modelPosts = 0;
  page.on('request', r => { if (r.method() === 'POST' && /pythia|conversation|treatment/.test(r.url())) modelPosts++; });
  await studio.getByRole('button', { name: 'Pythia', exact: true }).click();
  await expect(studio.getByRole('complementary', { name: 'Pythia consultation' })).toBeVisible();
  await studio.getByRole('button', { name: 'Close Pythia panel', exact: true }).click();
  await studio.locator('.studio-inline-editor').getByRole('toolbar', { name: 'Scene menus' }).getByRole('button', { name: 'Insert', exact: true }).click();
  await studio.locator('.studio-inline-editor').getByRole('menuitem', { name: 'Text', exact: true }).click();
  await studio.getByRole('button', { name: 'Interaction', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Unsaved scene changes', exact: true });
  await guard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(studio.locator('.studio-inline-editor')).toHaveAttribute('data-dirty', 'true');
  await studio.getByRole('button', { name: 'Interaction', exact: true }).click();
  await guard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(studio.getByRole('region', { name: 'Manual learner interaction editor' })).toBeVisible();
  await studio.getByRole('button', { name: 'Stage', exact: true }).click();
  await guard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(studio.locator('.studio-inline-editor')).toHaveAttribute('data-dirty', 'false');
  expect(modelPosts).toBe(0);
});
