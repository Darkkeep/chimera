const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  // The isolated Vite server uses 5187; preserve the production API's explicit
  // 5173 origin allowlist rather than broadening it for a test server.
  await page.route(/\/pythia-conversation(?:\/.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const response = await route.fetch({ url: 'http://127.0.0.1:8027' + path,
      headers: { ...route.request().headers(), origin: 'http://127.0.0.1:5173' },
    });
    await route.fulfill({ response });
  });
});

async function openConversation(page, request, title) {
  let response = await request.post('/api/projects', { data: { title } });
  expect(response.ok()).toBeTruthy();
  let project = await response.json();
  response = await request.post(`/api/projects/${project.id}/scenes`, { data: {
    title: 'Fictional approval queue', extractedText: ['Staff explain the procedure accurately, but requests wait three days for approval.'],
  }, headers: { 'If-Match': `"${project.storyboard.revision}"` } });
  expect(response.ok()).toBeTruthy();
  project = await response.json();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Switch project', exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: 'Talk to Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Talk to Pythia', exact: true });
  await expect(dialog.getByLabel('Your message', { exact: true })).toBeEnabled();
  return { project, dialog };
}

test('a failed Pythia submit preserves the draft and does not retry automatically', async ({ page, request }) => {
  let submissions = 0;
  await page.route('**/pythia-conversation', route => {
    if (route.request().method() === 'POST') {
      submissions++;
      return route.fulfill({ status: 503, json: { detail: 'Synthetic transport unavailable. Retry explicitly.' } });
    }
    return route.fallback();
  });
  const { dialog } = await openConversation(page, request, 'Pythia failure UI');
  await dialog.getByLabel('Your message', { exact: true }).fill('A fictional test question.');
  await dialog.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic transport unavailable');
  await expect(dialog.getByLabel('Your message', { exact: true })).toHaveValue('A fictional test question.');
  await dialog.getByLabel('Your message', { exact: true }).fill('An edited question.');
  expect(submissions).toBe(1);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
});

test('real local Pythia answers, revises and recovers browser history', async ({ page, request }, testInfo) => {
  test.skip(process.env.CHIMERA_PYTHIA_LIVE_BROWSER !== '1', 'Explicit opt-in for two real provider consultations');
  test.setTimeout(180000);
  const { project, dialog } = await openConversation(page, request, 'Fictional Pythia direct browser qualification');
  await dialog.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'tools verified' })).toBeVisible({ timeout: 20000 });
  await dialog.getByLabel(/Include current scene text/).check();
  await dialog.getByLabel('Your message', { exact: true }).fill('For this fictional case, should we begin by producing a training course? Give two short paragraphs of advice.');
  await dialog.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(dialog.locator('.pythia-talk-answer')).toHaveCount(1, { timeout: 90000 });
  await expect(dialog.getByRole('button', { name: 'Send to Pythia', exact: true })).toBeDisabled(); // Empty composer after acceptance.
  await dialog.getByLabel(/Include current scene text/).uncheck();
  await dialog.getByLabel('Your message', { exact: true }).fill('Correction: observation now shows staff enter the wrong approval category because two labels are ambiguous. Revise your advice in two short paragraphs.');
  await dialog.getByRole('button', { name: 'Send to Pythia', exact: true }).click();
  await expect(dialog.locator('.pythia-talk-answer')).toHaveCount(2, { timeout: 90000 });
  const answers = await dialog.locator('.pythia-talk-answer > div > p').allTextContents();
  expect(answers[0].length).toBeGreaterThan(100);
  expect(answers[1].length).toBeGreaterThan(100);
  expect(answers[1]).not.toEqual(answers[0]);
  const state = await (await request.get(`/api/projects/${project.id}/pythia-conversation`)).json();
  expect(state.turns.map(turn => turn.result.producer_id)).toEqual(['live-chatgpt-text-v1', 'live-chatgpt-text-v1']);
  expect(state.turns[0].context.sceneId).toBe(project.storyboard.scenes[0].id);
  expect(state.turns.every(turn => turn.result.stopping_boundary === 'advisory-only')).toBe(true);
  const current = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(current.storyboard.revision).toBe(project.storyboard.revision);
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('pythia-live-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close Pythia conversation', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Talk to Pythia', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Talk to Pythia', exact: true });
  await expect(restored.locator('.pythia-talk-answer')).toHaveCount(2);
  expect(await restored.locator('.pythia-talk-answer > div > p').allTextContents()).toEqual(answers);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await restored.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pythia-live-mobile.png'), fullPage: true });
});
