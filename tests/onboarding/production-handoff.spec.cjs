const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { guide, startChimera, createProject, saveScene } = require('./helpers.cjs');

test('Import JSON previews the Pythia proposal before adding scenes', async ({ page }) => {
  await startChimera(page);
  await createProject(page, `Handoff course ${Date.now()}`);
  await saveScene(page, 'Original authored scene');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Close guide' }).click();
  const projectId = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const readStoryboard = async () => {
    const response = await page.request.get(`/api/projects/${projectId}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).storyboard;
  };
  const before = await readStoryboard();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Import JSON', { exact: true }).setInputFiles(
    path.resolve('backend/tests/fixtures/production-handoff-v1.json'),
  );
  await expect(page.getByRole('heading', { name: 'Storyboard suggestions' })).toBeVisible();
  const proposal = page.locator('article.enhancement-proposal').filter({ hasText: 'Pythia production handoff' });
  await expect(proposal.getByText('pending', { exact: true })).toBeVisible();
  await expect(proposal.getByText(/When the alarm sounds, leave by the nearest marked exit/)).toBeVisible();
  await proposal.getByText('Objectives, assessment, interactions, media and sources', { exact: true }).click();
  await expect(proposal.getByText(/Floor exit map/)).toBeVisible();
  await expect(proposal.getByText(/Which route would you take/)).toBeVisible();
  await expect(proposal.getByText(/\(correct answer\)/)).toBeVisible();
  expect(await readStoryboard()).toEqual(before);

  await proposal.getByRole('button', { name: 'Accept change' }).click();
  await expect(proposal.getByText('accepted', { exact: true })).toBeVisible();
  const after = await readStoryboard();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.scenes.map(scene => scene.title)).toEqual([
    'Original authored scene', 'Leave by a marked exit', 'Check your understanding',
  ]);
  expect(after.scenes[2].assessmentItem.correctResponse).toBe('exit');
});
