const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { guide, expectStep, startChimera, createProject, saveScene, reloadAuthoring } = require('./helpers.cjs');
const unique = name => `${name} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
function pptx() {
  const local = path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return execFileSync(process.env.CHIMERA_TEST_PYTHON || (existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3'), ['tests/onboarding/make-pptx.py']);
}
async function seed(page) {
  await startChimera(page); await createProject(page, unique('Catalog'));
  await saveScene(page, 'Practice content');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Close guide' }).click();
  return page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
}
async function choose(page, name) {
  const review = page.getByRole('button', { name: 'Guided review', exact: true });
  if (!await review.isVisible()) await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await review.click();
  await page.getByText(/^All functionality walkthroughs/).click();
  await page.getByRole('button', { name: `Start ${name}`, exact: true }).click();
}
async function finish(page) {
  await expectStep(page, 'Review the result');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'Walkthrough complete');
  await guide(page).getByRole('button', { name: 'Close guide' }).click();
}
async function readProject(page, id) { return (await page.request.get(`/api/projects/${id}`)).json(); }
async function write(page, id, endpoint, data, method = 'post') {
  const project = await readProject(page, id);
  const response = await page.request[method](`/api/projects/${id}/${endpoint}`, { data, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function mockPythia(page, id) {
  const project = await readProject(page, id);
  const sceneId = project.storyboard.scenes[0].id;
  const sourceRevision = project.storyboard.revision;
  const state = { submissions: 0, decisions: 0, failSave: false, failDecision: false, running: false, failCancel: false };
  const analysis = { id: 'analysis-fixture', sceneId, sourceRevision, status: 'pending', artifact: { payload: { scene_id: sceneId, findings: [], recommendations: [], uncertainties: [], review_questions: [], source_refs: [] } } };
  const transformation = { id: 'transform-fixture', sourceSceneIds: [sceneId], sourceRevision, status: 'pending', artifact: { payload: { rationale: 'Inert transformation fixture', proposed_scenes: [{ proposal_scene_id: 'proposed-one', title: 'Proposed scene', purpose: 'Practice', learner_content: ['Practice safely'], interaction_recommendation: 'Review', production_notes: 'Verify manually', media_requirements: [], assessment_opportunities: [] }] } } };
  const item = { identifier: 'fixture_question', type: 'true-false', prompt: 'Practice safely?', correctResponse: 'true', correctFeedback: 'Yes', incorrectFeedback: 'Try again' };
  const assessment = { id: 'assessment-fixture', targetSceneId: sceneId, sourceRevision, status: 'pending', origin: 'ai', provider: 'Pythia', field: 'assessmentItem', beforeValue: null, proposedValue: item, changes: [], rationale: 'Inert assessment fixture', affectedIds: ['objective-one'], referenceCitations: [], sourceTaskId: 'task-fixture', sourceArtifactId: 'artifact-fixture', sourceCapability: 'assessment.design', sourceArtifact: { payload: { alignment: [], assumptions: [], limitations: [], review_questions: [], ai_use_boundaries: 'Human review required', proposed_items: [] } } };
  const review = { id: 'review-fixture', taskId: 'task-fixture', artifactId: 'artifact-fixture', sourceRevision, createdAt: new Date().toISOString(), findings: [{ findingId: 'finding-one', status: 'open', resolutionNote: null }], artifact: { payload: { domain_status: [], findings: [{ finding_id: 'finding-one', category: 'accessibility', severity: 'review', statement: 'Inspect this scene', object_refs: [], evidence_refs: [], recommendation: 'Verify the saved content', limitations: [] }], specialist_routes: [], limitations: [], review_questions: [] } } };
  const task = { task_id: 'task-fixture', status: 'submitted', source_revision: sourceRevision, source_scene_ids: [sceneId], objective_ids: ['objective-one'] };
  await page.route(/\/api\/projects\/[^/]+\/(?:scenes\/[^/]+\/)?pythia-/, async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/pythia-status')) return route.fulfill({ json: { health: { status: 'ok' }, capabilities: { capabilities: ['storyboard.analyze', 'storyboard.transform', 'assessment.design', 'course.review'] }, supportsStoryboardAnalyze: true, supportsStoryboardTransform: true, supportsAssessmentDesign: true, supportsCourseReview: true } });
    if (pathname.includes('/pythia-tasks/')) {
      if (pathname.endsWith('/cancel')) {
        if (state.failCancel) return route.fulfill({ status: 503, json: { detail: 'Cancellation unavailable' } });
        return route.fulfill({ json: { ...task, status: 'cancelled' } });
      }
      return route.fulfill({ json: { ...task, status: state.running ? 'running' : 'awaiting_review', artifact_id: 'artifact-fixture' } });
    }
    if (pathname.includes('/pythia-artifacts/')) return route.fulfill({ json: analysis.artifact });
    if (pathname.endsWith('/decision')) {
      state.decisions++;
      if (state.failDecision) return route.fulfill({ status: 409, json: { detail: 'Decision conflict' } });
      const proposal = pathname.includes('analysis') ? analysis : transformation;
      proposal.status = request.postDataJSON().decision === 'accept' ? 'accepted' : 'rejected';
      return route.fulfill({ json: pathname.includes('analysis') ? proposal : { proposal, project: null } });
    }
    if (pathname.includes('/findings/')) {
      state.decisions++;
      if (state.failDecision) return route.fulfill({ status: 503, json: { detail: 'Finding save unavailable' } });
      review.findings[0] = { ...review.findings[0], ...request.postDataJSON() };
      return route.fulfill({ json: review });
    }
    const saved = pathname.endsWith('/pythia-analysis-proposals') ? analysis : pathname.endsWith('/pythia-transform-proposals') ? transformation : pathname.endsWith('/pythia-assessment-proposals') ? assessment : pathname.endsWith('/pythia-course-reviews') ? review : null;
    if (saved) {
      if (request.method() === 'GET') return route.fulfill({ json: [saved] });
      if (state.failSave) return route.fulfill({ status: 503, json: { detail: 'Draft save unavailable' } });
      return route.fulfill({ status: 201, json: saved === assessment ? [saved] : saved });
    }
    state.submissions++;
    return route.fulfill({ status: 202, json: task });
  });
  await page.route('**/api/projects/*/enhancement-proposals**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [assessment] });
    state.decisions++;
    if (state.failDecision) return route.fulfill({ status: 409, json: { detail: 'Decision conflict' } });
    assessment.status = route.request().postDataJSON().decision === 'accept' ? 'accepted' : 'rejected';
    return route.fulfill({ json: { proposal: assessment, project: null } });
  });
  return state;
}

for (const [name, submit] of [
  ['Analyze a scene with Pythia', 'Analyze selected scene'],
  ['Propose a Pythia storyboard transformation', 'Propose transformation'],
  ['Design an assessment with Pythia', 'Design assessment'],
  ['Review the course with Pythia', 'Review course with Pythia'],
]) {
  test(`${name} waits for an explicit submission and a persisted draft`, async ({ page }) => {
    const id = await seed(page);
    const before = await readProject(page, id);
    const state = await mockPythia(page, id);
    state.failSave = true;
    await choose(page, name);
    await expectStep(page, name);
    expect(state.submissions).toBe(0);
    if (submit === 'Analyze selected scene') {
      await page.evaluate(scope => {
        for (const detail of [
          { type: 'pythia.analysis.saved', scope, entityId: 'wrong-scene' },
          { type: 'pythia.analysis.saved', scope: 'wrong-project' },
        ]) window.dispatchEvent(new CustomEvent('chimera:onboarding-outcome', { detail }));
      }, id);
      await expectStep(page, name);
    }
    if (submit === 'Design assessment') {
      await page.getByLabel('Objective ID', { exact: true }).fill('objective-one');
      await page.getByLabel('Statement', { exact: true }).fill('Practice safely');
      await page.getByLabel('Audience', { exact: true }).fill('New authors');
      await page.getByLabel('Completion rules', { exact: true }).fill('Answer correctly');
      await page.keyboard.press('Escape');
      await expect(guide(page)).toHaveCount(0);
      await expect(page.getByLabel('Audience', { exact: true })).toHaveValue('New authors');
      await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
      await expectStep(page, name);
    }
    await page.getByRole('dialog').getByRole('button', { name: submit, exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Draft save unavailable');
    await expectStep(page, name);
    expect(state.submissions).toBe(1);
    state.failSave = false;
    await page.getByRole('button', { name: 'Retry polling', exact: true }).click();
    await finish(page);
    expect(state.submissions).toBe(1);
    expect((await readProject(page, id)).storyboard).toEqual(before.storyboard);
  });
}

for (const [name, proposalLabel, button] of [
  ['Review a Pythia analysis', 'Pythia analysis proposals', 'Accept review'],
  ['Review a Pythia transformation', 'Pythia storyboard transformations', 'Reject'],
  ['Review Pythia assessment items', null, 'Reject'],
]) {
  test(`${name} advances only after its own successful decision`, async ({ page }) => {
    const id = await seed(page);
    const state = await mockPythia(page, id);
    await choose(page, name);
    const unrelated = proposalLabel
      ? page.getByRole('article').filter({ hasText: 'Inert assessment fixture' })
      : page.getByLabel('Pythia analysis proposals').getByRole('article').first();
    await unrelated.getByRole('button', { name: proposalLabel ? 'Reject' : 'Accept review', exact: true }).click();
    await expectStep(page, name);
    state.failDecision = true;
    const proposal = proposalLabel ? page.getByLabel(proposalLabel).getByRole('article').first() : page.getByRole('article').filter({ hasText: 'Inert assessment fixture' });
    await proposal.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expectStep(page, name);
    state.failDecision = false;
    await proposal.getByRole('button', { name: button, exact: true }).click();
    await finish(page);
    expect(state.submissions).toBe(0);
    expect(state.decisions).toBe(3);
  });
}

test('Pythia cancellation waits for confirmation and findings require a saved resolution', async ({ page }) => {
  const id = await seed(page);
  const state = await mockPythia(page, id);
  state.running = true;
  state.failCancel = true;
  await choose(page, 'Cancel or recover a Pythia task');
  await page.getByRole('button', { name: 'Analyze selected scene', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel task', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Cancellation unavailable');
  await expectStep(page, 'Cancel or recover a Pythia task');
  state.failCancel = false;
  await page.getByRole('button', { name: 'Cancel task', exact: true }).click();
  await finish(page);
  await page.getByRole('button', { name: 'Close Pythia analysis', exact: true }).click();
  await choose(page, 'Resolve Pythia course findings');
  await expect(page.getByRole('button', { name: 'Resolve', exact: true })).toBeDisabled();
  await page.getByLabel('Resolution note', { exact: true }).fill('Verified in the saved scene');
  state.failDecision = true;
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Finding save unavailable');
  await expectStep(page, 'Resolve Pythia course findings');
  state.failDecision = false;
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await finish(page);
  await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
});

test('canvas authoring and production stage walkthroughs wait for real saves', async ({ page }) => {
  const id = await seed(page);
  await choose(page, 'Author the scene canvas');
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await finish(page);
  await choose(page, 'Record the production and release stage');
  const title = (await readProject(page, id)).title;
  await page.getByLabel(`Production stage for ${title}`, { exact: true }).selectOption('in-review');
  await finish(page);
  expect((await readProject(page, id)).productionStage).toBe('in-review');
});

test('media provider walkthroughs require successful explicit actions and retain disconnect confirmation', async ({ page }) => {
  await seed(page);
  let writes = 0;
  let fail = true;
  const status = { configured: true, keyConfigured: true, storageAvailable: true, canManage: true, revision: 'fixture', source: 'saved', provider: 'openai', textModel: 'text-fixture', textModels: ['text-fixture'], imageModel: 'image-fixture', imageModels: ['image-fixture'], audioModel: 'audio-fixture', audioModels: ['audio-fixture'], maxRequestsPerDay: 20, maxConcurrentRequests: 1 };
  await page.route('**/api/ai-connection**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    writes++;
    if (fail) return route.fulfill({ status: 503, json: { detail: 'Provider action unavailable' } });
    return route.fulfill({ json: route.request().url().endsWith('/test') ? { message: 'Connection verified.' } : status });
  });
  await choose(page, 'Save media provider settings');
  expect(writes).toBe(0);
  await page.getByLabel('Daily request limit', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Save media settings', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Provider action unavailable');
  await expectStep(page, 'Save media provider settings');
  fail = false;
  await page.getByRole('button', { name: 'Save media settings', exact: true }).click();
  await finish(page);
  await page.getByRole('button', { name: 'Close media provider settings', exact: true }).click();
  await choose(page, 'Test the media provider connection');
  await page.getByRole('button', { name: 'Test provider', exact: true }).click();
  await finish(page);
  await page.getByRole('button', { name: 'Close media provider settings', exact: true }).click();
  await choose(page, 'Disconnect the media provider');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expectStep(page, 'Disconnect the media provider');
  expect(writes).toBe(3);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await finish(page);
  expect(writes).toBe(4);
});

test('Pythia guides fit desktop and mobile, preserve drafts and do not submit on navigation', async ({ page }) => {
  const id = await seed(page);
  const state = await mockPythia(page, id);
  for (const [width, theme] of [[1440, 'Light'], [390, 'Dark']]) {
    await page.setViewportSize({ width, height: 1000 });
    const reviewTools = page.getByRole('button', { name: 'Review tools', exact: true });
    if (await reviewTools.getAttribute('aria-expanded') === 'true') await reviewTools.click();
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    if (await settings.getAttribute('aria-expanded') !== 'true') await settings.click();
    await page.getByRole('radio', { name: theme, exact: true }).check();
    await choose(page, 'Design an assessment with Pythia');
    await page.getByLabel('Audience', { exact: true }).fill('Draft audience');
    await expect(guide(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await guide(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000);
    expect((await new AxeBuilder({ page }).include('.onboarding-card').analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`pythia-guide-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
    await expect(page.getByLabel('Audience', { exact: true })).toHaveValue('Draft audience');
    await guide(page).getByRole('button', { name: 'Pause guide' }).click();
    await page.getByRole('button', { name: 'Close assessment design', exact: true }).click();
  }
  expect(state.submissions).toBe(0);
});

test('every catalog journey opens a visible target in a prepared project', async ({ page }) => {
  test.setTimeout(180000);
  const id = await seed(page);
  for (const title of ['Question one', 'Question two']) {
    const p = await write(page, id, 'scenes', { title, sceneType: 'assessment' });
    const sceneId = p.storyboard.scenes.at(-1).id;
    await write(page, id, `scenes/${sceneId}`, { assessmentItem: { identifier: sceneId.replaceAll('-', '_'), type: 'true-false', prompt: 'Practice?', correctResponse: 'true', correctFeedback: 'Yes', incorrectFeedback: 'Try again' } }, 'patch');
  }
  let p = await readProject(page, id);
  const uploaded = await page.request.post(`/api/projects/${id}/assets`, { headers: { 'If-Match': `"${p.storyboard.revision}"` }, multipart: { file: { name: 'fixture.png', mimeType: 'image/png', buffer: image } } });
  expect(uploaded.ok()).toBe(true); p = await uploaded.json();
  const sceneId = p.storyboard.scenes[0].id;
  const audio = Buffer.alloc(46); audio.write('RIFF'); audio.writeUInt32LE(38, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(2, 40);
  const wav = await page.request.post(`/api/projects/${id}/assets`, { headers: { 'If-Match': `"${p.storyboard.revision}"` }, multipart: { file: { name: 'fixture.wav', mimeType: 'audio/wav', buffer: audio } } });
  expect(wav.ok()).toBe(true); p = await wav.json();
  await write(page, id, `scenes/${sceneId}`, { imageAssets: [p.storyboard.assets.find(a => a.kind === 'image').id], audioAssets: [p.storyboard.assets.find(a => a.kind === 'audio').id] }, 'patch');
  const template = await page.request.post('/api/templates', { multipart: { file: { name: 'fixture.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx() } } });
  expect(template.ok()).toBe(true);
  await page.unroute('**/api/projects'); await reloadAuthoring(page);
  await expect(page.getByRole('heading', { name: (await readProject(page, id)).title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await page.getByRole('button', { name: 'Guided review', exact: true }).click();
  await page.getByText(/^All functionality walkthroughs/).click();
  const names = await page.locator('details').getByRole('button').allTextContents();
  expect(names.length).toBeGreaterThan(60);
  await page.getByRole('button', { name: 'Close Golden Path' }).click();
  for (const label of names) {
    await choose(page, label.replace(/^Start /, '').trim());
    if (label.includes('Manage project members and review links')) {
      await expect(guide(page).getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
      await guide(page).getByRole('button', { name: 'Pause guide' }).click();
      continue;
    }
    await expect(guide(page).getByRole('button', { name: 'Retry', exact: true }), label).toHaveCount(0);
    await expect(page.locator('[data-onboarding-highlight]'), label).toHaveCount(1);
    await expect(page.locator('[data-onboarding-highlight]'), label).toBeVisible();
    await guide(page).getByRole('button', { name: 'Pause guide' }).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) {
      await dialog.getByRole('button', { name: /^Close / }).first().click();
    }
    // Assessment preparation changes scene selection; reset it for audio/content tasks.
    await page.getByRole('button', { name: 'Storyboard', exact: true }).click();
    await page.getByRole('button', { name: /01 Practice content/ }).click();
  }
});

test('editing waits for a real save, preserves failed drafts, and has independent reload progress', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Edit scene content and settings');
  await page.getByRole('textbox', { name: 'Scene title', exact: true }).fill('Edited by walkthrough');
  await page.route('**/api/projects/*/scenes/*', r => r.fulfill({ status: 409, json: { detail: 'Conflict' } }));
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Edited by walkthrough');
  await page.keyboard.press('Escape'); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await page.unroute('**/api/projects/*/scenes/*');
  await page.getByRole('button', { name: 'Save scene', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].title).toBe('Edited by walkthrough');
  await choose(page, 'Upload images or audio'); await guide(page).getByRole('button', { name: 'Pause guide' }).click();
  await page.unroute('**/api/projects'); await reloadAuthoring(page);
  await expect(page.getByRole('heading', { name: (await readProject(page, id)).title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await expectStep(page, 'Upload images or audio');
  const stored = await page.evaluate(id => JSON.parse(localStorage.getItem(`chimera.onboarding:${id}:edit-scene`)), id);
  expect(stored.status).toBe('complete');
});

test('media upload, attachment, credit and image description confirm persisted outcomes', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Upload images or audio');
  await page.getByLabel('Add media', { exact: true }).setInputFiles({ name: 'guide.png', mimeType: 'image/png', buffer: image }); await finish(page);
  await choose(page, 'Attach or detach media'); await page.getByRole('button', { name: 'Attach to scene', exact: true }).click(); await finish(page);
  await choose(page, 'Save media attribution'); await page.getByLabel('Attribution / credit').fill('Practice illustration, local fixture'); await page.getByRole('button', { name: 'Save credit' }).click(); await finish(page);
  await choose(page, 'Describe scene images');
  const descriptions = page.getByRole('dialog', { name: 'Image descriptions' });
  const sceneDescription = descriptions.getByRole('region', { name: 'Scene 1: Practice content' });
  await sceneDescription.getByRole('textbox', { name: 'Alternative text' }).fill('A practice fixture');
  await sceneDescription.getByRole('button', { name: 'Save', exact: true }).click(); await finish(page);
  const p = await readProject(page, id); const asset = p.storyboard.assets[0];
  expect(p.storyboard.scenes[0].imageAssets).toContain(asset.id); expect(asset.attributionText).toContain('Practice illustration');
  expect(p.storyboard.scenes[0].imageAltText[asset.id]).toBe('A practice fixture');
});

for (const [type, name] of [['single-choice', 'Single-choice question'], ['multiple-response', 'Multiple-answer question'], ['true-false', 'True / false question'], ['ordering', 'Ordering question'], ['drag-drop', 'Drag-and-drop question'], ['matching', 'Matching question'], ['short-answer', 'Short-answer question']]) {
  test(`${name} guide completes only after its matching question is saved`, async ({ page }) => {
    const id = await seed(page); await write(page, id, 'scenes', { title: 'Assessment practice', sceneType: 'assessment' });
    await page.unroute('**/api/projects'); await reloadAuthoring(page); await expect(page.getByRole('button', { name: /Assessment practice question/ })).toBeVisible();
    await choose(page, name);
    if (type === 'single-choice') {
      await page.getByRole('combobox', { name: /^Question type/ }).selectOption('true-false');
      await page.getByRole('textbox', { name: 'Question prompt', exact: true }).fill('Wrong type must not advance');
      await page.getByRole('button', { name: 'Save question', exact: true }).click();
      await expect(page.getByText(/^Saved to Catalog/)).toBeVisible();
      await expectStep(page, name);
    }
    await page.getByRole('combobox', { name: /^Question type/ }).selectOption(type);
    await page.getByRole('textbox', { name: 'Question prompt', exact: true }).fill('Practice question');
    if (['single-choice', 'multiple-response', 'ordering'].includes(type)) { await page.getByRole('textbox', { name: 'Text for CHOICE_A' }).fill('One'); await page.getByRole('textbox', { name: 'Text for CHOICE_B' }).fill('Two'); }
    if (type === 'short-answer') await page.getByLabel('Enter one accepted answer per line').fill('Practice');
    if (['matching', 'drag-drop'].includes(type)) {
      const prefix = type === 'matching' ? ['LEFT', 'RIGHT'] : ['DRAG', 'TARGET'];
      for (const side of prefix) for (const letter of ['A', 'B']) await page.getByRole('textbox', { name: `Text for ${side}_${letter}` }).fill(`${side} ${letter}`);
      const pairs = page.getByRole('group', { name: type === 'matching' ? 'Correct matches' : 'Correct placement' }).getByRole('combobox');
      await pairs.nth(0).selectOption(`${prefix[1]}_A`); await pairs.nth(1).selectOption(`${prefix[1]}_B`);
    }
    await page.getByRole('button', { name: 'Save question', exact: true }).click(); await finish(page);
    expect((await readProject(page, id)).storyboard.scenes.at(-1).assessmentItem.type).toBe(type);
  });
}

test('completion rules, validation and preview support modal pause/resume', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Set course completion rules');
  await page.getByLabel('Course passing score').selectOption('90'); await page.getByRole('button', { name: 'Save rules' }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.completionSettings.passingScore).toBe(90);
  await choose(page, 'Validate authoring and production readiness');
  await page.getByRole('button', { name: 'Production release', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Production readiness', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(guide(page)).toHaveCount(0); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await expectStep(page, 'Review the result');
  expect((await new AxeBuilder({ page }).include('.onboarding-card').analyze()).violations).toEqual([]);
  await guide(page).getByRole('button', { name: 'Pause guide' }).click(); await page.getByRole('button', { name: 'Close validation report' }).click();
  await choose(page, 'Preview as a learner'); await expect(page.getByRole('dialog').getByRole('heading', { name: 'Practice content', exact: true })).toBeVisible();
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click(); await finish(page);
});

test('comments save, reply and resolve against the real API', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Post a review comment');
  await page.getByLabel('Reviewer', { exact: true }).fill('Practice reviewer'); await page.getByLabel('Comment', { exact: true }).fill('Please review this scene');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click(); await finish(page); await page.getByRole('button', { name: 'Close course preview' }).click();
  await choose(page, 'Reply, resolve and reopen comments'); await page.getByRole('button', { name: 'Resolve', exact: true }).click(); await finish(page);
  expect((await (await page.request.get(`/api/projects/${id}/review-comments`)).json())[0].resolved).toBe(true);
});

test('exports recognize successful downloads and failed exports stay active', async ({ page }) => {
  await seed(page); await choose(page, 'Download storyboard JSON');
  await page.route('**/storyboard/export', r => r.fulfill({ status: 500, json: { detail: 'Unavailable' } }));
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click(); await expectStep(page, 'Download storyboard JSON');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); await page.unroute('**/storyboard/export');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON', exact: true }).click(); expect((await downloaded).suggestedFilename()).toMatch(/storyboard.json$/); await finish(page);
});

test('prerequisites block safely and cancelled deletion never completes', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Single-choice question'); await expect(guide(page).getByRole('button', { name: 'Retry' })).toBeVisible();
  await guide(page).getByRole('button', { name: 'Pause guide' }).click(); await choose(page, 'Delete a scene');
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'Delete Practice content', exact: true }).click(); await expectStep(page, 'Delete a scene');
  expect((await readProject(page, id)).storyboard.scenes).toHaveLength(1);
});

test('templates upload, edit, replace and assign; PowerPoint import saves real scenes', async ({ page }) => {
  test.setTimeout(60000);
  const id = await seed(page); const deck = pptx(); const editedName = unique('Edited template');
  await choose(page, 'Upload a scene template');
  await page.getByLabel('Upload PPTX template', { exact: true }).setInputFiles({ name: 'practice.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }); await finish(page);
  await choose(page, 'Edit template details'); await page.getByLabel('Template name', { exact: true }).fill(editedName); await page.getByRole('button', { name: 'Save template', exact: true }).click(); await finish(page);
  await choose(page, 'Replace a template source'); await page.getByRole('article').filter({ hasText: editedName }).getByLabel('Replace template PowerPoint').setInputFiles({ name: 'replacement.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }); await finish(page);
  await choose(page, 'Assign a template to a scene'); await page.getByRole('combobox', { name: /^Rendering mode/ }).selectOption('template');
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  const select = page.getByRole('dialog').getByRole('combobox', { name: 'Template', exact: true }); const templateId = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(templateId); await page.getByRole('button', { name: 'Save scene', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].templateId).toBe(templateId);
  await choose(page, 'Import PowerPoint');
  const [importResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/projects/${id}/source`) && response.request().method() === 'POST', { timeout: 45000 }),
    page.getByLabel('Import PowerPoint', { exact: true }).setInputFiles({ name: 'course.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }),
  ]);
  expect(importResponse.ok()).toBe(true);
  await finish(page);
  expect((await readProject(page, id)).hasSourceDeck).toBe(true);
});

test('both SCORM profiles, reports, Word and Chimera storyboard confirm real downloads', async ({ page }) => {
  test.setTimeout(60000); await seed(page);
  for (const [name, button, suffix] of [
    ['Build SCORM 2004', 'Build SCORM 2004', /scorm2004.zip$/],
    ['Build SCORM 1.2', 'Build SCORM 1.2', /scorm12.zip$/],
    ['Download a SCORM build report', 'Report 2004', /build-report.json$/],
    ['Download Chimera storyboard', 'Download Chimera storyboard', /backup.zip$/],
  ]) {
    await choose(page, name); const download = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click(); expect((await download).suggestedFilename()).toMatch(suffix); await finish(page);
    await page.getByRole('button', { name: 'Close export', exact: true }).click();
  }
  await choose(page, 'Export an editable Word storyboard');
  for (const [format, suffix] of [['sme', /sme-master\.docx$/], ['full', /full-storyboard\.docx$/]]) {
    await page.getByLabel('Word storyboard format').selectOption(format);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Word document', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(suffix);
  }
  await finish(page);
  await page.getByRole('button', { name: 'Close export', exact: true }).click();
});

test('restore guides retain confirmation and advance after successful JSON and ZIP restoration', async ({ page }) => {
  const id = await seed(page); const p = await readProject(page, id);
  await choose(page, 'Restore storyboard JSON');
  page.once('dialog', d => d.dismiss());
  const file = { name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p.storyboard)) };
  await page.getByLabel('Restore JSON', { exact: true }).setInputFiles(file); await expectStep(page, 'Restore storyboard JSON');
  expect((await readProject(page, id)).storyboard.revision).toBe(p.storyboard.revision);
  page.once('dialog', d => d.accept()); await page.getByLabel('Restore JSON', { exact: true }).setInputFiles(file); await finish(page);
  await page.getByRole('button', { name: 'Close export', exact: true }).click();
  const backup = await page.request.get(`/api/projects/${id}/backup.zip`); expect(backup.ok()).toBe(true);
  await choose(page, 'Restore Chimera storyboard'); page.once('dialog', d => d.accept());
  await page.getByLabel('Restore Chimera storyboard', { exact: true }).setInputFiles({ name: 'restore.zip', mimeType: 'application/zip', buffer: await backup.body() }); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].title).toBe('Practice content');
});

test('reordering, audio requirements, export threshold and deletion persist only after confirmation', async ({ page }) => {
  const id = await seed(page); await write(page, id, 'scenes', { title: 'Second scene' });
  await page.unroute('**/api/projects'); await reloadAuthoring(page); await expect(page.getByRole('button', { name: /Second scene content/ })).toBeVisible();
  await choose(page, 'Reorder scenes'); await page.getByRole('button', { name: 'Move Practice content down', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[1].title).toBe('Practice content');
  await choose(page, 'Set the package size warning'); await page.getByRole('spinbutton', { name: 'Package warning threshold in MB' }).fill('250'); await page.getByRole('heading', { name: 'Export course', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.exportSettings.packageWarningThresholdMB).toBe(250);
  await page.getByRole('button', { name: 'Close export' }).click(); await choose(page, 'Delete a scene'); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete Second scene' }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes.map(s => s.title)).toEqual(['Practice content']);
});

test('catalog search is usable in a narrow dark window', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 600, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByRole('button', { name: 'Review tools', exact: true }).click(); await page.getByRole('button', { name: 'Guided review' }).click(); await page.getByText(/^All functionality walkthroughs/).click();
  await page.getByRole('searchbox', { name: 'Find a walkthrough' }).fill('storyboard');
  await expect(page.getByRole('button', { name: 'Start Download Chimera storyboard' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.golden-path-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('walkthrough-catalog.png') });
});

test('references and author suggestions save without invoking an AI provider', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Add enhancement references');
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({ name: 'practice.md', mimeType: 'text/markdown', buffer: Buffer.from('# Practice\nUse concise instructions.') }); await finish(page);
  await page.getByRole('button', { name: 'Close suggestion review' }).click();
  const p = await readProject(page, id);
  await write(page, id, 'enhancement-proposals', { origin: 'author', targetSceneId: p.storyboard.scenes[0].id, field: 'actionDescription', proposedValue: 'Practice direction', rationale: 'Inert author fixture' });
  await choose(page, 'Review and decide suggestions'); await page.getByRole('button', { name: 'Accept change', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].actionDescription).toBe('Practice direction');
});

test('enhancement submission requires an explicit click; provider requests use inert responses', async ({ page }) => {
  const id = await seed(page); let submissions = 0;
  const job = { id: 'fixture-job', sourceRevision: 2, scope: 'whole-course', sceneIds: [], goal: 'Practice', resourceIds: [], resourceVersions: {}, status: 'queued', progress: 0, message: 'Inert fixture', provider: 'fixture', model: 'fixture', estimatedInputTokens: 1, estimatedCostUsd: null, proposalIds: [], resourceConflicts: [], error: null, retryOf: null };
  await page.route('**/enhancement-jobs/preview', r => r.fulfill({ json: { sourceRevision: 2, sceneCount: 1, resourceCount: 0, estimatedInputTokens: 1, estimatedCostUsd: null, engineConfigured: true, payload: { scenes: [], references: [] } } }));
  await page.route('**/enhancement-jobs', r => { if (r.request().method() === 'POST') { submissions++; return r.fulfill({ status: 202, json: job }); } return r.fulfill({ json: [] }); });
  await choose(page, 'Preview and submit an enhancement run');
  await page.getByRole('textbox', { name: 'Enhancement goal', exact: true }).fill('Practice');
  await page.getByRole('combobox', { name: /^Scope/ }).selectOption('whole-course');
  await page.getByRole('button', { name: 'Preview submission', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit run', exact: true })).toBeEnabled();
  expect(submissions).toBe(0); await expectStep(page, 'Preview and submit an enhancement run');
  await page.getByRole('button', { name: 'Submit run', exact: true }).click(); await finish(page); expect(submissions).toBe(1);
  expect((await readProject(page, id)).storyboard.scenes[0].actionDescription).toBe('');
});

test('media candidate decisions require author action and failed decisions do not advance', async ({ page }) => {
  const id = await seed(page); const p = await readProject(page, id); let rejected = false;
  const candidate = { id: 'fixture-candidate', jobId: 'fixture-job', sceneId: p.storyboard.scenes[0].id, kind: 'image', status: 'pending', filename: 'fixture.png', purpose: 'Practice', prompt: 'Practice', script: '', altText: 'Practice fixture', provider: 'fixture', model: 'fixture' };
  await page.route('**/generated-candidates', r => r.fulfill({ json: rejected ? [] : [candidate] }));
  await page.route('**/generated-candidates/fixture-candidate/asset', r => r.fulfill({ contentType: 'image/png', body: image }));
  await page.route('**/generated-candidates/fixture-candidate/approve', r => r.fulfill({ status: 409, json: { detail: 'Fixture conflict' } }));
  await page.route('**/generated-candidates/fixture-candidate/reject', r => { rejected = true; return r.fulfill({ json: { project: null } }); });
  await choose(page, 'Generate and review media candidates'); expect(rejected).toBe(false);
  await page.getByRole('button', { name: 'Approve asset', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Fixture conflict'); await expectStep(page, 'Generate and review media candidates');
  await page.getByRole('button', { name: 'Reject', exact: true }).click(); await finish(page); expect(rejected).toBe(true);
  expect((await readProject(page, id)).storyboard.scenes[0].imageAssets).toEqual([]);
});
