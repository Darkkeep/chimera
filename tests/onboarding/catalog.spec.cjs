const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { guide, expectStep, startChimera, createProject, saveScene } = require('./helpers.cjs');
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
  await page.unroute('**/api/projects'); await page.reload();
  await expect(page.getByRole('heading', { name: (await readProject(page, id)).title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await page.getByRole('button', { name: 'Guided review', exact: true }).click();
  await page.getByText(/^All functionality walkthroughs/).click();
  const names = await page.locator('details').getByRole('button').allTextContents();
  expect(names.length).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Close Golden Path' }).click();
  for (const label of names) {
    await choose(page, label.replace(/^Start /, '').trim());
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
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectStep(page, 'Edit scene content and settings');
  await expect(page.getByRole('textbox', { name: 'Scene title', exact: true })).toHaveValue('Edited by walkthrough');
  await page.keyboard.press('Escape'); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume walkthrough', exact: true }).click();
  await page.unroute('**/api/projects/*/scenes/*');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].title).toBe('Edited by walkthrough');
  await choose(page, 'Upload images or audio'); await guide(page).getByRole('button', { name: 'Pause guide' }).click();
  await page.unroute('**/api/projects'); await page.reload();
  await expect(page.getByRole('heading', { name: (await readProject(page, id)).title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start / resume walkthrough', exact: true }).click();
  await expectStep(page, 'Upload images or audio');
  const stored = await page.evaluate(id => JSON.parse(localStorage.getItem(`chimera.onboarding:${id}:edit-scene`)), id);
  expect(stored.status).toBe('complete');
});

test('media upload, attachment, credit and image description confirm persisted outcomes', async ({ page }) => {
  const id = await seed(page); await choose(page, 'Upload images or audio');
  await page.getByLabel('Upload media', { exact: true }).setInputFiles({ name: 'guide.png', mimeType: 'image/png', buffer: image }); await finish(page);
  await choose(page, 'Attach or detach media'); await page.getByRole('button', { name: 'Attach to scene', exact: true }).click(); await finish(page);
  await choose(page, 'Save media attribution'); await page.getByLabel('Attribution / credit').fill('Practice illustration, local fixture'); await page.getByRole('button', { name: 'Save credit' }).click(); await finish(page);
  await choose(page, 'Describe scene images'); await page.getByLabel('Alternative text').fill('A practice fixture'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await finish(page);
  const p = await readProject(page, id); const asset = p.storyboard.assets[0];
  expect(p.storyboard.scenes[0].imageAssets).toContain(asset.id); expect(asset.attributionText).toContain('Practice illustration');
  expect(p.storyboard.scenes[0].imageAltText[asset.id]).toBe('A practice fixture');
});

for (const [type, name] of [['single-choice', 'Single-choice question'], ['multiple-response', 'Multiple-answer question'], ['true-false', 'True / false question'], ['ordering', 'Ordering question'], ['drag-drop', 'Drag-and-drop question'], ['matching', 'Matching question'], ['short-answer', 'Short-answer question']]) {
  test(`${name} guide completes only after its matching question is saved`, async ({ page }) => {
    const id = await seed(page); await write(page, id, 'scenes', { title: 'Assessment practice', sceneType: 'assessment' });
    await page.unroute('**/api/projects'); await page.reload(); await expect(page.getByRole('button', { name: /Assessment practice assessment/ })).toBeVisible();
    await choose(page, name);
    if (type === 'single-choice') {
      await page.getByRole('combobox', { name: /^Question type/ }).selectOption('true-false');
      await page.getByLabel('Question prompt', { exact: true }).fill('Wrong type must not advance');
      await page.getByRole('button', { name: 'Save question', exact: true }).click();
      await expect(page.getByText(/^Saved to Catalog/)).toBeVisible();
      await expectStep(page, name);
    }
    await page.getByRole('combobox', { name: /^Question type/ }).selectOption(type);
    await page.getByLabel('Question prompt', { exact: true }).fill('Practice question');
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
  const id = await seed(page); const deck = pptx();
  await choose(page, 'Upload a scene template');
  await page.getByLabel('Upload PPTX template', { exact: true }).setInputFiles({ name: 'practice.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }); await finish(page);
  await choose(page, 'Edit template details'); await page.getByLabel('Template name', { exact: true }).fill(unique('Edited template')); await page.getByRole('button', { name: 'Save template', exact: true }).click(); await finish(page);
  await choose(page, 'Replace a template source'); await page.getByLabel('Replace template PowerPoint').first().setInputFiles({ name: 'replacement.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }); await finish(page);
  await choose(page, 'Assign a template to a scene'); await page.getByRole('combobox', { name: /^Scene layout/ }).selectOption('template');
  const select = page.getByRole('dialog').getByRole('combobox', { name: /^Template/ }); const templateId = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(templateId); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].templateId).toBe(templateId);
  await choose(page, 'Import PowerPoint'); await page.getByLabel('Import PowerPoint', { exact: true }).setInputFiles({ name: 'course.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: deck }); await finish(page);
  expect((await readProject(page, id)).hasSourceDeck).toBe(true);
});

test('both SCORM profiles, reports, Word and portable backup confirm real downloads', async ({ page }) => {
  test.setTimeout(60000); await seed(page);
  for (const [name, button, suffix] of [
    ['Build SCORM 2004', 'Build SCORM 2004', /scorm2004.zip$/],
    ['Build SCORM 1.2', 'Build SCORM 1.2', /scorm12.zip$/],
    ['Download a SCORM build report', 'Report 2004', /build-report.json$/],
    ['Export an editable Word storyboard', 'Download Word document', /storyboard.docx$/],
    ['Download a portable backup', 'Download portable backup', /backup.zip$/],
  ]) {
    await choose(page, name); const download = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click(); expect((await download).suggestedFilename()).toMatch(suffix); await finish(page);
    await page.getByRole('button', { name: 'Close export', exact: true }).click();
  }
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
  await choose(page, 'Restore a portable backup'); page.once('dialog', d => d.accept());
  await page.getByLabel('Restore portable backup', { exact: true }).setInputFiles({ name: 'restore.zip', mimeType: 'application/zip', buffer: await backup.body() }); await finish(page);
  expect((await readProject(page, id)).storyboard.scenes[0].title).toBe('Practice content');
});

test('reordering, audio requirements, export threshold and deletion persist only after confirmation', async ({ page }) => {
  const id = await seed(page); await write(page, id, 'scenes', { title: 'Second scene' });
  await page.unroute('**/api/projects'); await page.reload(); await expect(page.getByRole('button', { name: /Second scene content/ })).toBeVisible();
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
  await page.getByRole('searchbox', { name: 'Find a walkthrough' }).fill('backup');
  await expect(page.getByRole('button', { name: 'Start Download a portable backup' })).toBeVisible();
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
  await page.route('**/enhancement-jobs/preview', r => r.fulfill({ json: { sourceRevision: 2, sceneCount: 1, resourceCount: 0, estimatedInputTokens: 1, estimatedCostUsd: null, providerConfigured: true, payload: { scenes: [], references: [] } } }));
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
