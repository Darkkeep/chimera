const { test, expect } = require('@playwright/test');

// Separate interaction scene: saved visual scenes contain timelines and must not
// be overwritten by native experiences. This verifies the genuinely manual path.
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio preview is explicitly opt-in');

test('manual native interaction is authored, previewed and persisted inline without Pythia', async ({ page, request }) => {
  let response = await request.post('/api/projects', { data: { title: 'Manual native interaction smoke' } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  response = await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { title: 'A decision without AI', sceneType: 'interaction' },
  });
  expect(response.ok()).toBeTruthy();
  project = await response.json();

  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  const resume = page.getByRole('button', { name: 'Resume authoring', exact: true });
  if (await resume.isVisible()) await resume.click();

  await page.getByRole('button', { name: 'Studio 2.0 preview' }).click();
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  const modelPosts = [];
  page.on('request', req => {
    if (req.method() === 'POST' && /pythia|conversation|design|treatment/.test(req.url())) modelPosts.push(req.url());
  });

  await studio.getByRole('button', { name: 'Build learner interaction' }).click();
  const editor = studio.getByRole('region', { name: 'Manual learner interaction editor' });
  await expect(editor).toBeVisible();
  await expect(page.locator('.modal-backdrop .experience-dialog')).toHaveCount(0);
  await expect(editor.getByText('Actual learner preview')).toBeVisible();

  await editor.getByRole('textbox', { name: 'Experience heading' }).fill('Choose a defensible next step');
  await editor.getByRole('checkbox', { name: /I reviewed the learning experience/ }).check();
  await editor.getByRole('button', { name: 'Save learner interaction' }).click();
  await expect(editor).toHaveCount(0);

  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const native = saved.storyboard.scenes[0].experience;
  expect(native.heading).toBe('Choose a defensible next step');
  expect(native.activities[0].kind).toBe('branching');
  await expect(studio.getByText('Choose a defensible next step').first()).toBeVisible();
  expect(modelPosts).toEqual([]);
});
