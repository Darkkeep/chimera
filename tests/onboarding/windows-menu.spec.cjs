const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio opt-in');
async function setup(page, request) {
  let project = await (await request.post('/api/projects', {data:{title:'Menu behavior synthetic'}})).json();
  for (const title of ['First menu scene', 'Second menu scene']) {
    const response=await request.post(`/api/projects/${project.id}/scenes`, {headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title,extractedText:['A short instruction.']}});
    expect(response.ok()).toBeTruthy(); project=await response.json();
  }
  await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);
  await page.goto('/'); await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
  const menu=page.getByRole('button',{name:'Show workspace menu',exact:true}); if(await menu.isVisible())await menu.click();
  await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
  const editor=page.locator('.studio-inline-editor');await expect(editor).toBeVisible();
  return {project,editor};
}
async function command(editor, group, name) {
  await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true}).click();
  await editor.getByRole('menuitem',{name,exact:true}).click();
}
for(const width of [1440,1100,390])test(`native command lists overlay without moving the canvas at ${width}`,async({page,request},info)=>{
  await page.setViewportSize({width,height:1000});const {editor}=await setup(page,request);
  await page.evaluate(() => document.fonts.ready);
  const canvas=editor.locator('.visual-stage-frame');const initial=await canvas.boundingBox();
  const bar=editor.getByRole('toolbar',{name:'Scene menus'});
  await expect(bar.getByRole('button',{name:'Background',exact:true})).toHaveCount(0);
  await expect(bar.getByRole('button',{name:'Timeline',exact:true})).toHaveCount(0);
  for(const group of ['Scene','Insert','Format','Animate','Layers','View','Preview']) {
    await bar.getByRole('button',{name:group,exact:true}).click();
    const menu=editor.getByRole('menu',{name:group+' menu',exact:true});await expect(menu).toBeVisible();
    const box=await canvas.boundingBox();for(const key of ['x','y','width','height'])expect(box[key]).toBeCloseTo(initial[key],0);
    expect(await menu.evaluate(node=>node.matches(':popover-open'))).toBe(true);
    const bounds=await menu.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    if(group==='Layers')await page.screenshot({path:info.outputPath(`layers-dropdown-${width}.png`),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(bar.getByRole('button',{name:group,exact:true})).toBeFocused();
  }
  await command(editor,'Layers','Scene background…');const dialog=page.getByRole('dialog',{name:'Background',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:/^Background color #/})).toBeVisible();await dialog.getByRole('button',{name:'Close scene controls'}).click();
  await expect(canvas).toBeVisible();
});
test('real pointer movement switches an open command menu',async({page,request})=>{
  const {editor}=await setup(page,request);
  const bar=editor.getByRole('toolbar',{name:'Scene menus'});
  await bar.getByRole('button',{name:'Scene',exact:true}).click();
  await expect(editor.getByRole('menu',{name:'Scene menu',exact:true})).toBeVisible();
  await bar.getByRole('button',{name:'Format',exact:true}).hover();
  await expect(editor.getByRole('menu',{name:'Format menu',exact:true})).toBeVisible();
  await bar.getByRole('button',{name:'Insert',exact:true}).hover();
  await expect(editor.getByRole('menu',{name:'Insert menu',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor.getByRole('menu',{name:'Insert menu',exact:true})).toBeHidden();
});

test('keyboard commands, text insertion, Undo and scene properties reuse the existing draft',async({page,request})=>{
  const {editor}=await setup(page,request);const bar=editor.getByRole('toolbar',{name:'Scene menus'});
  const count=await editor.locator('.visual-editable').count();
  await bar.getByRole('button',{name:'Insert',exact:true}).focus();await page.keyboard.press('ArrowDown');
  await expect(editor.getByRole('menuitem',{name:'Text',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(editor.locator('.visual-editable')).toHaveCount(count+1);await bar.getByRole('button',{name:'Undo canvas edit'}).click();
  await expect(editor).toHaveAttribute('data-dirty','false');
  await bar.getByRole('button',{name:'Format',exact:true}).click();
  await bar.getByRole('button',{name:'Scene',exact:true}).click();
  await expect(editor.getByRole('menu',{name:'Scene menu',exact:true})).toBeVisible();
  await bar.getByRole('button',{name:'Scene',exact:true}).click();
  await expect(editor.getByRole('menu',{name:'Scene menu',exact:true})).toBeHidden();
  await command(editor,'Scene','Properties…');const dialog=page.getByRole('dialog',{name:'Scene properties',exact:true});
  await dialog.getByRole('textbox',{name:'Scene title',exact:true}).fill('Changed in a floating dialog');
  await dialog.getByRole('button',{name:'Close scene controls'}).click();await expect(editor).toHaveAttribute('data-dirty','true');
  await page.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Second menu scene/}).click();
  await expect(page.getByRole('dialog',{name:'Unsaved scene changes',exact:true})).toBeVisible();
});
test('Preview offers isolated scene and whole-experience playback without changing course progress',async({page,request})=>{
  const {project}=await setup(page,request);
  await page.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Second menu scene/}).click();
  const row=page.locator('.studio-stage-toolbar');
  await row.getByRole('button',{name:'Preview',exact:true}).click();await row.getByRole('menuitem',{name:'Whole experience',exact:true}).click();
  const course=page.getByRole('dialog',{name:'Menu behavior synthetic course preview',exact:true});await expect(course).toBeVisible();
  await course.getByRole('button',{name:'Close course preview'}).click();
  const before=await page.evaluate(id=>localStorage.getItem('chimera.preview.'+id),project.id);
  await row.getByRole('button',{name:'Preview',exact:true}).click();await row.getByRole('menuitem',{name:'This scene',exact:true}).click();
  const scene=page.getByRole('dialog',{name:'Menu behavior synthetic scene preview',exact:true});await expect(scene).toBeVisible();
  await expect(scene).toContainText('Second menu scene');await expect(scene).toContainText('Previewing this scene');await expect(scene).toContainText('SCENE 01 / 01');
  await scene.getByRole('button',{name:'Close course preview'}).click();
  expect(await page.evaluate(id=>localStorage.getItem('chimera.preview.'+id),project.id)).toBe(before);
  await row.getByRole('button',{name:'Preview',exact:true}).click();await row.getByRole('menuitem',{name:'Whole experience',exact:true}).click();
  await course.getByRole('button',{name:'Contents',exact:true}).click();await expect(course.getByRole('navigation',{name:'Table of contents'}).getByRole('button',{name:/First menu scene|Second menu scene/})).toHaveCount(2);
});
