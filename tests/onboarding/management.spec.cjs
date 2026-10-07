const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

function project(id, title) {
  return { id, title, sceneCount: 0, updatedAt: '2026-10-07T10:00:00Z', hasSourceDeck: false, productionStage: 'draft',
    storyboard: { revision: 1, scenes: [], assets: [], completionSettings: { passingScore: 80, includeOptionalAssessments: false }, exportSettings: { packageWarningThresholdMB: 200 } } };
}

async function mockWorkspace(page, options = {}) {
  const projects = options.empty ? [] : [project('alpha', 'Alpha course'), project('beta', 'Beta course')];
  while (projects.length < (options.projectCount || 0)) projects.push(project(`project-${projects.length + 1}`, `Project ${projects.length + 1}`));
  let stage = 'draft';
  await page.addInitScript(() => localStorage.setItem('chimera.activeProjectId', 'alpha'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = body => route.fulfill({ json: body });
    if (path === '/api/auth/config') return json({ deploymentMode: 'single-user', identityProvider: 'local', passwordLoginAvailable: false });
    if (path === '/api/projects') {
      if (route.request().method() === 'POST') {
        const created = project('new-project', route.request().postDataJSON().title);
        projects.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      return json(projects);
    }
    if (path === '/api/templates') return json([]);
    if (path === '/api/identity/context') return json({ actor: { actorDisplayName: 'Local user', actorId: 'local-user', installationId: 'local-installation' }, memberships: [{ role: 'author' }, { role: 'instructional-designer' }, { role: 'administrator' }], policy: { deploymentMode: 'single-user', trackingMode: 'local', auditRetentionDays: 365 } });
    if (path === '/api/management/audit') return json({ events: options.events || [] });
    if (path === '/api/management/project-health') {
      if (options.healthFailure) return route.fulfill({ status: 503, json: { detail: 'Unavailable' } });
      return json(projects.map(item => ({ projectId: item.id, title: item.title, revision: 1, sceneCount: 0, pendingProposals: 0, unresolvedComments: 0, publicationBlockers: 2, authoringWarnings: 1, updatedAt: item.updatedAt, productionStage: stage, productionPassed: false, canEdit: !options.readOnly, canSetStage: !options.readOnly,
        blockerCounts: { 'missing-asset-file': 1, 'missing-media-attribution': 1 }, blockers: [{ code: 'missing-asset-file', message: 'Restore or remove the missing asset: image.png.', sceneTitle: null }, { code: 'missing-media-attribution', message: 'Complete attribution for image.png before production release.', sceneTitle: 'image.png' }] })));
    }
    if (path.endsWith('/production-stage')) {
      if (options.stageFailure) return route.fulfill({ status: 403, json: { detail: 'Denied' } });
      stage = route.request().postDataJSON().productionStage;
      return json({ ...projects[0], productionStage: stage });
    }
    if (path.endsWith('/readiness')) return json({ publicationBlockers: 1, pendingProposals: 0, unresolvedComments: 0, outdatedComments: 0, missingMedia: 0 });
    const selected = projects.find(item => path === `/api/projects/${item.id}`);
    if (selected) {
      if (selected.id === 'alpha' && options.restoreGate) await options.restoreGate;
      if (options.openFailure && selected.id === 'beta') return route.fulfill({ status: 500, json: { detail: 'Unavailable' } });
      return json(selected);
    }
    return route.fulfill({ status: 404, json: { detail: 'Not found' } });
  });
}

test('opens My Work on launch and refresh, with detailed blockers', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button').first()).toHaveText('My Work');
  await expect(page.getByRole('button', { name: 'Edit Alpha course', exact: true })).toBeVisible();
  await expect(page.getByText('Missing media files: 1; Missing media attribution: 1')).toHaveCount(2);
  await page.locator('.health-blockers summary').first().click();
  await expect(page.getByText('Restore or remove the missing asset: image.png.').first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
});

test('New Project on My Work opens creation and enters authoring after saving', async ({ page }) => {
  await mockWorkspace(page, { empty: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close new project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Course name', exact: true }).fill('Created from My Work');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Created from My Work', exact: true })).toBeVisible();
  await expect(page.getByLabel('Add scene', { exact: true })).toBeEnabled();
});

test('opens the remembered project and another project in authoring', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit Alpha course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha course', exact: true })).toBeVisible();
  await expect(page.getByLabel('Add scene', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'My Work', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Beta course', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Beta course', exact: true })).toBeVisible();
  await expect(page.getByLabel('Add scene', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'My Work', exact: true }).click();
  await page.locator('.health-row').first().locator('td').last().click();
  await expect(page.getByRole('heading', { name: 'Alpha course', exact: true })).toBeVisible();
});

test('waits for startup restoration before opening another project', async ({ page }) => {
  let release;
  const restoreGate = new Promise(resolve => { release = resolve; });
  await mockWorkspace(page, { restoreGate });
  await page.goto('/');
  const projectButton = page.getByRole('button', { name: 'Edit Beta course', exact: true });
  await expect(projectButton).toBeVisible();
  await expect(projectButton).toBeDisabled();
  release();
  await projectButton.click();
  await expect(page.getByRole('heading', { name: 'Beta course', exact: true })).toBeVisible();
});

test('saves stage independently from blocked publication checks', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/');
  const stage = page.getByRole('combobox', { name: 'Production stage for Alpha course', exact: true });
  await stage.selectOption('in-review');
  await expect(stage).toHaveValue('in-review');
  await expect(page.getByRole('status')).toContainText('In review saved.');
  await expect(page.getByText('Publication checks blocked')).toHaveCount(2);
  await page.reload();
  await expect(stage).toHaveValue('in-review');
});

test('failed stage save preserves the previous stage', async ({ page }) => {
  await mockWorkspace(page, { stageFailure: true });
  await page.goto('/');
  const stage = page.getByRole('combobox', { name: 'Production stage for Alpha course', exact: true });
  await stage.selectOption('published');
  await expect(page.getByRole('alert')).toContainText('permission');
  await expect(stage).toHaveValue('draft');
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
});

test('failed project opening keeps dashboard visible with an error', async ({ page }) => {
  await mockWorkspace(page, { openFailure: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit Beta course', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Project could not be opened');
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
});

test('empty and failed health states are distinct', async ({ page }) => {
  await mockWorkspace(page, { empty: true });
  await page.goto('/');
  await expect(page.getByText('No projects yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume authoring' })).toBeDisabled();
});

test('unavailable health is not shown as an empty workspace', async ({ page }) => {
  await mockWorkspace(page, { healthFailure: true });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Project health unavailable');
  await expect(page.getByText('Project health is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
});

test('review-only health does not expose editable stage controls', async ({ page }) => {
  await mockWorkspace(page, { readOnly: true });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Alpha course', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Production stage for/ })).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`${theme} dashboard is accessible and fits desktop/mobile`, async ({ page }) => {
    await mockWorkspace(page);
    await page.addInitScript(value => localStorage.setItem('chimera.appearance', value), theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Edit Alpha course', exact: true })).toBeVisible();
    const summary = await page.locator('.management-summary > *').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
    expect(new Set(summary).size).toBe(1);
    expect((await new AxeBuilder({ page }).include('.management-view').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/management-${theme}-desktop.png`, fullPage: true });
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('combobox', { name: 'Production stage for Alpha course', exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/management-${theme}-mobile.png`, fullPage: true });
  });
}

test('recent activity starts collapsed and supports keyboard expansion', async ({ page }) => {
  await mockWorkspace(page, { events: [{ eventId: 'activity-1', eventName: 'project.created', eventClass: 'operational', occurredAt: '2026-10-07T10:00:00Z', projectId: 'alpha' }] });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Edit Alpha course', exact: true })).toBeVisible();
  const activity = page.locator('.management-activity');
  await expect(activity).not.toHaveAttribute('open');
  await expect(activity.locator('.audit-list')).toBeHidden();
  await activity.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(activity).toHaveAttribute('open', '');
  await expect(activity.locator('.audit-list')).toContainText('project / created');
  await activity.locator('summary').click();
  await expect(activity.locator('.audit-list')).toBeHidden();
  await page.reload();
  await expect(page.locator('.management-activity')).not.toHaveAttribute('open');
});

test('expanded recent activity scrolls independently on desktop and mobile', async ({ page }) => {
  const events = Array.from({ length: 12 }, (_, index) => ({ eventId: `activity-${index}`, eventName: 'project.created', eventClass: 'operational', occurredAt: '2026-10-07T10:00:00Z', projectId: 'alpha' }));
  await mockWorkspace(page, { events });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Edit Alpha course', exact: true })).toBeVisible();
  await page.locator('.management-activity > summary').click();
  const activity = page.getByRole('region', { name: 'Recent activity list', exact: true });
  await expect(activity.locator('li')).toHaveCount(12);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await activity.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await activity.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
    await activity.evaluate(element => { element.scrollTop = 0; });
    await activity.scrollIntoViewIfNeeded();
    await activity.focus();
    await page.keyboard.press('End');
    await expect.poll(() => activity.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(activity.locator('li').last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.management-activity').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/management-activity-scroll-${width}.png`, fullPage: true });
  }
  await page.locator('.management-activity > summary').click();
  await expect(activity).toBeHidden();
});

for (const projectCount of [4, 5, 6]) {
  test(`project health scrolling threshold with ${projectCount} rows`, async ({ page }) => {
    await mockWorkspace(page, { projectCount });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.health-row')).toHaveCount(projectCount);
    const container = page.locator('.health-table-container');
    if (projectCount < 5) {
      await expect(container).not.toHaveClass(/is-scrollable/);
      expect(await container.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');
      return;
    }
    await expect(container).toHaveClass(/is-scrollable/);
    expect(await container.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await container.evaluate(element => getComputedStyle(element).overflowY)).toBe('scroll');
    await container.focus();
    await page.keyboard.press('End');
    await expect.poll(() => container.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: `Edit Project ${projectCount}`, exact: true })).toBeInViewport();
    expect((await new AxeBuilder({ page }).include('.management-view').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/management-scroll-${projectCount}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await container.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/management-scroll-${projectCount}-mobile.png`, fullPage: true });
  });
}

test('production stage persists through the API without revising the storyboard', async ({ request }) => {
  const created = await request.post('/api/projects', { data: { title: 'Management stage regression' } });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect(project.productionStage).toBe('draft');
  const updated = await request.patch(`/api/projects/${project.id}/production-stage`, { data: { productionStage: 'in-production' } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).storyboard.revision).toBe(project.storyboard.revision);
  const persisted = await request.get(`/api/projects/${project.id}`);
  expect((await persisted.json()).productionStage).toBe('in-production');
  expect((await request.patch(`/api/projects/${project.id}/production-stage`, { data: { productionStage: 'unknown' } })).status()).toBe(422);
});