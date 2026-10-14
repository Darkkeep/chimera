const { test, expect } = require('@playwright/test');

test('measured text fitting preserves layout data and reports unresolved locked or crowded content', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { fitLayoutText } = await import('/src/text-fit.ts');
    const text = { id: 'paragraph', kind: 'text', x: 72, y: 180, width: 1136, height: 60, rotation: 0,
      text: 'Collect two slices of bread, peanut butter, jelly or jam of your choice, a butter knife, and a plate.',
      fontSize: 28, fontFamily: 'sans-serif', bold: false, italic: false, align: 'left', locked: false,
      animations: { entrance: { effect: 'bounce', durationMs: 600, delayMs: 150 } } };
    const layout = { enabled: true, width: 1280, height: 720, elements: [text] };
    const before = await fitLayoutText(layout);
    const fitted = await fitLayoutText(layout, true);
    const after = await fitLayoutText(fitted.layout);
    const locked = await fitLayoutText({ ...layout, elements: [{ ...text, locked: true }] }, true);
    const crowded = await fitLayoutText({ ...layout, elements: [{ ...text, width: 30, height: 20, fontSize: 18, text: 'Long content '.repeat(100) },
      { id: 'image', kind: 'image', x: 72, y: 208, width: 100, height: 400 }] }, true);
    return { before: before.issues, after: after.issues, fitted: fitted.layout.elements[0], original: text,
      locked: locked.issues, lockedElement: locked.layout.elements[0], crowded: crowded.issues, crowdedElement: crowded.layout.elements[0] };
  });
  expect(result.before).toHaveLength(1);
  expect(result.after).toEqual([]);
  expect(result.fitted.height).toBeGreaterThan(60);
  expect(result.original.height).toBe(60);
  expect(result.fitted.text).toBe(result.original.text);
  expect(result.fitted.animations).toEqual(result.original.animations);
  expect(result.fitted.x).toBe(result.original.x);
  expect(result.fitted.y).toBe(result.original.y);
  expect(result.locked).toHaveLength(1);
  expect(result.lockedElement).toEqual({ ...result.original, locked: true });
  expect(result.crowded).toHaveLength(1);
  expect(result.crowdedElement.height).toBeLessThanOrEqual(20);
  expect(result.crowdedElement.fontSize).toBe(18);
});

test('AI draft text is fitted before review and unresolved edits cannot be saved', async ({ page, request }) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Text fit course' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Welcome' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  const paragraph = 'Collect two slices of bread, peanut butter, jelly or jam of your choice, a butter knife, and a plate.';
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.route('**/content-draft', route => route.fulfill({ json: {
    title: 'Gather supplies', sceneType: 'content', extractedText: [paragraph], actionDescription: '', narration: '', notes: '', required: true,
    visualLayout: { enabled: true, width: 1280, height: 720, backgroundColor: '#17324d', elements: [
      { id: 'title', kind: 'text', x: 72, y: 64, width: 1100, height: 100, rotation: 0, text: 'Gather supplies', fontSize: 40, fontFamily: 'sans-serif', color: '#ffffff' },
      { id: 'body', kind: 'text', x: 72, y: 180, width: 1136, height: 60, rotation: 0, text: paragraph, fontSize: 28, fontFamily: 'sans-serif', color: '#ffffff', animations: { entrance: { effect: 'bounce', durationMs: 600, delayMs: 150 }, presentation: { effect: 'none', durationMs: 800, delayMs: 0, iterations: 1 }, exit: { effect: 'none', durationMs: 400, delayMs: 3000 } } },
    ], warnings: [] },
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog').last();
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByLabel('Scene prompt', { exact: true }).fill('Draft a supply checklist.');
  await editor.getByRole('button', { name: 'Generate scene + layout draft' }).click();
  await expect(editor.getByRole('tab', { name: 'Stage', exact: true })).toHaveAttribute('aria-selected', 'true');
  const body = editor.locator('.visual-text').filter({ hasText: paragraph });
  expect(await body.evaluate(node => node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth)).toBe(true);
  const before = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(before.storyboard.scenes[0].title).toBe('Welcome');
  await editor.getByRole('button', { name: `${paragraph.slice(0, 50)} element`, exact: true }).click();
  await editor.getByRole('spinbutton', { name: 'Element height', exact: true }).fill('20');
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Text does not fit');
  expect((await (await request.get(`/api/projects/${project.id}`)).json()).storyboard.revision).toBe(before.storyboard.revision);
  await editor.getByRole('button', { name: 'Fit text', exact: true }).click();
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].visualLayout.elements[1].height).toBeGreaterThan(60);
  expect(saved.storyboard.scenes[0].visualLayout.elements[1].animations.entrance.effect).toBe('bounce');
});