const { test, expect } = require('@playwright/test');
const { guide, startChimera, createProject, saveScene } = require('./helpers.cjs');
const themes = [['DARKROGUE','purple','rgb(24, 21, 41)'],['Classic Dark','dark','rgb(21, 26, 32)'],['Light Temple','light','rgb(255, 253, 249)']];
for (const width of [1440,1100,390]) {
  test(`whole app theme switching, persistence and menu at ${width}`, async ({ page }) => {
    await page.setViewportSize({width,height:1000});
    await page.route('**/api/projects', route => route.request().method()==='GET' ? route.fulfill({json:[]}) : route.continue());
  await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-appearance','purple');
    if (width === 390) await page.getByRole('button',{name:'Show workspace menu',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    for (const [label,value,color] of themes) {
      await page.getByRole('radio',{name:label,exact:true}).check();
      await expect(page.locator('html')).toHaveAttribute('data-appearance',value);
      await expect(page.locator('.sidebar')).toHaveCSS('background-color',color);
      await expect(page.locator('.workspace-menu-toggle')).toHaveCSS('background-color',color);
      await expect(page.locator('.management-header')).toHaveCSS('background-color',color);
      await expect(page.getByRole('radio',{name:label,exact:true})).toBeChecked();
      await page.screenshot({path:`docs/qualification/founder-refinement-003/themes-${value}-${width}.png`,fullPage:true});
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-appearance','light');
    if (width === 390) await page.getByRole('button',{name:'Show workspace menu',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('radio',{name:'DARKROGUE',exact:true}).check();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-appearance','purple');
  });
}
test('theme changes preserve active scene draft and authored stage colors', async ({ page }) => {
  test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true');
  await startChimera(page);
  await createProject(page,'Theme qualification synthetic');
  await saveScene(page,'Theme isolation');
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await guide(page).getByRole('button',{name:'Close guide'}).click();
  await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
  const editor=page.locator('.studio-inline-editor');
  await expect(editor).toBeVisible();
  await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'Insert',exact:true}).click();
  await editor.getByRole('menuitem',{name:'Text',exact:true}).click();
  await expect(editor).toHaveAttribute('data-dirty','true');
  const before=await editor.locator('.visual-editable').evaluateAll(nodes=>nodes.map(n=>({style:n.getAttribute('style'),text:n.textContent})));
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  for (const [label,,color] of themes) {
    await page.getByRole('radio',{name:label,exact:true}).check();
    await expect(page.locator('.studio-shell')).toHaveCSS('background-color',color);
    await expect(editor).toHaveAttribute('data-dirty','true');
    expect(await editor.locator('.visual-editable').evaluateAll(nodes=>nodes.map(n=>({style:n.getAttribute('style'),text:n.textContent})))).toEqual(before);
    await expect(editor.getByRole('button',{name:'Save scene',exact:true})).toBeVisible();
  }
});
