const { test, expect } = require('@playwright/test');

test('course prompt uses uploaded references and persists only the reviewed draft', async ({ page }, testInfo) => {
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.route('**/api/ai-connection', route => route.fulfill({ json: { configured: true } }));
  let generationRequest;
  await page.route('**/api/projects/*/content-drafts/course', async route => {
    generationRequest = route.request().postDataJSON();
    await route.fulfill({ json: { scenes: [{ title: 'AI proposal', sceneType: 'content', extractedText: ['Proposed learner text.'], actionDescription: 'Compare the checklist.', narration: 'Read the checklist.', notes: 'Verify local terms.', required: true }] } });
  });
  let sceneGenerationRequest;
  await page.route('**/content-draft', async route => {
    sceneGenerationRequest = route.request().postDataJSON();
    await route.fulfill({ json: { title: 'AI scene revision', sceneType: 'interaction', extractedText: ['Revised learner text.'], actionDescription: 'Select the applicable checklist item.', narration: 'Choose the item that applies.', notes: 'Confirm the local procedure.', required: false, visualLayout: { version: 1, enabled: true, width: 1280, height: 720, backgroundColor: '#17324d', backgroundAsset: null, elements: [{ id: 'headline', kind: 'text', x: 64, y: 72, width: 1120, height: 160, text: 'AI scene revision', fontSize: 48, fontFamily: 'Manrope', color: '#ffffff', bold: true, italic: false, align: 'left', crop: [0, 0, 0, 0], shapeSvg: null, shapeName: null, source: 'manual', locked: false }, { id: 'body', kind: 'text', x: 96, y: 310, width: 1000, height: 120, text: 'Revised learner text.', fontSize: 30, fontFamily: 'Manrope', color: '#ffffff', bold: false, italic: false, align: 'left', crop: [0, 0, 0, 0], shapeSvg: null, shapeName: null, source: 'manual', locked: false }], warnings: [] } } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Name your course' });
  await dialog.getByRole('textbox', { name: 'Course name' }).fill(`Draft flow ${Date.now()}`);
  await dialog.getByLabel('Attach course design documents').setInputFiles({
    name: 'course-guide.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Use the local safety checklist before operation.'),
  });
  await dialog.getByRole('textbox', { name: 'Course prompt' }).fill('Create a brief operator course grounded in this guide.');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Draft course scenes' });
  await expect(review).toBeVisible();
  await expect(review.getByText('1 reference available for grounding.')).toBeVisible();
  await review.getByRole('button', { name: 'Generate course draft' }).click();
  await expect(review.getByLabel('Generated scenes for review')).toBeVisible();
  expect(generationRequest.prompt).toContain('operator course');
  expect(generationRequest.resourceIds).toHaveLength(1);

  await review.getByLabel('Title').fill('Reviewed operator introduction');
  await review.getByRole('button', { name: 'Add selected scenes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const projectId = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const saved = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(saved.storyboard.scenes).toHaveLength(1);
  expect(saved.storyboard.scenes[0].title).toBe('Reviewed operator introduction');
  expect(saved.storyboard.scenes[0].extractedText).toEqual(['Proposed learner text.']);

  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const sceneEditor = page.getByRole('dialog').last();
  await sceneEditor.getByRole('tab', { name: 'Details', exact: true }).click();
  await sceneEditor.getByRole('textbox', { name: 'Scene title' }).fill('Unsaved operator lesson');
  await sceneEditor.getByRole('textbox', { name: 'On-screen text', exact: true }).fill('Use this current editor wording.');
  await sceneEditor.getByLabel('Scene prompt').fill('Make this scene interactive and concise.');
  await sceneEditor.getByRole('button', { name: 'Generate scene + layout draft' }).click();
  await expect(sceneEditor.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true');
  await expect(sceneEditor.getByText('Generated scene layout · not saved')).toBeVisible();
  expect(sceneGenerationRequest.prompt).toContain('interactive');
  expect(sceneGenerationRequest.currentScene.title).toBe('Unsaved operator lesson');
  expect(sceneGenerationRequest.currentScene.extractedText).toEqual(['Use this current editor wording.']);
  expect(sceneGenerationRequest.currentScene.visualLayout.elements[0].text).toBe('Unsaved operator lesson');
  const selectedSceneId = saved.storyboard.scenes[0].id;
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(sceneEditor.getByRole('button', { name: 'Revised learner text. element' })).toBeVisible();
  const beforeSave = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(beforeSave.storyboard.scenes[0].title).toBe('Reviewed operator introduction');
  await sceneEditor.getByRole('tab', { name: 'Details' }).click();
  await expect(sceneEditor.getByRole('textbox', { name: 'Scene title' })).toHaveValue('AI scene revision');
  await sceneEditor.getByRole('button', { name: 'Save scene' }).click();
  await expect(sceneEditor).toHaveCount(0);
  const afterSave = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const revisedScene = afterSave.storyboard.scenes.find(scene => scene.id === selectedSceneId);
  expect(revisedScene.title).toBe('AI scene revision');
  expect(revisedScene.sceneType).toBe('interaction');
  expect(revisedScene.extractedText).toEqual(['Revised learner text.']);
  expect(revisedScene.narration).toBe('Choose the item that applies.');
  expect(revisedScene.required).toBe(false);
  expect(revisedScene.visualLayout.enabled).toBe(true);
  expect(revisedScene.visualLayout.backgroundColor).toBe('#17324d');
  expect(revisedScene.visualLayout.elements).toHaveLength(2);

  await page.route('**/content-draft', route => route.fulfill({ json: {
    title: 'Equipment knowledge check', sceneType: 'question', extractedText: ['Check your understanding.'],
    actionDescription: '', narration: '', notes: '', required: true,
    assessmentItem: { type: 'true-false', identifier: 'equipment-check', prompt: 'Inspect equipment before operation.', correctResponse: 'true', correctFeedback: 'Correct. Inspect first.', incorrectFeedback: 'Review the inspection checklist.' },
    assessmentSettings: { maxAttempts: 3, passingScore: 100, scoreWeight: 2, remediationSceneId: null },
    visualLayout: { enabled: true, width: 1280, height: 720, backgroundColor: '#17324d', elements: [
      { id: 'title', kind: 'text', x: 64, y: 64, width: 1100, height: 160, text: 'Equipment knowledge check', fontSize: 48, color: '#ffffff' },
      { id: 'body', kind: 'text', x: 64, y: 300, width: 1100, height: 160, text: 'Check your understanding.', fontSize: 28, color: '#ffffff' },
    ], warnings: [] },
  } }));
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const assessmentEditor = page.getByRole('dialog').last();
  await assessmentEditor.getByRole('tab', { name: 'Details', exact: true }).click();
  await assessmentEditor.getByLabel('Scene prompt').fill('Turn this into a true-false knowledge check.');
  await assessmentEditor.getByRole('button', { name: 'Generate scene + layout draft' }).click();
  await expect(assessmentEditor.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true');
  const beforeAssessmentSave = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(beforeAssessmentSave.storyboard.scenes[0].assessmentItem).toBeNull();
  await assessmentEditor.getByRole('tab', { name: 'Details', exact: true }).click();
  const assessmentReview = assessmentEditor.getByRole('region', { name: 'Draft assessment', exact: true });
  await expect(assessmentReview.getByText('Inspect equipment before operation.', { exact: true })).toBeVisible();
  await expect(assessmentReview.getByText('True', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('assessment-review-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(assessmentReview).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('assessment-review-mobile.png') });
  await assessmentEditor.getByRole('button', { name: 'Save scene' }).click();
  await expect(assessmentEditor).toHaveCount(0);
  const assessmentSaved = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(assessmentSaved.storyboard.scenes[0].assessmentItem.correctResponse).toBe('true');
  expect(assessmentSaved.storyboard.scenes[0].assessmentSettings.maxAttempts).toBe(3);
  expect(assessmentSaved.storyboard.scenes[0].assessmentSettings.scoreWeight).toBe(2);
});
