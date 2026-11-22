const { test, expect } = require('@playwright/test');
test.skip(process.env.VITE_CHIMERA_STUDIO_ENABLED !== 'false', 'Explicit classic-mode qualification');
test('classic editor retains its tabs and shares dirty close/save protection',async({page,request})=>{
  let project=await (await request.post('/api/projects',{data:{title:'Classic refinement synthetic'}})).json();
  project=await (await request.post(`/api/projects/${project.id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title:'Classic source',extractedText:['Short original text']}})).json();
  await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);await page.goto('/');
  await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
  await expect(page.getByRole('button',{name:'Chimera2 Studio'})).toHaveCount(0);
  await page.getByRole('button',{name:'Edit scene',exact:true}).click();
  const editor=page.locator('.modal.visual-editor');await editor.getByRole('tab',{name:'Details',exact:true}).click();
  await editor.getByRole('textbox',{name:'Scene title',exact:true}).fill('Classic saved with guard');
  // Wait for the controlled draft to render, not just the input's DOM value,
  // before exercising close/save on slower WebKit event processing.
  await expect(editor.getByRole('heading',{name:'Classic saved with guard',exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'Close scene editor'}).click();
  const guard=page.getByRole('dialog',{name:'Unsaved scene changes',exact:true});await expect(guard).toBeVisible();
  await page.keyboard.press('Escape');await expect(guard).toHaveCount(0);
  await expect(editor.getByRole('textbox',{name:'Scene title',exact:true})).toHaveValue('Classic saved with guard');
  await editor.getByRole('button',{name:'Close scene editor'}).click();await guard.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0);
  const stored=await (await request.get(`/api/projects/${project.id}`)).json();expect(stored.storyboard.scenes[0].title).toBe('Classic saved with guard');
});
