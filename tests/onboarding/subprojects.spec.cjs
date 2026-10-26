const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function seed(page, request, theme = 'light') {
  const prefix = `Hierarchy ${Date.now()} ${Math.random().toString(16).slice(2, 7)}`;
  const create = async (name, parentProjectId = null) => {
    const response = await request.post('/api/projects', { data: { title: `${prefix} ${name}`, parentProjectId } });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const parent = await create('Parent');
  const other = await create('Other parent');
  const standalone = await create('Standalone');
  const first = await create('First child', parent.id);
  const second = await create('Second child', parent.id);
  await page.addInitScript(({ id, theme }) => {
    localStorage.setItem('chimera.activeProjectId', id);
    localStorage.setItem('chimera.appearance', theme);
  }, { id: parent.id, theme });
  for (const endpoint of ['/api/projects', '/api/management/project-health']) {
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const projects = await response.json();
      await route.fulfill({ response, json: projects.filter(project => project.title.startsWith(prefix)) });
    });
  }
  await page.route('**/api/ai-connection', route => route.fulfill({ json: { configured: false } }));
  await page.goto('/');
  const row = project => page.locator('.health-row').filter({ has: page.getByRole('button', { name: `Edit ${project.title}`, exact: true }) });
  const actions = async project => {
    const summary = row(project).locator('.project-hierarchy-actions > summary');
    if (await row(project).locator('.project-hierarchy-actions').getAttribute('open') === null) await summary.click();
  };
  await expect(row(parent)).toBeVisible();
  return { prefix, parent, other, standalone, first, second, row, actions };
}

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  test(`subprojects create, navigate and order independently in ${theme} at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await seed(page, request, theme);
    const { prefix, parent, first, second, row, actions } = fixture;
    const sourceScene = await request.post(`/api/projects/${parent.id}/scenes`, { data: { title: 'Parent-only scene' }, headers: { 'If-Match': `"${parent.storyboard.revision}"` } });
    expect(sourceScene.ok()).toBe(true);
    const withScene = await sourceScene.json();
    const asset = await request.post(`/api/projects/${parent.id}/assets`, {
      multipart: { file: { name: 'parent-only.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64') } },
      headers: { 'If-Match': `"${withScene.storyboard.revision}"` },
    });
    expect(asset.ok()).toBe(true);
    const withAsset = await asset.json();
    expect((await request.patch(`/api/projects/${parent.id}/background`, { data: { backgroundAsset: withAsset.storyboard.assets[0].id }, headers: { 'If-Match': `"${withAsset.storyboard.revision}"` } })).ok()).toBe(true);
    const parentBefore = await (await request.get(`/api/projects/${parent.id}`)).json();
    const expand = page.getByRole('button', { name: `Subprojects of ${parent.title}`, exact: true });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(row(first)).toHaveCount(0);
    await expand.press('Enter');
    await expect(row(first)).toBeVisible();
    await expect(row(second)).toBeVisible();
    await expect(row(parent)).toContainText('0 of 2 visible subprojects approved or published');
    await actions(parent);
    await row(parent).getByRole('button', { name: 'Create subproject', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`Creating a subproject of ${parent.title}`);
    await expect(page.getByRole('combobox', { name: 'Switch project', exact: true })).toBeDisabled();
    const childTitle = `${prefix} Created child`;
    await dialog.getByRole('textbox', { name: 'Course name', exact: true }).fill(childTitle);
    await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('heading', { name: childTitle, exact: true })).toBeVisible();
    const breadcrumb = page.getByRole('navigation', { name: 'Project hierarchy', exact: true });
    await expect(breadcrumb).toContainText(parent.title);
    await expect(breadcrumb).toContainText(childTitle);
    const activeId = await page.getByRole('combobox', { name: 'Switch project', exact: true }).inputValue();
    const child = await (await request.get(`/api/projects/${activeId}`)).json();
    expect(child.parentProjectId).toBe(parent.id);
    expect(child.sceneCount).toBe(0);
    expect(child.storyboard.assets).toEqual([]);
    expect(child.storyboard.backgroundAsset).toBeNull();
    await expect(page.getByRole('combobox', { name: 'Switch project' }).locator('optgroup').filter({ has: page.locator(`option[value="${activeId}"]`) })).toHaveAttribute('label', parent.title);
    await page.getByRole('button', { name: 'My Work', exact: true }).click();
    await expect(row(parent)).toBeVisible();
    const parentExpand = page.getByRole('button', { name: `Subprojects of ${parent.title}`, exact: true });
    await parentExpand.click();
    const created = { title: childTitle };
    await actions(created);
    await expect(row(created).getByRole('button', { name: 'Create subproject' })).toHaveCount(0);
    await row(created).getByRole('button', { name: 'Manage subproject', exact: true }).click();
    expect((await new AxeBuilder({ page }).include('.project-relationship-dialog').analyze()).violations).toEqual([]);
    await page.getByRole('spinbutton', { name: 'Display order', exact: true }).fill('-1');
    await expect(page.getByRole('button', { name: 'Save relationship', exact: true })).toBeDisabled();
    await page.getByRole('spinbutton', { name: 'Display order', exact: true }).fill('50');
    await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.subproject-row .health-project-link').last()).toHaveText(childTitle);
    expect((await (await request.get(`/api/projects/${activeId}`)).json()).siblingOrder).toBe(50);
    expect((await (await request.get(`/api/projects/${parent.id}`)).json()).storyboard).toEqual(parentBefore.storyboard);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.management-view').analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`subprojects-${theme}-${width}.png`), fullPage: true });
    await row(created).getByRole('button', { name: `Edit ${childTitle}`, exact: true }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText("not its parent or subprojects");
  });
}

test('existing projects attach, move, detach and reject stale relationship saves', async ({ page, request }) => {
  const { parent, other, standalone, row, actions } = await seed(page, request);
  await actions(parent);
  await row(parent).getByRole('button', { name: 'Attach existing project', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Attach existing project', exact: true });
  await dialog.getByRole('combobox', { name: 'Project to attach', exact: true }).selectOption(standalone.id);
  await dialog.getByRole('button', { name: 'Attach project', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(standalone)).toHaveClass(/subproject-row/);
  await actions(standalone);
  await row(standalone).getByRole('button', { name: 'Manage subproject', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Manage subproject', exact: true });
  const before = await (await request.get(`/api/projects/${standalone.id}`)).json();
  expect((await request.patch(`/api/projects/${standalone.id}/relationship`, { data: { parentProjectId: other.id, siblingOrder: 2, metadataRevision: before.metadataRevision } })).ok()).toBe(true);
  await dialog.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Project relationships changed');
  expect((await (await request.get(`/api/projects/${standalone.id}`)).json()).parentProjectId).toBe(other.id);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const expand = page.getByRole('button', { name: `Subprojects of ${other.title}`, exact: true });
  await expect(expand).toBeVisible();
  await expand.click();
  await actions(standalone);
  await row(standalone).getByRole('button', { name: 'Manage subproject', exact: true }).click();
  await page.getByRole('combobox', { name: 'Parent project', exact: true }).selectOption(parent.id);
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(standalone)).toBeVisible();
  expect((await (await request.get(`/api/projects/${standalone.id}`)).json()).parentProjectId).toBe(parent.id);
  await actions(standalone);
  await row(standalone).getByRole('button', { name: 'Manage subproject', exact: true }).click();
  await page.getByRole('combobox', { name: 'Parent project', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(standalone)).not.toHaveClass(/subproject-row/);
  await page.reload();
  await expect(row(standalone)).toBeVisible();
  expect((await (await request.get(`/api/projects/${standalone.id}`)).json()).parentProjectId).toBeNull();
});

test('parent deletion is blocked and orphaned trashed children require an explicit restore choice', async ({ page, request }) => {
  const { parent, first, second, row } = await seed(page, request);
  await row(parent).getByRole('button', { name: 'Move to trash', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Move project to trash?', exact: true });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/subprojects/i);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const project of [first, second, parent]) expect((await request.post(`/api/projects/${project.id}/trash`)).ok()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  const childTrash = page.locator('.trash-table tbody tr').filter({ hasText: first.title });
  await childTrash.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/parent/i);
  await childTrash.getByRole('combobox', { name: `Restore parent for ${first.title}`, exact: true }).selectOption('');
  await childTrash.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row(first)).toBeVisible();
  expect((await (await request.get(`/api/projects/${first.id}`)).json()).parentProjectId).toBeNull();
});

test('restricted hierarchy listings do not expose hidden titles or relationship controls', async ({ page, request }) => {
  const { parent, first, second } = await seed(page, request);
  await page.route('**/api/projects', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: (await response.json()).filter(project => project.id === first.id) });
  });
  await page.route('**/api/management/project-health', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: (await response.json()).filter(project => project.projectId === first.id).map(project => ({
      ...project, canEdit: false, canManageRelationship: false, canCreateSubproject: false, canSetStage: false, canTrash: false,
    })) });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: `Open ${first.title}`, exact: true })).toBeVisible();
  await expect(page.locator('.management-view')).not.toContainText(parent.title);
  await expect(page.locator('.management-view')).not.toContainText(second.title);
  await expect(page.locator('.project-hierarchy-actions')).toHaveCount(0);
  await expect(page.locator('.project-expand')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Switch project', exact: true }).locator(`option[value="${parent.id}"]`)).toHaveCount(0);
  await expect(page.locator('.management-view')).toContainText('Parent project unavailable');
});
