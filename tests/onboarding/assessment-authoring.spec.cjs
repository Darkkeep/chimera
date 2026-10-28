const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`question authoring fields and ordering controls in ${theme} at ${width}px`, async ({ page, request }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      let response = await request.post('/api/projects', { data: { title: `Question authoring ${theme} ${width}` } });
      expect(response.ok()).toBe(true);
      let project = await response.json();
      response = await request.post(`/api/projects/${project.id}/scenes`, {
        data: { title: 'Authoring check', sceneType: 'assessment' },
        headers: { 'If-Match': `"${project.storyboard.revision}"` },
      });
      expect(response.ok()).toBe(true);
      project = await response.json();
      await page.addInitScript(({ id, theme }) => {
        localStorage.setItem('chimera.activeProjectId', id);
        localStorage.setItem('chimera.appearance', theme);
      }, { id: project.id, theme });
      await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
      await page.goto('/');
      await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
      await page.getByRole('button', { name: 'Create question', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Authoring check', exact: true });

      for (const type of ['drag-drop', 'matching', 'ordering', 'single-choice', 'multiple-response']) {
        await dialog.getByRole('combobox', { name: 'Question type', exact: true }).selectOption(type);
        await dialog.getByRole('textbox', { name: 'Question prompt', exact: true }).fill(`Complete the ${type} question.`);
        const paired = type === 'drag-drop' || type === 'matching';
        const prefixes = type === 'drag-drop' ? ['DRAG', 'TARGET'] : type === 'matching' ? ['LEFT', 'RIGHT'] : ['CHOICE'];
        for (const prefix of prefixes) {
          for (const letter of ['A', 'B']) {
            const input = dialog.getByRole('textbox', { name: `Text for ${prefix}_${letter}`, exact: true });
            await input.scrollIntoViewIfNeeded();
            expect((await input.boundingBox()).width).toBeGreaterThanOrEqual(160);
            await input.fill(`${prefix} answer ${letter}`);
          }
        }
        if (paired) {
          await expect(dialog).toContainText('Answer items currently support text only, not images.');
          const addLabel = type === 'drag-drop' ? 'draggable item' : 'left item';
          await dialog.getByRole('button', { name: `Add ${addLabel}`, exact: true }).click();
          await expect(dialog.getByRole('textbox', { name: `Text for ${prefixes[0]}_C`, exact: true })).toBeVisible();
          await dialog.getByRole('button', { name: `Remove ${prefixes[0]}_C`, exact: true }).click();
          const matches = dialog.locator('.assessment-pair-row select');
          await matches.nth(0).selectOption(`${prefixes[1]}_B`);
          await matches.nth(1).selectOption(`${prefixes[1]}_A`);
        }
        if (type === 'ordering') {
          const earlier = dialog.getByRole('button', { name: 'Move CHOICE_A earlier', exact: true });
          const later = dialog.getByRole('button', { name: 'Move CHOICE_A later', exact: true });
          await expect(earlier).toBeDisabled();
          await expect(later).toBeEnabled();
          await expect(later).toHaveCSS('width', '32px');
          await expect(later.locator('svg')).toHaveAttribute('width', '18');
          const contrast = await later.evaluate(button => {
            const luminance = color => {
              const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                const s = value / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const style = getComputedStyle(button);
            const fg = luminance(style.color);
            const bg = luminance(style.backgroundColor);
            return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          });
          expect(contrast).toBeGreaterThanOrEqual(4.5);
          await later.click();
          await expect(dialog.locator('.assessment-choice-row').first()).toContainText('CHOICE_B');
          await expect(earlier).toBeEnabled();
          await expect(later).toBeDisabled();
        }
        if (type === 'multiple-response') await dialog.getByRole('checkbox', { name: 'Mark CHOICE_B as correct', exact: true }).check();
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await dialog.locator('.assessment-editor-body').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        const violations = (await new AxeBuilder({ page }).include('.assessment-editor-dialog').withRules(['color-contrast']).analyze()).violations;
        expect(violations).toEqual([]);
        await dialog.getByRole('button', { name: 'Save question', exact: true }).click();
        await expect(dialog.getByText(/^Saved to/)).toBeVisible();
        const saved = await (await request.get(`/api/projects/${project.id}`)).json();
        const item = saved.storyboard.scenes[0].assessmentItem;
        expect(item.type).toBe(type);
        if (paired) expect(item.correctMatches).toEqual([
          { sourceIdentifier: `${prefixes[0]}_A`, targetIdentifier: `${prefixes[1]}_B` },
          { sourceIdentifier: `${prefixes[0]}_B`, targetIdentifier: `${prefixes[1]}_A` },
        ]);
        if (type === 'ordering') expect(item.correctOrder).toEqual(['CHOICE_B', 'CHOICE_A']);
        await dialog.getByRole('button', { name: 'Close question editor', exact: true }).click();
        await page.getByRole('button', { name: 'Edit question', exact: true }).click();
        await expect(dialog.getByRole('textbox', { name: `Text for ${prefixes[0]}_A`, exact: true })).toHaveValue(`${prefixes[0]} answer A`);
        await page.screenshot({ path: test.info().outputPath(`${type}.png`) });
      }
    });
  }
}
