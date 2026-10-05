const { expect } = require('@playwright/test');
const guide = page => page.getByRole('region', { name: 'Interactive guide' });
async function expectStep(page, title) {
  await expect(guide(page).getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(guide(page).getByRole('status')).not.toHaveText('Opening the task…');
}
module.exports = { guide, expectStep };
