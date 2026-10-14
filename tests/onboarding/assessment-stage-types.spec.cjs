const { test, expect } = require('@playwright/test');

test('all assessment types answer inside the Stage without saved layouts', async ({ page, request }) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Assessment Stage types' } })).json();
  const choices = [{ identifier: 'first', text: 'Inspect equipment' }, { identifier: 'second', text: 'Start operation' }];
  const items = [
    { type: 'single-choice', choices, correctResponse: 'first' },
    { type: 'multiple-response', choices, correctResponses: ['first', 'second'] },
    { type: 'true-false', correctResponse: 'true' },
    { type: 'ordering', choices, correctOrder: ['first', 'second'] },
    { type: 'matching', leftItems: [{ identifier: 'source', text: 'Inspection' }, { identifier: 'source2', text: 'Operation' }], rightItems: [{ identifier: 'target', text: 'Before use' }, { identifier: 'target2', text: 'After inspection' }], correctMatches: [{ sourceIdentifier: 'source', targetIdentifier: 'target' }, { sourceIdentifier: 'source2', targetIdentifier: 'target2' }] },
    { type: 'drag-drop', draggables: choices, targets: [{ identifier: 'target', text: 'Before use' }], correctMatches: [{ sourceIdentifier: 'first', targetIdentifier: 'target' }] },
    { type: 'short-answer', acceptedAnswers: ['Inspect'] },
  ];
  for (const [index, item] of items.entries()) {
    const created = await request.post(`/api/projects/${project.id}/scenes`, {
      data: { title: item.type, sceneType: 'assessment', assessmentItem: { ...item, identifier: `check-${index}`, prompt: `${item.type} question` } },
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(created.ok(), await created.text()).toBe(true);
    project = await created.json();
    const cleared = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[index].id}`, {
      data: { visualLayout: null }, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(cleared.ok()).toBe(true);
    project = await cleared.json();
  }
  const remediation = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
    data: { assessmentSettings: { remediationSceneId: project.storyboard.scenes[1].id } },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  });
  expect(remediation.ok()).toBe(true);
  project = await remediation.json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Assessment Stage types course preview', exact: true });
  for (const [index, item] of items.entries()) {
    const question = preview.locator('.visual-stage-frame .assessment-stage-region');
    await expect(question).toHaveCount(1);
    await expect(question.getByRole('heading', { name: `${item.type} question`, exact: true })).toBeVisible();
    if (item.type === 'single-choice') {
      await question.getByLabel('Start operation', { exact: true }).check();
      await question.getByRole('button', { name: 'Check answer', exact: true }).click();
      const wrongFeedback = page.getByRole('dialog', { name: 'Not correct', exact: true });
      await expect(wrongFeedback).toContainText('Score 0%');
      await expect(wrongFeedback).toContainText('1/2 attempts');
      await wrongFeedback.getByRole('button', { name: 'Review lesson', exact: true }).click();
      await expect(wrongFeedback).toHaveCount(0);
      await expect(preview.locator('.assessment-stage-region')).toContainText('multiple-response question');
      await preview.getByRole('button', { name: 'Return to question', exact: true }).click();
      await expect(question).toContainText('single-choice question');
      await question.getByLabel('Inspect equipment', { exact: true }).check();
    }
    if (item.type === 'multiple-response') {
      await question.getByLabel('Inspect equipment', { exact: true }).check();
      await question.getByLabel('Start operation', { exact: true }).check();
    }
    if (item.type === 'true-false') await question.getByLabel('True', { exact: true }).check();
    if (item.type === 'ordering') {
      await question.getByRole('button', { name: 'Move Start operation earlier', exact: true }).click();
      await question.getByRole('button', { name: 'Move Start operation later', exact: true }).click();
    }
    if (item.type === 'matching') {
      await question.getByRole('combobox', { name: 'Match for Inspection', exact: true }).selectOption('target');
      await question.getByRole('combobox', { name: 'Match for Operation', exact: true }).selectOption('target2');
    }
    if (item.type === 'drag-drop') await question.getByRole('combobox', { name: 'Match for Inspect equipment', exact: true }).selectOption('target');
    if (item.type === 'short-answer') await question.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Inspect');
    await question.getByRole('button', { name: item.type === 'single-choice' ? 'Try again' : 'Check answer', exact: true }).click();
    const feedback = page.getByRole('dialog', { name: 'Correct', exact: true });
    await expect(feedback).toContainText('Score 100%');
    await feedback.getByRole('button', { name: 'Close feedback', exact: true }).click();
    if (index < items.length - 1) await preview.getByRole('button', { name: 'Next', exact: true }).click();
  }
});