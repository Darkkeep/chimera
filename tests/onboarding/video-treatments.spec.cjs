const { test, expect } = require('@playwright/test');

const treatment = {
  title: 'Inspect before opening', purpose: 'Recognize the inspection step',
  rationale: 'Separate inspection from action.',
  shots: [
    { text: 'Inspect the valve.', durationSeconds: 6, transition: 'fade' },
    { text: 'Only then open it.', durationSeconds: 6, transition: 'none' },
  ],
  productionNeeds: ['Spoken narration is suggested but not implemented.'],
};

async function treatmentFixture(page, request, inEditor = false) {
  let project = await (await request.post('/api/projects', { data: { title: 'Scene-aware video design' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Valve inspection', extractedText: ['Inspect before opening.'], narration: 'Check the valve for damage.',
      actionDescription: 'Emphasize the inspection step.', notes: 'Use plain language.' },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  const scene = project.storyboard.scenes[0];
  const connection = { id: 'narration-111111111111', name: 'Shotstack test', provider: 'shotstack', executor: 'chimera',
    configured: true, supports: ['video'], readyFor: ['video'], models: { video: 'shotstack-video' },
    revisions: { video: 'fixture-r1' }, voice: '', language: 'en-US', reason: '' };
  const defaults = { scene: null, image: null, narration: null, video: connection.id };
  await page.route('**/media-generation-capability', route => route.fulfill({ json: {
    providerConfigured: true, canGenerate: true, imageConfigured: false, videoConfigured: true,
    narrationConnections: [], connectionOptions: [connection], defaultConnections: defaults,
  } }));
  await page.route('**/api/ai-connections', route => route.fulfill({ json: { connections: [connection], defaults, videoUnavailableReason: '' } }));
  const fixture = { project, scene, connection, designs: [], saves: [], renders: [], failDesign: false, failSave: false,
    context: { sourceRevision: project.storyboard.revision, fingerprint: 'fixture-context', scene: {
      title: scene.title, extractedText: scene.extractedText, narration: scene.narration,
      actionDescription: scene.actionDescription, notes: scene.notes,
    }, designBrief: 'New operators; safe valve inspection.' }, draft: null, operation: null };
  await page.route('**/video-treatment', route => {
    if (route.request().method() === 'POST') {
      fixture.designs.push(route.request().postDataJSON());
      if (fixture.failDesign) {
        fixture.operation = { requestId: 'fixture-design', status: 'failed', error: 'Pythia could not design this treatment. Nothing was rendered.' };
      } else {
        const request = route.request().postDataJSON();
        fixture.draft = { sourceRevision: fixture.context.sourceRevision,
          treatment: request.currentTreatment || structuredClone(treatment),
          designBrief: request.includeDesignBrief ? fixture.context.designBrief : '',
          usesDesignBrief: request.includeDesignBrief };
        fixture.operation = { requestId: request.requestId, status: 'completed', error: null };
      }
      return route.fulfill({ status: 202, json: { context: fixture.context, draft: fixture.draft,
        operation: { requestId: 'fixture-design', status: 'running', error: null } } });
    }
    if (route.request().method() === 'PUT') {
      fixture.saves.push(route.request().postDataJSON());
      if (fixture.failSave) return route.fulfill({ status: 409, json: { detail: 'The agreed brief changed. Refine the treatment before saving or rendering.' } });
      fixture.draft = { ...fixture.draft, ...route.request().postDataJSON() };
    }
    return route.fulfill({ json: { context: fixture.context, draft: fixture.draft, operation: fixture.operation } });
  });
  await page.route('**/media-generation-jobs', route => {
    if (route.request().method() === 'POST') {
      fixture.renders.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { id: 'fixture-render', sceneId: scene.id, kind: 'video', status: 'queued' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/generated-candidates', route => route.fulfill({ json: [] }));
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  if (inEditor) {
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Edit scene', exact: true }).click();
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    await page.locator('.generation-creator > summary').click();
  } else await openTreatment(page);
  return fixture;
}

test('scene editor exposes scene-aware treatment requests without starting a render', async ({ page, request }) => {
  const fixture = await treatmentFixture(page, request, true);
  const editor = page.getByRole('dialog').last();
  const panel = editor.getByRole('region', { name: 'Scene-aware video treatment' });
  await panel.getByText('Context shared with Pythia when you request a treatment', { exact: true }).click();
  await expect(panel.getByText('Check the valve for damage.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Emphasize the inspection step.', { exact: true })).toBeVisible();
  expect(fixture.designs).toEqual([]);
  expect(fixture.renders).toEqual([]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await panel.getByRole('textbox', { name: 'Video design direction', exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole('textbox', { name: 'Video design direction', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`scene-editor-media-${width}.png`) });
  }
});

async function openTreatment(page) {
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.locator('.generation-creator > summary').click();
  await expect(page.getByRole('combobox', { name: 'Video workflow', exact: true })).toHaveValue('design');
}

test('scene-aware Shotstack design is reviewed, edited and refined before an explicit render', async ({ page, request }) => {
  const fixture = await treatmentFixture(page, request);
  const panel = page.getByRole('region', { name: 'Scene-aware video treatment' });
  await panel.getByText('Context shared with Pythia when you request a treatment', { exact: true }).click();
  await expect(panel.getByText('Check the valve for damage.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Emphasize the inspection step.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Use plain language.', { exact: true })).toBeVisible();
  await expect(panel.getByText('New operators; safe valve inspection.', { exact: true })).toBeVisible();
  expect(fixture.designs).toHaveLength(0);
  expect(fixture.renders).toHaveLength(0);
  await panel.getByRole('textbox', { name: 'Video design direction', exact: true }).fill('Help new operators recognize the inspection step.');
  await panel.getByRole('spinbutton', { name: 'Treatment duration (seconds)', exact: true }).fill('12');
  await panel.getByRole('button', { name: 'Propose treatment with Pythia', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toHaveValue('Inspect the valve.');
  expect(fixture.designs[0]).toMatchObject({ direction: 'Help new operators recognize the inspection step.',
    sourceRevision: fixture.project.storyboard.revision, durationSeconds: 12, includeDesignBrief: true, currentTreatment: null });
  expect(fixture.renders).toHaveLength(0);
  await expect(panel.getByText('Spoken narration is suggested but not implemented.', { exact: true })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Shot 1 text', exact: true }).fill('Look for damage before opening.');
  await panel.getByRole('spinbutton', { name: 'Shot 2 seconds', exact: true }).fill('30');
  await expect(panel.getByRole('button', { name: 'Render reviewed treatment', exact: true })).toBeDisabled();
  await panel.getByRole('spinbutton', { name: 'Shot 2 seconds', exact: true }).fill('6');
  await panel.getByRole('button', { name: 'Add text shot', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Render reviewed treatment', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Remove shot 3', exact: true }).click();
  await panel.getByRole('checkbox', { name: 'Include the agreed design brief in the design request', exact: true }).uncheck();
  await panel.getByRole('textbox', { name: 'Video design direction', exact: true }).fill('Keep my first shot and improve the ending.');
  await panel.getByRole('button', { name: 'Refine treatment with Pythia', exact: true }).click();
  await expect(panel.locator('.pythia-processing')).toHaveCount(0);
  expect(fixture.designs).toHaveLength(2);
  expect(fixture.designs[1].includeDesignBrief).toBe(false);
  expect(fixture.designs[1].currentTreatment.shots[0].text).toBe('Look for damage before opening.');
  await panel.getByRole('textbox', { name: 'Treatment title', exact: true }).fill('My inspection sequence');
  await panel.getByRole('button', { name: 'Save treatment edits', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Nothing has been rendered');
  expect(fixture.renders).toHaveLength(0);
  await page.reload();
  await openTreatment(page);
  await expect(panel.getByRole('textbox', { name: 'Treatment title', exact: true })).toHaveValue('My inspection sequence');
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toHaveValue('Look for damage before opening.');
  await panel.getByRole('button', { name: 'Render reviewed treatment', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Render submitted');
  expect(fixture.renders).toHaveLength(1);
  expect(fixture.renders[0]).toMatchObject({ kind: 'video', sceneId: fixture.scene.id, connectionId: fixture.connection.id,
    prompt: 'My inspection sequence', durationSeconds: 12, width: 1280, height: 720,
    videoTreatment: { sourceRevision: fixture.project.storyboard.revision, treatment: fixture.draft.treatment } });
  expect(fixture.renders[0]).not.toHaveProperty('designBrief');
  expect(fixture.renders[0]).not.toHaveProperty('scene');
  await expect(panel.getByRole('button', { name: 'Render reviewed treatment', exact: true })).toBeDisabled();
});

test('failed design preserves editable treatment and a save conflict cannot trigger a render', async ({ page, request }) => {
  const fixture = await treatmentFixture(page, request);
  const panel = page.getByRole('region', { name: 'Scene-aware video treatment' });
  await panel.getByRole('textbox', { name: 'Video design direction', exact: true }).fill('Emphasize inspection.');
  await panel.getByRole('button', { name: 'Propose treatment with Pythia', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Shot 1 text', exact: true }).fill('My preserved edit.');
  fixture.failSave = true;
  await panel.getByRole('button', { name: 'Render reviewed treatment', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('brief changed');
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toHaveValue('My preserved edit.');
  expect(fixture.renders).toHaveLength(0);
  fixture.failSave = false;
  await panel.getByRole('button', { name: 'Save treatment edits', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Nothing has been rendered');
  await panel.getByRole('textbox', { name: 'Shot 1 text', exact: true }).fill('My unsaved refinement edit.');
  fixture.failDesign = true;
  await panel.getByRole('button', { name: 'Refine treatment with Pythia', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Nothing was rendered');
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toHaveValue('My unsaved refinement edit.');
  fixture.context.designBrief = 'A changed brief';
  await panel.getByRole('button', { name: /^Refresh context and status/ }).click();
  await expect(panel.getByText(/scene context or agreed brief changed/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Render reviewed treatment', exact: true })).toBeDisabled();
});

test('mobile treatment review wraps context and remains keyboard accessible', async ({ page, request }) => {
  const AxeBuilder = require('@axe-core/playwright').default;
  await page.setViewportSize({ width: 390, height: 844 });
  await treatmentFixture(page, request);
  const panel = page.getByRole('region', { name: 'Scene-aware video treatment' });
  await panel.getByRole('textbox', { name: 'Video design direction', exact: true }).fill('Make a readable inspection sequence.');
  await panel.getByRole('button', { name: 'Propose treatment with Pythia', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  await expect(panel.getByRole('textbox', { name: 'Shot 1 text', exact: true })).toBeEnabled();
  await panel.getByRole('textbox', { name: 'Shot 1 text', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('spinbutton', { name: 'Shot 1 seconds', exact: true })).toBeFocused();
  const results = await new AxeBuilder({ page }).include('.video-treatment').analyze();
  expect(results.violations).toEqual([]);
});
