const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio must be enabled');

// Disposable real storage/revisions; identity and network decisions are fixtures.
async function setup({ page, request }, { freshLogin = false, holdInitial = false } = {}) {
  const projects = [];
  const suffix = require('node:crypto').randomUUID().slice(0, 8);
  for (const label of ['Navigation A', 'Navigation B']) {
    const title = label + ' ' + suffix;
    const created = await request.post('/api/projects', { data: { title } });
    expect(created.ok()).toBeTruthy();
    const p = await created.json();
    const seeded = await request.post(`/api/projects/${p.id}/scenes`, {
      headers: { 'If-Match': `"${p.storyboard.revision}"` },
      data: { title: label + ' scene', extractedText: [label + ' private text'] },
    });
    expect(seeded.ok()).toBeTruthy(); projects.push(await seeded.json());
  }
  let signedIn = !freshLogin;
  const modes = new Map(projects.map(p => [p.id, holdInitial ? 'hold' : 'author']));
  const releases = [];
  const counts = new Map();
  await page.route('**/api/auth/config', route => route.fulfill({ json: {
    deploymentMode: 'team', identityProvider: freshLogin ? 'darkrogue' : 'password', passwordLoginAvailable: !freshLogin,
    darkrogue: { sessionUrl: 'https://authority.example.test/session', signInUrl: 'https://authority.example.test/sign-in' },
  } }));
  await page.route('https://authority.example.test/session', route => route.fulfill({ headers: {
    'access-control-allow-origin': 'http://127.0.0.1:5187', 'access-control-allow-credentials': 'true',
  }, json: { token: 'fixture-handoff' } }));
  await page.route('**/api/auth/darkrogue', route => { signedIn = true; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/auth/logout', route => { signedIn = false; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/admission/status', route => route.fulfill({ json: { admitted: true } }));
  await page.route('**/api/identity/context', route => route.fulfill(signedIn
    ? { json: { actor: { actorId: 'navigation-author', actorDisplayName: 'Synthetic author' }, memberships: [{ role: 'author' }], policy: {} } }
    : { status: 401, json: {} }));
  for (const p of projects) {
    await page.route(`**/api/projects/${p.id}/permissions`, async route => {
      counts.set(p.id, (counts.get(p.id) || 0) + 1);
      let mode = modes.get(p.id);
      if (mode === 'hold') { await new Promise(resolve => releases.push(resolve)); mode = modes.get(p.id); }
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fulfill({ status: mode === 'failure' ? 503 : mode === 'revoked' ? 403 : 200,
        headers: { 'Server-Timing': 'chimera;dur=12, authority;dur=9;desc="1 checks"' },
        json: { canEdit: mode !== 'reviewer', canExport: mode !== 'reviewer', canManageMembers: false, canEnhance: false },
      }).catch(() => {});
    });
  }
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), projects[0].id);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
  const focus = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const open = index => page.getByRole('button', { name: 'Edit ' + projects[index].title, exact: true }).click();
  async function release() {
    for (const p of projects) if (modes.get(p.id) === 'hold') modes.set(p.id, 'author');
    releases.splice(0).forEach(resolve => resolve());
  }
  async function draft() {
    if (await page.getByRole('button', { name: 'Chimera2 Studio', exact: true }).count())
      await page.getByRole('button', { name: 'Chimera2 Studio', exact: true }).click();
    const editor = page.locator('.studio-inline-editor');
    await editor.getByRole('button', { name: 'Navigation A private text element', exact: true }).click();
    await editor.getByRole('button', { name: 'Properties', exact: true }).click();
    const field = editor.getByRole('textbox', { name: 'Studio selected text' });
    await field.fill('Unsaved navigation draft');
    await field.evaluate(node => { node.dataset.mountMarker = 'retained'; });
    return { editor, field };
  }
  return { projects, modes, counts, release, open, nav, focus, draft };
}

async function measured(testInfo, label, action) {
  const start = Date.now(); await action(); const elapsedMs = Date.now() - start;
  await testInfo.attach(label, { body: JSON.stringify({ operation: label, elapsedMs }), contentType: 'application/json' });
  expect(elapsedMs, label + ' must not wait for project verification').toBeLessThan(1500);
}

test('fresh DARKROGUE login and first opening keep My Work navigable during a slow access check', async ({ page, request }, testInfo) => {
  const state = await setup({ page, request }, { freshLogin: true, holdInitial: true });
  await measured(testInfo, 'open-unverified-project', async () => {
    await state.open(0); await expect(page.getByRole('heading', { name: 'Opening project' })).toBeVisible();
  });
  await expect(page.getByText('Navigation A private text', { exact: true })).toHaveCount(0);
  await measured(testInfo, 'my-work-during-check', async () => {
    await state.nav.getByRole('button', { name: 'My Work', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  });
  await state.release(); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Opening project' })).toHaveCount(0);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Chimera' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with DARKROGUE' }).click();
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
});

test('My Work round trips retain the mounted unsaved draft; changing project still requires a decision', async ({ page, request }, testInfo) => {
  const state = await setup({ page, request }); await state.open(0);
  const draft = await state.draft();
  for (let index = 0; index < 2; index++) {
    await measured(testInfo, 'draft-to-my-work-' + index, async () => {
      await state.nav.getByRole('button', { name: 'My Work', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
    });
    const count = state.counts.get(state.projects[0].id);
    await measured(testInfo, 'resume-same-project-' + index, async () => {
      await page.getByRole('button', { name: 'Edit ' + state.projects[0].title, exact: true }).click(); await expect(draft.field).toBeVisible();
    });
    await expect(draft.field).toHaveValue('Unsaved navigation draft');
    await expect(draft.field).toHaveAttribute('data-mount-marker', 'retained');
    expect((state.counts.get(state.projects[0].id) || 0) - count).toBeLessThanOrEqual(1); // A scheduled poll may coincide.
  }
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click(); await state.open(1);
  await expect(page.getByRole('heading', { name: 'Unsaved scene changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click(); await expect(draft.field).toHaveValue('Unsaved navigation draft');
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click(); await state.open(1);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: state.projects[1].title, exact: true })).toBeVisible();
  // Returning to A still verifies fresh rights, without blocking My Work or
  // rendering the prior draft before that decision.
  state.modes.set(state.projects[0].id, 'hold');
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click();
  await state.open(0);
  await expect(page.getByRole('heading', { name: 'Opening project' })).toBeVisible();
  await expect(page.getByText('Unsaved navigation draft', { exact: true })).toHaveCount(0);
  await measured(testInfo, 'return-my-work-during-revisit', async () => { await state.nav.getByRole('button', { name: 'My Work', exact: true }).click(); await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible(); });
  await state.release(); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  await expect(page.getByRole('heading', { name: state.projects[0].title, exact: true })).toBeVisible();
});

test('slow and failed permission checks keep navigation available; retries recover and revocation conceals content', async ({ page, request }) => {
  const state = await setup({ page, request }); await state.open(0); const draft = await state.draft();
  state.modes.set(state.projects[0].id, 'failure'); await state.focus();
  await expect(page.getByText('Connection interrupted.', { exact: false })).toBeVisible();
  await expect(draft.field).toHaveValue('Unsaved navigation draft');
  await expect(page.locator('[data-project-surface]')).toHaveAttribute('inert', '');
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
  const before = state.counts.get(state.projects[0].id);
  await page.getByRole('button', { name: 'Retry project access' }).click();
  await expect.poll(() => state.counts.get(state.projects[0].id)).toBeGreaterThan(before);
  state.modes.set(state.projects[0].id, 'slow'); await page.getByRole('button', { name: 'Retry project access' }).click();
  await expect(page.locator('[data-project-surface]')).not.toHaveAttribute('inert', '');
  await expect(draft.field).toHaveValue('Unsaved navigation draft');
  state.modes.set(state.projects[0].id, 'revoked'); await state.focus();
  await expect(page.getByRole('heading', { name: 'Project access unavailable' })).toBeVisible();
  await expect(page.getByText('Unsaved navigation draft', { exact: true })).toHaveCount(0);
  await expect(page.locator('.studio-inline-editor')).toHaveCount(0);
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click(); await state.open(1);
  await expect(page.getByRole('heading', { name: state.projects[1].title, exact: true })).toBeVisible();
  const diagnostics = await page.evaluate(() => performance.getEntriesByType('measure').filter(e => e.name.startsWith('chimera.access.')).map(e => e.detail));
  expect(diagnostics.some(item => item.status === 503)).toBe(true);
  expect(diagnostics.some(item => item.authorityMs === 9)).toBe(true);
  expect(JSON.stringify(diagnostics)).not.toMatch(/Unsaved navigation|Navigation A|fixture-handoff|navigation-author/);
});

test('an initial access outage has an actionable retry inside a navigable shell', async ({ page, request }) => {
  const state = await setup({ page, request }); state.modes.set(state.projects[1].id, 'failure'); await state.open(1);
  await expect(page.getByText('Project verification could not finish.', { exact: false })).toBeVisible();
  await expect(page.getByText('Navigation B private text', { exact: true })).toHaveCount(0);
  state.modes.set(state.projects[1].id, 'author'); await page.getByRole('button', { name: 'Retry project access' }).click();
  await expect(page.getByRole('heading', { name: 'Opening project' })).toHaveCount(0);
});


test('a stalled project read does not hijack My Work when it eventually completes', async ({ page, request }, testInfo) => {
  const state = await setup({ page, request }); await state.open(0);
  await expect(page.getByRole('heading', { name: 'Opening project' })).toHaveCount(0);
  await state.nav.getByRole('button', { name: 'My Work', exact: true }).click();
  await page.route(`**/api/projects/${state.projects[1].id}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 2000)); await route.continue();
  });
  await measured(testInfo, 'start-slow-project-read', async () => { await state.open(1); await expect(page.getByRole('heading', { name: 'Opening project' })).toBeVisible(); });
  await measured(testInfo, 'my-work-during-project-read', async () => { await state.nav.getByRole('button', { name: 'My Work', exact: true }).click(); await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible(); });
  await page.waitForResponse(r => new URL(r.url()).pathname === `/api/projects/${state.projects[1].id}`);
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
});

test('an identity timeout becomes an actionable sign-in retry in ten seconds', async ({ page }) => {
  test.setTimeout(30000);
  let slow = true;
  await page.route('**/api/auth/config', route => route.fulfill({ json: { deploymentMode: 'team', identityProvider: 'password', passwordLoginAvailable: true } }));
  await page.route('**/api/identity/context', async route => {
    if (slow) await new Promise(resolve => setTimeout(resolve, 11500));
    await route.fulfill({ json: { actor: { actorId: 'fixture-author', actorDisplayName: 'Synthetic author' }, memberships: [{ role: 'author' }], policy: {} } }).catch(() => {});
  });
  const start = Date.now(); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connecting to Chimera' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible({ timeout: 12000 });
  expect(Date.now() - start).toBeLessThan(13000);
  slow = false; await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  const diagnostic = await page.evaluate(() => performance.getEntriesByName('chimera.access.identity').map(e => e.detail));
  expect(diagnostic.some(item => item.status === 'TimeoutError' && item.elapsedMs >= 9500)).toBe(true);
});
