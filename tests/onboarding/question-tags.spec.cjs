const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`search and reuse project tags in ${theme} at ${width}px`, async ({ page, request }) => {
      let project = await (await request.post('/api/projects', { data: { title: 'Searchable tags' } })).json();
      for (const [index, tags] of [['Safety', 'equipment', 'Fire safety'], []].entries()) {
        const response = await request.post(`/api/projects/${project.id}/scenes`, {
          headers: { 'If-Match': `"${project.storyboard.revision}"` },
          data: { title: `Question ${index + 1}`, sceneType: 'question', assessmentItem: {
            type: 'true-false', identifier: `TAG_${index}`, prompt: 'Ready?', correctResponse: 'true', metadata: { tags, learningObjectiveRefs: tags },
          } },
        });
        expect(response.ok()).toBe(true);
        project = await response.json();
      }
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(({ id, theme }) => {
        localStorage.setItem('chimera.activeProjectId', id);
        localStorage.setItem('chimera.appearance', theme);
      }, { id: project.id, theme });
      await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
      await page.goto('/');
      const bank = page.getByRole('dialog', { name: 'Assessments', exact: true });
      async function openEditor() {
        await page.getByRole('button', { name: 'Assessments', exact: true }).click();
        await bank.getByRole('button', { name: 'Edit question and metadata', exact: true }).nth(1).click();
        const editor = page.getByRole('dialog', { name: 'Question 2', exact: true });
        await expect(editor.locator('.question-references')).not.toHaveAttribute('open', '');
        await expect(editor.locator('.assessment-editor-body > :last-child')).toHaveClass('question-metadata');
        await editor.getByText('Tags and learning-objective references', { exact: true }).click();
      }
      await openEditor();
      const editor = page.getByRole('dialog', { name: 'Question 2', exact: true });
      for (const [singular, label] of [['tag', 'Tags'], ['learning-objective reference', 'Learning-objective references']]) {
      const search = editor.getByRole('combobox', { name: `Search or create a ${singular}`, exact: true });
      await expect(search).toHaveAttribute('aria-expanded', 'false');
      await expect(editor.getByRole('listbox')).toHaveCount(0);
      await editor.getByRole('button', { name: `Toggle ${label.toLowerCase()} dropdown`, exact: true }).click();
      await expect(editor.getByRole('option', { name: 'equipment', exact: true })).toBeVisible();
      await search.fill('SAF');
      await expect(editor.getByRole('option', { name: 'Safety', exact: true })).toBeVisible();
      await expect(editor.getByRole('option', { name: 'Fire safety', exact: true })).toBeVisible();
      await expect(editor.getByRole('option', { name: 'equipment', exact: true })).toHaveCount(0);
      await editor.getByRole('option', { name: 'Safety', exact: true }).click();
      await expect(search).toHaveAttribute('aria-expanded', 'false');
      await expect(search).toHaveValue('');
      await search.fill('safety');
      await expect(editor.getByRole('option', { name: `Create ${singular} "safety"`, exact: true })).toHaveCount(0);
      await search.press('Enter');
      await expect(editor.getByRole('button', { name: `Remove ${singular} Safety`, exact: true })).toHaveCount(1);
      await search.fill(' New hire ');
      await editor.getByRole('option', { name: `Create ${singular} "New hire"`, exact: true }).click();
      await editor.getByRole('button', { name: `Remove ${singular} Safety`, exact: true }).click();
      await search.fill('safety');
      await search.press('ArrowDown');
      await search.press('ArrowDown');
      await search.press('Enter');
      await expect(editor.getByRole('list', { name: `Selected ${label.toLowerCase()}`, exact: true })).toContainText('New hire');
      await search.focus();
      await search.press('ArrowDown');
      await search.press('Escape');
      await expect(search).toHaveAttribute('aria-expanded', 'false');
      await expect(editor).toBeVisible();
      }
      expect((await new AxeBuilder({ page }).include('.question-reference-picker').withRules(['color-contrast']).analyze()).violations).toEqual([]);
      expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await editor.getByRole('button', { name: 'Save question', exact: true }).click();
      await expect(editor.getByText(/^Saved to/)).toBeVisible();
      const saved = await (await request.get(`/api/projects/${project.id}`)).json();
      expect(saved.storyboard.scenes[1].assessmentItem.metadata.tags).toEqual(['New hire', 'Safety']);
      expect(saved.storyboard.scenes[1].assessmentItem.metadata.learningObjectiveRefs).toEqual(['New hire', 'Safety']);
      expect(saved.storyboard.scenes[0].assessmentItem.metadata.tags).toEqual(['Safety', 'equipment', 'Fire safety']);
      await editor.getByRole('button', { name: 'Close question editor', exact: true }).click();
      await openEditor();
      await expect(editor.getByRole('button', { name: 'Remove tag New hire', exact: true })).toBeVisible();
      await expect(editor.getByRole('button', { name: 'Remove tag Safety', exact: true })).toBeVisible();
      await expect(editor.getByRole('button', { name: 'Remove learning-objective reference Safety', exact: true })).toBeVisible();
      const search = editor.getByRole('combobox', { name: 'Search or create a tag', exact: true });
      await search.fill('equipment');
      await search.press('Enter');
      await editor.getByRole('button', { name: 'Close question editor', exact: true }).click();
      await openEditor();
      await expect(editor.getByRole('button', { name: 'Remove tag equipment', exact: true })).toHaveCount(0);
    });
  }
}
