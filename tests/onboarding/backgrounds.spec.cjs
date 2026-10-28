const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const python = require('./python.cjs');

async function seed(page, request) {
  await page.goto('/');
  const images = await page.evaluate(() => ['#ddeeff', '#ffeecc'].map(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.fillRect(0, 0, 160, 90);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  let response = await request.post('/api/projects', { data: { title: 'Background inheritance' } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  for (const [index, name] of ['Project image.png', 'Scene image.png'].entries()) {
    response = await request.post(`/api/projects/${project.id}/assets`, {
      multipart: { file: { name, mimeType: 'image/png', buffer: Buffer.from(images[index], 'base64') } },
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json();
  }
  for (const title of ['Inherited scene', 'Override scene', 'Empty background scene']) {
    response = await request.post(`/api/projects/${project.id}/scenes`, {
      data: { title, extractedText: ['Readable learning content.'] },
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(response.ok()).toBeTruthy();
    project = await response.json();
  }
  return project;
}

async function selectImage(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectBackground(stage, id) {
  if (id) {
    await expect(stage).toHaveCSS('background-image', new RegExp(id));
    expect(await stage.evaluate(async element => {
      const image = new Image();
      image.src = getComputedStyle(element).backgroundImage.slice(5, -2);
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);
  } else await expect(stage).toHaveCSS('background-image', 'none');
}

test('original comparison never changes the authored previews or survives reopening', async ({ page, request }) => {
  let project = await seed(page, request);
  let response = await request.post(`/api/projects/${project.id}/authoring/prepare`, { headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok()).toBeTruthy(); project = await response.json();
  response = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { visualLayout: { version: 1, enabled: true, width: 1280, height: 720, backgroundColor: '#123456', elements: [{ id: 'body', kind: 'text', x: 72, y: 176, width: 1136, height: 80, text: 'Readable learning content.' }] } },
  });
  expect(response.ok()).toBeTruthy(); project = await response.json();
  project.storyboard.scenes[0].previewImage = 'source-preview.png';
  await page.route(`**/api/projects/${project.id}`, route => route.fulfill({ json: project }));
  await page.route('**/source-preview.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64') }));
  await page.addInitScript(({ id, sceneId }) => {
    localStorage.setItem('chimera.activeProjectId', id);
    localStorage.setItem(`chimera.previewView.${id}.${sceneId}`, 'source');
  }, { id: project.id, sceneId: project.storyboard.scenes[0].id });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await expect(page.locator('.visual-authoring-surface .visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Inherited scene', exact: true });
  await expect(editor.locator('.visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(editor.getByRole('combobox', { name: 'Rendering mode', exact: true })).toHaveCount(0);
  await editor.getByRole('tab', { name: 'Stage', exact: true }).click();
  await editor.getByRole('button', { name: 'Compare with original', exact: true }).click();
  await expect(editor.locator('.visual-source')).toBeVisible();
  await expect(editor.getByRole('status')).toContainText('Original slide reference');
  await editor.getByRole('button', { name: 'Close scene editor', exact: true }).click();
  await expect(page.locator('.visual-authoring-surface .visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const preview = page.getByRole('dialog', { name: `${project.title} course preview`, exact: true });
  await expect(preview.locator('.visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(preview.locator('.course-preview-slide')).toHaveCount(0);
  const navigation = await preview.locator('.course-preview-navigation').boundingBox();
  const transcript = await preview.locator('.course-preview-transcript').boundingBox();
  const discussion = await preview.locator('.course-preview-review').boundingBox();
  expect(transcript.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  expect(discussion.y).toBeGreaterThan(transcript.y);
  await preview.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Compare with original', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('imports a graphic inside project background and saves it across reload', async ({ page, request }) => {
  const project = await seed(page, request);
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Project background', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Project background', exact: true });
  const buffer = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18;
    const context = canvas.getContext('2d'); context.fillStyle = '#123456'; context.fillRect(0, 0, 32, 18);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await dialog.getByLabel('Import background graphic').setInputFiles({ name: 'Imported background.png', mimeType: 'image/png', buffer: Buffer.from(buffer, 'base64') });
  await expect(dialog.getByRole('combobox')).toContainText('Imported background.png');
  await dialog.getByRole('button', { name: 'Save project background', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const image = saved.storyboard.assets.find(asset => asset.filename === 'Imported background.png');
  expect(saved.storyboard.backgroundAsset).toBe(image.id);
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Project background', exact: true }).click();
  await expect(dialog.getByRole('combobox')).toContainText('Imported background.png');
});

test('apply template previews the composition, supports undo, and preserves it on save', async ({ page, request }) => {
  let project = await seed(page, request);
  let response = await request.post(`/api/projects/${project.id}/authoring/prepare`, { headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok()).toBeTruthy(); project = await response.json();
  const buffer = execFileSync(python, ['-c', `import io,sys
from pptx import Presentation
from pptx.dml.color import RGBColor
p=Presentation(); s=p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text='Template title'; s.placeholders[1].text='Template body'
s.background.fill.solid(); s.background.fill.fore_color.rgb=RGBColor(18,52,86)
b=io.BytesIO(); p.save(b); sys.stdout.buffer.write(b.getvalue())`]);
  response = await request.post('/api/templates', { multipart: { file: { name: 'Authored template.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer } } });
  expect(response.ok()).toBeTruthy(); const template = await response.json();
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Inherited scene', exact: true });
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Template', exact: true }).selectOption(template.id);
  await editor.getByRole('button', { name: 'Apply template', exact: true }).click();
  await expect(editor.locator('.visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  let saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].templateId).toBeNull();
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('.visual-stage')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await editor.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('.visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(editor).toHaveCount(0);
  saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].templateId).toBe(template.id);
  expect(saved.storyboard.scenes[0].title).toBe('Inherited scene');
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await expect(page.locator('.visual-authoring-surface .visual-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
});

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  test(`project and scene thumbnail backgrounds persist and preview in ${theme} at ${width}px`, async ({ page, request }) => {
    const project = await seed(page, request);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(({ id, theme }) => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', theme);
    }, { id: project.id, theme });
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Scene sequence', exact: true }).getByRole('button', { name: 'Project background', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Project background', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Project background', exact: true });
    await dialog.getByRole('combobox', { name: 'Project background image' }).click();
    const list = dialog.getByRole('listbox');
    await expect(list.getByRole('option').locator('img')).toHaveCount(2);
    await expect.poll(() => list.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect((await new AxeBuilder({ page }).include('.scene-editor').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`project-thumbnails-${theme}-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox')).toBeFocused();
    await selectImage(page, 'Project background image', 'Project image.png');
    await dialog.getByRole('button', { name: 'Save project background', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectBackground(page.locator('.visual-authoring-surface .visual-stage'), project.storyboard.assets[0].id);
    for (const [index, option] of [[1, 'Scene image.png'], [2, 'None']]) {
      await page.locator('.scene-row').nth(index).click();
      await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
      const editor = page.getByRole('dialog').last();
      await editor.locator('.visual-inspector summary').filter({ hasText: /^Background$/ }).click();
      const picker = editor.getByRole('combobox', { name: 'Background image', exact: true });
      await expect(picker).toContainText('Use project default (Project image.png)');
      await picker.click();
      await expect(editor.getByRole('option', { name: 'Use project default (Project image.png)', exact: true }).locator('img')).toBeVisible();
      await editor.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
      await expectBackground(editor.locator('.visual-stage'), index === 1 ? project.storyboard.assets[1].id : null);
      await editor.getByRole('button', { name: 'Save scene', exact: true }).click();
      await expect(editor).toHaveCount(0);
    }
    const read = async () => (await request.get(`/api/projects/${project.id}`)).json();
    let saved = await read();
    expect(saved.storyboard.backgroundAsset).toBe(project.storyboard.assets[0].id);
    expect(saved.storyboard.scenes[0].visualLayout).toEqual(project.storyboard.scenes[0].visualLayout);
    expect(saved.storyboard.scenes[1].visualLayout.backgroundMode).toBe('image');
    expect(saved.storyboard.scenes[2].visualLayout.backgroundMode).toBe('none');
    await page.reload();
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Preview course', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Background inheritance course preview', exact: true });
    for (const id of [project.storyboard.assets[0].id, project.storyboard.assets[1].id, null]) {
      await expectBackground(preview.locator('.visual-stage'), id);
      if (id) await preview.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await preview.getByRole('button', { name: 'Close course preview', exact: true }).click();
    await page.getByRole('button', { name: 'Project background', exact: true }).click();
    await selectImage(page, 'Project background image', 'Scene image.png');
    await page.getByRole('button', { name: 'Save project background', exact: true }).click();
    await page.locator('.scene-row').nth(0).click();
    await expectBackground(page.locator('.visual-authoring-surface .visual-stage'), project.storyboard.assets[1].id);
    saved = await read();
    expect(saved.storyboard.scenes[1].visualLayout.backgroundAsset).toBe(project.storyboard.assets[1].id);
    expect(saved.storyboard.scenes[2].visualLayout.backgroundMode).toBe('none');
    await page.locator('.scene-row').nth(1).click();
    await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
    await page.locator('.visual-inspector summary').filter({ hasText: /^Background$/ }).click();
    const picker = page.getByRole('combobox', { name: 'Background image', exact: true });
    await picker.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(picker).toContainText('Use project default');
    await page.getByRole('button', { name: 'Save scene', exact: true }).click();
    await expect.poll(async () => (await read()).storyboard.scenes[1].visualLayout.backgroundMode).toBe('inherit');
    saved = await read();
    expect(saved.storyboard.scenes[1].backgroundAsset).toBeNull();
  });
}

test('project background save reports stale revisions instead of overwriting', async ({ page, request }) => {
  const project = await seed(page, request);
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Project background', exact: true }).click();
  await selectImage(page, 'Project background image', 'Project image.png');
  await request.patch(`/api/projects/${project.id}/background`, {
    data: { backgroundAsset: project.storyboard.assets[1].id }, headers: { 'If-Match': `"${project.storyboard.revision}"` },
  });
  await page.getByRole('button', { name: 'Save project background', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/changed|updated|Reload/i);
  expect((await (await request.get(`/api/projects/${project.id}`)).json()).storyboard.backgroundAsset).toBe(project.storyboard.assets[1].id);
});

test('SCORM and standalone players render inherited, overridden and empty backgrounds', async ({ page, request, browser }, testInfo) => {
  let project = await seed(page, request);
  const change = async (suffix, data) => {
    const response = await request.patch(`/api/projects/${project.id}/${suffix}`, {
      data, headers: { 'If-Match': `"${project.storyboard.revision}"` },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json();
  };
  await change('background', { backgroundAsset: project.storyboard.assets[0].id });
  await change(`scenes/${project.storyboard.scenes[1].id}`, { visualLayout: { enabled: true, backgroundMode: 'image', backgroundAsset: project.storyboard.assets[1].id } });
  await change(`scenes/${project.storyboard.scenes[2].id}`, { visualLayout: { enabled: true, backgroundMode: 'none' } });
  for (const profile of ['scorm-2004', 'scorm-12', 'standalone']) {
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const archive = testInfo.outputPath(`${profile}.zip`);
    const folder = testInfo.outputPath(profile);
    await fs.writeFile(archive, await response.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, folder]);
    const context = await browser.newContext();
    try {
      const player = await context.newPage();
      if (profile === 'standalone') await player.goto(pathToFileURL(path.join(folder, 'index.html')).href);
      else {
        await player.route('**/background-export/**', route => {
          const relative = new URL(route.request().url()).pathname.split('/background-export/')[1];
          return route.fulfill({ path: path.join(folder, relative) });
        });
        await player.goto('http://127.0.0.1:5187/background-export/index.html');
      }
      for (const id of [project.storyboard.assets[0].id, project.storyboard.assets[1].id, null]) {
        await expectBackground(player.locator('#scene-body .visual-stage-frame > div').first(), id);
        if (id) await player.getByRole('button', { name: 'Next', exact: true }).click();
      }
    } finally { await context.close(); }
  }
});
