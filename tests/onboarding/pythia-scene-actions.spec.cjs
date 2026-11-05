const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const online = {
  health: { status: 'ok' },
  capabilities: { capabilities: ['storyboard.analyze', 'storyboard.transform', 'assessment.design'] },
  supportsStoryboardAnalyze: true,
  supportsStoryboardTransform: true,
  supportsAssessmentDesign: true,
};

async function setup(page, respond, sceneTitles = ['Pythia scene']) {
  const response = await page.request.post('/api/projects', { data: { title: 'Pythia toolbar' } });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  for (const title of sceneTitles) {
    const current = await page.request.get(`/api/projects/${project.id}`);
    expect(current.ok()).toBeTruthy();
    const detail = await current.json();
    const scene = await page.request.post(`/api/projects/${project.id}/scenes`, {
      headers: { 'If-Match': `"${detail.storyboard.revision}"` },
      data: { title },
    });
    expect(scene.ok()).toBeTruthy();
  }
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
  await expect(toggle).toHaveAttribute('title',   'Pythia connection unavailable (503). Check Settings > Pythia.');
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
  await expect(toggle).toHaveAttribute('title',   'Pythia Engine is not healthy. Check Settings > Pythia.');
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

for (const conflict of [false, true]) {
  test(`transformation applies directly in its dialog${conflict ? ' and preserves the draft on revision conflict' : ''}`, async ({ page }) => {
    const toggle = await setup(page, route => route.fulfill({ json: online }));
    const projectResponse = await page.request.get(`/api/projects/${await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'))}`);
    const project = await projectResponse.json();
    const revision = project.storyboard.revision;
    const proposedScene = {
      proposal_scene_id: 'proposed-1', source_scene_ids: [project.storyboard.scenes[0].id],
      title: 'Transformed learner scene', purpose: 'Explain the topic', learner_content: ['New learner content'],
      interaction_recommendation: 'Discuss', production_notes: 'Add an illustration',
      media_requirements: [], assessment_opportunities: [], rationale: 'Clearer sequence',
    };
    const proposal = { id: 'inline-proposal', status: 'pending', sourceRevision: revision, artifact: { payload: { rationale: 'Clearer sequence', proposed_scenes: [proposedScene] } } };
    await page.route('**/pythia-transform', route => route.fulfill({ json: { task_id: 'inline-task', status: 'submitted', source_revision: revision, source_scene_ids: [project.storyboard.scenes[0].id] } }));
    await page.route('**/pythia-tasks/inline-task', route => route.fulfill({ json: { task_id: 'inline-task', status: 'awaiting_review', artifact_id: 'inline-artifact' } }));
    await page.route('**/pythia-transform-proposals', route => route.fulfill({ json: proposal }));
    let decisions = 0;
    await page.route('**/pythia-transform-proposals/inline-proposal/decision', async route => {
      decisions++;
      expect(route.request().headers()['if-match']).toBe(`"${revision}"`);
      expect(route.request().postDataJSON()).toEqual({ decision: 'accept' });
      if (conflict) return route.fulfill({ status: 412, json: { detail: 'Revision conflict' } });
      const updated = { ...project, storyboard: { ...project.storyboard, revision: revision + 1, scenes: [{ ...project.storyboard.scenes[0], id: 'transformed-scene', title: proposedScene.title, extractedText: proposedScene.learner_content }] } };
      await route.fulfill({ json: { proposal: { ...proposal, status: 'accepted' }, project: updated } });
    });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await page.getByRole('button', { name: 'Transform with Pythia', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Propose transformation', exact: true }).click();
    await expect(dialog.getByText('Transformed learner scene', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Applying replaces/)).toBeVisible();
    expect(decisions).toBe(0);
    await dialog.getByRole('button', { name: 'Apply transformation', exact: true }).click();
    if (conflict) {
      await expect(dialog.getByRole('alert')).toContainText('This storyboard changed');
      await expect(dialog.getByText('Transformed learner scene', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Apply transformation', exact: true })).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'Pythia scene', exact: true })).toBeVisible();
    } else {
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Transformed learner scene', exact: true })).toBeVisible();
    }
    expect(decisions).toBe(1);
  });
}

for (const theme of ['light', 'dark']) {
  test(`transformation scene choices remain readable and selectable in ${theme} appearance`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('chimera.appearance', theme), theme);
    const titles = ['Expanded Scripted Content:', 'A long scene title with an unbroken reference ' + 'x'.repeat(60)];
    const toggle = await setup(page, route => route.fulfill({ json: online }), titles);
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await page.getByRole('button', { name: 'Transform with Pythia', exact: true }).click();
    const choices = page.getByRole('group', { name: 'Scenes to transform' });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(choices).toBeVisible();
      const layout = await choices.locator('.enhancement-choice-list').evaluate(list => ({
        width: list.clientWidth,
        scrollWidth: list.scrollWidth,
        rows: [...list.querySelectorAll('label')].map(label => {
          const checkbox = label.querySelector('input').getBoundingClientRect();
          const title = label.querySelector('strong').getBoundingClientRect();
          const bounds = list.getBoundingClientRect();
          return { checkboxWidth: checkbox.width, checkboxRight: checkbox.right, titleLeft: title.left, titleRight: title.right, listRight: bounds.right };
        }),
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      for (const row of layout.rows) {
        expect(row.checkboxWidth).toBe(16);
        expect(row.titleLeft).toBeGreaterThan(row.checkboxRight);
        expect(row.titleRight).toBeLessThanOrEqual(row.listRight);
      }
      const second = choices.getByRole('checkbox', { name: `${titles[1]}Scene 2`, exact: true });
      await second.uncheck();
      await choices.getByText(titles[1], { exact: true }).click();
      await expect(second).toBeChecked();
      await page.screenshot({ path: test.info().outputPath(`scene-choices-${theme}-${width}.png`) });
    }
    await page.getByRole('button', { name: 'Close Pythia transformation', exact: true }).click();
  });

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