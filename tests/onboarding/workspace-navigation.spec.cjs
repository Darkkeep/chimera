const { test, expect } = require('@playwright/test');

test('desktop menu reclaims space and remembers the author preference', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/projects', route => route.request().method()==='GET' ? route.fulfill({json:[]}) : route.continue());
  await page.goto('/');
  const main = page.locator('#workspace-content');
  await expect(page.getByRole('button', { name: 'Hide workspace menu', exact: true })).toBeVisible();
  await expect.poll(async () => (await main.boundingBox()).width).toBe(1208);
  await page.getByRole('button', { name: 'Hide workspace menu', exact: true }).click();
  await expect.poll(async () => (await main.boundingBox()).width).toBe(1388);
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show workspace menu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show workspace menu', exact: true }).click();
  await expect.poll(async () => (await main.boundingBox()).width).toBe(1208);
});

test('mobile drawer contains keyboard focus, closes and opens authoring actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/projects', route => route.request().method()==='GET' ? route.fulfill({json:[]}) : route.continue());
  await page.goto('/');
  const show = page.getByRole('button', { name: 'Show workspace menu', exact: true });
  await show.focus();
  await page.keyboard.press('Enter');
  const hide = page.getByRole('button', { name: 'Hide workspace menu', exact: true });
  await expect(hide).toBeFocused();
  await expect(page.locator('#workspace-content')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.locator('.workspace-navigation').evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(hide).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(show).toBeFocused();
  await expect(page.locator('#workspace-content')).toHaveJSProperty('inert', false);
  await show.click();
  await page.getByRole('button', { name: 'Close workspace menu', exact: true }).click({ position: { x: 380, y: 100 } });
  await expect(show).toBeVisible();
  await show.click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('button', { name: 'Start with an idea', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toBeFocused();
  await expect(page.locator('#workspace-content')).toHaveJSProperty('inert', false);
});
