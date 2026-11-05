const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

const experience = {
  version: 1, heading: 'Sporting merit', introduction: 'Results should reflect performance.',
  flow: [{ label: 'Performance', description: 'Skill and effort in competition.' },
    { label: 'Results', description: 'Outcomes should follow performance.' }],
  reveals: [{ label: 'Fair Play', explanation: 'Compete within the agreed rules.' },
    { label: 'Equal Opportunity', explanation: 'A fair chance to compete.' }],
  conclusion: 'Sporting merit is a principle, not a guarantee of every result.', motion: true,
  background: '#100818', foreground: '#E8E5EA', accent: '#FF32AA', accentText: '#100818',
  diagramAccent: '#8542E8',
};
const treatment = { learningIntent: 'Explain performance and results.', rationale: 'Native diagram with learner-controlled explanations.',
  experience, productionNeeds: [{ description: 'Optional authorized background music is not implemented.', requiredBeforeApply: false }] };

async function course(request) {
  let project = await (await request.post('/api/projects', { data: { title: 'Native learning experience' } })).json();
  const response = await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'Fair competition', extractedText: ['Results should reflect performance.'],
      actionDescription: 'Use a Performance to Results diagram and click-reveals.', notes: 'No narration.' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function open(page, project) {
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
}

async function designFixture(page, request) {
  const project = await course(request);
  const scene = project.storyboard.scenes[0];
  const base = `/api/projects/${project.id}/scenes/${scene.id}`;
  const actual = await (await request.get(base + '/experience-treatment')).json();
  const fixture = { project, scene, designs: [], saves: [], applies: [], fail: false, conflict: false,
    state: actual, mediaCalls: 0 };
  await page.route(/\/experience-treatment(?:\?.*)?$/, async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON(); fixture.designs.push(data);
      if (fixture.fail) {
        fixture.state.operation = { status: 'failed', error: 'Pythia could not design this experience. Nothing was applied.' };
      } else {
        fixture.state.draft = { id: 'a'.repeat(32), status: 'pending', sourceIds: [], contextFingerprint: actual.context.fingerprint,
          treatment: data.currentTreatment || structuredClone(treatment), provenance: {
            direction: data.direction, revision: actual.context.revision, sources: [], designBrief: '',
          } };
        fixture.state.operation = { status: 'completed', error: null };
      }
      return route.fulfill({ status: 202, json: { ...fixture.state, operation: { status: 'running', error: null } } });
    }
    if (route.request().method() === 'PUT') {
      fixture.saves.push(route.request().postDataJSON());
      fixture.state.draft.treatment = route.request().postDataJSON().treatment;
    }
    return route.fulfill({ json: fixture.state });
  });
  await page.route('**/experience-treatment/apply', async route => {
    fixture.applies.push(route.request().postDataJSON());
    if (fixture.conflict) return route.fulfill({ status: 409, json: { detail: 'The scene changed. Refine before applying.' } });
    const response = await request.patch(base, { headers: { 'If-Match': `"${fixture.project.storyboard.revision}"` },
      data: { experience: route.request().postDataJSON().treatment.experience } });
    expect(response.ok(), await response.text()).toBeTruthy();
    fixture.project = await response.json();
    fixture.state.draft.status = 'applied';
    fixture.state.draft.treatment = route.request().postDataJSON().treatment;
    return route.fulfill({ json: { ...fixture.state, project: fixture.project } });
  });
  await page.route('**/media-generation-jobs', route => {
    if (route.request().method() !== 'GET') fixture.mediaCalls++;
    return route.fulfill({ json: [] });
  });
  await open(page, project);
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  return fixture;
}

test('whole-scene design previews real native assembly, preserves failed refinement edits and applies only after review', async ({ page, request }) => {
  const fixture = await designFixture(page, request);
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Direction for Pythia').fill('Use DARKROGUE plum, violet and pink; no narration. Relate performance to results.');
  expect(fixture.designs).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Ask Pythia for a scene experience', exact: true }).click();
  const preview = dialog.getByRole('region', { name: 'Executable experience preview' });
  await expect(preview.getByRole('heading', { name: 'Performance', exact: true })).toBeVisible();
  const dialogSize = await dialog.boundingBox();
  expect(dialogSize.width).toBeGreaterThan(1000);
  expect(dialogSize.width).toBeLessThanOrEqual(page.viewportSize().width - 32);
  await expect(dialog.getByRole('button', { name: 'Refine experience with Pythia', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true })).toBeDisabled();
  const fair = preview.locator('summary').filter({ hasText: 'Fair Play' });
  await fair.focus(); await fair.press('Enter');
  await expect(preview.getByText('Compete within the agreed rules.', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Show all explanations', exact: true }).click();
  await expect(preview.getByText('A fair chance to compete.', { exact: true })).toBeVisible();
  await dialog.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const bottomReachable = await dialog.evaluate(node => {
    const reveal = node.querySelector('.native-experience details:last-child');
    const lastAction = node.querySelector('.experience-actions');
    const bounds = node.getBoundingClientRect();
    return { revealBottom: reveal.getBoundingClientRect().bottom, actionsBottom: lastAction.getBoundingClientRect().bottom,
      visibleBottom: Math.min(bounds.bottom, innerHeight) };
  });
  expect(bottomReachable.revealBottom).toBeLessThanOrEqual(bottomReachable.visibleBottom);
  expect(bottomReachable.actionsBottom).toBeLessThanOrEqual(bottomReachable.visibleBottom);
  await dialog.getByRole('textbox', { name: 'Introduction', exact: true }).fill('Performance should determine the result.');
  fixture.fail = true;
  await dialog.getByRole('button', { name: 'Refine experience with Pythia', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'Pythia could not design' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Introduction', exact: true })).toHaveValue('Performance should determine the result.');
  expect(fixture.designs[1].currentTreatment.experience.introduction).toBe('Performance should determine the result.');
  await dialog.getByRole('button', { name: 'Save treatment privately', exact: true }).click();
  expect(fixture.applies).toHaveLength(0);
  expect((await (await request.get(`/api/projects/${fixture.project.id}`)).json()).storyboard.scenes[0].experience).toBeNull();
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Experience applied.' })).toBeVisible();
  expect(fixture.applies).toHaveLength(1);
  expect(fixture.mediaCalls).toBe(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const coursePreview = page.getByRole('dialog').last();
  await expect(coursePreview.locator('.native-experience')).toBeVisible();
  await coursePreview.getByRole('button', { name: 'Show all explanations', exact: true }).click();
  await expect(coursePreview.getByText('A fair chance to compete.', { exact: true })).toBeVisible();
});

test('expanded long reveals and bottom actions remain reachable in a short desktop viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  const fixture = await designFixture(page, request);
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Direction for Pythia').fill('Design a detailed learner experience.');
  await dialog.getByRole('button', { name: 'Ask Pythia for a scene experience', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Refine experience with Pythia', exact: true })).toBeEnabled();
  fixture.state.draft.treatment.experience.reveals = Array.from({ length: 8 }, (_, i) => ({
    label: `Explanation ${i + 1}`, explanation: 'A detailed explanation with readable learning content. '.repeat(30),
  }));
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  const reopened = page.getByRole('dialog').last();
  const lastExplanation = reopened.getByRole('textbox', { name: 'Explanation', exact: true }).last();
  await lastExplanation.scrollIntoViewIfNeeded();
  let editorBounds = await lastExplanation.boundingBox();
  expect(editorBounds.y).toBeGreaterThanOrEqual(16);
  expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(page.viewportSize().height - 16);
  await lastExplanation.fill('The last reveal remains reachable and editable.');
  await reopened.getByRole('textbox', { name: 'Conclusion', exact: true }).scrollIntoViewIfNeeded();
  await expect(reopened.getByRole('textbox', { name: 'Conclusion', exact: true })).toBeInViewport();
  await reopened.locator('.native-experience').getByRole('button', { name: 'Show all explanations', exact: true }).click();
  await reopened.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const bounds = await reopened.evaluate(node => ({
    dialogBottom: node.getBoundingClientRect().bottom, viewport: innerHeight,
    revealBottom: node.querySelector('.native-experience details:last-child').getBoundingClientRect().bottom,
    actionsBottom: node.querySelector('.experience-actions').getBoundingClientRect().bottom,
  }));
  expect(bounds.revealBottom).toBeLessThanOrEqual(Math.min(bounds.dialogBottom, bounds.viewport));
  expect(bounds.actionsBottom).toBeLessThanOrEqual(Math.min(bounds.dialogBottom, bounds.viewport));
  await expect(reopened.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 817, height: 768 });
  await lastExplanation.scrollIntoViewIfNeeded();
  editorBounds = await lastExplanation.boundingBox();
  expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(752);
  await reopened.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(reopened.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true })).toBeInViewport();
});

test('required production work and revision conflicts block application without losing edits', async ({ page, request }) => {
  const fixture = await designFixture(page, request);
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Direction for Pythia').fill('Include fair play reveals and optional music.');
  await dialog.getByRole('button', { name: 'Ask Pythia for a scene experience', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Refine experience with Pythia', exact: true })).toBeEnabled();
  await dialog.getByLabel('Required before applying', { exact: true }).check();
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await expect(dialog.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true })).toBeDisabled();
  await dialog.getByLabel('Required before applying', { exact: true }).uncheck();
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  fixture.conflict = true;
  await dialog.getByRole('button', { name: 'Apply reviewed experience to scene', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'The scene changed.' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Experience heading', exact: true })).toHaveValue('Sporting merit');
  expect(fixture.mediaCalls).toBe(0);
});

test('native experience reflows on mobile, supports reduced motion, accessibility and provider-free edit/reopen', async ({ page, request }) => {
  let project = await course(request);
  const changed = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { experience },
  });
  expect(changed.ok(), await changed.text()).toBeTruthy(); project = await changed.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, project);
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  const native = dialog.locator('.native-experience');
  await expect(native).toBeVisible();
  expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(358);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(native.locator('.experience-flow')).toHaveCSS('flex-direction', 'column');
  await native.getByRole('button', { name: 'Replay diagram', exact: true }).click();
  expect(await native.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await native.getByRole('button', { name: 'Show all explanations', exact: true }).click();
  await expect(native.getByText('Compete within the agreed rules.', { exact: true })).toBeVisible();
  expect(await native.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.native-experience').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Edit applied scene without Pythia', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Explanation', exact: true }).first().fill('Follow the agreed rules of competition.');
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Save reviewed native scene edits', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Native scene edits saved.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  await expect(page.getByRole('dialog').last().getByRole('textbox', { name: 'Explanation', exact: true }).first()).toHaveValue('Follow the agreed rules of competition.');
  const reopened = page.getByRole('dialog').last();
  await reopened.getByRole('button', { name: 'Restore underlying canvas', exact: true }).click();
  await reopened.getByRole('button', { name: 'Remove native experience and restore canvas', exact: true }).click();
  await expect(reopened).toHaveCount(0);
  const restored = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(restored.storyboard.scenes[0].experience).toBeNull();
  expect(restored.storyboard.scenes[0].extractedText).toEqual(project.storyboard.scenes[0].extractedText);
});

for (const profile of ['standalone', 'scorm-2004', 'scorm-12']) {
  test(`${profile} delivers the same native reveals and static alternative`, async ({ page, request }, testInfo) => {
    const project = await course(request);
    const changed = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { experience },
    });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    const zip = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(zip.ok(), await zip.text()).toBeTruthy();
    const archive = testInfo.outputPath('experience.zip'), directory = testInfo.outputPath('course');
    await fs.writeFile(archive, await zip.body()); await fs.mkdir(directory, { recursive: true });
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    let server;
    try {
      let url = pathToFileURL(path.join(directory, 'index.html')).href;
      if (profile !== 'standalone') {
        server = require('node:http').createServer(async (req, res) => {
          const file = path.resolve(directory, '.' + new URL(req.url, 'http://localhost').pathname);
          if (!file.startsWith(directory + path.sep)) return res.writeHead(403).end();
          try {
            const body = await fs.readFile(file.endsWith(path.sep) ? path.join(file, 'index.html') : file);
            res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' }).end(body);
          } catch { res.writeHead(404).end(); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        url = `http://127.0.0.1:${server.address().port}/index.html`;
      }
      await page.goto(url);
      const native = page.locator('.native-experience');
      await expect(native.getByRole('heading', { name: 'Performance', exact: true })).toBeVisible();
      const reveal = native.locator('summary').filter({ hasText: 'Fair Play' });
      await reveal.focus(); await reveal.press('Space');
      await expect(native.getByText('Compete within the agreed rules.', { exact: true })).toBeVisible();
      await native.getByRole('button', { name: 'Show all explanations', exact: true }).click();
      await expect(native.getByText('A fair chance to compete.', { exact: true })).toBeVisible();
      await native.getByRole('button', { name: 'Close all explanations', exact: true }).click();
      await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
      await expect(native.getByText('A fair chance to compete.', { exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page }).include('.native-experience').analyze()).violations).toEqual([]);
    } finally {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    }
  });
}
