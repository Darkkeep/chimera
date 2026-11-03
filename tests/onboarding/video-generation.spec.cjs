const { test, expect } = require('@playwright/test');

for (const provider of ['shotstack', 'synthesia']) {
  test(`${provider}: video-only installation submits a 30-second candidate request`, async ({ page, request }) => {
    let project = await (await request.post('/api/projects', { data: { title: `${provider} video authoring` } })).json();
    project = await (await request.post(`/api/projects/${project.id}/scenes`, {
      data: { title: 'Video destination', narration: 'Inspect the valve before opening it.' },
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
    })).json();
    const connection = { id: 'narration-111111111111', name: `${provider} video`, provider, executor: 'chimera',
      configured: true, supports: ['video'], readyFor: ['video'], models: { video: `${provider}-video` },
      revisions: { video: 'fixture-r1' }, voice: '', language: 'en-US', reason: '' };
    const defaults = { scene: null, image: null, narration: null, video: connection.id };
    await page.route('**/media-generation-capability', route => route.fulfill({ json: {
      providerConfigured: true, canGenerate: true, imageConfigured: false, videoConfigured: true,
      videoUnavailableReason: '', narrationConnections: [], connectionOptions: [connection], defaultConnections: defaults,
    } }));
    await page.route('**/api/ai-connections', route => route.fulfill({ json: { connections: [connection], defaults, videoUnavailableReason: '' } }));
    const submissions = [];
    let jobs = [];
    await page.route('**/media-generation-jobs', route => {
      if (route.request().method() === 'POST') {
        submissions.push(route.request().postDataJSON());
        jobs = [{ id: 'fixture-render', sceneId: project.storyboard.scenes[0].id, kind: 'video', status: 'running', message: 'Video render submitted', provider, providerOperationId: 'remote-render-123' }];
        return route.fulfill({ status: 202, json: jobs[0] });
      }
      return route.fulfill({ json: jobs });
    });
    await page.route('**/generated-candidates', route => route.fulfill({ json: [] }));
    await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Media library', exact: true }).click();
    await page.locator('.generation-creator summary').click();
    await expect(page.getByRole('combobox', { name: 'Media type', exact: true })).toHaveValue('video');
    await expect(page.getByRole('combobox', { name: 'AI connection', exact: true })).toHaveValue(connection.id);
    await page.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Explain the valve');
    await page.getByRole('textbox', { name: provider === 'synthesia' ? 'Video title' : 'Title text', exact: true }).fill('Inspect the valve');
    const duration = page.getByRole('spinbutton', { name: provider === 'synthesia' ? 'Maximum duration (seconds)' : 'Duration (seconds)', exact: true });
    await expect(duration).toHaveValue('30');
    await duration.fill('31');
    await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeDisabled();
    await duration.fill('30');
    if (provider === 'synthesia') {
      await expect(page.getByRole('textbox', { name: 'Presenter script', exact: true })).toHaveValue('Inspect the valve before opening it.');
      await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeDisabled();
      await page.getByRole('textbox', { name: 'Synthesia avatar ID', exact: true }).fill('authorized_avatar');
    } else {
      await expect(page.getByText(/Text\/title clip with fades/)).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Presenter script', exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('textbox', { name: 'Style', exact: true })).toHaveCount(0);
    await duration.fill('3');
    await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeDisabled();
    await duration.fill('4');
    await expect(page.getByRole('button', { name: 'Generate candidate', exact: true })).toBeEnabled();
    await duration.fill('30');
    await page.getByRole('button', { name: 'Generate candidate', exact: true }).click();
    await expect(page.locator('.pythia-processing').filter({ hasText: 'Generating video' })).toBeVisible();
    await expect(page.getByText('remote-render-123', { exact: true })).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      kind: 'video', connectionId: connection.id, durationSeconds: 30, width: 1280, height: 720,
      style: '', prompt: 'Inspect the valve', avatar: provider === 'synthesia' ? 'authorized_avatar' : '',
      script: provider === 'synthesia' ? 'Inspect the valve before opening it.' : '',
    });
    expect(submissions[0]).not.toHaveProperty('apiKey');
  });
}
