const { test, expect } = require('@playwright/test');

test('Settings opens Pythia diagnostics under its product name', async ({ page }) => {
  await page.route('**/api/intelligence-engine', route => route.fulfill({ json: {
    available: true, canViewUsage: false, health: { status: 'ok', version: 'test' },
    capabilities: {}, providerRegistry: {}, telemetry: {},
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.locator('#workspace-settings');
  await expect(settings.getByRole('button', { name: 'Intelligence Engine', exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pythia', exact: true });
  await expect(dialog.getByText('Available', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Pythia settings', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
