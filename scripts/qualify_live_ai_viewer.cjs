const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const out = path.resolve('workspace/qualification-live-2026-10-14');
  const manifest = JSON.parse(await fs.readFile(path.join(out, 'manifest.json')));
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } });
  const results = { responseSource: 'Captured real provider responses replayed into the editor; no additional provider calls', scenes: [] };
  try {
    await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), manifest.projectId);
    await page.goto('http://127.0.0.1:5173/');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    for (const [name, sceneId, file, sceneTitle] of [
      ['animation', manifest.animationSceneId, 'animation-retest-response.json', 'Packing sequence'],
      ['question', manifest.questionSceneId, 'question-response.json', 'Packing question'],
    ]) {
      const draft = JSON.parse(await fs.readFile(path.join(out, file)));
      const current = await (await page.request.get(`/api/projects/${manifest.projectId}`)).json();
      const currentScene = current.storyboard.scenes.find(scene => scene.id === sceneId);
      await page.getByRole('button', { name: new RegExp(`${currentScene.title} (content|question)`) }).click();
      await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
      const editor = page.getByRole('dialog').last();
      await editor.getByRole('tab', { name: 'Details', exact: true }).click();
      await editor.getByLabel('Scene prompt').fill('Review the captured live qualification draft.');
      const pattern = `**/scenes/${sceneId}/content-draft`;
      await page.route(pattern, route => route.fulfill({ json: draft }));
      await editor.getByRole('button', { name: 'Generate scene + layout draft', exact: true }).click();
      await expect(editor.getByRole('tab', { name: 'Stage', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.screenshot({ path: path.join(out, `${name}-draft-desktop.png`) });
      await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
      await expect(editor).toHaveCount(0);
      await page.unroute(pattern);
      const saved = await (await page.request.get(`/api/projects/${manifest.projectId}`)).json();
      const scene = saved.storyboard.scenes.find(scene => scene.id === sceneId);
      expect(scene.title).toBe(draft.title);
      expect(scene.assessmentItem).toEqual(draft.assessmentItem);
      results.scenes.push({ name, title: scene.title, revision: saved.storyboard.revision, persisted: true });
    }
    await page.getByRole('button', { name: 'Preview course', exact: true }).click();
    const preview = page.getByRole('dialog', { name: /course preview$/ });
    await expect.poll(() => preview.locator('[data-scene-element]').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations()).length)).toBeGreaterThan(0);
    results.animationPlayback = true;
    await preview.getByRole('button', { name: 'Go to scene 2: Packing question', exact: true }).click();
    await expect(preview.locator('.assessment-stage-region')).toHaveCount(1);
    await preview.getByLabel('True', { exact: true }).check();
    await preview.getByRole('button', { name: 'Check answer', exact: true }).click();
    const incorrect = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close feedback', exact: true }) });
    await expect(incorrect).toContainText('Score 0%');
    await incorrect.getByRole('button', { name: 'Close feedback', exact: true }).click();
    await preview.getByLabel('False', { exact: true }).check();
    await preview.getByRole('button', { name: 'Try again', exact: true }).click();
    const correct = page.getByRole('dialog', { name: 'Correct', exact: true });
    await expect(correct).toContainText('Score 100%');
    await correct.getByRole('button', { name: 'Close feedback', exact: true }).click();
    results.questionScoring = { incorrect: 0, correctRetry: 100 };
    await page.screenshot({ path: path.join(out, 'question-preview-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, 'question-preview-mobile.png') });
    await preview.getByRole('button', { name: 'Close course preview', exact: true }).click();
    const exportResponse = await page.request.get(`/api/projects/${manifest.projectId}/scorm-12.zip`);
    expect(exportResponse.ok()).toBeTruthy();
    await fs.writeFile(path.join(out, 'live-ai-scorm12.zip'), await exportResponse.body());
    await fs.writeFile(path.join(out, 'viewer-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
