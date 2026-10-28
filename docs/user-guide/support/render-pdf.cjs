const { chromium } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(process.argv[2] || 'workspace/user-guide-print.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const broken = await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src));
    if (broken.length) throw new Error('Missing guide images: ' + broken.join(', '));
    await page.evaluate(repositoryRoot => {
      for (const anchor of document.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href');
        if (href.startsWith('#')) { anchor.href = location.href.split('#')[0] + href; continue; }
        const url = new URL(href, document.baseURI);
        if (url.href.startsWith(repositoryRoot)) anchor.href = 'https://github.com/Darkkeep/chimera/blob/main/' + url.href.slice(repositoryRoot.length);
      }
    }, pathToFileURL(path.resolve('.') + path.sep).href);
    await page.pdf({ path: path.resolve('docs/user-guide.pdf'), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>', footerTemplate: '<div style="font:9px Arial;color:#52606a;width:100%;margin:0 14mm;display:flex;justify-content:space-between"><span>Chimera user guide · 2026-10-27</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    console.log('Rendered docs/user-guide.pdf');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
