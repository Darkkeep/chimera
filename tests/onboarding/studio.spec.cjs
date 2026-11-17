const { test, expect } = require('@playwright/test');
const { guide, startChimera, createProject, saveScene } = require('./helpers.cjs');

// The preview must be explicitly enabled in the Vite dev server AND in this test.
// Ordinary 1.x CI exercises the default-off interface without this suite changing it.
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio preview is intentionally opt-in');

test('Studio 2.0 reuses saved scenes, existing editor and reversible classic navigation', async ({ page }) => {
  await startChimera(page);
  await createProject(page, 'Studio 2.0 synthetic smoke');
  await saveScene(page, 'Verify the new authoring shell');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Close guide' }).click();

  await page.getByRole('button', { name: 'Studio 2.0 preview' }).click();
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  await expect(studio).toBeVisible();
  await expect(studio.getByRole('navigation', { name: 'Studio scenes' })).toBeVisible();
  await expect(studio.getByText('Verify the new authoring shell').first()).toBeVisible();
  await expect(studio.getByRole('button', { name: 'Edit on stage' })).toBeEnabled();

  await studio.getByRole('button', { name: 'Edit on stage' }).click();
  await expect(page.getByRole('dialog', { name: /Verify the new authoring shell/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close scene editor' }).click();
  await expect(studio).toBeVisible();

  let modelPosts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /pythia|conversation/.test(request.url())) modelPosts += 1;
  });
  await studio.getByRole('button', { name: 'Open consultation' }).click();
  await expect(studio.getByRole('complementary', { name: 'Pythia consultation' })).toBeVisible();
  await studio.getByRole('button', { name: 'Close Pythia panel' }).click();
  expect(modelPosts).toBe(0);

  await page.getByRole('button', { name: 'Classic storyboard' }).click();
  await expect(studio).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit scene', exact: true })).toBeVisible();
});
