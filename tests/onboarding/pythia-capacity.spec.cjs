const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function openCapacityFixture(page, request) {
  const response = await request.post('/api/projects', { data: { title: 'Fictional capacity review' } });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  const limits = { contextChars: 100000, messageChars: 100000, historyMessages: 100,
    requestBytes: 1048576, modelInputTokens: 200000, verified: true };
  const capacity = (text = '', selected = false) => {
    const used = 2000 + [...text].length + (selected ? 80000 : 0);
    return { used: { contextChars: used, messageChars: used - 2000, historyMessages: 2,
      requestBytes: used + 1000, modelInputTokens: used + 3000 }, limits,
      status: used > 100000 ? 'full' : used >= 80000 ? 'warning' : 'available',
      exceeded: used > 100000 ? ['contextChars'] : [] };
  };
  let submissions = 0;
  const state = { sessionId: 'capacity-fixture', turns: [], configured: true,
    mode: 'hosted-text', capacity: capacity() };
  await page.route('**/pythia-conversation', async route => {
    if (route.request().method() === 'POST') submissions++;
    await route.fulfill({ status: route.request().method() === 'POST' ? 202 : 200, json: state });
  });
  await page.route('**/pythia-conversation/capacity', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: capacity(body.message, body.sourceIds.length > 0) });
  });
  await page.route('**/reference-resources', route => route.fulfill({ json: [{
    id: 'outline-ref', title: 'Fictional outline', currentVersion: 'v1',
    versions: [{ version: 'v1', extractionStatus: 'complete', passages: [
      { locator: 'line:1', text: 'a'.repeat(40000) }, { locator: 'line:2', text: 'b'.repeat(40000) } ] }],
  }] }));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Switch project', exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: 'Consult Pythia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Consult Pythia', exact: true });
  await expect(dialog.getByLabel('Your message', { exact: true })).toBeEnabled();
  return { dialog, capacity, submissions: () => submissions };
}

test('capacity includes sources, warns early and preserves an over-capacity draft', async ({ page, request }, testInfo) => {
  const fixture = await openCapacityFixture(page, request);
  const { dialog } = fixture;
  const message = dialog.getByLabel('Your message', { exact: true });
  const send = dialog.getByRole('button', { name: 'Send to Pythia', exact: true });
  await message.fill('Plan this course.');
  await expect(send).toBeEnabled();
  await dialog.getByText(/Select source text/).click();
  await dialog.getByLabel('Fictional outline', { exact: true }).check();
  await expect(dialog.getByText(/nearing its capacity/)).toBeVisible();
  await message.fill('a'.repeat(30000));
  await expect(dialog.getByRole('alert')).toContainText('exceeds the connection capacity');
  await expect(send).toBeDisabled();
  await expect(message).toHaveValue('a'.repeat(30000));
  expect(fixture.submissions()).toBe(0);
  await dialog.getByLabel('Fictional outline', { exact: true }).uncheck();
  await expect(send).toBeEnabled();
  await expect(dialog.getByText(/Conversation text:/)).toContainText('32,000');
  await expect(dialog.getByText(/Estimated model capacity:/)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.pythia-talk-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('capacity-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole('region', { name: 'Conversation capacity' }).scrollIntoViewIfNeeded();
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('capacity-mobile.png'), fullPage: true });
  await send.click();
  await expect(message).toHaveValue('');
  expect(fixture.submissions()).toBe(1);
});

test('a delayed preview cannot replace the capacity for a newer draft', async ({ page, request }) => {
  const fixture = await openCapacityFixture(page, request);
  let firstSeen = false;
  await page.route('**/pythia-conversation/capacity', async route => {
    const message = route.request().postDataJSON().message;
    if (message === 'Earlier draft') {
      firstSeen = true;
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    await route.fulfill({ json: fixture.capacity(message, message === 'Earlier draft') }).catch(() => {});
  });
  const field = fixture.dialog.getByLabel('Your message', { exact: true });
  await field.fill('Earlier draft');
  await expect.poll(() => firstSeen).toBe(true);
  await field.fill('New draft');
  await expect(fixture.dialog.getByRole('button', { name: 'Send to Pythia', exact: true })).toBeEnabled();
  await expect(fixture.dialog.getByText(/Conversation text:/)).toContainText('2,009');
  await page.waitForTimeout(1000);
  await expect(fixture.dialog.getByText(/nearing its capacity/)).toHaveCount(0);
  expect(fixture.submissions()).toBe(0);
});
