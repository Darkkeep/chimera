const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
  test(`production theme reaches authoring dialogs in ${theme}`, async ({ page, request }) => {
    let response = await request.post('/api/projects', { data: { title: `Production UI ${theme}` } });
    let project = await response.json();
    response = await request.post(`/api/projects/${project.id}/scenes`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { title: 'Theme coverage scene' },
    });
    expect(response.ok()).toBeTruthy();
    await page.addInitScript(({ id, theme }) => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', theme);
    }, { id: project.id, theme });
    await page.route('**/api/projects/*/pythia-status', route => route.fulfill({ json: {
      health: { status: 'ok' }, capabilities: { capabilities: ['storyboard.analyze'] },
      supportsStoryboardAnalyze: true, supportsStoryboardTransform: false, supportsAssessmentDesign: false,
    } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    const workflow = page.getByRole('navigation', { name: 'Authoring workflow' });
    for (const [open, close, selector] of [
      ['Analyze with Pythia', 'Close Pythia analysis', '.pythia-analysis-dialog'],
      ['Export', 'Close export', '.export-dialog'],
    ]) {
      if (open === 'Analyze with Pythia') await page.getByRole('button', { name: 'Pythia', exact: true }).click();
      await page.getByRole('button', { name: open, exact: true }).click();
      await expect(page.locator(selector)).toBeVisible();
      const violations = (await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.locator(selector).evaluate(e => e.scrollWidth <= e.clientWidth)).toBeTruthy();
      await page.screenshot({ path: test.info().outputPath(`${theme}-${open.replaceAll(' ', '-')}.png`) });
      await page.getByRole('button', { name: close, exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await workflow.getByRole('button', { name: /Verify/ }).click();
    await expect(page.locator('.validation-dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.validation-dialog').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Close validation report' }).click();
    const chooser = page.waitForEvent('filechooser');
    await workflow.getByRole('button', { name: /Source/ }).click();
    expect(await chooser).toBeTruthy();
  });
}
