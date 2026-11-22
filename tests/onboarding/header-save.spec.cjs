const { test, expect } = require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true','Studio opt-in');
async function setup(page,request) {
  let project=await (await request.post('/api/projects',{data:{title:'Conditional save synthetic'}})).json();
  project=await (await request.post(`/api/projects/${project.id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title:'Save only changes',extractedText:['Keep the stage clear.']}})).json();
  await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);await page.goto('/');
  await page.getByRole('button',{name:'Resume authoring',exact:true}).click();await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
  const editor=page.locator('.studio-inline-editor');await expect(editor).toBeVisible();return {project,editor};
}
async function insertText(editor) {
  await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'Insert',exact:true}).click();
  await editor.getByRole('menuitem',{name:'Text',exact:true}).click();
}
test('Save appears in the header only for dirty drafts, and Undo/Redo and successful save update visibility',async({page,request})=>{
  const {editor,project}=await setup(page,request);const header=editor.locator('.visual-editor-header');
  await expect(header.getByRole('button',{name:'Save scene',exact:true})).toHaveCount(0);
  await expect(editor.getByRole('button',{name:'Close scene editor',exact:true})).toHaveCount(0);
  await expect(editor.getByRole('button',{name:'Cancel',exact:true})).toHaveCount(0);
  await expect(editor.locator('footer')).toHaveCount(0);
  const height=await header.evaluate(node=>node.getBoundingClientRect().height);
  await insertText(editor);await expect(header.getByRole('button',{name:'Save scene',exact:true})).toBeVisible();
  expect(await header.evaluate(node=>node.getBoundingClientRect().height)).toBeCloseTo(height,0);
  await editor.getByRole('button',{name:'Undo canvas edit'}).click();await expect(header.getByRole('button',{name:'Save scene',exact:true})).toHaveCount(0);
  await editor.getByRole('button',{name:'Redo canvas edit'}).click();await expect(header.getByRole('button',{name:'Save scene',exact:true})).toBeVisible();
  await header.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','false');
  await expect(header.getByRole('button',{name:'Save scene',exact:true})).toHaveCount(0);
  const stored=await (await request.get(`/api/projects/${project.id}`)).json();expect(stored.storyboard.scenes[0].visualLayout.elements.length).toBe(3);
});
for(const status of [403,409])test(`failed header save (${status}) retains the draft and Save action`,async({page,request})=>{
  const {editor}=await setup(page,request);await insertText(editor);
  if (!await editor.getByRole('textbox',{name:'Studio selected text',exact:true}).isVisible()) await editor.getByRole('button',{name:'Properties',exact:true}).click();
  await editor.getByRole('textbox',{name:'Studio selected text'}).fill('Retain this unsaved draft');
  await page.route('**/api/projects/*/scenes/*',route=>route.request().method()==='PATCH'?route.fulfill({status,json:{detail:'Save rejected'}}):route.continue());
  await editor.locator('.visual-editor-header').getByRole('button',{name:'Save scene',exact:true}).click();
  await expect(editor.getByRole('alert')).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','true');
  await expect(editor.getByRole('textbox',{name:'Studio selected text'})).toHaveValue('Retain this unsaved draft');
  await expect(editor.locator('.visual-editor-header').getByRole('button',{name:'Save scene',exact:true})).toBeEnabled();
});
