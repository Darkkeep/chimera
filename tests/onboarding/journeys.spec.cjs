const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { guide, expectStep, startChimera, createProject, saveScene } = require('./helpers.cjs');
const unique = title => `${title} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;

test('Chimera confirms real saves, resumes after reload, and finishes review', async ({ page }) => {
  await startChimera(page); const course = unique('Onboarding'); await createProject(page, course);
  const scene = unique('First scene'); await saveScene(page, scene);
  const projectId = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const stored = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(stored.storyboard.scenes.at(-1).title).toBe(scene);
  await page.unroute('**/api/projects'); await page.reload();
  await expect(page.getByRole('heading', { name: course, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click();
  await expectStep(page, 'Review your saved content');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'Walkthrough complete');
  await guide(page).getByRole('button', { name: 'Close guide' }).click();
  await expect(guide(page)).toHaveCount(0);
});

test('a failed save preserves draft and does not advance; retry succeeds', async ({ page }) => {
  await startChimera(page); await createProject(page, unique('Failure recovery'));
  await page.route('**/api/projects/*/scenes', route => route.fulfill({ status: 409, json: { detail: 'Revision conflict' } }));
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expectStep(page, 'Create a scene');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Keep this draft');
  await page.unroute('**/api/projects/*/scenes');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  await expectStep(page, 'Review your saved content');
});

test('missing control offers recovery, and Escape pauses without closing the draft', async ({ page }) => {
  await startChimera(page); await createProject(page, unique('Missing control'));
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('Draft survives pause');
  await page.locator('[data-onboarding="scene.form"]').evaluate(el => el.removeAttribute('data-onboarding'));
  await expect(guide(page).getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 7000 });
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).evaluate(el => el.closest('label').setAttribute('data-onboarding', 'scene.form'));
  await guide(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await expectStep(page, 'Create a scene');
  await page.keyboard.press('Escape');
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Draft survives pause');
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expectStep(page, 'Create a scene');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Draft survives pause');
});

test('guide controls participate in modal keyboard navigation and pass scoped axe checks', async ({ page }) => {
  await startChimera(page);
  await page.getByRole('textbox', { name: 'Course name' }).fill(unique('Keyboard'));
  await page.getByRole('textbox', { name: 'Course name' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expectStep(page, 'Create a scene');
  expect(await guide(page).evaluate(el => Boolean(el.closest('[role="dialog"]')))).toBe(true);
  const results = await new AxeBuilder({ page }).include('.onboarding-card').analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('chimera-guide.png') });
  await guide(page).getByRole('button', { name: 'Pause guide' }).click();
  await page.getByRole('button', { name: 'Close scene editor' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click();
  await expectStep(page, 'Create a scene');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).include('.onboarding-card').analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('chimera-guide-dark.png') });
});

test('standalone vanilla application uses the same engine for create, edit, complete', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click();
  await expectStep(page, 'Create a task');
  await page.getByRole('textbox', { name: 'TITLE', exact: true }).fill('Write the introduction');
  await page.getByRole('button', { name: 'Create task →' }).click();
  await expectStep(page, 'Refine the title');
  await page.getByRole('textbox', { name: 'Edit title for Write the introduction' }).fill('Review the introduction');
  await page.getByRole('button', { name: 'Save title' }).click();
  await expectStep(page, 'Mark it complete');
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expectStep(page, 'Walkthrough complete');
  await page.reload(); await expect(page.getByRole('button', { name: 'Completed', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('task-demo.items'))[0].done)).toBe(true);
});

test('standalone progress resumes and skipped steps remain incomplete', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188');
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click();
  await expectStep(page, 'Create a task');
  await page.getByRole('textbox', { name: 'TITLE', exact: true }).fill('Practice');
  await page.getByRole('button', { name: 'Create task →' }).click(); await expectStep(page, 'Refine the title');
  await page.reload(); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click(); await expectStep(page, 'Refine the title');
  await guide(page).getByRole('button', { name: 'Skip step' }).click(); await expectStep(page, 'Mark it complete');
  await guide(page).getByRole('button', { name: 'Skip step' }).click(); await expectStep(page, 'Walkthrough ended');
  await expect(guide(page)).toContainText('2 step(s) skipped');
});

test('manually created projects do not inherit completed walkthroughs', async ({ page }) => {
  await startChimera(page); await createProject(page, unique('Completed project'));
  await saveScene(page, 'Practice scene'); await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'Walkthrough complete'); await guide(page).getByRole('button', { name: 'Close guide' }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill(unique('Separate project'));
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Start / resume walkthrough' }).click(); await expectStep(page, 'Create a scene');
});

test('standalone guide remains usable in a narrow window with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5188'); await page.getByRole('button', { name: 'Start / resume walkthrough' }).click();
  await expectStep(page, 'Create a task');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('demo-narrow.png'), fullPage: true });
});
