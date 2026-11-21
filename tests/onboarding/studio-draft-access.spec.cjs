const { test, expect } = require('@playwright/test');

test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio must be enabled');

// Use a disposable storyboard and its real revision checks. Only the hosted
// identity and permission decisions are controlled by the browser fixture.
async function openDraft({ page, request }) {
  const created = await request.post('/api/projects', { data: { title: 'Draft access regression' } });
  expect(created.ok()).toBeTruthy();
  const project = await created.json();
  const base = '/api/projects/' + project.id;
  const seeded = await request.post(base + '/scenes', {
    headers: { 'If-Match': '"' + project.storyboard.revision + '"' },
    data: { title: 'Stored scene', extractedText: ['Stored content'] },
  });
  expect(seeded.ok()).toBeTruthy();
  let access = 'author';
  await page.route('**/api/auth/config', route => route.fulfill({
    json: { deploymentMode: 'team', identityProvider: 'password', passwordLoginAvailable: true },
  }));
  await page.route('**/api/identity/context', route => route.fulfill(access === 'expired'
    ? { status: 401, json: {} }
    : { json: { actor: { actorId: 'test-author', actorDisplayName: 'Synthetic author' }, memberships: [{ role: 'author' }], policy: {} } }));
  await page.route('**' + base + '/permissions', route => {
    const status = { unavailable: 503, suspended: 403, expired: 401 }[access] || 200;
    return route.fulfill({ status, json: { canEdit: access === 'author', canExport: access === 'author', canManageMembers: false, canEnhance: false } });
  });
  await page.goto('/?project_id=' + project.id);
  await page.getByRole('button', { name: 'Chimera2 Studio', exact: true }).click();
  const editor = page.locator('.studio-inline-editor');
  await editor.getByRole('button', { name: 'Stored content element' }).click();
  await editor.getByRole('button', { name: 'Properties', exact: true }).click();
  const field = editor.getByRole('textbox', { name: 'Studio selected text' });
  const marker = 'Unsaved text';
  await field.fill(marker);
  await expect(editor).toHaveAttribute('data-dirty', 'true');
  const read = async () => (await (await request.get(base)).json()).storyboard;
  const original = await read();
  async function change(next) {
    access = next;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  }
  async function assertHidden() {
    await expect(editor).toHaveCount(0);
    expect(await page.evaluate(text =>
      document.body.textContent.includes(text)
      || [...document.querySelectorAll('input,textarea')].some(input => input.value.includes(text))
      || [sessionStorage, localStorage].some(storage => Object.values(storage).some(value => value.includes(text))),
    marker)).toBe(false);
  }
  return { editor, field, marker, base, original, read, change, assertHidden };
}

test('demotion and interrupted authorization preserve the draft without rebasing or autosaving', async ({ page, request }) => {
  const draft = await openDraft({ page, request });
  for (const access of ['reviewer', 'unavailable']) {
    await draft.change(access);
    await expect(page.getByText('Your unsaved scene changes are preserved', { exact: false })).toBeVisible();
    await draft.assertHidden();
    await draft.change('author');
    await expect(draft.field).toHaveValue(draft.marker);
    expect(await draft.read()).toEqual(draft.original);
  }
  const scene = draft.base + '/scenes/' + draft.original.scenes[0].id;
  const concurrent = await request.patch(scene, {
    headers: { 'If-Match': '"' + draft.original.revision + '"' }, data: { title: 'Newer stored title' },
  });
  expect(concurrent.ok()).toBeTruthy();
  const updated = (await concurrent.json()).storyboard;
  const [response] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname === scene),
    draft.editor.getByRole('button', { name: 'Save scene', exact: true }).first().click(),
  ]);
  expect(response.status()).toBe(412);
  await expect(draft.field).toHaveValue(draft.marker);
  expect(await draft.read()).toEqual(updated);
});

test('an author can explicitly save the recovered draft against its original revision', async ({ page, request }) => {
  const draft = await openDraft({ page, request });
  await draft.change('reviewer');
  await expect(page.getByText('Your unsaved scene changes are preserved', { exact: false })).toBeVisible();
  await draft.change('author');
  await expect(draft.field).toHaveValue(draft.marker);
  expect(await draft.read()).toEqual(draft.original);
  await draft.editor.getByRole('button', { name: 'Close scene controls' }).click();
  await draft.editor.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(draft.editor).toHaveAttribute('data-dirty', 'false');
  const saved = await draft.read();
  expect(saved.revision).toBe(draft.original.revision + 1);
  expect(saved.scenes[0].visualLayout.elements.some(element => element.text === draft.marker)).toBe(true);
});

for (const reason of ['suspended', 'expired']) {
  test(reason + ' access removes the draft from the session', async ({ page, request }) => {
    const draft = await openDraft({ page, request });
    await draft.change(reason);
    await expect(page.getByRole('heading', { name: reason === 'expired' ? 'Sign in to Chimera' : 'Project access unavailable' })).toBeVisible();
    await draft.assertHidden();
    if (reason === 'suspended') {
      await draft.change('author');
      await expect(draft.editor).toHaveAttribute('data-dirty', 'false');
      await expect(draft.editor.getByRole('button', { name: 'Stored content element' })).toBeVisible();
    }
    expect(await draft.read()).toEqual(draft.original);
  });
}
