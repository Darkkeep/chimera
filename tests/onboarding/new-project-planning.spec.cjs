const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai-connection', route => route.fulfill({ json: { configured: false, canManage: false } }));
  await page.route(/\/pythia-conversation(?:\/.*)?$/, async route => {
    const response = await route.fetch({ url: 'http://127.0.0.1:8027' + new URL(route.request().url()).pathname,
      headers: { ...route.request().headers(), origin: 'http://127.0.0.1:5173' } });
    await route.fulfill({ response });
  });
});

async function begin(page, title) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Name your course', exact: true });
  await dialog.getByRole('textbox', { name: 'Course name', exact: true }).fill(title);
  return dialog;
}

async function projectByTitle(request, title) {
  const projects = await (await request.get('/api/projects')).json();
  const matching = projects.filter(project => project.title === title);
  expect(matching).toHaveLength(1);
  return matching[0];
}

test('New Project accepts every source kind without AI configuration and preserves the planning draft across sections', async ({ page, request }, testInfo) => {
  const title = `Queued source planning ${testInfo.project.name}`;
  const initial = await begin(page, title);
  await initial.getByLabel('Attach course design documents').setInputFiles({ name: 'planning-guide.txt', mimeType: 'text/plain', buffer: Buffer.from('Use the category checklist before submitting.') });
  await initial.locator('.new-project-extra-sources > summary').click();
  const intake = initial.locator('.sources-embedded');
  for (const [kind, name, content] of [['text', 'Workshop notes', 'New operators need a practical sequence.'], ['web', 'Policy bookmark', ''], ['pythia', 'Earlier Pythia advice', 'Use a checklist to support the workflow.']]) {
    if (kind === 'web') await intake.getByRole('button', { name: /^Web pages and links/ }).click();
    if (kind === 'pythia') await intake.getByRole('button', { name: /^Pythia conversations and outputs/ }).click();
    await intake.getByLabel('Source title', { exact: true }).fill(name);
    if (kind === 'web') await intake.getByLabel('Page URL', { exact: true }).fill('https://example.com/policy');
    else await intake.getByRole('textbox', { name: kind === 'pythia' ? 'Conversation or output text' : 'Source text', exact: true }).fill(content);
    await intake.getByRole('button', { name: 'Queue source', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText(`Queued ${name}`);
  }
  await initial.getByRole('textbox', { name: 'Course prompt', exact: true }).fill('Help me plan a short orientation before drafting scenes.');
  expect((await new AxeBuilder({ page }).include('.new-project-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('new-project-sources.png'), fullPage: true });
  await initial.getByRole('button', { name: 'Create & plan with Pythia', exact: true }).click();
  const planner = page.getByRole('dialog', { name: 'Plan your course', exact: true });
  await expect(planner.getByRole('heading', { name: 'Plan with Pythia', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(planner.getByLabel('Your message', { exact: true })).toHaveValue('Help me plan a short orientation before drafting scenes.');
  const project = await projectByTitle(request, title);
  let resources = await (await request.get(`/api/projects/${project.id}/reference-resources`)).json();
  expect(resources.map(source => source.versions[0].sourceKind).sort()).toEqual(['document', 'pythia', 'text', 'web']);
  expect(resources.find(source => source.title === 'Policy bookmark').versions[0].passages).toEqual([]);
  await expect(planner.getByRole('checkbox', { name: /^Policy bookmark/ })).toBeDisabled();
  await planner.getByLabel('Your message', { exact: true }).fill('An unsent follow-up that should survive switching sections.');
  await planner.getByRole('tab', { name: 'Sources', exact: true }).click();
  const sources = planner.getByRole('tabpanel', { name: 'Sources', exact: true });
  await expect(sources.getByRole('heading', { name: 'Saved sources · 4', exact: true })).toBeVisible();
  await sources.getByRole('button', { name: /^Pasted text/ }).click();
  await sources.getByLabel('Source title', { exact: true }).fill('Later source');
  await sources.getByRole('textbox', { name: 'Source text', exact: true }).fill('Add a practical example after the checklist.');
  await sources.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(sources.getByRole('heading', { name: 'Saved sources · 5', exact: true })).toBeVisible();
  await planner.getByRole('tab', { name: 'Sources', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(planner.getByRole('tab', { name: 'Plan with Pythia', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(planner.getByLabel('Your message', { exact: true })).toHaveValue('An unsent follow-up that should survive switching sections.');
  await expect(planner.getByRole('checkbox', { name: 'Later source', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.new-project-dialog').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await planner.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('new-project-planning-mobile.png'), fullPage: true });
  await planner.getByRole('button', { name: 'Open storyboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  resources = await (await request.get(`/api/projects/${project.id}/reference-resources`)).json();
  expect(resources).toHaveLength(5);
});

test('a failed New Project attachment can be retried without creating another project or resending saved sources', async ({ page, request }) => {
  const title = 'New Project attachment retry';
  let attempts = 0;
  await page.route('**/reference-resources', async route => {
    if (route.request().method() === 'POST' && route.request().postDataBuffer().includes(Buffer.from('retry-guide.txt'))) {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 503, json: { detail: 'Synthetic upload failure' } });
    }
    return route.continue();
  });
  const initial = await begin(page, title);
  await initial.getByLabel('Attach course design documents').setInputFiles([
    { name: 'retry-guide.txt', mimeType: 'text/plain', buffer: Buffer.from('Retry this source.') },
    { name: 'saved-guide.txt', mimeType: 'text/plain', buffer: Buffer.from('This source succeeds first time.') },
  ]);
  await initial.getByRole('button', { name: 'Create & plan with Pythia', exact: true }).click();
  const planner = page.getByRole('dialog', { name: 'Plan your course', exact: true });
  await expect(planner.getByRole('alert')).toContainText('retry-guide');
  await expect(planner.getByRole('tab', { name: 'Sources', exact: true })).toHaveAttribute('aria-selected', 'true');
  const project = await projectByTitle(request, title);
  await planner.getByRole('button', { name: 'Retry queued sources', exact: true }).click();
  await expect(planner.getByRole('heading', { name: 'Saved sources · 2', exact: true })).toBeVisible();
  await expect(planner.getByRole('button', { name: 'Retry queued sources', exact: true })).toHaveCount(0);
  expect((await (await request.get(`/api/projects/${project.id}/reference-resources`)).json()).map(source => source.title).sort()).toEqual(['retry-guide', 'saved-guide']);
  expect((await projectByTitle(request, title)).id).toBe(project.id);
  expect(attempts).toBe(2);
});

test('New Project holds a real source-grounded conversation until the author requests and applies rough scenes', async ({ page, request }, testInfo) => {
  test.skip(process.env.CHIMERA_PYTHIA_LIVE_BROWSER !== '1', 'Explicit opt-in for three real Pythia calls');
  test.setTimeout(240000);
  const title = 'Fictional new-project Pythia planning';
  const initial = await begin(page, title);
  await initial.getByLabel('Attach course design documents').setInputFiles({ name: 'planning-guide.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional guide: before submitting a request, check the category label and ask for clarification when the two labels are ambiguous.') });
  await initial.getByRole('textbox', { name: 'Course prompt', exact: true }).fill("Let's plan a brief orientation for new operators using the selected guide. Recommend a practical structure, but do not draft scene content yet.");
  await initial.getByRole('button', { name: 'Create & plan with Pythia', exact: true }).click();
  const planner = page.getByRole('dialog', { name: 'Plan your course', exact: true });
  await planner.getByRole('checkbox', { name: 'planning-guide', exact: true }).check();
  await planner.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(planner.locator('.pythia-talk-answer')).toHaveCount(1, { timeout: 90000 });
  const project = await projectByTitle(request, title);
  const getProject = async () => (await request.get(`/api/projects/${project.id}`)).json();
  expect((await getProject()).storyboard.scenes).toHaveLength(0);
  await planner.getByLabel('Your message', { exact: true }).fill('Make this self-paced and plan for two short content scenes. Confirm the plan before drafting anything.');
  await planner.getByRole('tab', { name: 'Sources', exact: true }).click();
  await planner.getByRole('tab', { name: 'Plan with Pythia', exact: true }).click();
  await expect(planner.getByLabel('Your message', { exact: true })).toHaveValue('Make this self-paced and plan for two short content scenes. Confirm the plan before drafting anything.');
  await planner.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(planner.locator('.pythia-talk-answer')).toHaveCount(2, { timeout: 90000 });
  expect((await getProject()).storyboard.scenes).toHaveLength(0);
  await planner.getByRole('button', { name: 'Draft rough scenes from this advice', exact: true }).last().click();
  await planner.getByLabel('Author direction', { exact: true }).fill("Draft exactly two new content scenes, titled 'Choose the label' and 'Check before sending', each with one concise screen paragraph. Use the guide and our agreed self-paced plan. Do not add assessments or media.");
  await planner.getByRole('button', { name: 'Generate content draft', exact: true }).click();
  await expect(planner.getByRole('button', { name: 'Apply changes', exact: true })).toBeEnabled({ timeout: 90000 });
  expect((await getProject()).storyboard.scenes).toHaveLength(0);
  await expect(planner.locator('.pythia-action-new-scene')).toHaveCount(2);
  await planner.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(planner.getByText(/Applied to storyboard revision/)).toBeVisible();
  const authored = await getProject();
  expect(authored.storyboard.scenes.map(scene => scene.title)).toEqual(['Choose the label', 'Check before sending']);
  const state = await (await request.get(`/api/projects/${project.id}/pythia-conversation`)).json();
  expect(state.turns).toHaveLength(2);
  expect(state.turns.every(turn => turn.result.producer_id === 'live-chatgpt-text-v1')).toBe(true);
  expect(state.turns[0].context.sourceIds).toHaveLength(1);
  expect(state.actions[0].result.producer_id).toBe('live-chimera-authoring-v1');
  expect((await new AxeBuilder({ page }).include('.new-project-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('new-project-live-rough-scenes.png'), fullPage: true });
  await planner.getByRole('button', { name: 'Open storyboard', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Talk to Pythia', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Talk to Pythia', exact: true });
  await expect(restored.locator('.pythia-talk-answer')).toHaveCount(2);
  await expect(restored.getByText(/Applied to storyboard revision/)).toBeVisible();
});
