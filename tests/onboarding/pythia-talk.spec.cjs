const { openWorkspaceMenu } = require('./helpers.cjs');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  // The isolated Vite server uses 5187; preserve the production API's explicit
  // 5173 origin allowlist rather than broadening it for a test server.
  await page.route(/\/pythia-conversation(?:\/.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const response = await route.fetch({ url: 'http://127.0.0.1:8027' + path,
      headers: { ...route.request().headers(), origin: 'http://127.0.0.1:5173' },
    });
    await route.fulfill({ response });
  });
});

async function openConversation(page, request, title) {
  let response = await request.post('/api/projects', { data: { title } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  response = await request.post(`/api/projects/${project.id}/scenes`, { data: {
    title: 'Fictional approval queue', extractedText: ['Staff explain the procedure accurately, but requests wait three days for approval.'],
  }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok()).toBeTruthy();
  project = await response.json();
  await page.goto(`/?project_id=${project.id}`);
  await expect(page.getByRole('combobox', { name: 'Switch project', exact: true })).toHaveValue(project.id);
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button').first()).toHaveText('Consult Pythia');
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Consult Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Consult Pythia', exact: true });
  await expect(dialog.getByLabel('What would you like to do?', { exact: true })).toBeEnabled();
  return { project, dialog };
}

test('a failed Pythia submit preserves the draft and does not retry automatically', async ({ page, request }) => {
  let submissions = 0;
  await page.route('**/pythia-conversation', route => {
    if (route.request().method() === 'POST') {
      submissions++;
      return route.fulfill({ status: 503, json: { detail: 'Synthetic transport unavailable. Retry explicitly.' } });
    }
    return route.fulfill({ json: { sessionId: 'failure-fixture', turns: [], actions: [], configured: true } });
  });
  const { dialog } = await openConversation(page, request, 'Pythia failure UI');
  await dialog.getByLabel('What would you like to do?', { exact: true }).fill('A fictional test question.');
  await dialog.getByRole('button', { name: /^(Start with Pythia|Send to Pythia)$/, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic transport unavailable');
  await expect(dialog.getByLabel('What would you like to do?', { exact: true })).toHaveValue('A fictional test question.');
  await dialog.getByLabel('What would you like to do?', { exact: true }).fill('An edited question.');
  expect(submissions).toBe(1);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
});

test('prior exchanges roll up and processing animates for consultations and drafts', async ({ page, request }) => {
  const advice = content => ({ content, kind: 'answer', rationale: '', limits: [], producer_id: 'live-test-provider', stopping_boundary: 'advisory-only' });
  let state = { sessionId: 'rollup-session', configured: true, actions: [], turns: [
    { id: 'turn-one', question: 'First question', status: 'completed', result: advice('Earlier answer retained.'), context: { sceneId: null, sourceIds: [] } },
    { id: 'turn-two', question: 'Second question', status: 'completed', result: advice('Latest answer visible.'), context: { sceneId: null, sourceIds: [] } },
  ] };
  let calls = 0;
  await page.route('**/pythia-conversation', async route => {
    if (route.request().method() === 'POST') {
      calls++;
      const body = route.request().postDataJSON();
      state = { ...state, turns: [...state.turns, { id: body.requestId, question: body.message, status: 'running', result: null, error: null, context: { sceneId: null, sourceIds: [] } }] };
    }
    await route.fulfill({ status: route.request().method() === 'POST' ? 202 : 200, json: state });
  });
  const { project, dialog } = await openConversation(page, request, 'Roll up consultation');
  await expect(dialog.getByText('Earlier answer retained.', { exact: true })).not.toBeVisible();
  await expect(dialog.getByText('Latest answer visible.', { exact: true })).toBeVisible();
  await dialog.locator('.pythia-talk-turn > summary').first().click();
  await expect(dialog.getByText('Earlier answer retained.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Roll up prior exchanges', exact: true }).click();
  await expect(dialog.getByText('Earlier answer retained.', { exact: true })).not.toBeVisible();
  await dialog.getByRole('button', { name: 'Expand all exchanges', exact: true }).click();
  await expect(dialog.getByText('Earlier answer retained.', { exact: true })).toBeVisible();
  await dialog.getByLabel('What would you like to do?', { exact: true }).fill('Third question');
  await dialog.getByRole('button', { name: /^(Start with Pythia|Send to Pythia)$/, exact: true }).click();
  const processing = dialog.getByRole('status').filter({ hasText: 'Pythia Processing' });
  await expect(processing).toBeVisible();
  expect(await processing.locator('.pythia-processing-orb').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('pythia-orbit');
  await expect(dialog.getByText(/close this dialog and return/)).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await processing.locator('.pythia-processing-orb').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
  state = { ...state, turns: state.turns.map((turn, index) => index === 2 ? { ...turn, status: 'completed', result: advice('Third answer ready.') } : turn) };
  await expect(dialog.getByText('Third answer ready.', { exact: true })).toBeVisible();
  await expect(processing).toHaveCount(0);
  await page.route('**/pythia-conversation/actions', async route => {
    const body = route.request().postDataJSON();
    state = { ...state, actions: [{ id: body.requestId, turnId: body.turnId, mode: body.mode, sceneId: body.sceneId, direction: body.direction,
      sourceRevision: project.storyboard.revision, status: 'drafting', before: { title: 'Fictional approval queue' }, result: null, error: null }] };
    await route.fulfill({ status: 202, json: state });
  });
  await page.route('**/pythia-conversation/planning', async route => {
    const body = route.request().postDataJSON();
    state = { ...state, planning: { stage: body.stage, brief: body.brief, turnId: body.turnId } };
    await route.fulfill({ json: state });
  });
  await dialog.getByRole('button', { name: 'Design brief', exact: true }).click();
  await dialog.getByRole('button', { name: 'Review our design brief', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Design brief', exact: true }).fill('Help new operators navigate the approval queue. Clarify the existing title.');
  await dialog.getByRole('button', { name: 'Agree brief and explore scene design', exact: true }).click();
  await dialog.getByRole('button', { name: 'Prepare a content draft from this advice', exact: true }).last().click();
  await dialog.getByText('Sources and instructions', { exact: true }).click();
  await dialog.getByLabel('Author direction', { exact: true }).fill('Make the title clearer.');
  await dialog.getByRole('button', { name: 'Generate content draft', exact: true }).click();
  await expect(processing).toBeVisible();
  await expect(processing).toContainText('Preparing your scene draft for review');
  expect(calls).toBe(1);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
});

for (const stale of [false, true]) {
  test(`saved draft has a clear slide handoff; stale=${stale}`, async ({ page, request }, testInfo) => {
    let decisions = 0;
    const action = { id: 'ready-draft', turnId: 'ready-turn', mode: 'add-scenes', sceneId: null,
      direction: 'Use the reviewed draft', sourceRevision: 0, before: null, status: 'pending', error: null,
      result: { rationale: 'A practical starting point', producer_id: 'live-fixture', changes: [], scenes: [
        { title: 'Inspect first', sceneType: 'content', extractedText: ['Check before starting.'], narration: '', actionDescription: '', notes: '' },
      ] } };
    const state = { sessionId: 'handoff-session', configured: true, actions: [action], turns: [
      { id: 'ready-turn', question: 'Prepare a starting draft', status: 'completed', context: { sceneId: null, sourceIds: [] },
        result: { content: 'Here is your starting point.', kind: 'answer', rationale: '', limits: [], producer_id: 'live-fixture', stopping_boundary: 'advisory-only' } },
    ] };
    await page.route('**/pythia-conversation', async route => {
      const projectPath = new URL(route.request().url()).pathname.replace('/pythia-conversation', '');
      const project = await (await request.get(projectPath)).json();
      action.sourceRevision = project.storyboard.revision - (stale ? 1 : 0);
      await route.fulfill({ json: state });
    });
    await page.route('**/pythia-conversation/actions/ready-draft/decision', async route => {
      decisions++;
      const body = route.request().postDataJSON();
      expect(body.decision).toBe('apply');
      const projectPath = new URL(route.request().url()).pathname.split('/pythia-conversation')[0];
      const response = await request.post(projectPath + '/scenes', { data: action.result.scenes[0], headers: { 'If-Match': `"${body.expectedRevision}"` } });
      expect(response.ok()).toBeTruthy();
      const project = await response.json();
      action.status = 'applied'; action.appliedRevision = project.storyboard.revision;
      await route.fulfill({ json: { conversation: state, project } });
    });
    const { dialog, project } = await openConversation(page, request, `Clear draft handoff ${stale}`);
    if (stale) await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.getByRole('region', { name: 'Drafts ready for review' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Files', exact: true }).click();
    await dialog.getByRole('button', { name: 'Review my draft', exact: true }).click();
    const accept = dialog.getByRole('button', { name: 'Use this draft as my slides', exact: true });
    await expect(accept).toBeVisible();
    await expect(dialog.locator('.pythia-action-review')).toBeFocused();
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('draft-handoff.png'), fullPage: true });
    if (stale) {
      await expect(accept).toBeDisabled();
      await expect(dialog.getByRole('alert')).toContainText('Request a new draft');
      expect(decisions).toBe(0);
    } else {
      await accept.click();
      await expect(dialog.getByRole('status')).toContainText('editable slides');
      await dialog.getByRole('button', { name: 'Open my slides', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const saved = await (await request.get(`/api/projects/${project.id}`)).json();
      expect(saved.storyboard.scenes.map(scene => scene.title)).toEqual(['Fictional approval queue', 'Inspect first']);
      expect(decisions).toBe(1);
    }
  });
}

for (const width of [390, 1100, 1440]) {
  test(`work-first entry preserves sources and blocks unreadable uploads at ${width}px`, async ({ page, request }) => {
    let uploads = 0, submissions = [], readable = true;
    const sources = [];
    await page.route('**/reference-resources', async route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: sources });
      uploads++;
      const source = { id: `source-${uploads}`, title: readable ? 'Notes.txt' : 'Scanned.pdf', currentVersion: '1',
        versions: [{ version: '1', extractionStatus: readable ? 'complete' : 'failed', passages: readable ? [{ locator: 'p1', text: 'Fictional source.' }] : [] }] };
      sources.push(source);
      await route.fulfill({ json: source });
    });
    await page.route('**/pythia-conversation', async route => {
      if (route.request().method() === 'POST') {
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { detail: 'Synthetic send failed. Prompt retained.' } });
      }
      await route.fulfill({ json: { sessionId: 'entry-session', configured: true, turns: [], actions: [] } });
    });
    const { dialog } = await openConversation(page, request, `Work first ${width}`);
    await page.setViewportSize({ width, height: 900 });
    const prompt = dialog.getByLabel('What would you like to do?', { exact: true });
    await expect(dialog.locator('textarea:visible')).toHaveCount(1);
    await prompt.fill('Improve these existing notes.');
    await dialog.getByRole('button', { name: 'Design brief', exact: true }).click();
    await dialog.getByRole('button', { name: 'Conversation', exact: true }).click();
    await expect(prompt).toHaveValue('Improve these existing notes.');
    await dialog.getByLabel('Attach source files', { exact: true }).setInputFiles({ name: 'Notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional source.') });
    expect(uploads).toBe(0);
    await dialog.getByRole('button', { name: 'Start with Pythia', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Synthetic send failed');
    await expect(prompt).toHaveValue('Improve these existing notes.');
    expect(submissions[0].sourceIds).toEqual(['source-1']);
    await dialog.getByRole('button', { name: 'Start with Pythia', exact: true }).click();
    await expect.poll(() => submissions.length).toBe(2);
    expect(uploads).toBe(1);
    expect(submissions[1].sourceIds).toEqual(['source-1']);
    readable = false;
    await dialog.getByLabel('Attach source files', { exact: true }).setInputFiles({ name: 'Scanned.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Unreadable fixture') });
    await dialog.getByRole('button', { name: 'Start with Pythia', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('has no readable text');
    await dialog.getByRole('button', { name: 'Start with Pythia', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('has no readable text');
    expect(uploads).toBe(2);
    expect(submissions).toHaveLength(2);
    await expect(dialog.getByRole('button', { name: 'Remove Scanned.pdf', exact: true })).toBeVisible();
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  });
}

test('real local Pythia answers, revises and recovers browser history', async ({ page, request }, testInfo) => {
  test.skip(process.env.CHIMERA_PYTHIA_LIVE_BROWSER !== '1', 'Explicit opt-in for two real provider consultations');
  test.setTimeout(180000);
  const { project, dialog } = await openConversation(page, request, 'Fictional Pythia direct browser qualification');
  await dialog.getByText('Connection and conversation details', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'tools verified' })).toBeVisible({ timeout: 20000 });
  await dialog.getByText('Sources and instructions', { exact: true }).click();
  await dialog.getByLabel(/Include current scene text/).check();
  await dialog.getByLabel('What would you like to do?', { exact: true }).fill('For this fictional case, should we begin by producing a training course? Give two short paragraphs of advice.');
  await dialog.getByRole('button', { name: /^(Start with Pythia|Send to Pythia)$/, exact: true }).click();
  await expect(dialog.locator('.pythia-talk-answer')).toHaveCount(1, { timeout: 90000 });
  await expect(dialog.getByRole('button', { name: /^(Start with Pythia|Send to Pythia)$/, exact: true })).toBeDisabled(); // Empty composer after acceptance.
  await dialog.getByLabel(/Include current scene text/).uncheck();
  await dialog.getByLabel('What would you like to do?', { exact: true }).fill('Correction: observation now shows staff enter the wrong approval category because two labels are ambiguous. Revise your advice in two short paragraphs.');
  await dialog.getByRole('button', { name: /^(Start with Pythia|Send to Pythia)$/, exact: true }).click();
  await expect(dialog.locator('.pythia-talk-answer')).toHaveCount(2, { timeout: 90000 });
  const answers = await dialog.locator('.pythia-talk-answer > div > p').allTextContents();
  expect(answers[0].length).toBeGreaterThan(100);
  expect(answers[1].length).toBeGreaterThan(100);
  expect(answers[1]).not.toEqual(answers[0]);
  const state = await (await request.get(`/api/projects/${project.id}/pythia-conversation`)).json();
  expect(state.turns.map(turn => turn.result.producer_id)).toEqual(['live-chatgpt-text-v1', 'live-chatgpt-text-v1']);
  expect(state.turns[0].context.sceneId).toBe(project.storyboard.scenes[0].id);
  expect(state.turns.every(turn => turn.result.stopping_boundary === 'advisory-only')).toBe(true);
  const current = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(current.storyboard.revision).toBe(project.storyboard.revision);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('pythia-live-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close Pythia conversation', exact: true }).click();
  await page.reload();
  await openWorkspaceMenu(page);
  await page.getByRole('button', { name: 'Consult Pythia', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Consult Pythia', exact: true });
  await expect(restored.locator('.pythia-talk-answer')).toHaveCount(2);
  expect(await restored.locator('.pythia-talk-answer > div > p').allTextContents()).toEqual(answers);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await restored.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pythia-live-mobile.png'), fullPage: true });
});
