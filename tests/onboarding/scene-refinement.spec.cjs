const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio explicitly opt-in');
async function setup(page, request) {
  let project = await (await request.post('/api/projects', {data:{title:'Refinement 003 synthetic'}})).json();
  for (const title of ['First scene', 'Second scene']) {
    const response=await request.post(`/api/projects/${project.id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title,extractedText:['A short useful instruction.']}});
    expect(response.ok()).toBeTruthy();project=await response.json();
  }
  const other=await (await request.post('/api/projects',{data:{title:'Other synthetic project'}})).json();
  await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);
  await page.goto('/');await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
  const showMenu=page.getByRole('button',{name:'Show workspace menu',exact:true}); if(await showMenu.isVisible()) await showMenu.click();
  await page.getByRole('button',{name:'Studio 2.0 preview',exact:true}).click();
  await page.getByRole('button',{name:'Stage',exact:true}).click();
  const editor=page.locator(`.studio-inline-editor[data-scene-id="${project.storyboard.scenes[0].id}"]`);
  return {project,other,editor};
}
async function dirty(editor) {
  await editor.getByRole('button',{name:'First scene element',exact:true}).click();
  if (!await editor.getByRole('textbox',{name:'Studio selected text',exact:true}).isVisible()) await editor.getByRole('button',{name:'Properties',exact:true}).click();
  await editor.getByRole('textbox',{name:'Studio selected text',exact:true}).fill('Draft must survive');
  await expect(editor).toHaveAttribute('data-dirty','true');
}
const prompt=page=>page.getByRole('dialog',{name:'Unsaved scene changes',exact:true});
const paths={
  scene: async(page)=>page.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Second scene/}).click(),
  classic: async(page)=>page.getByRole('button',{name:'Classic storyboard',exact:true}).click(),
  workspace: async(page)=>page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('button',{name:'Media library',exact:true}).click(),
  management: async(page)=>page.getByRole('button',{name:'My Work',exact:true}).click(),
  project: async(page,other)=>page.getByLabel('Switch project',{exact:true}).selectOption(other.id),
  preview: async(page)=>page.getByRole('button',{name:'Learner preview',exact:true}).click(),
};
for(const [name,navigate] of Object.entries(paths)) {
  test(`unsaved ${name}: keep editing and explicit discard`, async({page,request})=>{
    const {editor,other}=await setup(page,request);await dirty(editor);
    await navigate(page,other);await expect(prompt(page)).toBeVisible();
    await prompt(page).getByRole('button',{name:'Keep editing',exact:true}).click();
    await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Draft must survive');
    await navigate(page,other);await prompt(page).getByRole('button',{name:'Discard changes',exact:true}).click();
    await expect(editor).toHaveCount(0);await expect(prompt(page)).toHaveCount(0);
  });
}
for(const [name,navigate] of Object.entries(paths)) test(`unsaved ${name}: save then navigate`,async({page,request})=>{
  const {editor,project,other}=await setup(page,request);await dirty(editor);
  await navigate(page,other);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(editor).toHaveCount(0);await expect(prompt(page)).toHaveCount(0);
  const stored=await (await request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes[0].visualLayout.elements.some(e=>e.text==='Draft must survive')).toBe(true);
});
test('save before navigation uses persisted source, while stale save preserves draft',async({page,request})=>{
  const {editor,project}=await setup(page,request);await dirty(editor);
  await paths.preview(page);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Refinement 003 synthetic course preview',exact:true})).toBeVisible();
  let stored=await (await request.get(`/api/projects/${project.id}`)).json();
  expect(stored.storyboard.scenes[0].visualLayout.elements.some(e=>e.text==='Draft must survive')).toBe(true);
  await page.getByRole('button',{name:'Close course preview'}).click();await page.getByRole('button',{name:'Stage'}).click();
  await editor.getByRole('button',{name:'Draft must survive element',exact:true}).click();
  if (!await editor.getByRole('textbox',{name:'Studio selected text',exact:true}).isVisible()) await editor.getByRole('button',{name:'Properties',exact:true}).click();
  await editor.getByRole('textbox',{name:'Studio selected text'}).fill('Stale draft retained');
  stored=await (await request.get(`/api/projects/${project.id}`)).json();
  const changed=await request.patch(`/api/projects/${project.id}/scenes/${stored.storyboard.scenes[0].id}`,{headers:{'If-Match':`"${stored.storyboard.revision}"`},data:{notes:'Concurrent author write'}});expect(changed.ok()).toBeTruthy();
  await paths.scene(page);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(prompt(page).getByRole('alert')).toBeVisible();
  await prompt(page).getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Stale draft retained');
  await expect(editor.getByRole('alert')).toContainText('changed');
});
test('undo to clean skips prompt; keyboard menus expose supported surfaces',async({page,request})=>{
  const {editor}=await setup(page,request);const menu=editor.getByRole('toolbar',{name:'Scene menus'});
  await expect(editor.locator('.scene-timeline')).not.toHaveAttribute('open');
  await expect(editor.getByRole('region',{name:'Contextual properties'})).toBeHidden();
  await menu.getByRole('button',{name:'Scene',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(menu.getByRole('button',{name:'Insert',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await editor.getByRole('menuitem',{name:'Text',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','true');
  await editor.getByRole('button',{name:'Undo canvas edit'}).click();await expect(editor).toHaveAttribute('data-dirty','false');
  await menu.getByRole('button',{name:'Layers',exact:true}).click();await editor.getByRole('menuitem',{name:'Scene background…',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Background',exact:true})).toBeVisible();await editor.getByRole('button',{name:'Close scene controls'}).click();
  await editor.locator('.scene-timeline > summary').click();await expect(editor.locator('.scene-timeline')).toHaveAttribute('open','');
  await paths.scene(page);await expect(prompt(page)).toHaveCount(0);await expect(editor).toHaveCount(0);await expect(page.locator('.studio-inline-editor')).toHaveAttribute('data-dirty','false');
});
test('native refresh protection retains dirty draft when cancelled',async({page,request})=>{
  const {editor}=await setup(page,request);await dirty(editor);
  const dialog=page.waitForEvent('dialog');const reload=page.reload({timeout:2000}).catch(()=>{});
  const native=await dialog;expect(native.type()).toBe('beforeunload');await native.dismiss();await reload;
  await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Draft must survive');
});
for(const width of [1440,1100,390])test(`compact scene layout ${width}`,async({page,request},info)=>{
  await page.setViewportSize({width,height:1000});const {editor}=await setup(page,request);
  if(width===390) { /* Mobile menu must be opened for setup navigation. */ }
  await expect(editor.getByRole('toolbar',{name:'Scene menus'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:info.outputPath(`compact-${width}.png`),fullPage:true,animations:"disabled"});
});

test('failed permission save blocks navigation and keyboard Keep editing restores draft',async({page,request})=>{
  const {editor}=await setup(page,request);await dirty(editor);
  await page.route('**/api/projects/*/scenes/*',route=>route.request().method()==='PATCH'?route.fulfill({status:403,json:{detail:'Read only'}}):route.continue());
  await paths.workspace(page);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(prompt(page).getByRole('alert')).toBeVisible();await page.keyboard.press('Escape');
  await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Draft must survive');
});
test('native interaction uses the same guard without bypassing author review',async({page,request})=>{
  const {editor}=await setup(page,request);await expect(editor).toHaveAttribute("data-dirty","false");
  await page.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Second scene/}).click();
  await page.getByRole('button',{name:'Interaction',exact:true}).click();
  const native=page.getByRole('region',{name:'Manual learner interaction editor'});
  await native.getByLabel('Experience heading').fill('Unsaved reviewed interaction');
  await paths.preview(page);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(prompt(page).getByRole('alert')).toBeVisible();await prompt(page).getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(native.getByLabel('Experience heading')).toHaveValue('Unsaved reviewed interaction');
  await native.getByRole('checkbox',{name:/I reviewed/}).check();
  await paths.preview(page);await prompt(page).getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(native).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Refinement 003 synthetic course preview',exact:true})).toBeVisible();
});

test('browser tab close uses native beforeunload protection',async({page,request})=>{
  const {editor}=await setup(page,request);await dirty(editor);
  const nextDialog=page.waitForEvent('dialog');await page.close({runBeforeUnload:true});
  const native=await nextDialog;expect(native.type()).toBe('beforeunload');await native.dismiss();
  expect(page.isClosed()).toBe(false);await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Draft must survive');
});
test('all scene menu groups expose the existing editing capabilities',async({page,request})=>{
  const {editor}=await setup(page,request);const menu=editor.getByRole('toolbar',{name:'Scene menus'});
  const command=async(group,name)=>{await menu.getByRole('button',{name:group,exact:true}).focus();await page.keyboard.press('ArrowDown');await editor.getByRole('menuitem',{name,exact:true}).click();};
  const close=async()=>editor.getByRole('button',{name:'Close scene controls',exact:true}).click();
  await command('Scene','Properties…');const panel=page.getByRole('dialog',{name:'Scene properties',exact:true});
  for(const [tab,labels] of Object.entries({Identity:['Scene title','Scene type'],Template:['Template'],Content:['On-screen text','Action description'],Notes:['Narration','Speaker notes']})){
    await panel.getByRole('button',{name:tab,exact:true}).click();for(const label of labels)await expect(panel.getByLabel(label,{exact:true})).toBeVisible();
  }
  await close();await command('Scene','Canvas size…');await expect(editor.getByLabel('Stage size',{exact:true})).toBeVisible();await close();
  await command('Insert','Shapes…');await expect(page.getByRole('dialog',{name:'Shapes',exact:true}).getByRole('button',{name:'rectangle',exact:true})).toBeVisible();await close();
  await command('Insert','Image…');await expect(editor.getByLabel('Image from media library',{exact:true})).toBeVisible();await close();
  await editor.getByRole('button',{name:'First scene element',exact:true}).click();await command('Format','Object properties…');
  await expect(page.getByRole('dialog',{name:'Properties',exact:true}).getByRole('textbox',{name:'Studio selected text'})).toBeVisible();await close();
  await command('Format','Style…');await expect(page.getByRole('dialog',{name:'Style',exact:true})).toBeVisible();await close();
  await command('Animate','Motion inspector…');await expect(page.getByRole('dialog',{name:'Motion',exact:true})).toBeVisible();await close();
  await command('Layers','Scene background…');await expect(editor.getByRole('button',{name:/^Background color #/})).toBeVisible();await close();
  await command('Layers','Layer list and arrangement…');
  for(const name of ['Lock element','Bring forward','Send backward','Duplicate element','Delete element'])await expect(editor.getByRole('button',{name,exact:true})).toBeVisible();await close();
  await command('View','Timeline and layers');await expect(editor.getByRole('spinbutton',{name:'Scene duration (s)',exact:true})).toBeVisible();
  await command('Insert','Scene media…');await expect(editor.getByRole('heading',{name:'Media for First scene',exact:true})).toBeVisible();await close();
  await menu.getByRole('button',{name:'Preview',exact:true}).click();await expect(editor.getByRole('menuitem',{name:'This scene',exact:true})).toBeVisible();await expect(editor.getByRole('menuitem',{name:'Whole experience',exact:true})).toBeVisible();
});
