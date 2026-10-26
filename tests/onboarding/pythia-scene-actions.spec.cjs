const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const online = {
  health: { status: 'ok' },
  capabilities: { capabilities: ['storyboard.analyze', 'storyboard.transform', 'assessment.design'] },
  supportsStoryboardAnalyze: true,
  supportsStoryboardTransform: true,
  supportsAssessmentDesign: true,
};

async function setup(page, respond) {
  const response = await page.request.post('/api/projects', { data: { title: 'Pythia toolbar' } });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  const scene = await page.request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'Pythia scene' },
  });
  expect(scene.ok()).toBeTruthy();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects/*/pythia-status', respond);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  return page.getByRole('button', { name: 'Pythia', exact: true });
}

test('Pythia stays disabled while checking and reports a missing connection', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const toggle = await setup(page, async route => {
    await pending;
    await route.fulfill({ status: 503, json: { detail: 'Engine unavailable' } });
  });
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute('title', 'Checking Pythia connection...');
  await expect(page.getByText('Checking Pythia connection...', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit scene', exact: true })).toBeEnabled();
  release();
  await expect(toggle).toHaveAttribute('title', 'Pythia connection unavailable (503). Check Settings > Intelligence Engine.');
  const tooltipTarget = page.locator('.pythia-scene-toggle');
  await expect(tooltipTarget).toHaveAttribute('title', await toggle.getAttribute('title'));
  await tooltipTarget.hover();
  await expect(toggle).toHaveCSS('pointer-events', 'none');
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Pythia scene tools' })).toHaveCount(0);
});

test('connection retry enables the group and loss of health closes it', async ({ page }) => {
  await page.clock.install();
  let status = { ...online, health: { status: 'unavailable' } };
  const toggle = await setup(page, route => route.fulfill({ json: status }));
  await expect(toggle).toHaveAttribute('title', 'Pythia Engine is not healthy. Check Settings > Intelligence Engine.');
  await expect(toggle).toBeDisabled();
  status = online;
  await page.getByRole('button', { name: 'Check Pythia connection', exact: true }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('title', 'Pythia scene tools');
  await toggle.click();
  await expect(page.getByRole('group', { name: 'Pythia scene tools' })).toBeVisible();
  status = { ...online, health: { status: 'unavailable' } };
  await page.clock.fastForward(30000);
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Pythia scene tools' })).toHaveCount(0);
});

test('the connected group preserves capability gates and keyboard dismissal', async ({ page }) => {
  const toggle = await setup(page, route => route.fulfill({ json: { ...online, supportsStoryboardTransform: false } }));
  await expect(page.getByRole('button', { name: 'Analyze with Pythia', exact: true })).toHaveCount(0);
  await expect(toggle).toBeEnabled();
  await toggle.click();
  const group = page.getByRole('group', { name: 'Pythia scene tools' });
  await expect(group.getByRole('button', { name: 'Analyze with Pythia' })).toBeEnabled();
  await expect(group.getByRole('button', { name: 'Transform with Pythia' })).toBeDisabled();
  await expect(group.getByRole('button', { name: 'Design assessment' })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(group.getByRole('button', { name: 'Analyze with Pythia' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(group).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole('heading', { name: 'Pythia scene', exact: true }).click();
  await expect(group).toHaveCount(0);
});

for (const [action, close] of [
  ['Analyze with Pythia', 'Close Pythia analysis'],
  ['Transform with Pythia', 'Close Pythia transformation'],
  ['Design assessment', 'Close assessment design'],
]) {
  test(`Pythia group opens ${action}`, async ({ page }) => {
    const toggle = await setup(page, route => route.fulfill({ json: online }));
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await page.getByRole('group', { name: 'Pythia scene tools' }).getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Pythia scene tools' })).toHaveCount(0);
    await page.getByRole('button', { name: close, exact: true }).click();
  });
}

for (const theme of ['light', 'dark']) {
  test(`Pythia group fits desktop and mobile in ${theme} appearance`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('chimera.appearance', theme), theme);
    const toggle = await setup(page, route => route.fulfill({ json: online }));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(toggle).toBeEnabled();
      await toggle.click();
      const group = page.getByRole('group', { name: 'Pythia scene tools' });
      const bounds = await group.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).include('.scene-context-actions').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`${theme}-${width}.png`) });
      await toggle.focus();
      await page.keyboard.press('Escape');
      await expect(group).toHaveCount(0);
    }
  });
}