const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('author direction drives real Pythia drafts that update and add scenes only after apply', async ({ page, request }, testInfo) => {
  test.skip(process.env.CHIMERA_PYTHIA_LIVE_BROWSER !== '1', 'Explicit opt-in for three real provider calls');
  test.setTimeout(240000);
  // Forward real requests to the isolated backend using the app's allowed
  // local origin. No model responses or application routes are mocked.
  await page.route(/\/pythia-conversation(?:\/.*)?$/, async route => {
    const response = await route.fetch({ url: 'http://127.0.0.1:8027' + new URL(route.request().url()).pathname,
      headers: { ...route.request().headers(), origin: 'http://127.0.0.1:5173' } });
    await route.fulfill({ response });
  });
  let response = await request.post('/api/projects', { data: { title: 'Fictional Pythia action qualification' } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  response = await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Approval workflow', extractedText: ['Two category labels are ambiguous.'], narration: 'Preserve this narration.' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok()).toBeTruthy();
  project = await response.json();
  const getProject = async () => (await request.get(`/api/projects/${project.id}`)).json();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Switch project', exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: 'Talk to Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Talk to Pythia', exact: true });
  await expect(dialog.getByLabel('Author direction', { exact: true })).toBeEnabled();
  await dialog.getByLabel('Author direction', { exact: true }).fill('Use short plain sentences for a first-time operator.');
  await dialog.getByLabel(/Include current scene text/).check();
  await dialog.getByLabel('Your message', { exact: true }).fill('Suggest a clearer practical opening for this fictional scene. Keep your advice brief.');
  await dialog.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(dialog.locator('.pythia-talk-answer')).toHaveCount(1, { timeout: 90000 });
  const initial = await getProject();
  await dialog.getByRole('button', { name: 'Draft changes from this advice', exact: true }).click();
  await dialog.getByLabel('Author direction', { exact: true }).fill("Change only the scene title to exactly 'Check the labels first' and screen text to exactly one paragraph: 'Confirm the category before submitting.' Preserve narration, notes, and all other fields.");
  await dialog.getByRole('button', { name: 'Generate content draft', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply changes', exact: true })).toBeEnabled({ timeout: 90000 });
  expect((await getProject()).storyboard).toEqual(initial.storyboard);
  await expect(dialog.locator('.pythia-action-diff')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(dialog.getByText(/Applied to storyboard revision/)).toBeVisible();
  const updated = await getProject();
  expect(updated.storyboard.scenes[0].title).toBe('Check the labels first');
  expect(updated.storyboard.scenes[0].extractedText).toEqual(['Confirm the category before submitting.']);
  expect(updated.storyboard.scenes[0].narration).toBe('Preserve this narration.');
  expect(updated.storyboard.revision).toBe(initial.storyboard.revision + 1);
  if (updated.storyboard.scenes[0].visualLayout) {
    const texts = updated.storyboard.scenes[0].visualLayout.elements.filter(element => element.kind === 'text').map(element => element.text);
    expect(texts).toContain('Check the labels first');
    expect(texts).toContain('Confirm the category before submitting.');
  }
  await dialog.getByRole('combobox', { name: 'Content action', exact: true }).selectOption('add-scenes');
  await dialog.getByLabel('Author direction', { exact: true }).fill("Add exactly one new content scene titled 'Category check' with exactly one screen paragraph: 'Choose the matching label before sending.' Keep all existing scenes unchanged.");
  await dialog.getByRole('button', { name: 'Generate content draft', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply changes', exact: true })).toBeEnabled({ timeout: 90000 });
  expect((await getProject()).storyboard).toEqual(updated.storyboard);
  await dialog.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(dialog.getByText(/Applied to storyboard revision/)).toHaveCount(2);
  const appended = await getProject();
  expect(appended.storyboard.scenes).toHaveLength(2);
  expect(appended.storyboard.scenes[0]).toEqual(updated.storyboard.scenes[0]);
  expect(appended.storyboard.scenes[1].title).toBe('Category check');
  const conversation = await (await request.get(`/api/projects/${project.id}/pythia-conversation`)).json();
  expect(conversation.turns[0].direction).toBe('Use short plain sentences for a first-time operator.');
  expect(conversation.actions.map(action => action.result.producer_id)).toEqual(['live-chimera-authoring-v1', 'live-chimera-authoring-v1']);
  expect(conversation.actions.every(action => action.status === 'applied')).toBe(true);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('pythia-actions-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close Pythia conversation', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Talk to Pythia', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Talk to Pythia', exact: true });
  await expect(restored.getByText(/Applied to storyboard revision/)).toHaveCount(2);
  await expect(restored.getByLabel('Author direction', { exact: true })).toHaveValue(conversation.authorDirection);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await restored.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pythia-actions-mobile.png'), fullPage: true });
});
