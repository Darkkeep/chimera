const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

// This is a synthetic end-to-end qualification of the actual project storage,
// authoring UI, learner preview and both packaged SCORM runtime payloads.
// API fixtures establish the three-scene starting point; author interactions
// modify the saved source scene and branching design within Studio itself.
const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==',
  'base64',
);
async function postScene(request, project, data) {
  const response = await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio preview is explicitly opt-in');

test('three-scene no-AI course: author, preview and export both SCORM profiles', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const postsToModel = [];
  page.on('request', req => {
    if (req.method() === 'POST' && /pythia|conversation|treatment|content-draft|enhancement/.test(req.url())) {
      postsToModel.push(req.url());
    }
  });

  let response = await request.post('/api/projects', { data: { title: 'Studio manual golden path' } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  project = await postScene(request, project, {
    title: 'Recognize the signal', sceneType: 'content',
    extractedText: ['Notice the warning signal and consider the context.'],
  });
  project = await postScene(request, project, {
    title: 'Choose a response', sceneType: 'interaction',
    extractedText: ['Use the evidence available before acting.'],
  });
  project = await postScene(request, project, {
    title: 'Check your judgment', sceneType: 'question',
    assessmentItem: {
      type: 'true-false', identifier: 'SIGNAL-CHECK',
      prompt: 'Is it always appropriate to act before checking the situation?',
      correctResponse: 'false',
      correctFeedback: 'Correct. Examine the situation before deciding.',
      incorrectFeedback: 'Reconsider the information you need.',
    },
    assessmentSettings: { maxAttempts: 2, passingScore: 100, scoreWeight: 1 },
  });

  response = await request.post(`/api/projects/${project.id}/assets`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    multipart: { file: { name: 'signal.png', mimeType: 'image/png', buffer: sampleImage } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  project = await response.json();
  const asset = project.storyboard.assets.find(item => item.filename === 'signal.png');
  expect(asset).toBeTruthy();

  const first = project.storyboard.scenes[0];
  response = await request.patch(`/api/projects/${project.id}/scenes/${first.id}`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: {
      imageAssets: [asset.id],
      visualLayout: {
        version: 1, enabled: true, width: 1280, height: 720,
        backgroundColor: '#ffffff', backgroundAsset: null,
        elements: [
          { id: 'signal-text', kind: 'text', name: 'Lesson heading',
            text: 'Recognize an unusual signal', x: 90, y: 95,
            width: 850, height: 110, fontSize: 42, color: '#202020' },
          { id: 'signal-image', kind: 'image', name: 'Signal image', assetId: asset.id,
            x: 100, y: 235, width: 360, height: 250 },
        ], warnings: [],
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  project = await response.json();

  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Studio 2.0 preview' }).click();
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  await expect(studio.getByRole('navigation', { name: 'Studio scenes' }).getByRole('button')).toHaveCount(3);

  await studio.getByRole('button', { name: 'Edit on stage' }).click();
  const canvas = studio.locator('.studio-inline-editor');
  await expect(canvas).toBeVisible();
  await canvas.getByRole('button', { name: 'Lesson heading element' }).click();
  await canvas.getByRole('textbox', { name: 'Studio selected text' }).fill('Recognize the first signal');
  await canvas.getByRole('button', { name: 'Studio bold' }).click();
  await canvas.getByRole('button', { name: 'Signal image element' }).click();
  await canvas.getByRole('textbox', { name: 'Studio image alternative text' })
    .fill('A small reference image illustrating a training signal.');
  await canvas.getByRole('button', { name: 'Save scene' }).click();
  await expect(canvas).toHaveCount(0);

  let saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const content = saved.storyboard.scenes[0];
  expect(content.visualLayout.elements.find(e => e.id === 'signal-text').text).toBe('Recognize the first signal');
  expect(content.visualLayout.elements.find(e => e.id === 'signal-text').bold).toBe(true);
  expect(content.imageAltText[asset.id]).toBe('A small reference image illustrating a training signal.');

  await studio.getByRole('navigation', { name: 'Studio scenes' })
    .getByRole('button', { name: /Choose a response/ }).click();
  await studio.getByRole('button', { name: 'Build learner interaction' }).click();
  const native = studio.getByRole('region', { name: 'Manual learner interaction editor' });
  await expect(native.getByText('Actual learner preview')).toBeVisible();
  await native.getByLabel('Decision prompt').fill('A warning appears while work is underway. What should happen first?');
  await native.getByLabel('Choice label').nth(0).fill('Pause and collect relevant information');
  await native.getByLabel('Choice feedback').nth(0).fill('Good judgment begins with gathering the evidence.');
  await native.getByLabel('Choice label').nth(1).fill('Proceed immediately without checking');
  await native.getByLabel('Choice feedback').nth(1).fill('Acting without context can introduce preventable risk.');
  await native.getByRole('checkbox', { name: /I reviewed the learning experience/ }).check();
  await native.getByRole('button', { name: 'Save learner interaction' }).click();
  await expect(native).toHaveCount(0);

  saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes).toHaveLength(3);
  expect(saved.storyboard.scenes[1].experience.activities[0].nodes[0].choices[0].label)
    .toBe('Pause and collect relevant information');
  expect(saved.storyboard.scenes[2].assessmentItem.correctResponse).toBe('false');

  await studio.getByRole('button', { name: 'Learner preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Studio manual golden path course preview' });
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Recognize the first signal')).toBeVisible();
  await preview.getByRole('button', { name: 'Close course preview' }).click();

  for (const profile of ['scorm-12', 'scorm-2004']) {
    const zipResponse = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(zipResponse.ok(), await zipResponse.text().catch(() => '')).toBeTruthy();
    const archive = testInfo.outputPath(`${profile}.zip`);
    const directory = testInfo.outputPath(profile);
    await fs.writeFile(archive, await zipResponse.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    const files = await fs.readdir(directory);
    expect(files).toContain('imsmanifest.xml');
    expect(files).toContain('storyboard.json');
    expect(files).toContain('player.js');
    const manifest = await fs.readFile(path.join(directory, 'imsmanifest.xml'), 'utf8');
    expect(manifest).toContain('ADL SCORM');
    const packaged = JSON.parse(await fs.readFile(path.join(directory, 'storyboard.json'), 'utf8'));
    expect(packaged.scenes).toHaveLength(3);
    expect(packaged.scenes[1].experience.activities[0].kind).toBe('branching');
    expect(packaged.scenes[2].assessmentItem.correctResponse).toBe('false');
    expect(packaged.scenes[0].imageAltText[asset.id]).toContain('training signal');
  }
  expect(postsToModel).toEqual([]);
});
