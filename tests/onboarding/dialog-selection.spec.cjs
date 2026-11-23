const { test, expect } = require('@playwright/test');

test('dragging scene title selection onto backdrop preserves the new scene draft', async ({ page, request }) => {
  const response = await request.post('/api/projects', { data: { title: 'Dialog selection synthetic' } });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Add scene', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New scene', exact: true });
  const title = dialog.getByRole('textbox', { name: 'Scene title', exact: true });
  await title.fill('Keep this scene draft');
  const bounds = await title.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue('Keep this scene draft');
  // A deliberate click entirely on the backdrop must still dismiss the dialog.
  await page.mouse.click(5, bounds.y + bounds.height / 2);
  await expect(dialog).toHaveCount(0);
});
