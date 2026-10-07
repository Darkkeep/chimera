const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const root = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-visual-'));
const output = path.join(root, 'workspace/visual-qualification');
fs.mkdirSync(output, { recursive: true });
const python = process.env.CHIMERA_TEST_PYTHON || path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const environment = { ...process.env, CHIMERA_DEPLOYMENT_PROFILE: 'local', CHIMERA_WORKSPACE: path.join(temporary, 'workspace'), CHIMERA_AI_BASE_URL: '', CHIMERA_AI_API_KEY: '', CHIMERA_AI_MODEL: '' };
let backend, server, browser;
let backendLog = '';

async function freePort() {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

(async () => {
  const seed = spawnSync(python, [path.join(__dirname, 'seed.py')], { cwd: root, env: environment, encoding: 'utf8', windowsHide: true });
  assert.equal(seed.status, 0, seed.stderr);
  const fixture = JSON.parse(seed.stdout.trim());
  const apiPort = await freePort();
  backend = spawn(python, ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', String(apiPort), '--no-access-log'], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const backendReady = new Promise((resolve, reject) => { backend.stderr.on('data', chunk => { if (chunk.toString().includes('Uvicorn running on')) resolve(); }); backend.once('error', reject); backend.once('exit', code => reject(new Error(`API exited ${code}: ${backendLog}`))); });
  backend.stdout.on('data', chunk => backendLog += chunk);
  backend.stderr.on('data', chunk => backendLog += chunk);
  server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) {
      const upstream = http.request({ hostname: '127.0.0.1', port: apiPort, path: request.url, method: request.method, headers: request.headers }, remote => { response.writeHead(remote.statusCode, remote.headers); remote.pipe(response); });
      upstream.on('error', () => { response.writeHead(502); response.end(); }); request.pipe(upstream); return;
    }
    const pathname = decodeURIComponent(request.url.split('?')[0]);
    const base = pathname.startsWith('/exports/') ? output : path.join(root, 'frontend/dist');
    const local = pathname.startsWith('/exports/') ? pathname.slice('/exports'.length) : pathname;
    let file = path.resolve(base, '.' + local);
    if (file !== base && !file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'msedge' }); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await backendReady;
  await page.goto(origin);
  await page.getByLabel('Switch project').selectOption(fixture.projectId, { timeout: 30000 });
  const readProject = async id => { const response = await context.request.get(`${origin}/api/projects/${id || fixture.projectId}`); assert.equal(response.status(), 200); return response.json(); };
  let project = await readProject();
  assert(project.storyboard.scenes[0].visualLayout.backgroundAsset);
  assert(project.storyboard.scenes[0].visualLayout.elements.some(element => element.source === 'master'));
  await page.getByRole('button', { name: 'Edit canvas', exact: true }).click();
  await page.locator('.visual-editable').filter({ hasText: 'Editable scene text' }).dblclick();
  await page.getByLabel('Edit canvas text', { exact: true }).fill('Edited directly on canvas');
  await page.getByRole('heading', { name: 'Layers', exact: true }).click();
  const text = page.locator('.visual-editable').filter({ hasText: 'Edited directly on canvas' });
  await text.click();
  const beforeX = Number(await page.getByLabel('Element x', { exact: true }).inputValue());
  const box = await text.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 85, box.y + 50, { steps: 8 }); await page.mouse.up();
  assert(Number(await page.getByLabel('Element x', { exact: true }).inputValue()) > beforeX);
  await page.getByLabel('Element width', { exact: true }).fill('560');
  const beforeImages = await page.locator('.visual-editable .visual-image').count();
  const thumbnail = page.locator('.visual-attached-images button[draggable=true]').first();
  await thumbnail.scrollIntoViewIfNeeded();
  const thumbnailBox = await thumbnail.boundingBox();
  const stageBox = await page.locator('.visual-stage-frame').boundingBox();
  await page.mouse.move(thumbnailBox.x + 3, thumbnailBox.y + 3);
  await page.mouse.down();
  await page.mouse.move(thumbnailBox.x + 15, thumbnailBox.y - 15, {steps: 5});
  await page.mouse.move(stageBox.x + stageBox.width * 0.7, stageBox.y + stageBox.height * 0.3, {steps: 12});
  await page.mouse.move(stageBox.x + stageBox.width * 0.7 + 1, stageBox.y + stageBox.height * 0.3 + 1);
  await page.mouse.up();
  assert.equal(await page.locator('.visual-editable .visual-image').count(), beforeImages + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.locator('.visual-editable .visual-image').count(), beforeImages);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(await page.locator('.visual-editable .visual-image').count(), beforeImages + 1);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByLabel('Element text', { exact: true }).fill('Added text');
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.getByRole('button', { name: 'Edit canvas', exact: true }).waitFor();
  project = await readProject();
  const layout = project.storyboard.scenes[0].visualLayout;
  assert(layout.enabled); assert(layout.elements.some(element => element.text === 'Edited directly on canvas' && element.width === 560));
  await page.reload();
  await page.getByLabel('Switch project').selectOption(fixture.projectId);
  await page.locator('.visual-authoring-surface').getByText('Edited directly on canvas', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit canvas', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'editor-desktop.png'), fullPage: true });
  const editorAxe = await new AxeBuilder({ page }).include('.visual-editor').analyze();
  assert.deepEqual(editorAxe.violations.map(item => item.id), []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'editor-mobile.png'), fullPage: true });
  assert(await page.locator('.visual-editor').evaluate(element => element.scrollWidth <= element.clientWidth + 2));
  await page.getByRole('button', { name: 'Close visual editor', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await page.locator('#preview-contents > button').nth(22).click();
  assert.match(await page.locator('.course-preview-scene-meta').innerText(), /23 \/ 24/);
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await page.locator('#preview-contents > button').nth(7).click();
  assert.match(await page.locator('.course-preview-scene-meta').innerText(), /08 \/ 24/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const results = await new AxeBuilder({ page }).include('.course-preview-review').analyze();
    assert.deepEqual(results.violations.map(item => item.id), [], `${theme} review: ${JSON.stringify(results.violations)}`);
    await page.locator('.course-preview-review').screenshot({ path: path.join(output, `review-${theme}.png`) });
  }
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.getByLabel('Switch project').selectOption(fixture.legacyProjectId);
  await page.getByRole('button', { name: 'Edit canvas', exact: true }).click();
  const [extraction] = await Promise.all([page.waitForResponse(response => response.url().endsWith('/extract-layout')), page.getByRole('button', { name: 'Extract source layout', exact: true }).click()]);
  assert.equal(extraction.status(), 200, await extraction.text());
  await page.getByRole('button', { name: 'Extract source layout', exact: true }).waitFor({state:'detached'});
  await page.locator('.visual-editable').filter({ hasText: 'Editable scene text' }).waitFor();
  const legacy = await readProject(fixture.legacyProjectId);
  assert.equal(legacy.storyboard.scenes[0].notes, 'Preserved legacy notes');
  assert.equal(legacy.storyboard.scenes[0].visualLayout.enabled, false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const built = spawnSync(python, [path.join(__dirname, 'seed.py'), fixture.projectId, output], { cwd: root, env: environment, windowsHide: true, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  for (const profile of ['scorm12', 'scorm2004']) {
    const exported = await context.newPage();
    exported.on('pageerror', error => errors.push(error.message));
    await exported.goto(`${origin}/exports/${profile}/index.html`);
    await exported.locator('.visual-element').getByText('Edited directly on canvas', { exact: true }).waitFor();
    assert.equal(await exported.locator('#scene-body > img').count(), 0);
    assert.equal(await exported.locator('.visual-element img').count(), beforeImages + 1);
    assert(await exported.locator('.visual-stage-frame').evaluate(element => element.getBoundingClientRect().height > 100));
    assert(await exported.locator('.visual-element img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
    await exported.screenshot({ path: path.join(output, `${profile}-desktop.png`), fullPage: true });
    await exported.getByLabel('Contents', { exact: true }).selectOption('22');
    await exported.getByLabel('Contents', { exact: true }).selectOption('7');
    assert.equal(await exported.locator('#scene-status').textContent(), '8 / 24');
    await exported.getByLabel('Contents', { exact: true }).selectOption('0');
    await exported.setViewportSize({ width: 390, height: 844 });
    await exported.screenshot({ path: path.join(output, `${profile}-mobile.png`), fullPage: true });
    assert(await exported.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await exported.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'qualification.json'), JSON.stringify({ passed: true, checks: ['PPTX master/background extraction', 'inline text edit', 'pointer movement', 'resize', 'attached image drag/drop', 'undo/redo', 'save/reload', 'scene 23 to 8', 'review contrast light/dark', 'editor accessibility', 'mobile editor', 'legacy upgrade', 'SCORM 1.2 and 2004 visual parity'], fixture }, null, 2));
  console.log('Visual qualification passed. Evidence: workspace/visual-qualification');
})().catch(error => { console.error(error); console.error(backendLog); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (backend) { backend.kill(); await new Promise(resolve => backend.once('exit', resolve)); }
  try { fs.rmSync(temporary, { recursive: true, force: true }); } catch (error) { console.warn(`Temporary fixture cleanup deferred: ${error.code}`); }
});