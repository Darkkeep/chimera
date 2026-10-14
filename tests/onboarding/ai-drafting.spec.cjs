const { test, expect } = require('@playwright/test');

test('course prompt uses uploaded references and persists only the reviewed draft', async ({ page }) => {
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
  await sceneEditor.getByLabel('Scene prompt').fill('Make this scene interactive and concise.');
  await sceneEditor.getByRole('button', { name: 'Generate scene + layout draft' }).click();
  await expect(sceneEditor.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true');
  await expect(sceneEditor.getByText('Generated scene layout · not saved')).toBeVisible();
  expect(sceneGenerationRequest.prompt).toContain('interactive');
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
});