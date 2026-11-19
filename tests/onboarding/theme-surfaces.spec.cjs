const {test,expect}=require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST!=='true','Studio opt-in');
const themes=[['DARKROGUE','purple'],['Classic Dark','dark'],['Light Temple','light']];
for(const width of [1440,1100,390]) test(`populated screens, nested inspector and authored isolation at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:1000});
 let project=await(await request.post('/api/projects',{data:{title:'Theme surfaces synthetic'}})).json();
 project=await(await request.post(`/api/projects/${project.id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title:'Recognize a hazard',extractedText:['Pause, identify the risk, then choose a safe response.']}})).json();
 await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);
 await page.goto('/');await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
 const show=page.getByRole('button',{name:'Show workspace menu',exact:true});if(await show.isVisible())await show.click();
 await page.getByRole('button',{name:'Studio 2.0 preview',exact:true}).click();
 const editor=page.locator('.studio-inline-editor');await expect(editor).toBeVisible();
 const authored=await editor.locator('.visual-editable').evaluateAll(nodes=>nodes.map(n=>({style:n.getAttribute('style'),text:n.textContent})));
 for(const [label,key] of themes){
   const show=page.getByRole('button',{name:'Show workspace menu',exact:true});if(await show.isVisible())await show.click();
   const settings=page.getByRole('button',{name:'Settings',exact:true});if(await settings.getAttribute('aria-expanded')!=='true')await settings.click();
   await page.getByRole('radio',{name:label,exact:true}).check();
   if(width===390)await page.getByRole('button',{name:'Hide workspace menu',exact:true}).click();
   await expect(page.locator('html')).toHaveAttribute('data-appearance',key);
   const tokens=await page.locator('html').evaluate(n=>{const c=getComputedStyle(n);return{ink:c.getPropertyValue('--ink').trim(),panel:c.getPropertyValue('--theme-panel').trim(),input:c.getPropertyValue('--theme-input').trim()}});
   // This assertion catches a real prior bug: editor-local variables masked the root theme.
   expect(await editor.evaluate(n=>getComputedStyle(n).getPropertyValue('--ink').trim())).toBe(tokens.ink);
   await expect(editor).toHaveAttribute('data-dirty','false');
   expect(await editor.locator('.visual-editable').evaluateAll(nodes=>nodes.map(n=>({style:n.getAttribute('style'),text:n.textContent})))).toEqual(authored);
   await expect(editor.locator('.visual-text').first()).toBeVisible();
   await expect(editor.locator('.visual-stage-frame')).toHaveCSS('color-scheme','light');
   await page.screenshot({path:`docs/qualification/founder-refinement-003/full-theme-${key}-studio-${width}.png`,fullPage:true});
   await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'View',exact:true}).click();
   await editor.getByRole('menuitem',{name:'Properties inspector',exact:true}).click();
   const panel=page.getByRole('dialog',{name:'Properties',exact:true});await expect(panel).toBeVisible();
   expect(await panel.evaluate(n=>getComputedStyle(n).getPropertyValue('--ink').trim())).toBe(tokens.ink);
   await expect(panel.getByRole('textbox',{name:'Studio scene title',exact:true})).toHaveValue('Recognize a hazard');
   // Check real rendered text contrast inside both shell and floating controls.
   for(const scope of [editor,panel])expect(await scope.evaluate(n=>{
     const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
     const c=getComputedStyle(n),l=s=>{const a=rgb(s);return a[0]*.2126+a[1]*.7152+a[2]*.0722};
     const a=l(c.color),b=l(c.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   })).toBeGreaterThanOrEqual(4.5);
   await page.screenshot({path:`docs/qualification/founder-refinement-003/full-theme-${key}-inspector-${width}.png`,fullPage:true});
   await panel.getByRole('button',{name:'Close scene controls',exact:true}).click();
   await expect(editor).toHaveAttribute('data-dirty','false');
 }
});
