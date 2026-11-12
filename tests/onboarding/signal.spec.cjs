const { test, expect } = require('@playwright/test');
const { startChimera, createProject, saveScene } = require('./helpers.cjs');

test('Signal is discoverable without covering the Save scene action', async ({ page }) => {
  await startChimera(page);
  await createProject(page, 'Signal unobstructed save');
  const help = page.getByRole('button', { name: 'Help & Feedback' });
  await expect(help).toBeVisible();
  await expect(help.locator('xpath=ancestor::*[contains(@class, "sidebar-bottom")]')).toHaveCount(1);
  await saveScene(page, 'The save action remains clickable');
  await expect(help).toBeVisible();
});
