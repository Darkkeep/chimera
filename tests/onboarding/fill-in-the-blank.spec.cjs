const { test, expect } = require('@playwright/test');

for (const width of [1440, 390]) {
  test(`legacy short-answer questions author as fill-in-the-blank at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    let project = await (await request.post('/api/projects', { data: { title: 'Fill-in-the-blank authoring' } })).json();
    const created = await request.post(`/api/projects/${project.id}/scenes`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
      data: { title: 'Safety blank', sceneType: 'question', assessmentItem: {
        type: 'short-answer', identifier: 'LEGACY_BLANK', prompt: 'Before use, always',
        acceptedAnswers: ['Inspect'], caseSensitive: true,
        metadata: { title: 'Safety check', tags: ['safety'] },
      } },
    });
    expect(created.ok()).toBe(true);
    project = await created.json();
    await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
    await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    const bank = page.getByRole('dialog', { name: 'Assessments', exact: true });
    await expect(bank).toContainText('LEGACY_BLANK · Fill-in-the-blank');
    await bank.getByRole('button', { name: 'Edit question and metadata', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Safety blank', exact: true });
    await expect(editor.getByRole('combobox', { name: 'Question type', exact: true }).locator('option:checked')).toHaveText('Fill-in-the-blank');
    await expect(editor.getByText('Accepted answers for the blank', { exact: true })).toBeVisible();
    const answers = editor.getByRole('textbox', { name: 'Enter one accepted answer per line', exact: true });
    await expect(answers).toHaveValue('Inspect');
    await expect(editor.getByRole('checkbox', { name: 'Match letter case', exact: true })).toBeChecked();
    await answers.fill('Inspect\nCheck');
    await editor.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(editor.getByText(/^Saved to/)).toBeVisible();
    const saved = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(saved.storyboard.scenes[0].assessmentItem).toMatchObject({
      type: 'short-answer', identifier: 'LEGACY_BLANK', acceptedAnswers: ['Inspect', 'Check'],
      caseSensitive: true, metadata: { title: 'Safety check', tags: ['safety'] },
    });
    const xml = await request.get(`/api/projects/${project.id}/scenes/${saved.storyboard.scenes[0].id}/assessment.qti.xml`);
    expect(xml.ok()).toBe(true);
    const review = await request.post(`/api/projects/${project.id}/question-import/preview`, {
      multipart: { file: { name: 'blank.xml', mimeType: 'application/xml', buffer: await xml.body() } },
    });
    expect(review.ok()).toBe(true);
    const row = (await review.json()).questions[0];
    expect(row.item).toMatchObject({ type: 'short-answer', acceptedAnswers: ['Inspect', 'Check'], caseSensitive: true });
    expect(row.errors).toEqual([expect.stringContaining('already exists')]);
  });
}
