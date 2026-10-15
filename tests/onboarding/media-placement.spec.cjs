const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const http = require('node:http');

async function serveDirectory(directory) {
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1)) || 'index.html';
    const file = path.resolve(directory, name);
    if (!file.startsWith(path.resolve(directory) + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    const bytes = fs.readFileSync(file);
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    const start = range ? Number(range[1]) : 0, end = Math.min(range?.[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
    response.writeHead(range ? 206 : 200, { 'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
    response.end(bytes.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('course-wide video, scene exclusions, captions, shared copies and revision errors preserve author intent', async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  let project = await (await request.post('/api/projects', { data: { title: 'Media placement qualification' } })).json();
  const change = async (suffix, data, method = 'post') => {
    const response = await request[method](`/api/projects/${project.id}/${suffix}`, { data, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(response.ok(), await response.text()).toBe(true); project = await response.json();
  };
  await change('scenes', { title: 'Opening lesson' }); await change('scenes', { title: 'Second lesson' });
  const upload = await request.post(`/api/projects/${project.id}/assets`, { multipart: { file: { name: 'qualification.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(path.resolve('tests/fixtures/media-qualification.mp4')) } }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(upload.ok(), await upload.text()).toBe(true); project = await upload.json();
  const video = project.storyboard.assets[0];
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  const tools = page.getByRole('region', { name: 'Media placement and shared library', exact: true });
  await tools.getByText('Placement, captions, and shared media', { exact: true }).click();
  await tools.getByRole('combobox', { name: 'Placement scope', exact: true }).selectOption('course');
  await tools.getByRole('combobox', { name: 'Position', exact: true }).selectOption('before');
  await tools.getByRole('button', { name: 'Save placement', exact: true }).click();
  await expect(tools.getByRole('status')).toHaveText('Saved locally.');
  const read = async () => (await request.get(`/api/projects/${project.id}`)).json();
  project = await read();
  expect(project.storyboard.courseMedia[0]).toMatchObject({ assetId: video.id, position: 'before' });
  await tools.getByText('Transcript and timed captions', { exact: true }).click();
  await tools.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Inspect equipment before operation.');
  await tools.getByRole('textbox', { name: 'WebVTT captions', exact: true }).fill('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nInspect equipment before operation.');
  await tools.getByRole('button', { name: 'Save transcript and captions', exact: true }).click();
  await expect.poll(async () => (await read()).storyboard.assets[0].transcript).toBe('Inspect equipment before operation.');
  await expect(tools.getByRole('button', { name: 'Publish copy to shared library', exact: true })).toBeEnabled();
  await tools.getByRole('button', { name: 'Publish copy to shared library', exact: true }).click();
  const shared = tools.locator('.shared-media-row');
  await expect(shared.first()).toBeVisible();
  await shared.first().getByRole('button', { name: 'Copy to project', exact: true }).click();
  await expect(tools.getByRole('status')).toHaveText('Saved locally.');
  const noDuplicate = await read(); expect(noDuplicate.storyboard.assets).toHaveLength(1);

  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await expect(page.locator('.course-preview-shell video')).toHaveCount(1);
  expect(await page.locator('.course-preview-shell video').evaluate(v => v.textTracks[0]?.kind)).toBe('captions');
  const playerVideo = page.locator('.course-preview-shell video');
  await expect.poll(() => playerVideo.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await playerVideo.evaluate(v => { v.muted = true; void v.play().catch(() => {}); });
  await expect.poll(() => playerVideo.evaluate(v => v.ended)).toBe(true);
  await page.getByText('Transcript: qualification.mp4', { exact: true }).click();
  await expect(page.locator('.course-preview-shell')).toContainText('Inspect equipment before operation.');
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();

  // A revision failure retains typed captions rather than resetting the draft.
  await page.route(`**/assets/${video.id}/metadata`, route => route.fulfill({ status: 412, json: { detail: 'Revision changed' } }));
  await tools.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Retain this unsaved transcript.');
  await tools.getByRole('button', { name: 'Save transcript and captions', exact: true }).click();
  await expect(tools.getByRole('alert')).toBeVisible();
  await expect(tools.getByRole('textbox', { name: 'Transcript', exact: true })).toHaveValue('Retain this unsaved transcript.');
  await page.unroute(`**/assets/${video.id}/metadata`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('media-tools-mobile.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).include('.media-tools').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('media-tools-desktop.png'), fullPage: true });
});

for (const profile of ['scorm-12', 'scorm-2004', 'standalone']) {
  test(`${profile} packages play video and load captions without Chimera`, async ({ page, request, browser }, testInfo) => {
    let project = await (await request.post('/api/projects', { data: { title: 'Portable captioned video' } })).json();
    const root = `/api/projects/${project.id}`;
    const change = async (suffix, data, method = 'post') => {
      const response = await request[method](`${root}/${suffix}`, { data, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
      expect(response.ok(), await response.text()).toBe(true); project = await response.json();
    };
    await change('scenes', { title: 'Video lesson' });
    const uploaded = await request.post(`${root}/assets`, { multipart: { file: { name: 'inspection.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(path.resolve('tests/fixtures/media-qualification.mp4')) } }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
    expect(uploaded.ok()).toBe(true); project = await uploaded.json();
    const asset = project.storyboard.assets[0];
    await change(`assets/${asset.id}/attribution`, { attributionText: 'Synthetic Chromium canvas test fixture; no third-party footage.', attributionStatus: 'complete' }, 'patch');
    await change(`assets/${asset.id}/metadata`, { transcript: 'Inspect equipment. No spoken audio.', captionsVtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nInspect equipment.', language: 'en' }, 'patch');
    await change('course-media', { placements: [{ assetId: asset.id, position: 'before', order: 0 }] }, 'put');
    const downloaded = await request.get(`${root}/${profile}.zip`);
    expect(downloaded.ok(), await downloaded.text()).toBe(true);
    const archive = testInfo.outputPath('video.zip'), directory = testInfo.outputPath('portable video');
    fs.writeFileSync(archive, await downloaded.body());
    execFileSync(require('./python.cjs'), ['-m', 'zipfile', '-e', archive, directory]);
    const context = await browser.newContext({ offline: profile === 'standalone' && testInfo.project.name !== 'webkit', serviceWorkers: 'block' });
    const staticSite = profile === 'standalone' ? null : await serveDirectory(directory);
    const portable = await context.newPage();
    const unexpected = [];
    if (profile === 'standalone') await context.route(/^https?:\/\//, route => { unexpected.push(route.request().url()); return route.abort(); });
    else context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(staticSite.origin + '/')) unexpected.push(request.url()); });
    try {
      await portable.goto(profile === 'standalone' ? pathToFileURL(path.join(directory, 'index.html')).href : `${staticSite.origin}/index.html`);
      const video = portable.locator('video');
      await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
      await expect.poll(() => video.evaluate(v => v.textTracks[0]?.cues?.length || 0)).toBe(1);
      await video.evaluate(v => { v.muted = true; void v.play().catch(() => {}); });
      await expect.poll(() => video.evaluate(v => v.ended)).toBe(true);
      await portable.getByText('Transcript: inspection.mp4', { exact: true }).click();
      await expect(portable.locator('#scene-media-before')).toContainText('No spoken audio.');
      expect(unexpected).toEqual([]);
    } finally { await context.close(); if (staticSite) await new Promise(resolve => staticSite.server.close(resolve)); }
  });
}
