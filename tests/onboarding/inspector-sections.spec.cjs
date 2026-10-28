const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`scene inspector starts collapsed and expands accessibly in ${theme} at ${width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 1000 });
      let response = await request.post('/api/projects', { data: { title: 'Inspector sections' } });
      expect(response.ok()).toBeTruthy();
      let project = await response.json();
      response = await request.post(`/api/projects/${project.id}/scenes`, {
        headers: { 'If-Match': `"${project.storyboard.revision}"` },
        data: {
          title: 'Inspector question', sceneType: 'question',
          assessmentItem: { type: 'true-false', identifier: 'Q1', prompt: 'Is this expandable?', correctResponse: 'true' },
        },
      });
      expect(response.ok()).toBeTruthy();
      project = await response.json();
      await page.addInitScript(({ id, theme }) => {
        localStorage.setItem('chimera.activeProjectId', id);
        localStorage.setItem('chimera.appearance', theme);
      }, { id: project.id, theme });
      await page.goto('/');
      await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
      await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
      const editor = page.getByRole('dialog').last();
      const inspector = editor.getByRole('complementary', { name: 'Element properties' });
      const section = title => inspector.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${title}$`) }) });
      await expect(inspector.locator('details')).toHaveCount(4);
      await expect(inspector.locator('details[open]')).toHaveCount(0);
      await section('Layers').locator('summary').click();
      await inspector.locator('.visual-layers button').filter({ hasText: 'Inspector question' }).click();
      await section('Layers').locator('summary').click();
      await expect(inspector.locator('details')).toHaveCount(6);
      await expect(inspector.locator('details[open]')).toHaveCount(0);
      for (const title of ['Animation', 'Question', 'Stage', 'Background', 'Layers', 'Layout']) {
        const summary = section(title).locator('summary');
        await expect(summary.locator('svg')).toBeVisible();
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(section(title)).toHaveAttribute('open', '');
      }
      await expect(inspector.getByRole('combobox', { name: 'entrance effect', exact: true })).toBeVisible();
      await expect(inspector.getByRole('spinbutton', { name: 'Question width', exact: true })).toBeVisible();
      await expect(inspector.getByRole('textbox', { name: 'Element text', exact: true })).toBeVisible();
      await inspector.getByRole('spinbutton', { name: 'Stage width', exact: true }).fill('1400');
      await section('Stage').locator('summary').focus();
      await page.keyboard.press('Space');
      await expect(section('Stage')).not.toHaveAttribute('open');
      await expect(inspector.getByRole('spinbutton', { name: 'Stage width', exact: true })).toBeHidden();
      await expect(section('Background')).toHaveAttribute('open', '');
      await section('Stage').locator('summary').click();
      await expect(inspector.getByRole('spinbutton', { name: 'Stage width', exact: true })).toHaveValue('1400');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('.visual-inspector').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`inspector-${theme}-${width}.png`) });
      await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
      await expect(editor).toHaveCount(0);
      const saved = await (await request.get(`/api/projects/${project.id}`)).json();
      expect(saved.storyboard.scenes[0].visualLayout.width).toBe(1400);
      await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
      await expect(page.locator('.visual-inspector details')).toHaveCount(4);
      await expect(page.locator('.visual-inspector details[open]')).toHaveCount(0);
    });
  }
}
