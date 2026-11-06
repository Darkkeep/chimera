const { test, expect } = require('@playwright/test');

async function openSuggestions(page, request, width) {
  if (width) await page.setViewportSize({ width, height: 844 });
  let project = await (await request.post('/api/projects', { data: { title: 'Expansion review fixture' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'Competition', extractedText: ['Performance', 'Results'], actionDescription: 'Already authored.' },
  })).json();
  project = await (await request.post(`/api/projects/${project.id}/authoring/prepare`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  })).json();
  const response = await request.post(`/api/projects/${project.id}/enhancement-proposals`, {
    data: { targetSceneId: project.storyboard.scenes[0].id, field: 'additionalScenes',
      proposedValue: [{ title: 'Performance matters', extractedText: ['Demonstrate the relevant skill.'],
        narration: 'Explain the criteria.', notes: 'External research still needs review.' }],
      rationale: 'Expand the original topic without replacing it.', origin: 'ai' },
  });
  expect(response.ok()).toBe(true);
  let retries = 0;
  await page.route('**/enhancement-jobs', route => {
    if (route.request().method() !== 'GET') {
      retries++;
      return route.fulfill({ status: 500, json: { detail: 'No model calls in this test.' } });
    }
    return route.fulfill({ json: [{ id: 'legacy-zero', status: 'completed', sourceRevision: project.storyboard.revision,
      provider: 'Legacy fixture', model: 'deterministic', message: 'Created 0 pending proposal(s)', error: null,
      resourceConflicts: [], progress: 100, estimatedInputTokens: 10, estimatedCostUsd: null, proposalIds: [] }] });
  });
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Review tools', exact: true }).click();
  await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
  return { project, dialog: page.getByRole('dialog'), retries: () => retries };
}

for (const width of [1280, 390]) {
  test(`expansion review retains the original, applies explicitly and undoes safely at ${width}px`, async ({ page, request }) => {
    const { project, dialog, retries } = await openSuggestions(page, request, width);
    await expect(dialog.getByRole('status').filter({ hasText: 'An earlier run completed without suggestions' })).toBeVisible();
    const proposal = dialog.locator('.enhancement-proposal');
    await expect(proposal.getByText('Original scene is retained', { exact: true })).toBeVisible();
    await expect(proposal.locator('dd').last()).toContainText('Performance matters');
    await expect(proposal.locator('dd').last()).toContainText('Explain the criteria.');
    await expect(proposal.locator('dd').last()).toContainText('External research still needs review.');
    await expect(proposal.getByRole('button', { name: 'Edit values', exact: true })).toHaveCount(0);
    const before = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(before.storyboard.scenes).toEqual(project.storyboard.scenes);
    await proposal.getByRole('button', { name: 'Accept change', exact: true }).click();
    await expect(proposal.getByRole('button', { name: 'Undo acceptance', exact: true })).toBeVisible();
    const accepted = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(accepted.storyboard.scenes.map(scene => scene.title)).toEqual(['Competition', 'Performance matters']);
    expect(accepted.storyboard.scenes[0]).toEqual(project.storyboard.scenes[0]);
    const refreshed = page.waitForResponse(response => response.url().endsWith(`/api/projects/${project.id}`) && response.request().method() === 'GET');
    await page.reload();
    await refreshed;
    await expect(page.getByRole('button', { name: 'Consult Pythia', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review tools', exact: true }).click();
    await page.getByRole('button', { name: 'Review suggestions', exact: true }).click();
    await page.getByRole('button', { name: 'Undo acceptance', exact: true }).click();
    await expect(page.locator('.enhancement-proposal-status')).toHaveText('reversed');
    const reversed = await (await request.get(`/api/projects/${project.id}`)).json();
    expect(reversed.storyboard.scenes).toEqual(project.storyboard.scenes);
    expect(retries()).toBe(0);
  });
}
