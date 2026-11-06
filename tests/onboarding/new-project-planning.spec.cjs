const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai-connection', route => route.fulfill({ json: { configured: false, canManage: false } }));
  await page.route(/\/pythia-conversation(?:\/.*)?$/, async route => {
    const response = await route.fetch({ url: 'http://127.0.0.1:8027' + new URL(route.request().url()).pathname,
      headers: { ...route.request().headers(), origin: 'http://127.0.0.1:5173' } });
    // Source intake and unsent-draft checks must not depend on a developer's
    // sibling Pythia installation. Live opt-in cases retain real discovery.
    if (route.request().method() === 'GET' && !process.env.CHIMERA_PYTHIA_LIVE_BROWSER && response.ok()) {
      return route.fulfill({ response, json: { ...await response.json(), configured: true } });
    }
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
  const title = `Queued source planning ${testInfo.project.name}-${testInfo.retry}-${Date.now()}`;
  let conversationPosts=0;
  await page.route('**/pythia-conversation', route => {
    if (route.request().method() === 'GET') return route.fulfill({json:{sessionId:'source-planning-fixture',turns:[],actions:[],configured:true}});
    conversationPosts++;
    return route.fulfill({status:503,json:{detail:'This draft-preservation test must not submit a provider request.'}});
  });
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
  expect(conversationPosts).toBe(0);
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

test('numbered advice stays in consultation until the author agrees a brief and explicitly requests a draft', async ({ page, request }) => {
  const titles = Array.from({ length: 12 }, (_, index) => `Expanded topic ${index + 1}`);
  const sceneTitles = titles.flatMap(title => [`Explore ${title}`, `Practice ${title}`]);
  let state = { sessionId: 'outline-session', configured: true,
    authorDirection: 'Create a concise rough sequence of up to five content scenes from the agreed conversation.',
    turns: [{ id: 'outline-turn', question: 'Expand the outline.', outlineItemCount: 12, status: 'completed', context: { sceneId: null, sourceIds: [] },
      result: { content: titles.map((title, i) => `${i + 1}. ${title}`).join('\n'), kind: 'answer', rationale: '', limits: [], producer_id: 'live-test-outline', stopping_boundary: 'advisory-only' } }], actions: [] };
  await page.route('**/pythia-conversation', route => route.fulfill({ json: state }));
  let planningDecisions = 0;
  let draftRequests = 0;
  await page.route('**/pythia-conversation/planning', async route => {
    planningDecisions++;
    if (planningDecisions === 1) return route.fulfill({ status: 503, json: { detail: 'The brief could not be saved. Please retry.' } });
    const body = route.request().postDataJSON();
    expect(body.sessionId).toBe(state.sessionId);
    state = { ...state, planning: { stage: body.stage, brief: body.brief, turnId: body.turnId } };
    await route.fulfill({ json: state });
  });
  await page.route('**/pythia-conversation/actions', async route => {
    draftRequests++;
    const body = route.request().postDataJSON();
    expect(body.followOutline).toBe(true);
    expect(body.direction).toContain('learner-sized scene sequence');
    expect(body.direction).toContain('Split topics or source slides');
    expect(body.direction).not.toContain('five');
    state = { ...state, actions: [{ id: body.requestId, turnId: 'outline-turn', mode: 'add-scenes', sceneId: null,
      direction: body.direction, designBrief: state.planning.brief, sourceRevision: body.expectedRevision, before: null, status: 'pending', error: null,
      result: { rationale: 'Separate exploration from practice.', producer_id: 'live-chimera-authoring-v1', changes: [], scenes: sceneTitles.map(title => ({ title, sceneType: 'content', extractedText: ['Rough content.'], narration: '', actionDescription: '', notes: '' })) } }] };
    await route.fulfill({ status: 202, json: state });
  });
  const title = 'Expanded-outline rough draft';
  const initial = await begin(page, title);
  await initial.getByRole('button', { name: 'Create & plan with Pythia', exact: true }).click();
  const planner = page.getByRole('dialog', { name: 'Plan your course', exact: true });
  await expect(planner.getByLabel('Author direction', { exact: true })).not.toHaveValue(/five/);
  await expect(planner.getByRole('region', { name: 'Turn outline into scenes' })).toHaveCount(0);
  await expect(planner.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true })).toHaveCount(0);
  await planner.getByRole('button', { name: 'Review our design brief', exact: true }).click();
  await expect(planner.getByRole('button', { name: 'Agree brief and explore scene design', exact: true })).toBeDisabled();
  const agreedBrief = 'General audience. Explain the concepts with examples and practice. Duration remains open.';
  await planner.getByRole('textbox', { name: 'Design brief', exact: true }).fill(agreedBrief);
  await planner.getByRole('button', { name: 'Agree brief and explore scene design', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('The brief could not be saved');
  await expect(planner.getByRole('textbox', { name: 'Design brief', exact: true })).toHaveValue(agreedBrief);
  await expect(planner.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true })).toHaveCount(0);
  expect(draftRequests).toBe(0);
  await planner.getByRole('button', { name: 'Agree brief and explore scene design', exact: true }).click();
  expect(planningDecisions).toBe(2);
  expect(draftRequests).toBe(0);
  await expect(planner.getByRole('heading', { name: 'Explore the learning design', exact: true })).toBeVisible();
  await planner.getByRole('button', { name: 'Open storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Consult Pythia', exact: true }).click();
  const resumed = page.getByRole('dialog', { name: 'Consult Pythia', exact: true });
  await expect(resumed.getByRole('heading', { name: 'Explore the learning design', exact: true })).toBeVisible();
  await resumed.getByText('Your recorded design brief', { exact: true }).click();
  await expect(resumed.getByText(agreedBrief, { exact: true })).toBeVisible();
  await resumed.getByRole('button', { name: 'Return to consultation', exact: true }).click();
  await expect(resumed.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true })).toHaveCount(0);
  await resumed.getByRole('button', { name: 'Review our design brief', exact: true }).click();
  await expect(resumed.getByRole('textbox', { name: 'Design brief', exact: true })).toHaveValue(agreedBrief);
  await resumed.getByRole('button', { name: 'Agree brief and explore scene design', exact: true }).click();
  await resumed.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true }).click();
  await resumed.getByRole('button', { name: 'Generate content draft', exact: true }).click();
  await expect(resumed.locator('.pythia-action-new-scene')).toHaveCount(24);
  await expect(resumed.getByRole('button', { name: 'Apply changes', exact: true })).toBeEnabled();
  await expect(resumed.locator('.pythia-action-review')).toBeFocused();
  await resumed.getByText('Design brief used', { exact: true }).click();
  await expect(resumed.locator('.pythia-action-review').getByText(agreedBrief, { exact: true })).toBeVisible();
  expect(draftRequests).toBe(1);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await resumed.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const project = await projectByTitle(request, title);
  expect((await (await request.get(`/api/projects/${project.id}`)).json()).storyboard.scenes).toHaveLength(0);
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
  await planner.getByLabel('Your message', { exact: true }).fill('Make this self-paced. Return a numbered outline with exactly two top-level items titled Choose the label and Check before sending. Confirm the plan before drafting anything.');
  await planner.getByRole('tab', { name: 'Sources', exact: true }).click();
  await planner.getByRole('tab', { name: 'Plan with Pythia', exact: true }).click();
  await expect(planner.getByLabel('Your message', { exact: true })).toHaveValue('Make this self-paced. Return a numbered outline with exactly two top-level items titled Choose the label and Check before sending. Confirm the plan before drafting anything.');
  await planner.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(planner.locator('.pythia-talk-answer')).toHaveCount(2, { timeout: 90000 });
  expect((await getProject()).storyboard.scenes).toHaveLength(0);
  await planner.getByRole('button', { name: 'Review our design brief', exact: true }).click();
  await planner.getByRole('textbox', { name: 'Design brief', exact: true }).fill('New operators need a self-paced orientation to choosing category labels and checking before sending. Use the supplied guide; no media or assessments.');
  await planner.getByRole('button', { name: 'Agree brief and explore scene design', exact: true }).click();
  await planner.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true }).last().click();
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
  await page.getByRole('button', { name: 'Consult Pythia', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Consult Pythia', exact: true });
  await expect(restored.locator('.pythia-talk-answer')).toHaveCount(2);
  await expect(restored.getByText(/Applied to storyboard revision/)).toBeVisible();
});
