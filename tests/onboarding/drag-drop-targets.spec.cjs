const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
for (const width of [1440, 390]) {
  test(`drag-and-drop targets remain reachable in ${theme} at ${width}px`, async ({ page, request }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    let response = await request.post('/api/projects', { data: { title: 'Visible drop targets' } });
    expect(response.ok()).toBe(true);
    let project = await response.json();
    const draggables = ['A', 'B', 'C'].map(text => ({ identifier: `drag-${text}`, text }));
    const targets = ['A', 'B', 'C'].map(text => ({ identifier: `target-${text}`, text: `Target ${text}` }));
    response = await request.post(`/api/projects/${project.id}/scenes`, {
      data: {
        title: 'Drag the letters', sceneType: 'assessment',
        assessmentItem: {
          identifier: 'letters', type: 'drag-drop', prompt: 'Drag each letter to its target.',
          draggables, targets,
          correctMatches: draggables.map((source, index) => ({ sourceIdentifier: source.identifier, targetIdentifier: targets[index].identifier })),
        },
      },
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
    await page.getByRole('button', { name: 'Preview course', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Visible drop targets course preview', exact: true });
    const frame = preview.locator('.assessment-stage-frame');
    const assertInsideStage = async locator => {
      const frameBox = await frame.boundingBox();
      const box = await locator.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(frameBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(frameBox.y + frameBox.height);
    };
    const dropTargets = preview.locator('.course-preview-drop-target');
    await expect(dropTargets).toHaveCount(3);
    const firstBox = await dropTargets.nth(0).boundingBox();
    const secondBox = await dropTargets.nth(1).boundingBox();
    expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height);
    for (const target of await dropTargets.all()) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
      await assertInsideStage(target);
    }
    const check = preview.getByRole('button', { name: 'Check answer', exact: true });
    await assertInsideStage(check);
    await expect(frame).toHaveCSS('aspect-ratio', 'auto');
    expect((await new AxeBuilder({ page }).include('.course-preview-drag-question').withRules(['color-contrast']).analyze()).violations).toEqual([]);
    const bank = preview.getByRole('group', { name: 'Draggable answers', exact: true });
    const chips = bank.locator('.course-preview-drag-chip');
    await bank.getByRole('button', { name: 'A', exact: true }).dragTo(dropTargets.nth(1));
    await expect(preview.getByRole('status')).toContainText('It has returned home');
    await expect(bank.getByRole('button', { name: 'A', exact: true })).toBeVisible();
    await expect(dropTargets.nth(1).locator('button')).toHaveText('Drop a tile here');
    await expect(check).toBeDisabled();
    for (let index = 0; index < draggables.length; index += 1) {
      const tile = bank.getByRole('button', { name: draggables[index].text, exact: true });
      if (index === draggables.length - 1) {
        await tile.focus();
        await page.keyboard.press('Enter');
        const target = preview.getByRole('button', { name: `Place selected tile beside ${targets[index].text}`, exact: true });
        await target.focus();
        await page.keyboard.press('Enter');
      } else {
        await tile.dragTo(dropTargets.nth(index));
      }
      await expect(dropTargets.nth(index).locator('button')).toHaveText(draggables[index].text);
      await expect(bank.getByRole('button', { name: draggables[index].text, exact: true })).toHaveCount(0);
    }
    await expect(chips).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('visible-drop-targets.png') });
    await check.click();
    const feedback = page.getByRole('dialog', { name: 'Correct', exact: true });
    await expect(feedback).toContainText('Score 100%');
    await expect(feedback).toContainText('1/2 attempts');
  });
}
}
