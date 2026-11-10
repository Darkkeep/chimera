const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');

for (const width of [1280, 390]) {
  test(`hosted initial scenes remain proposals until acceptance at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await request.post('/api/projects', { data: { title: `Hosted storyboard ${crypto.randomUUID()}` } });
    expect(response.ok()).toBeTruthy();
    const project = await response.json();
    let submitted = 0;
    let complete = false;
    const job = { id: 'hosted-fixture-job', status: 'running', sourceRevision: project.storyboard.revision,
      provider: 'Pythia hosted drafting', model: 'engine-managed', message: 'Preparing draft', error: null,
      resourceConflicts: [], progress: 50, estimatedInputTokens: 100, estimatedCostUsd: null, proposalIds: [] };
    await page.route('**/enhancement-jobs/preview', route => route.fulfill({ json: {
      sourceRevision: project.storyboard.revision, sceneCount: 0, resourceCount: 0, estimatedInputTokens: 100,
      estimatedCostUsd: null, engineConfigured: true, payload: { scenes: [], references: [] },
    } }));
    await page.route('**/enhancement-jobs', async route => {
      if (route.request().method() === 'POST') {
        submitted++;
        const proposal = await request.post(`/api/projects/${project.id}/enhancement-proposals`, { data: {
          changes: [{ targetSceneId: null, field: 'additionalScenes', proposedValue: [
            { title: 'Practise the agreed task', extractedText: ['Complete one meaningful practice task.'], narration: 'Follow the worked example.' },
          ] }], rationale: 'Create scenes from the agreed design.', origin: 'ai', provider: 'Pythia hosted drafting',
        } });
        expect(proposal.ok()).toBeTruthy();
        complete = true;
        return route.fulfill({ status: 202, json: job });
      }
      return route.fulfill({ json: submitted ? [{ ...job, status: complete ? 'completed' : 'running', progress: 100, proposalIds: ['fixture-proposal'] }] : [] });
    });
    await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
    await page.goto('/');
    await page.getByRole('button', { name: 'Review tools', exact: true }).click();
    await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Enhancement goal', exact: true }).fill('Storyboard the agreed external design.');
    await dialog.getByRole('button', { name: 'Preview submission', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Submit run', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Submit run', exact: true }).click();
    const proposal = dialog.locator('.enhancement-proposal');
    await expect(proposal.getByText('Empty storyboard', { exact: true })).toBeVisible();
    await expect(proposal.getByText('Practise the agreed task', { exact: false })).toBeVisible();
    expect((await (await request.get(`/api/projects/${project.id}`)).json()).storyboard.scenes).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('hosted-storyboard-review.png'), fullPage: true });
    await proposal.getByRole('button', { name: 'Accept change', exact: true }).click();
    await expect(proposal.getByRole('button', { name: 'Undo acceptance', exact: true })).toBeVisible();
    const accepted = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(accepted.storyboard.scenes.map(scene => scene.title)).toEqual(['Practise the agreed task']);
    await proposal.getByRole('button', { name: 'Undo acceptance', exact: true }).click();
    await expect(proposal.locator('.enhancement-proposal-status')).toHaveText('reversed');
    expect((await (await request.get(`/api/projects/${project.id}`)).json()).storyboard.scenes).toHaveLength(0);
    expect(submitted).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
