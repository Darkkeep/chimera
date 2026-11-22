const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startChimera, createProject, saveScene, guide, openWorkspaceMenu } = require('../onboarding/helpers.cjs');
test.setTimeout(90000);

async function studio(page) {
  await startChimera(page);
  await createProject(page, 'Progressive synthetic authoring');
  await saveScene(page, 'Original author scene');
  await guide(page).getByRole('button', {name:'Next',exact:true}).click();
  await guide(page).getByRole('button', {name:'Close guide'}).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
  const panel=page.getByRole('region',{name:'Progressive scene proposals'});
  await expect(panel).toBeVisible();
  return panel;
}
test('accept, edit and save the first scene while the second arrives without interrupting the editor', async ({page}, info) => {
  const providerPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/pythia|\/content-drafts?|\/enhancement-jobs|\/conversation/.test(request.url())) providerPosts.push(request.url());
  });
  const panel = await studio(page);
  await panel.getByRole('button', {name:'Start progressive demo'}).click();
  const first = panel.getByRole('article', {name:'Draft proposal: Inspect before use'});
  await expect(first.locator('.scene-player-surface')).toBeVisible();
  await expect(panel.getByText('1 of 2 complete drafts available · Generation continues')).toBeVisible();
  await first.getByRole('button', {name:'Accept and edit', exact:true}).click();
  const editor = page.locator('.studio-inline-editor');
  await expect(editor).toHaveAttribute('data-scene-id', /progressive-.*-scene-1/);
  const acceptedId = await editor.getAttribute('data-scene-id');
  await editor.locator('.visual-editable').first().dblclick();
  const text = editor.getByRole('textbox', {name:'Edit canvas text'});
  await text.fill('Author improved the first scene while generation continued.');
  await text.press('Tab');
  await editor.getByRole('button', {name:'Save scene', exact:true}).click();
  await expect(editor).toHaveAttribute('data-dirty', 'false');
  await expect(panel.getByText('1 of 2 complete drafts available · Generation continues')).toBeVisible();
  const projectId = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const saved = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const savedScene = saved.storyboard.scenes.find(scene => scene.id === acceptedId);
  expect(savedScene.visualLayout.elements.some(element => element.text === 'Author improved the first scene while generation continued.')).toBe(true);
  // Keep a fresh, unsaved edit focused while the real producer delivers scene 2.
  await editor.locator('.visual-editable').first().dblclick();
  await text.fill('Still composing; keep my cursor here.');
  await expect(text).toBeFocused();
  const editorNode = await editor.elementHandle();
  const textNode = await text.elementHandle();
  const second = panel.getByRole('article', {name:'Draft proposal: Respond to a defect'});
  await expect(second).toBeVisible({timeout:40000});
  await expect(panel.getByText('Generation: completed')).toBeVisible();
  expect(await editorNode.evaluate(node => node.isConnected && node === document.querySelector('.studio-inline-editor'))).toBe(true);
  expect(await textNode.evaluate(node => node.isConnected && node === document.activeElement)).toBe(true);
  await expect(editor).toHaveAttribute('data-scene-id', acceptedId);
  await expect(text).toHaveValue('Still composing; keep my cursor here.');
  await expect(second.getByRole('button', {name:'Accept scene',exact:true})).toBeEnabled();
  const nav = page.getByRole('navigation', {name:'Studio scenes'});
  await expect(nav.locator('.studio-scene')).toHaveCount(2);
  await expect(nav.locator('.studio-scene[aria-current="true"]')).toContainText('Inspect before use');
  const after = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(after.storyboard.revision).toBe(saved.storyboard.revision);
  expect(after.storyboard.scenes.find(scene => scene.id === acceptedId)).toEqual(savedScene);
  expect(providerPosts).toEqual([]);
  await page.screenshot({path:info.outputPath('milestone-1-edit-while-generating.png'),fullPage:true});
  // Replaying scene 2 must not insert it, reset the editor, or duplicate proposals.
  await panel.getByRole('button', {name:'Reconnect proposals'}).click();
  await expect(panel.getByRole('article')).toHaveCount(2);
  expect(await editorNode.evaluate(node => node.isConnected)).toBe(true);
  await expect(editor.locator('.visual-editable').first()).toContainText('Still composing; keep my cursor here.');
  await expect(editor).toHaveAttribute('data-dirty', 'true');
  await second.getByRole('button', {name:'Accept scene',exact:true}).click();
  const guard = page.getByRole('dialog', {name:'Unsaved scene changes',exact:true});
  await expect(guard).toBeVisible();
  await guard.getByRole('button', {name:'Keep editing'}).click();
  await expect(editor).toHaveAttribute('data-dirty', 'true');
  await second.getByRole('button', {name:'Accept scene',exact:true}).click();
  await guard.getByRole('button', {name:'Save changes',exact:true}).click();
  await expect(guard).toHaveCount(0);
  await expect(nav.locator('.studio-scene')).toHaveCount(3);
  const final = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(final.storyboard.scenes.find(scene => scene.id === acceptedId).visualLayout.elements.some(element => element.text === 'Still composing; keep my cursor here.')).toBe(true);
  expect(providerPosts).toEqual([]);
});
test('a complete scene renders before completion, reconnects, and only acceptance saves it', async ({page},info) => {
  const panel=await studio(page);
  const nav=page.getByRole('navigation',{name:'Studio scenes'});
  await panel.getByRole('button',{name:'Start progressive demo'}).click();
  const draft=panel.getByRole('article',{name:'Draft proposal: Inspect before use'});
  await expect(draft).toBeVisible();
  await expect(draft.locator('.scene-player-surface')).toBeVisible();
  await expect(panel.getByText('1 of 2 complete drafts available · Generation continues')).toBeVisible();
  await expect(nav.locator('.studio-scene')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('first-scene-before-completion.png'),fullPage:true});
  await panel.getByRole('button',{name:'Reconnect proposals'}).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await draft.getByRole('button',{name:'Accept scene',exact:true}).click();
  await expect(nav.locator('.studio-scene')).toHaveCount(2);
  await expect(draft.getByText(/accepted/)).toBeVisible();
  await expect(panel.getByText('Generation: completed')).toBeVisible({timeout:40000});
  const second=panel.getByRole('article',{name:'Draft proposal: Respond to a defect'});
  await second.getByRole('button',{name:'Reject scene'}).click();
  await expect(second.getByText(/rejected/)).toBeVisible();
  await expect(nav.locator('.studio-scene')).toHaveCount(2);
});
test('cancel keeps proposals noncanonical and survives browser reconnect', async ({page}) => {
  const panel=await studio(page);
  await panel.getByRole('button',{name:'Start progressive demo'}).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await panel.getByRole('button',{name:'Cancel generation'}).click();
  await expect(panel.getByText('Generation: cancelled')).toBeVisible();
  await panel.getByRole('button',{name:'Reconnect proposals'}).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await expect(panel.getByRole('button',{name:'Accept scene',exact:true})).toBeDisabled();
  await expect(page.getByRole('navigation',{name:'Studio scenes'}).locator('.studio-scene')).toHaveCount(1);
  await page.unroute('**/api/projects');
  await page.reload();
  await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
  await expect(panel.getByText('Generation: cancelled')).toBeVisible();
  await expect(panel.getByRole('article')).toHaveCount(1);
});

test('an unsaved author edit is retained when acceptance requests review', async ({page}) => {
  const panel=await studio(page);
  await panel.getByRole('button',{name:'Start progressive demo'}).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  const editor=page.locator('.studio-inline-editor');
  await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'Scene',exact:true}).click();
  await editor.getByRole('menuitem',{name:'Properties…',exact:true}).click();
  const properties=page.getByRole('dialog',{name:'Scene properties',exact:true});
  await properties.getByRole('textbox',{name:'Scene title',exact:true}).fill('My unsaved author edit');
  await properties.getByRole('button',{name:'Close scene controls'}).click();
  await panel.getByRole('button',{name:'Accept scene',exact:true}).click();
  const guard=page.getByRole('dialog',{name:'Unsaved scene changes',exact:true});
  await expect(guard).toBeVisible();
  await guard.getByRole('button',{name:'Keep editing'}).click();
  await expect(editor).toHaveAttribute('data-dirty','true');
  await expect(page.getByRole('navigation',{name:'Studio scenes'}).locator('.studio-scene')).toHaveCount(1);
  await panel.getByRole('button',{name:'Cancel generation'}).click();
});

test('proposal controls remain accessible across narrow and wide Studio layouts', async ({page}, info) => {
  const panel=await studio(page);
  await panel.getByRole('button',{name:'Start progressive demo'}).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  for(const width of [320,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    // The responsive navigation closes itself on a breakpoint change. Wait for
    // that settled state rather than clicking an already-disappearing desktop toggle.
    if(width<=760)await expect(page.getByRole('button',{name:'Show workspace menu',exact:true})).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    const bounds=await panel.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
    const violations=(await new AxeBuilder({page}).include('.progressive-authoring').analyze()).violations;
    expect(violations).toEqual([]);
    if(width===320 || width===1440)await panel.screenshot({path:info.outputPath(`proposal-${width}.png`)});
  }
});
