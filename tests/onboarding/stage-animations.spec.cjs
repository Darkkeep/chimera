const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('animation authoring persists phases and Preview plays the scene timeline accessibly', async ({ page, request }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let project = await (await request.post('/api/projects', { data: { title: 'Animated course' } })).json();
  const created = await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Moving text', extractedText: ['First instruction', 'Second instruction'] },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  });
  expect(created.ok()).toBe(true);
  project = await created.json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog').last();
  await editor.getByRole('button', { name: 'Stagger text entrances', exact: true }).click();
  await editor.getByRole('button', { name: 'First instruction element', exact: true }).click();
  await expect(editor.getByRole('combobox', { name: 'entrance effect', exact: true })).toHaveValue('bounce');
  await expect(editor.getByRole('spinbutton', { name: 'entrance delay (ms)', exact: true })).toHaveValue('150');
  await editor.getByRole('combobox', { name: 'presentation effect', exact: true }).selectOption('sway');
  await editor.getByRole('spinbutton', { name: 'presentation duration (ms)', exact: true }).fill('500');
  await editor.getByRole('spinbutton', { name: 'Presentation repeats', exact: true }).fill('2');
  await editor.getByRole('combobox', { name: 'exit effect', exact: true }).selectOption('fade');
  await editor.getByRole('spinbutton', { name: 'exit delay (ms)', exact: true }).fill('3000');
  const beforeSave = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(beforeSave.storyboard.scenes[0].visualLayout.elements.every(element => !element.animations)).toBe(true);
  await editor.getByRole('button', { name: 'Preview animations', exact: true }).click();
  const moving = editor.locator('[data-scene-element]').filter({ hasText: 'First instruction' });
  await expect.poll(() => moving.evaluate(node => node.getAnimations().length)).toBe(3);
  const effects = await moving.evaluate(node => {
    const animations = node.getAnimations();
    animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
    const before = getComputedStyle(node).opacity;
    animations.forEach(animation => { animation.currentTime = 1000; });
    const during = getComputedStyle(node).rotate;
    animations.forEach(animation => { animation.currentTime = 4000; });
    return { before, during, after: getComputedStyle(node).opacity };
  });
  expect(Number(effects.before)).toBe(0);
  expect(effects.during).not.toBe('none');
  expect(Number(effects.after)).toBe(0);
  await editor.getByRole('button', { name: 'Stop animation preview', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'First instruction element', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('animation-inspector-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.getByRole('combobox', { name: 'entrance effect', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('animation-inspector-mobile.png') });
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const instruction = saved.storyboard.scenes[0].visualLayout.elements.find(element => element.text === 'First instruction');
  expect(instruction.animations.entrance).toEqual({ effect: 'bounce', durationMs: 600, delayMs: 150 });
  expect(instruction.animations.presentation.iterations).toBe(2);
  expect(instruction.animations.exit.effect).toBe('fade');
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  let preview = page.getByRole('dialog', { name: 'Animated course course preview', exact: true });
  await expect(preview.locator('#course-preview-scene-title')).toHaveClass('course-preview-title-on-stage');
  await expect(preview.locator('[data-scene-element]').filter({ hasText: 'Moving text' })).toHaveCount(1);
  await expect.poll(() => preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().length)).toBe(3);
  await preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  await expect(preview.locator(`[data-scene-element="${instruction.id}"]`)).toHaveCSS('opacity', '0');
  await preview.getByRole('button', { name: 'Replay motion', exact: true }).click();
  await expect.poll(() => preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().length)).toBe(3);
  expect(await preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => Math.max(...node.getAnimations().map(animation => Number(animation.currentTime))))).toBeLessThan(1500);
  const afterReplay = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(afterReplay.storyboard.revision).toBe(saved.storyboard.revision);
  await preview.getByRole('button', { name: 'Stop motion', exact: true }).click();
  await expect.poll(() => preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().length)).toBe(0);
  await expect(preview.locator(`[data-scene-element="${instruction.id}"]`)).toHaveCSS('opacity', '1');
  await preview.getByRole('button', { name: 'Play motion', exact: true }).click();
  await expect.poll(() => preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().length)).toBe(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => preview.locator(`[data-scene-element="${instruction.id}"]`).evaluate(node => node.getAnimations().length)).toBe(0);
  await expect(preview.locator(`[data-scene-element="${instruction.id}"]`)).toHaveCSS('opacity', '1');
  await preview.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  preview = page.getByRole('dialog', { name: 'Animated course course preview', exact: true });
  expect(await preview.locator('[data-scene-element]').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations()).length)).toBe(0);
  await preview.getByRole('button', { name: 'Replay motion', exact: true }).click();
  expect(await preview.locator('[data-scene-element]').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations()).length)).toBe(0);
});

for (const profile of ['scorm-2004', 'scorm-12']) {
  test(`${profile} runs entrance, presentation and exit without replacing layout rotation`, async ({ page, request }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let project = await (await request.post('/api/projects', { data: { title: `Motion ${profile}` } })).json();
    project = await (await request.post(`/api/projects/${project.id}/scenes`, {
      data: { title: 'Animated scene', extractedText: ['Animated learner text'] }, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    })).json();
    const sceneId = project.storyboard.scenes[0].id;
    project = await (await request.patch(`/api/projects/${project.id}/scenes/${sceneId}`, {
      data: { visualLayout: { enabled: true, width: 1280, height: 720, backgroundColor: '#ffffff', elements: [
        { id: 'moving', kind: 'text', x: 120, y: 220, width: 900, height: 120, rotation: 15, text: 'Animated learner text', fontSize: 40,
          animations: { entrance: { effect: 'bounce', durationMs: 800, delayMs: 200 }, presentation: { effect: 'pulse', durationMs: 600, delayMs: 100, iterations: 2 }, exit: { effect: 'slide-left', durationMs: 400, delayMs: 4000 } } },
      ] } }, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    })).json();
    const second = await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Next scene' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(second.ok()).toBe(true);
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok(), await response.text()).toBe(true);
    const directory = testInfo.outputPath('scorm');
    await fs.mkdir(directory, { recursive: true });
    const archivePath = testInfo.outputPath('course.zip');
    await fs.writeFile(archivePath, await response.body());
    execFileSync(path.resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'), ['-m', 'zipfile', '-e', archivePath, directory]);
    await page.route('http://chimera-player.test/**', async route => {
      const filename = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!['index.html', 'storyboard.json', 'player.js'].includes(filename)) return route.abort();
      return route.fulfill({ body: await fs.readFile(path.join(directory, filename)), contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html' });
    });
    await page.addInitScript(profile => {
      window.__lmsWrites = [];
      const api = {};
      for (const name of ['Initialize', 'Commit', 'Terminate', 'LMSInitialize', 'LMSCommit', 'LMSFinish']) api[name] = () => 'true';
      for (const name of ['GetValue', 'LMSGetValue']) api[name] = () => '';
      for (const name of ['SetValue', 'LMSSetValue']) api[name] = (key, value) => { window.__lmsWrites.push([key, value]); return 'true'; };
      window[profile === 'scorm-2004' ? 'API_1484_11' : 'API'] = api;
    }, profile);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://chimera-player.test/index.html');
    const element = page.locator('[data-scene-element="moving"]');
    await expect.poll(() => element.evaluate(node => node.getAnimations().length)).toBe(3);
    const result = await element.evaluate(node => {
      const animations = node.getAnimations();
      const transform = getComputedStyle(node).transform;
      animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      const hiddenBeforeEntrance = getComputedStyle(node).opacity;
      animations.forEach(animation => { animation.currentTime = 1200; });
      const scale = getComputedStyle(node).scale;
      animations.forEach(animation => { animation.currentTime = 4500; });
      return { transformPreserved: transform === getComputedStyle(node).transform, hiddenBeforeEntrance, scale, hiddenAfterExit: getComputedStyle(node).opacity };
    });
    expect(result.transformPreserved).toBe(true);
    expect(result.hiddenBeforeEntrance).toBe('0');
    expect(result.hiddenAfterExit).toBe('0');
    expect(result.scale).not.toBe('none');
    await page.getByRole('button', { name: 'Stop motion', exact: true }).click();
    await expect.poll(() => element.evaluate(node => node.getAnimations().length)).toBe(0);
    await expect(element).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: 'Play motion', exact: true }).click();
    await expect.poll(() => element.evaluate(node => node.getAnimations().length)).toBe(3);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('[data-scene-element="moving"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect.poll(() => element.evaluate(node => node.getAnimations().length)).toBe(3);
    expect(await element.evaluate(node => Math.max(...node.getAnimations().map(animation => Number(animation.currentTime))))).toBeLessThan(2000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => element.evaluate(node => node.getAnimations().length)).toBe(0);
    await expect(element).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => window.__lmsWrites.some(([key]) => key === 'cmi.suspend_data'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
