const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('standalone export runs directly from an extracted local folder without networking', async ({ page, request, browser }, testInfo) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Local </script> course' } })).json();
  const write = async (suffix, data, method = 'post') => {
    const response = await request[method](`/api/projects/${project.id}/${suffix}`, {
      data, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(response.ok(), await response.text()).toBe(true);
    project = await response.json();
  };
  await write('scenes', { title: 'Welcome locally', extractedText: ['Inspect equipment before operation.'] });
  const introId = project.storyboard.scenes[0].id;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==', 'base64');
  const samples = 8000;
  const audio = Buffer.alloc(44 + samples, 128);
  audio.write('RIFF', 0); audio.writeUInt32LE(36 + samples, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28); audio.writeUInt16LE(1, 32);
  audio.writeUInt16LE(8, 34); audio.write('data', 36); audio.writeUInt32LE(samples, 40);
  for (const file of [{ name: 'equipment.png', mimeType: 'image/png', buffer: image }, { name: 'narration.wav', mimeType: 'audio/wav', buffer: audio }]) {
    const response = await request.post(`/api/projects/${project.id}/assets`, {
      multipart: { file }, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(response.ok(), await response.text()).toBe(true);
    project = await response.json();
  }
  const imageAsset = project.storyboard.assets.find(asset => asset.kind === 'image');
  const audioAsset = project.storyboard.assets.find(asset => asset.kind === 'audio');
  await write(`assets/${audioAsset.id}/attribution`, { attributionText: 'Generated silent test fixture.', attributionStatus: 'complete' }, 'patch');
  await write(`scenes/${introId}`, {
    imageAssets: [imageAsset.id], imageAltText: { [imageAsset.id]: 'Equipment fixture' },
    audioAssets: [audioAsset.id], audioRequired: true,
    visualLayout: { enabled: true, width: 1280, height: 720, backgroundColor: '#ffffff', elements: [
      { id: 'heading', kind: 'text', x: 64, y: 64, width: 1100, height: 100, text: 'Inspect equipment before operation.', fontSize: 32,
        animations: { entrance: { effect: 'slide-left', durationMs: 800, delayMs: 150 }, presentation: { effect: 'pulse', durationMs: 600, delayMs: 0, iterations: 1 }, exit: { effect: 'fade', durationMs: 400, delayMs: 10000 } } },
      { id: 'equipment', kind: 'image', assetId: imageAsset.id, x: 64, y: 220, width: 240, height: 240 },
    ] },
  }, 'patch');
  await write('scenes', {
    title: 'Knowledge check', sceneType: 'assessment',
    assessmentItem: { type: 'true-false', identifier: 'inspection', prompt: 'Inspect equipment before operation.', correctResponse: 'true' },
    assessmentSettings: { remediationSceneId: introId },
  });
  await write(`scenes/${project.storyboard.scenes[1].id}`, { visualLayout: { ...project.storyboard.scenes[1].visualLayout, assessmentRegion: { x: 80, y: 160, width: 1000, height: 500 } } }, 'patch');
  const nativeTitle = 'Welcome to PNutII: How to Make a Peanut Butter and Jelly Sandwich';
  await write('scenes', { title: nativeTitle, extractedText: ['In this course, you will learn how to make a classic peanut butter and jelly sandwich in less than five simple steps.'] });
  await write(`scenes/${project.storyboard.scenes[2].id}`, { visualLayout: null }, 'patch');
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export course', exact: true });
  await expect(exportDialog.getByRole('heading', { name: 'Standalone course', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('standalone-export-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const exportButton = exportDialog.getByRole('button', { name: 'Download standalone ZIP', exact: true });
  await exportButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('standalone-export-mobile.png') });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-standalone\.zip$/);
  const archivePath = testInfo.outputPath('course.zip');
  const extractedPath = testInfo.outputPath('local course');
  await download.saveAs(archivePath);
  const python = require('./python.cjs');
  execFileSync(python, ['-m', 'zipfile', '-e', archivePath, extractedPath]);
  const context = await browser.newContext({
    offline: !(process.platform === 'win32' && testInfo.project.name === 'webkit'),
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  const networkRequests = [];
  await context.route(/^https?:\/\//, route => {
    networkRequests.push(route.request().url());
    return route.abort();
  });
  const localPage = await context.newPage();
  const errors = [];
  localPage.on('pageerror', error => errors.push(error.message));
  try {
    await localPage.goto(pathToFileURL(path.join(extractedPath, 'index.html')).href);
    await expect(localPage.locator('#course-title')).toHaveText('Local </script> course');
    await expect(localPage.locator('#runtime-status')).toContainText('Local course:');
    await expect(localPage.getByRole('heading', { name: 'Welcome locally', exact: true })).toBeVisible();
    await expect(localPage.getByText('Inspect equipment before operation.', { exact: true })).toBeVisible();
    const animatedHeading = localPage.locator('[data-scene-element="heading"]');
    await expect.poll(() => animatedHeading.evaluate(node => node.getAnimations().length)).toBe(3);
    const motion = await animatedHeading.evaluate(node => {
      const animations = node.getAnimations();
      animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      const entering = getComputedStyle(node).opacity;
      animations.forEach(animation => { animation.currentTime = 11000; });
      const exited = getComputedStyle(node).opacity;
      animations.forEach(animation => animation.cancel());
      return { entering, exited, staticOpacity: getComputedStyle(node).opacity };
    });
    expect(motion).toEqual({ entering: '0', exited: '0', staticOpacity: '1' });
    await expect.poll(() => localPage.getByAltText('Equipment fixture').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const localAudio = localPage.locator('audio');
    await expect.poll(() => localAudio.evaluate(audio => audio.readyState)).toBeGreaterThanOrEqual(1);
    await localAudio.evaluate(audio => { audio.muted = true; return audio.play(); });
    await expect.poll(() => localAudio.evaluate(audio => audio.ended)).toBe(true);
    await localPage.screenshot({ path: testInfo.outputPath('local-player-desktop.png') });
    await localPage.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(localPage.locator('.visual-stage-frame .assessment-stage-region')).toHaveCount(1);
    expect(await localPage.locator('.assessment-stage-region').evaluate(region => region.style.left)).toBe('6.25%');
    await expect(localPage.locator('#scene-assessment')).toBeEmpty();
    await localPage.getByLabel('False', { exact: true }).check();
    await localPage.getByRole('button', { name: 'Check answer', exact: true }).click();
    const wrongFeedback = localPage.getByRole('dialog', { name: 'Not correct', exact: true });
    await expect(wrongFeedback).toContainText('Score: 0%');
    await wrongFeedback.getByRole('button', { name: 'Review lesson', exact: true }).click();
    await expect(wrongFeedback).toHaveCount(0);
    await expect(localPage.locator('#scene-title')).toHaveText('Welcome locally');
    await localPage.getByRole('button', { name: 'Return to question', exact: true }).click();
    await expect(localPage.locator('#scene-title')).toHaveText('Knowledge check');
    await localPage.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(localPage.getByLabel('False', { exact: true })).not.toBeChecked();
    await expect(localPage.getByRole('button', { name: 'Check answer', exact: true })).toBeDisabled();
    await localPage.getByLabel('True', { exact: true }).check();
    await localPage.getByRole('button', { name: 'Check answer', exact: true }).click();
    const feedback = localPage.getByRole('dialog', { name: 'Correct', exact: true });
    await expect(feedback).toContainText('Score: 100%');
    await expect(feedback.getByRole('button', { name: 'Close feedback', exact: true })).toBeFocused();
    await localPage.keyboard.press('Escape');
    await expect(feedback).toHaveCount(0);
    await expect(localPage.getByRole('button', { name: 'View feedback', exact: true })).toBeFocused();
    await localPage.getByRole('button', { name: 'View feedback', exact: true }).click();
    await expect(feedback).toContainText('(2/2 attempts)');
    await feedback.getByRole('button', { name: 'Close feedback', exact: true }).click();
    await expect(localPage.locator('.assessment-stage-region')).toHaveCSS('font-size', '16px');
    await expect(localPage.locator('.assessment-stage-region')).toHaveCSS('overflow-y', 'visible');
    await localPage.setViewportSize({ width: 390, height: 844 });
    await expect(localPage.getByRole('heading', { name: 'Knowledge check', exact: true })).toBeVisible();
    await localPage.screenshot({ path: testInfo.outputPath('local-player-mobile.png') });
    await localPage.getByRole('button', { name: 'Next', exact: true }).click();
    const nativeSlide = localPage.getByRole('region', { name: 'Scene content', exact: true });
    await expect(nativeSlide.getByRole('heading', { name: nativeTitle, exact: true })).toBeVisible();
    await expect(nativeSlide).toContainText('less than five simple steps.');
    expect(await localPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await localPage.screenshot({ path: testInfo.outputPath('native-slide-mobile.png') });
    await localPage.setViewportSize({ width: 1440, height: 900 });
    await expect(nativeSlide).toBeVisible();
    const slideBox = await nativeSlide.boundingBox();
    expect(Math.abs(slideBox.width / slideBox.height - 16 / 9)).toBeLessThan(0.05);
    await localPage.screenshot({ path: testInfo.outputPath('native-slide-desktop.png') });
    await localPage.reload();
    await expect(localPage.locator('#scene-title')).toHaveText('Welcome locally');
    await expect.poll(() => localPage.locator('[data-scene-element="heading"]').evaluate(node => node.getAnimations().length)).toBe(3);
    await localPage.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => localPage.locator('[data-scene-element="heading"]').evaluate(node => node.getAnimations().length)).toBe(0);
    await expect(localPage.locator('[data-scene-element="heading"]')).toHaveCSS('opacity', '1');
    expect(errors).toEqual([]);
    expect(networkRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
