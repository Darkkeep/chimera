const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
for (const width of [1440, 390]) {
  test(`assessment management persists ordered questions in ${theme} at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    const response = await page.request.post('/api/projects', { data: { title: `Assessment groups ${width}` } });
    expect(response.ok()).toBeTruthy();
    let project = await response.json();
    const id = project.id;
    const questions = [];
    for (const title of ['First question', 'Second question', 'Outside question']) {
      const created = await page.request.post(`/api/projects/${id}/scenes`, {
        headers: { 'If-Match': `"${project.storyboard.revision}"` },
        data: { title, sceneType: 'question', assessmentItem: { type: 'true-false', identifier: `Q${questions.length}`, prompt: `${title}?`, correctResponse: 'true' } },
      });
      expect(created.ok()).toBeTruthy();
      project = await created.json();
      questions.push(project.storyboard.scenes.at(-1).id);
    }
    await page.addInitScript(({ id, theme }) => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', theme);
    }, { id, theme });
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Assessments', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Assessments', exact: true });
    const checkContrast = async () => {
      expect((await new AxeBuilder({ page }).include('.assessments-editor').withRules(['color-contrast']).analyze()).violations).toEqual([]);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    };
    await checkContrast();
    await dialog.getByRole('button', { name: 'Create assessment', exact: true }).click();
    await dialog.getByLabel('Assessment title', { exact: true }).fill('Knowledge check');
    for (const row of await dialog.locator('.assessments-question').all()) {
      expect((await row.locator('input').boundingBox()).width).toBe(18);
      expect((await row.locator('span').boundingBox()).width).toBeGreaterThanOrEqual(160);
      expect((await row.boundingBox()).height).toBeLessThan(100);
    }
    await checkContrast();
    await dialog.getByRole('checkbox', { name: /First question/ }).check();
    await dialog.getByRole('checkbox', { name: /Second question/ }).check();
    await dialog.getByRole('button', { name: 'Move Second question earlier', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Edit Knowledge check', exact: true })).toBeVisible();
    await checkContrast();
    project = await (await page.request.get(`/api/projects/${id}`)).json();
    expect(project.storyboard.assessments[0].questionSceneIds).toEqual([questions[1], questions[0]]);
    const downloadEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download QTI test for Knowledge check', exact: true }).click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toContain('assessment.qti.zip');
    await dialog.getByRole('button', { name: 'Edit Knowledge check', exact: true }).click();
    await dialog.getByLabel('Assessment title', { exact: true }).fill('Edited check');
    await dialog.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Edit Edited check', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('assessment-groups.png') });
    await dialog.getByRole('button', { name: 'Close assessments', exact: true }).click();
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Preview course', exact: true }).click();
    const preview = page.getByRole('dialog', { name: /course preview$/ });
    const summary = preview.locator('.course-preview-assessments');
    await expect(summary).toContainText('Edited check');
    await expect(summary).toContainText('0/2 answered');
    await preview.getByLabel('True', { exact: true }).check();
    await preview.getByRole('button', { name: 'Check answer', exact: true }).click();
    await page.getByRole('dialog', { name: 'Correct', exact: true }).getByRole('button', { name: 'Close feedback', exact: true }).click();
    await expect(summary).toContainText('1/2 answered');
    await expect(summary).toContainText('Score 50%');
    await preview.getByRole('button', { name: 'Close course preview', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Edit Edited check', exact: true })).toBeVisible();
    page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', { name: 'Delete Edited check', exact: true }).click();
    await expect(dialog.getByText('No assessments yet.', { exact: true })).toBeVisible();
    project = await (await page.request.get(`/api/projects/${id}`)).json();
    expect(project.storyboard.assessments).toEqual([]);
    expect(project.storyboard.scenes.map(scene => scene.id)).toEqual(questions);
  });
}
}
