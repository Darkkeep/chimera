const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startChimera, createProject, saveScene, guide, openWorkspaceMenu } = require('../onboarding/helpers.cjs');
test.setTimeout(60000);

async function studio(page) {
  await startChimera(page);
  await createProject(page, 'Progressive synthetic authoring');
  await saveScene(page, 'Original author scene');
  await guide(page).getByRole('button', {name:'Next',exact:true}).click();
  await guide(page).getByRole('button', {name:'Close guide'}).click();
  await openWorkspaceMenu(page);
  await page.getByRole('button',{name:'Studio 2.0 preview',exact:true}).click();
  const panel=page.getByRole('region',{name:'Progressive scene proposals'});
  await expect(panel).toBeVisible();
  return panel;
}
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
  await page.getByRole('button',{name:'Studio 2.0 preview',exact:true}).click();
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
