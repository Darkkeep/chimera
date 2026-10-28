const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
for (const width of [1440, 390]) {
  test(`review templates, import questions, and edit metadata in ${theme} at ${width}px`, async ({ page, request }) => {
    test.setTimeout(90000);
    const format = width === 1440 ? 'csv' : 'xlsx';
    const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await page.setViewportSize({ width, height: 900 });
    const response = await request.post('/api/projects', { data: { title: `Question import ${width}` } });
    expect(response.ok()).toBe(true);
    const project = await response.json();
    const base = `/api/projects/${project.id}`;
    await page.addInitScript(({ id, theme }) => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', theme);
    }, { id: project.id, theme });
    await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Assessments', exact: true });
    await dialog.getByRole('button', { name: 'Create assessment', exact: true }).click();
    await dialog.getByLabel('Assessment title', { exact: true }).fill('Imported assessment');
    await dialog.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await dialog.getByRole('button', { name: 'Import questions', exact: true }).click();
    const template = await request.get(base + `/question-import/template.${format}`);
    expect(template.ok()).toBe(true);
    await dialog.getByLabel('Question file', { exact: true }).setInputFiles({ name: `questions.${format}`, mimeType, buffer: await template.body() });
    await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(dialog.getByText('7 selected of 7 reviewed questions. Nothing has been added yet.', { exact: true })).toBeVisible();
    for (const row of await dialog.locator('.question-import-select').all()) {
      expect((await row.locator('input').boundingBox()).width).toBe(18);
      expect((await row.locator('span').boundingBox()).width).toBeGreaterThan(100);
    }
    expect((await new AxeBuilder({ page }).include('.assessments-editor').withRules(['color-contrast']).analyze()).violations).toEqual([]);
    let saved = await (await request.get(base)).json();
    expect(saved.storyboard.scenes).toEqual([]);
    await dialog.getByRole('combobox', { name: 'Add imported questions to', exact: true }).selectOption({ label: 'Imported assessment' });
    const acknowledgement = dialog.getByRole('checkbox', { name: 'I have reviewed the warnings for the selected questions.', exact: true });
    if (await acknowledgement.count()) await acknowledgement.check();
    await dialog.getByRole('button', { name: 'Import 7 selected questions', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Question bank (7)', exact: true })).toBeVisible();
    saved = await (await request.get(base)).json();
    expect(saved.storyboard.assessments[0].questionSceneIds).toHaveLength(7);
    expect(new Set(saved.storyboard.scenes.map(scene => scene.assessmentItem.type)).size).toBe(7);

    for (const exportFormat of ['csv', 'xlsx']) {
      const responseEvent = page.waitForResponse(response => response.url().endsWith(`${base}/questions.${exportFormat}`));
      const downloadEvent = page.waitForEvent('download');
      await dialog.getByRole('button', { name: `Export questions ${exportFormat.toUpperCase()}`, exact: true }).click();
      const exported = await responseEvent;
      expect(exported.status()).toBe(200);
      expect(exported.headers()['content-type']).toContain(exportFormat === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const download = await downloadEvent;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toBe(`${project.id}-questions.${exportFormat}`);
      const content = await exported.body();
      if (exportFormat === 'csv') expect(content.toString('utf8')).toContain('identifier,type,title,prompt');
      else expect(content.subarray(0, 2).toString()).toBe('PK');
    }

    await dialog.getByRole('button', { name: 'Import questions', exact: true }).click();
    await dialog.getByLabel('Question file', { exact: true }).setInputFiles({ name: `questions.${format}`, mimeType, buffer: await template.body() });
    await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(dialog.getByText('0 selected of 7 reviewed questions. Nothing has been added yet.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Import 0 selected questions', exact: true })).toBeDisabled();
    await expect(dialog.getByText(/already exists in this project/).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit question and metadata', exact: true }).first().click();
    const editor = page.getByRole('dialog').last();
    const tags = editor.getByRole('combobox', { name: 'Search or create a tag', exact: true });
    await expect(tags).not.toBeVisible();
    await editor.getByText('Tags and learning-objective references', { exact: true }).click();
    await expect(tags).toBeVisible();
    await expect(editor.locator('.question-metadata > details').last()).not.toHaveAttribute('open', '');
    await tags.fill('safety');
    await tags.press('Enter');
    await tags.fill('practice');
    await editor.getByRole('option', { name: 'Create tag "practice"', exact: true }).click();
    await editor.getByText('Question metadata', { exact: true }).click();
    await editor.getByLabel('Question title', { exact: true }).fill('Edited metadata title');
    await editor.getByLabel('Stable question identifier', { exact: true }).fill('EDITED_QUESTION');
    await editor.getByLabel('Description', { exact: true }).fill('A reviewable assessment question.');
    const objectives = editor.getByRole('combobox', { name: 'Search or create a learning-objective reference', exact: true });
    await objectives.fill('OBJ-1');
    await objectives.press('Enter');
    await objectives.fill('OBJ-2');
    await objectives.press('Enter');
    await editor.getByLabel('Author', { exact: true }).fill('Training team');
    await editor.getByLabel('Source', { exact: true }).fill('Local policy');
    await editor.getByLabel('Language tag', { exact: true }).fill('en-US');
    await editor.getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('medium');
    await editor.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(editor.getByText(/^Saved to/)).toBeVisible();
    saved = await (await request.get(base)).json();
    const item = saved.storyboard.scenes[0].assessmentItem;
    expect(item.identifier).toBe('EDITED_QUESTION');
    expect(item.metadata).toEqual({
      title: 'Edited metadata title', description: 'A reviewable assessment question.',
      tags: ['safety', 'practice'], learningObjectiveRefs: ['OBJ-1', 'OBJ-2'],
      author: 'Training team', source: 'Local policy', language: 'en-US', difficulty: 'medium',
    });
    await editor.getByRole('button', { name: 'Close question editor', exact: true }).click();
    await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit question and metadata', exact: true }).first().click();
    await editor.getByText('Tags and learning-objective references', { exact: true }).click();
    await expect(tags).toBeVisible();
    await expect(editor.getByRole('list', { name: 'Selected tags', exact: true })).toContainText('safety');
    await expect(editor.getByRole('list', { name: 'Selected tags', exact: true })).toContainText('practice');
    await editor.getByRole('button', { name: 'Remove tag safety', exact: true }).click();
    await tags.fill('refresher');
    await tags.press('Enter');
    await editor.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(editor.getByText(/^Saved to/)).toBeVisible();
    saved = await (await request.get(base)).json();
    expect(saved.storyboard.scenes[0].assessmentItem.metadata.tags).toEqual(['practice', 'refresher']);
    await editor.getByText('Question metadata', { exact: true }).click();
    await expect(editor.getByLabel('Question title', { exact: true })).toHaveValue('Edited metadata title');
    await expect(editor.getByRole('list', { name: 'Selected tags', exact: true })).toContainText('refresher');
    await page.screenshot({ path: test.info().outputPath('question-metadata.png') });
    await editor.getByRole('button', { name: 'Close question editor', exact: true }).click();
    await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    await dialog.getByLabel('New question title', { exact: true }).fill('Direct authoring');
    await dialog.getByRole('button', { name: 'Add question', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Direct authoring', exact: true })).toBeVisible();
  });
}
}
