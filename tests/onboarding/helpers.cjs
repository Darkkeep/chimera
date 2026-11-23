const { guide, expectStep } = require('@guided-workflows/onboarding/playwright');
exports.guide = guide;
exports.expectStep = expectStep;
exports.reloadAuthoring = async page => {
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
};
exports.startChimera = async page => {
  // Every browser gets an empty initial selector; all writes still use the isolated real API.
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: [] });
    else await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await exports.openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await exports.expectStep(page, 'Name your course');
};
exports.createProject = async (page, title) => {
  await page.getByRole('textbox', { name: 'Course name' }).fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await exports.expectStep(page, 'Create a scene');
};
exports.saveScene = async (page, title) => {
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'On-screen text', exact: true }).fill('Persistent onboarding content');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  await exports.expectStep(page, 'Review your saved content');
};

exports.openWorkspaceMenu = async page => {
  await page.locator('.workspace-menu-toggle').waitFor({ state: 'visible' });
  const show = page.getByRole('button', { name: 'Show workspace menu', exact: true });
  if (await show.isVisible()) {
    await show.click();
    await page.getByRole('button', { name: 'Hide workspace menu', exact: true }).waitFor({ state: 'visible' });
  }
};

exports.closeMobileWorkspaceMenu = async page => {
  if ((page.viewportSize()?.width || 1280) > 760) return;
  const hide = page.getByRole('button', { name: 'Hide workspace menu', exact: true });
  if (await hide.isVisible()) await hide.click();
};
