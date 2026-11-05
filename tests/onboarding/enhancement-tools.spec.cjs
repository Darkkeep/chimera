const { test, expect } = require('@playwright/test');

async function openToolReview(page, request, ready = true, initialStatus = 'failed') {
  let project = await (await request.post('/api/projects', { data: { title: 'Tool orchestration fixture' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'Fair play', extractedText: ['Performance and results.'] },
  })).json();
  project = await (await request.post(`/api/projects/${project.id}/authoring/prepare`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  const submissions = [], previews = [];
  let jobs = [];
  let failNextPoll = false;
  await page.route('**/enhancement-jobs/preview', route => {
    const body = route.request().postDataJSON();
    previews.push(body);
    return route.fulfill({ json: { sourceRevision: project.storyboard.revision, sceneCount: 1, resourceCount: 0,
      estimatedInputTokens: 100, estimatedCostUsd: null, engineConfigured: ready, webResearchAvailable: ready,
      tools: [{ name: 'research.synthesize', description: 'Registered Research Specialist.' },
        { name: 'storyboard.analyze', description: 'Registered Storyboard Producer.' }],
      maxProviderRequests: body.useTools ? 7 : 1, payload: body } });
  });
  await page.route('**/enhancement-jobs', route => {
    if (route.request().method() === 'GET' && failNextPoll) {
      failNextPoll = false;
      return route.fulfill({ status: 503, json: { detail: 'Synthetic status outage' } });
    }
    if (route.request().method() === 'GET') return route.fulfill({ json: jobs });
    const body = route.request().postDataJSON();
    submissions.push(body);
    jobs = [{ id: 'enhancement-0123456789ab', sourceRevision: project.storyboard.revision,
      status: initialStatus, createdAt: new Date(Date.now() - 65000).toISOString(),
      progress: initialStatus === 'failed' ? 100 : 10, provider: 'Synthetic local Pythia', model: 'fixture', ...body,
      message: 'Tools completed; final drafting failed', error: 'Nothing was applied. Inspect retained tool results.',
      proposalIds: [], resourceConflicts: [], estimatedInputTokens: 100, estimatedCostUsd: null,
      toolExecutions: [{ sequence: 1, tool: 'research_web', instruction: 'Public fair-play criteria', status: 'completed',
        result: { boundary: 'Provider-cited synthesis', sources: ['Public reference'] } },
      { sequence: 2, tool: 'storyboard.analyze', instruction: 'Develop a learner-controlled explanation', status: 'completed',
        result: { provider: 'storyboard-producer', draft: { recommendation: 'Compare performance and results.' } } }],
      researchSources: [{ id: 'web-0123456789abcdef', title: 'Public fair-play reference',
        url: 'https://example.org/fair-play', version: '2026-11-04T20:00:00Z', evidenceKind: 'web-search-synthesis',
        passages: [{ locator: 'provider-synthesis', text: 'Public evidence about participation criteria.' }] }] }];
    return route.fulfill({ status: 202, json: jobs[0] });
  });
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
  return { project, dialog: page.getByRole('dialog'), submissions, previews,
    setJobStatus: status => { jobs = jobs.map(job => ({ ...job, status })); },
    failPoll: () => { failNextPoll = true; } };
}

test('status refresh failure keeps activity visible and completion removes it', async ({ page, request }) => {
  const { dialog, setJobStatus, failPoll } = await openToolReview(page, request, true, 'running');
  await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
  await dialog.getByRole('button', { name: 'Submit run', exact: true }).click();
  const banner = page.getByRole('complementary', { name: 'Active enhancements' });
  await expect(banner).toBeVisible();
  failPoll();
  await expect(dialog.getByRole('alert')).toContainText('The run may still be active');
  await expect(banner).toBeVisible();
  setJobStatus('completed');
  await expect(banner).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`active enhancement is prominent, survives scrolling/reload and ends on failure at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const { dialog, setJobStatus } = await openToolReview(page, request, true, 'queued');
    await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
    await dialog.getByRole('button', { name: 'Submit run', exact: true }).click();
    const banner = page.getByRole('complementary', { name: 'Active enhancements' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('status')).toHaveText('Enhancement queued');
    await expect(banner).toContainText('elapsed');
    const elapsed = await banner.locator('.enhancement-elapsed').textContent();
    await expect(banner.locator('.enhancement-elapsed')).not.toHaveText(elapsed);
    setJobStatus('running');
    await expect(banner.getByRole('status')).toHaveText('Enhancement in progress');
    await dialog.locator('.enhancement-submission-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const bounds = await banner.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThan(844);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(banner.locator('svg')).toHaveCSS('animation-name', 'none');
    await page.reload();
    await page.getByRole('button', { name: 'Review tools', exact: true }).click();
    await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
    await expect(banner.getByRole('status')).toHaveText('Enhancement in progress');
    setJobStatus('failed');
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  });

  test(`author explicitly permits tools and research; execution evidence survives failure and reload at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const { project, dialog, submissions, previews } = await openToolReview(page, request);
    const tools = dialog.getByRole('checkbox', { name: 'Enable specialist tool orchestration', exact: true });
    const web = dialog.getByRole('checkbox', { name: 'Search the public web before drafting', exact: true });
    await expect(tools).not.toBeChecked();
    await expect(web).toBeDisabled();
    await tools.check();
    await web.check();
    await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Permitted authoring tools' })).toContainText('research.synthesize');
    await expect(dialog.getByRole('region', { name: 'Permitted authoring tools' })).toContainText('required before drafting');
    await expect(dialog.getByRole('button', { name: 'Submit run', exact: true })).toBeEnabled();
    expect(previews[0]).toMatchObject({ useTools: true, allowWebResearch: true });
    await tools.uncheck();
    await expect(web).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Submit run', exact: true })).toHaveCount(0);
    await tools.check();
    await web.check();
    await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
    await dialog.getByRole('button', { name: 'Submit run', exact: true }).click();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ useTools: true, allowWebResearch: true });
    await dialog.getByText('Tool execution · 2 completed', { exact: true }).click();
    await expect(dialog.getByText('research_web · completed', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Public fair-play reference', exact: true })).toHaveAttribute('href', 'https://example.org/fair-play');
    await dialog.getByText('Inspect cited synthesis', { exact: true }).click();
    await expect(dialog.getByText('Public evidence about participation criteria.', { exact: true })).toBeVisible();
    const persisted = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(persisted.storyboard).toEqual(project.storyboard);
    const loaded = page.waitForResponse(response => response.url().endsWith(`/api/projects/${project.id}`) && response.request().method() === 'GET');
    await page.reload(); await loaded;
    await page.getByRole('button', { name: 'Review tools', exact: true }).click();
    await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
    await page.getByText('Tool execution · 2 completed', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Public fair-play reference', exact: true })).toBeVisible();
    expect(submissions).toHaveLength(1);
  });
}

test('unsupported tool or web connection blocks submission instead of silently falling back', async ({ page, request }) => {
  const { dialog, submissions } = await openToolReview(page, request, false);
  await dialog.getByRole('checkbox', { name: 'Enable specialist tool orchestration', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Search the public web before drafting', exact: true }).check();
  await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Submit run', exact: true })).toBeDisabled();
  await expect(dialog.getByText('Public web research: unavailable on this connection', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(0);
});
