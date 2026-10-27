const { test, expect } = require('@playwright/test');
const { guide, expectStep, startChimera, createProject, saveScene } = require('./helpers.cjs');

async function pauseFirstScene(page) {
  await startChimera(page);
  await createProject(page, `Walkthrough context ${Date.now()} ${test.info().project.name}`);
  await saveScene(page, 'Context practice');
  await guide(page).getByRole('button', { name: 'Pause guide' }).click();
}

test('dismiss leaves the current draft open and next help follows the new workflow', async ({ page }) => {
  await startChimera(page);
  await createProject(page, `Dismiss context ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('Draft survives dismissal');
  await guide(page).getByRole('button', { name: 'Dismiss walkthrough', exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Draft survives dismissal');
  await page.getByRole('button', { name: 'Close scene editor', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await expectStep(page, 'Upload images or audio');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const id = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const previous = await page.evaluate(id => JSON.parse(localStorage.getItem(`chimera.onboarding:${id}:first-scene`)), id);
  expect(previous.index).toBe(1);
  expect(previous.status).toBe('paused');
});

test('dismissed canvas guide picks up Details rather than resuming the old task on the same surface', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Author the scene canvas');
  await guide(page).getByRole('button', { name: 'Dismiss walkthrough', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('New workflow draft');
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('New workflow draft');
});

test('a stale first-scene review does not resume inside media settings', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'AI connection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Resume walkthrough', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Start walkthrough/ }).click();
  await expectStep(page, 'Configure the media provider');
  await expect(dialog).toContainText('Configure the media provider');
  await expect(guide(page).getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});

test('editing a scene starts its workflow without returning to first-scene review or losing drafts', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('Keep this current draft');
  await page.getByRole('button', { name: /^Start walkthrough/ }).click();
  await expectStep(page, 'Edit scene content and settings');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Keep this current draft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expectStep(page, 'Review the result');
});

test('sidebar follows the current media workflow rather than stale first-scene progress', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await expectStep(page, 'Upload images or audio');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('completed first-scene practice does not restart scene creation from Storyboard', async ({ page }) => {
  await startChimera(page);
  await createProject(page, `Completed context ${Date.now()}`);
  await saveScene(page, 'Continue authoring this scene');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Close guide', exact: true }).click();
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Continue authoring this scene');
  await expect(page.getByRole('button', { name: 'Create scene', exact: true })).toHaveCount(0);
});

test('a targetless result review pauses when leaving its workflow', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'AI connection', exact: true }).click();
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Configure the media provider');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'Review the result');
  await page.getByRole('button', { name: 'Close media provider settings', exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
});

test('stage walkthrough stays attached when switching editor tabs', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Author the scene canvas');
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(page.locator('[data-onboarding-highlight]')).toBeVisible();
  await page.getByRole('tab', { name: 'Stage', exact: true }).click();
  await expect(page.locator('[data-onboarding-highlight]')).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(guide(page).getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expectStep(page, 'Author the scene canvas');
});

test('new project walkthrough starts at naming instead of skipping to the previous project', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Course name', exact: true }).fill('Preserved new course draft');
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Name your course');
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveValue('Preserved new course draft');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveCount(0);
});

test('a different Pythia workflow gets its own guide without submitting a provider task', async ({ page }) => {
  let submissions = 0;
  await page.route(/\/api\/projects\/[^/]+\/pythia-/, async route => {
    if (route.request().method() !== 'GET') submissions++;
    if (route.request().url().endsWith('/pythia-status')) return route.fulfill({ json: {
      health: { status: 'ok' }, capabilities: { capabilities: ['storyboard.analyze', 'storyboard.transform', 'assessment.design'] },
      supportsStoryboardAnalyze: true, supportsStoryboardTransform: true, supportsAssessmentDesign: true,
    } });
    return route.fulfill({ json: [] });
  });
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Pythia', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze with Pythia', exact: true }).click();
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Analyze a scene with Pythia');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close Pythia analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Pythia', exact: true }).click();
  await page.getByRole('button', { name: 'Transform with Pythia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume walkthrough', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
  await expectStep(page, 'Propose a Pythia storyboard transformation');
  expect(submissions).toBe(0);
});

test('AI-enabled first-scene walkthrough hands off to one scene dialog, not course drafting', async ({ page }) => {
  await page.route('**/api/ai-connection', route => route.fulfill({ json: { configured: true, canManage: false } }));
  await startChimera(page);
  await expect(page.getByRole('region', { name: 'Course design documents' })).toBeVisible();
  await createProject(page, `Guided AI handoff ${Date.now()}`);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Draft course scenes', exact: true })).toHaveCount(0);
  await saveScene(page, 'Guided scene with AI configured');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'Walkthrough complete');
});

for (const [type, title] of [['matching', 'Matching question'], ['short-answer', 'Fill-in-the-blank question']]) {
  test(`question help picks the current ${type} type and preserves entered text`, async ({ page }) => {
    await pauseFirstScene(page);
    await page.getByRole('button', { name: 'Add scene', exact: true }).click();
    await page.getByRole('combobox', { name: 'Scene type', exact: true }).selectOption('question');
    await page.getByRole('button', { name: 'Create scene', exact: true }).click();
    await page.getByRole('button', { name: 'Create question', exact: true }).click();
    await page.getByRole('combobox', { name: 'Question type', exact: true }).selectOption(type);
    await page.getByRole('textbox', { name: 'Question prompt', exact: true }).fill('Preserve this question draft');
    await page.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
    await expectStep(page, title);
    await expect(page.getByRole('combobox', { name: 'Question type', exact: true })).toHaveValue(type);
    await expect(page.getByRole('textbox', { name: 'Question prompt', exact: true })).toHaveValue('Preserve this question draft');
    if (type === 'short-answer') {
      await page.getByLabel('Enter one accepted answer per line').fill('practice');
      await page.getByRole('button', { name: 'Save question', exact: true }).click();
      await expectStep(page, 'Review the result');
    }
  });
}

test('unsupported forms do not offer a misleading resume for an unrelated paused guide', async ({ page }) => {
  await pauseFirstScene(page);
  await page.getByRole('button', { name: 'Assessments', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume walkthrough', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start walkthrough', exact: true })).toHaveCount(0);
  await expect(guide(page)).toHaveCount(0);
});

for (const [provider, kind] of [['Cartesia', 'narration'], ['Shotstack', 'video']]) {
  test(`${provider} walkthroughs advance only after successful save, test and confirmed disconnect`, async ({ page }) => {
    await pauseFirstScene(page);
    let collection = { revision: 'r0', canManage: true, storageAvailable: true, legacyConfigured: false, connections: [] };
    let fail = true;
    let mutations = 0;
    await page.route('**/api/narration-connections**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: collection });
      mutations++;
      if (fail) return route.fulfill({ status: 503, json: { detail: 'Inert provider failure' } });
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/test')) return route.fulfill({ json: { connected: true, message: 'Inert discovery succeeded', voices: [], models: [] } });
      const { expectedRevision, ...settings } = route.request().postDataJSON();
      collection = { ...collection, revision: `r${mutations}`, connections: path.endsWith('/disconnect') ? [] : [{
        ...settings, id: 'narration-000000000001', configured: true, credentialError: false,
      }] };
      return route.fulfill({ json: collection });
    });
    async function chooseTask(title) {
      await page.getByRole('button', { name: 'Review tools', exact: true }).click();
      await page.getByRole('button', { name: 'Guided review', exact: true }).click();
      await page.getByText(/^All functionality walkthroughs/).click();
      await page.getByRole('button', { name: `Start ${title}`, exact: true }).click();
      await page.getByRole('tab', { name: provider, exact: true }).click();
    }
    async function finishTask() {
      await expectStep(page, 'Review the result');
      await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
      await guide(page).getByRole('button', { name: 'Close guide', exact: true }).click();
      await page.getByRole('button', { name: 'Close media provider settings', exact: true }).click();
    }
    await chooseTask('Save media provider settings');
    await page.getByLabel('Connection name', { exact: true }).fill('Inert walkthrough connection');
    await page.getByRole('combobox', { name: 'Credential source', exact: true }).selectOption('environment');
    await page.getByRole('button', { name: `Save ${kind} connection`, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Inert provider failure');
    await expectStep(page, 'Save media provider settings');
    fail = false;
    await page.getByRole('button', { name: `Save ${kind} connection`, exact: true }).click();
    await finishTask();
    await chooseTask('Test the media provider connection');
    await page.getByRole('combobox', { name: `Saved ${kind} connection`, exact: true }).selectOption('narration-000000000001');
    fail = true;
    await page.getByRole('button', { name: `Test ${kind} connection`, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Inert provider failure');
    await expectStep(page, 'Test the media provider connection');
    fail = false;
    await page.getByRole('button', { name: `Test ${kind} connection`, exact: true }).click();
    await finishTask();
    await chooseTask('Disconnect the media provider');
    await page.getByRole('combobox', { name: `Saved ${kind} connection`, exact: true }).selectOption('narration-000000000001');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: `Disconnect ${kind} connection`, exact: true }).click();
    await expectStep(page, 'Disconnect the media provider');
    expect(mutations).toBe(4);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: `Disconnect ${kind} connection`, exact: true }).click();
    await finishTask();
    expect(mutations).toBe(5);
  });
}
