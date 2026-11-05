const { test, expect } = require('@playwright/test');
const { mediaCapability } = require('./media-connection-fixtures.cjs');
test('generation animation tracks queued, running, completed and failed jobs', async ({ page, request }) => {
  let project = await (await request.post('/api/projects', { data: { title: 'Generation feedback' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'Destination scene' }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  const job = { id: 'fixture-job', sceneId: project.storyboard.scenes[0].id, kind: 'image', status: 'queued', message: 'Queued', createdAt: '2026-11-02T12:00:00Z' };
  let jobs = [], completed = false;
  await page.route('**/media-generation-capability', route => route.fulfill({ json: mediaCapability({ providerConfigured: true, canGenerate: true }) }));
  await page.route('**/media-generation-jobs', route => {
    if (route.request().method() === 'POST') { jobs = [job]; return route.fulfill({ status: 202, json: job }); }
    return route.fulfill({ json: jobs });
  });
  await page.route('**/generated-candidates', route => route.fulfill({ json: completed ? [{ id: 'candidate-fixture', jobId: job.id, sceneId: job.sceneId, kind: 'image', status: 'pending', filename: 'Destination scene - Image - Take 1.png', altText: 'Generated illustration' }] : [] }));
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.locator('.generation-creator summary').click();
  await page.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Explain the topic');
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('An instructional illustration');
  await page.getByRole('button', { name: 'Generate candidate', exact: true }).click();
  const processing = page.locator('.pythia-processing');
  const activeJob = title => processing.filter({ hasText: title });
  await expect(activeJob('Media generation queued')).toContainText('Destination scene');
  jobs = [{ ...job, status: 'running', message: 'Generating media' }];
  await expect(activeJob('Generating image')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await processing.locator('.pythia-processing-orb').evaluate(node => getComputedStyle(node, '::before').animationName)).toBe('none');
  await page.reload();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(activeJob('Generating image')).toBeVisible();
  completed = true; jobs = [{ ...job, status: 'completed', message: 'Candidate ready' }];
  await expect(page.locator('.pythia-processing')).toHaveCount(0);
  await expect(page.getByText('Your media candidate is ready to preview below.', { exact: true })).toBeVisible();
  jobs = [{ ...job, status: 'failed', error: 'Provider unavailable' }];
  await expect(page.getByRole('alert')).toContainText('Generation failed: Provider unavailable');
  await expect(page.locator('.pythia-processing')).toHaveCount(0);
});
