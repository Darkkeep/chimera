// Print snapshots use the same player and composition as standalone/LMS delivery.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  const storyboard = JSON.parse(await fs.readFile(path.join(root, 'storyboard.json'), 'utf8'));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.css': 'text/css' };
  const server = http.createServer(async (request, response) => {
    try {
      const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const target = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
      if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const content = await fs.readFile(target);
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(origin + '/') || url.startsWith('data:') ? route.continue() : route.abort();
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#next').waitFor();
    await fs.mkdir(output, { recursive: true });
    for (let index = 0; index < storyboard.scenes.length; index++) {
      const scene = storyboard.scenes[index];
      await page.locator('#scene-title').filter({ hasText: scene.title }).waitFor({ state: 'attached' });
      // Static output captures the authored composition, without entrance/exit effects.
      await page.evaluate(() => {
        const motion = document.querySelector('#motion');
        if (motion && !motion.hidden && motion.textContent.includes('Stop')) motion.click();
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('#scene-body img')].map(image => image.decode()));
      });
      const stage = page.locator('#scene-body .visual-stage-frame');
      const target = await stage.count() ? stage : page.locator('#scene-body');
      await target.screenshot({ path: path.join(output, `${index}.png`), animations: 'disabled' });
      if (index + 1 < storyboard.scenes.length) await page.locator('#next').click();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
