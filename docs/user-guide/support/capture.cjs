/* Requires Playwright supplied through GUIDE_PLAYWRIGHT; see README.md here. */
const { chromium } = require(process.env.GUIDE_PLAYWRIGHT || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../images');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ baseURL: process.env.GUIDE_URL || 'http://127.0.0.1:5178', viewport: { width: 1500, height: 1400 }, colorScheme: 'light' });
    page.setDefaultTimeout(10000);
    const button = (name) => page.getByRole('button', { name, exact: true });
    const manifest = [];
    async function shot(name, selector) {
      const locator = typeof selector === 'string' ? page.locator(selector).first() : selector.first();
      await locator.waitFor({ state: 'visible' });
      await locator.screenshot({ path: path.join(output, name + '.png') });
      manifest.push({ file: name + '.png', selector: typeof selector === 'string' ? selector : 'semantic locator' });
      console.log(name);
    }
    await page.goto(process.env.GUIDE_URL || 'http://127.0.0.1:5178');
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../workspace/user-guide-restored/fixture.json'), 'utf8'));
    const projects = await (await page.request.get('/api/projects')).json();
    if (projects.length !== 1 || projects[0].id !== fixture.projectId) {
      throw new Error('Capture requires the isolated guide workspace, not a real authoring workspace.');
    }
    await button('Resume authoring').click();
    await button('Edit scene').waitFor();
    await shot('workspace', '.app-shell');
    await shot('project-controls', '.sidebar-project');
    await shot('top-actions', '.top-actions');
    await shot('scene-sequence', '.scene-list');
    await button('Settings').click();
    await shot('appearance', '.appearance-selector');
    await button('Create project').click();
    await shot('create-project', '[role=dialog]');
    await button('Close new project').click();
    await button('Review tools').click();
    await shot('review-tools', '#review-tools');
    await button('Edit scene').click();
    await shot('scene-editor', '[role=dialog]');
    await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
    await shot('scene-canvas-editor', '[role=dialog]');
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.getByLabel('Scene layout').selectOption('template');
    await shot('template-selection', '[role=dialog]');
    await button('Close scene editor').click();
    await button('Add scene').click();
    await shot('new-scene', '[role=dialog]');
    await button('Close scene editor').click();
    await shot('audio-requirement', '.audio-requirement-setting');
    for (const [open, close, name] of [
      ['Completion rules', 'Close completion settings', 'completion-rules'],
      ['Check image descriptions', 'Close image accessibility editor', 'image-descriptions'],
      ['Validate storyboard', 'Close validation report', 'validation'],
      ['Guided review', 'Close Golden Path', 'guided-review'],
    ]) {
      await button(open).click();
      if (name === 'validation') await page.getByText('No blocking issues', { exact: true }).waitFor();
      await shot(name, '[role=dialog]');
      if (name === 'validation') {
        await button('Production release').click();
        await page.getByText('Production release blocked', { exact: true }).waitFor();
        await shot('production-validation', '[role=dialog]');
      }
      await button(close).click();
    }
    await button('Templates').click();
    await shot('templates', '.template-library');
    await button('Edit details').click();
    await shot('template-details', '[role=dialog]');
    await button('Close template editor').click();
    await page.route('**/media-generation-capability', route => route.fulfill({ json: { providerConfigured: true, canGenerate: true } }));
    await button('Media library').click();
    await page.locator('.generation-creator > summary').click();
    await shot('media-image-form', '.generated-media-form');
    await page.getByLabel('Media type').selectOption('narration');
    await shot('media-narration-form', '.generated-media-form');
    await shot('candidate-review', '.generated-candidate');
    await shot('media-library', '.media-library');
    await button('Storyboard').click();
    await page.locator('.scene-row').nth(1).click();
    await shot('assessment-launch', '.assessment-authoring-launch');
    await button('Media library').click();
    await shot('attach-media', '.media-library');
    await button('Storyboard').click();
    await button('Edit question').click();
    await button('Save question').click();
    await page.getByText('Saved to Chimera Guide Demonstration', { exact: true }).waitFor();
    await shot('assessment-actions', '.assessment-editor-footer');
    for (const type of ['single-choice', 'multiple-response', 'true-false', 'ordering', 'drag-drop', 'matching', 'short-answer']) {
      await page.getByLabel('Question type').selectOption(type);
      await page.locator('.assessment-editor-body').evaluate(el => { el.scrollTop = 0; });
      await shot('question-' + type, '.assessment-editor-dialog');
    }
    await page.locator('.assessment-settings').scrollIntoViewIfNeeded();
    await shot('assessment-rules', '.assessment-settings');
    await button('Close question editor').click();
    await page.locator('.scene-row').first().click();
    const freshProposal = await page.request.post(`/api/projects/${fixture.projectId}/enhancement-proposals`, { data: {
      targetSceneId: fixture.sceneId, origin: 'author',
      proposedValue: `Documentation suggestion captured ${new Date().toISOString()}: introduce each objective, then ask learners what they will practice.`,
      rationale: 'Documentation fixture to demonstrate author approval; no AI request was made.',
    } });
    if (!freshProposal.ok()) throw new Error('Could not prepare a current-revision proposal fixture');
    await button('Review suggestions').click();
    await page.locator('.enhancement-proposal').first().waitFor();
    if (await page.getByText('No references added', { exact: true }).count()) {
      await page.locator('.enhancement-upload-button input').setInputFiles(path.resolve(__dirname, '../../../workspace/user-guide-restored/study-guide.txt'));
      await page.getByText('study-guide', { exact: true }).waitFor();
    }
    await page.getByLabel('Scope').selectOption('selected-scenes');
    await page.locator('.enhancement-choice-group').first().getByRole('checkbox').first().check();
    await shot('enhancement-form', '.enhancement-submission');
    await button('Preview submission').click();
    await page.locator('.enhancement-submission-preview').waitFor();
    await shot('submission-preview', '.enhancement-submission-preview');
    await shot('submission-actions', '.enhancement-submit-actions');
    if (await page.locator('.enhancement-job-list').count()) {
      await shot('enhancement-jobs', '.enhancement-job-list');
      const cancel = page.locator('.enhancement-job').getByRole('button', { name: 'Cancel', exact: true });
      if (await cancel.count()) await cancel.first().click();
    }
    const exampleProposal = page.locator('.enhancement-proposal').last();
    await shot('proposal', exampleProposal);
    await exampleProposal.getByRole('button', { name: 'Edit values', exact: true }).click();
    await shot('proposal-edit', exampleProposal);
    await exampleProposal.getByRole('button', { name: 'Cancel edit', exact: true }).click();
    await exampleProposal.getByRole('button', { name: 'Accept change', exact: true }).click();
    await exampleProposal.getByRole('button', { name: 'Undo acceptance', exact: true }).waitFor();
    await shot('proposal-accepted', exampleProposal);
    await button('Close suggestion review').click();
    await button('Preview course').click();
    await shot('preview-header', '.course-preview-header');
    await shot('preview-navigation', '.course-preview-navigation');
    await page.getByLabel('Reviewer', { exact: true }).fill('Demo reviewer');
    await page.getByLabel('Comment', { exact: true }).fill('Please confirm that both objectives are demonstrated.');
    await button('Add comment').click();
    await button('Resolve').first().waitFor();
    await shot('scene-discussion', '.course-preview-review');
    await button('Resolve').first().click();
    await shot('resolved-thread', '.course-preview-comment.resolved');
    await shot('preview-audio', '.course-preview-audio');
    await page.getByText('Read slide text', { exact: true }).click();
    await shot('slide-transcript', '.course-preview-transcript');
    await button('Next').click();
    await shot('learner-question', '.course-preview-assessment');
    await page.locator('.course-preview-assessment').getByRole('radio').nth(1).check();
    await button('Check answer').click();
    await shot('remediation', '.course-preview-assessment');
    await button('Review lesson').click();
    await shot('return-question', button('Return to question'));
    await button('Return to question').click();
    await page.locator('.course-preview-assessment').getByRole('radio').first().check();
    await button('Try again').click();
    await shot('learner-result', '.course-preview-assessment');
    await button('Close course preview').click();
    await button('Export').click();
    await shot('export-dialog', '[role=dialog]');
    for (const [name, title] of [['scorm-export', 'Learning management system'], ['backup-controls', 'Chimera storyboard'], ['word-export', 'Editable Word storyboard'], ['qti-test', 'Assessment test']]) {
      await shot(name, page.locator('.export-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) }));
    }
    await button('Close export').click();
    await button('My Work').click();
    await page.locator('.health-row').first().waitFor();
    await shot('my-work', '.management-view');
    await page.locator('.health-row').first().getByRole('button', { name: 'Move to trash', exact: true }).click();
    await shot('trash-confirmation', '[role=dialog]');
    await button('Cancel').click();
    await button('Resume authoring').click();
    // Temporarily expose scene-specific validation controls, then restore fixture data.
    const original = await (await page.request.get(`/api/projects/${fixture.projectId}`)).json();
    try {
      const assessmentScene = original.storyboard.scenes[1];
      const cleared = await page.request.patch(`/api/projects/${fixture.projectId}/scenes/${assessmentScene.id}`, { data: { assessmentItem: null } });
      if (!cleared.ok()) throw new Error('Could not prepare Create question control');
      await page.reload();
      await button('Resume authoring').click();
      await page.locator('.scene-row').nth(1).click();
      await shot('assessment-create', '.assessment-authoring-launch');
      const changes = await page.request.patch(`/api/projects/${fixture.projectId}/scenes/${fixture.sceneId}`, { data: { imageAltText: {}, audioAssets: [], audioRequired: true } });
      if (!changes.ok()) throw new Error('Could not prepare validation fixture');
      await button('Review tools').click();
      await button('Validate storyboard').click();
      await button('Add description').waitFor();
      await shot('validation-issues', '.validation-dialog');
      await button('Close validation report').click();
    } finally {
      const restored = await page.request.put(`/api/projects/${fixture.projectId}/storyboard/import`, { data: original.storyboard });
      if (!restored.ok()) throw new Error('Could not restore validation fixture');
    }
    fs.writeFileSync(path.join(output, '../capture-manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), viewport: { width: 1500, height: 1400 }, fixture: 'isolated demonstration data; no live AI generation', screenshots: manifest }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
