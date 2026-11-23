const {test,expect}=require('@playwright/test');
test.skip(process.env.CHIMERA_STUDIO_TEST!=='true','Studio opt-in');
async function setup(page,request){
 let project=await(await request.post('/api/projects',{data:{title:'Floating inspectors synthetic'}})).json();
 for(const title of ['First menu scene','Second menu scene']){
  const response=await request.post(`/api/projects/${project.id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data:{title,extractedText:['A short instruction.']}});expect(response.ok()).toBeTruthy();project=await response.json();
 }
 await page.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),project.id);
 await page.goto('/');await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
 const menu=page.getByRole('button',{name:'Show workspace menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
 const editor=page.locator('.studio-inline-editor');await expect(editor).toBeVisible();
 const hide=page.getByRole('button',{name:'Hide workspace menu',exact:true});if(await hide.isVisible())await hide.click();
 if((page.viewportSize()?.width||1280)>760)await expect.poll(()=>page.locator('.workspace-navigation').evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(52);
 return{project,editor};
}
async function command(editor,group,label){await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true}).focus();await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true}).press('ArrowDown');await editor.getByRole('menuitem',{name:label,exact:true}).click();}
for(const width of [1440,1100,390])test(`floating inspectors and project swatches at ${width}`,async({page,request},info)=>{
 await page.setViewportSize({width,height:1000});const{editor}=await setup(page,request);
 const frame=editor.locator('.visual-stage-frame'),before=await frame.evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};});
 await command(editor,'Layers','Scene background…');const panel=page.getByRole('dialog',{name:'Background',exact:true});await expect(panel).toBeVisible();
 const after=await frame.evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};});for(const key of ['x','y','width','height'])expect(after[key]).toBeCloseTo(before[key],0);
 await expect(panel.getByRole('button',{name:/^Background color #/})).toHaveCount(1);
 await panel.getByRole('button',{name:/^Background color #/}).click();const picker=page.getByRole('dialog',{name:'Background color picker',exact:true});await expect(picker).toBeVisible();
 await expect(picker.getByRole('group',{name:'Course colors',exact:true})).toBeVisible();
 await picker.getByRole('textbox',{name:'Background color hex',exact:true}).fill('#123abc');await picker.getByRole('textbox',{name:'Background color hex',exact:true}).press('Enter');
 await picker.getByRole('button',{name:'Save current color as swatch'}).click();await expect(picker.getByRole('button',{name:'Saved swatches #123abc',exact:true})).toBeVisible();
 await picker.getByRole('button',{name:'Standard colors #ffffff',exact:true}).click();
 await expect(editor).toHaveAttribute('data-dirty','false');
 await picker.getByRole('button',{name:'Saved swatches #123abc',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','true');
 const box=await picker.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(1000);
 await page.screenshot({path:info.outputPath(`swatches-${width}.png`),fullPage:true});
 await picker.getByRole('button',{name:'Close color picker'}).click();await panel.getByRole('button',{name:'Close scene controls'}).click();
 await editor.getByRole('button',{name:'Undo canvas edit'}).click();await expect(editor).toHaveAttribute('data-dirty','false');
 await command(editor,'Insert','Rectangle');await command(editor,'Animate','Bounce into place');
 const motion=page.getByRole('dialog',{name:'Motion',exact:true});await expect(motion.getByRole('combobox',{name:'entrance effect',exact:true})).toHaveValue('bounce');
 await motion.getByRole('button',{name:'Emphasis',exact:true}).click();await motion.getByRole('button',{name:'Pulse',exact:true}).click();
 await expect(motion.getByRole('combobox',{name:'presentation effect',exact:true})).toHaveValue('pulse');
 await page.screenshot({path:info.outputPath(`motion-${width}.png`),fullPage:true});
 await motion.getByRole('button',{name:'Close scene controls'}).click();
 await editor.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor.getByRole('button',{name:'Save scene',exact:true})).toHaveCount(0);
});
test('pin, keyboard move, collapse, dock and restore never dirty the scene',async({page,request})=>{
 await page.setViewportSize({width:1440,height:1000});const{editor}=await setup(page,request);
 await command(editor,'View','Properties inspector');let panel=page.getByRole('dialog',{name:'Properties',exact:true});
 await panel.getByRole('button',{name:'Pin Properties inspector'}).click();
 const grip=panel.getByRole('button',{name:'Move Properties inspector'}),before=await panel.boundingBox();await grip.focus();await page.keyboard.press('ArrowLeft');
 expect((await panel.boundingBox()).x).toBeCloseTo(before.x-10,0);
 await command(editor,'Layers','Scene background…');await expect(page.locator('.floating-inspector')).toHaveCount(2);
 await panel.getByRole('button',{name:'Collapse Properties inspector'}).click();await expect(panel.locator('.floating-inspector-body')).toHaveCount(0);
 await panel.getByRole('button',{name:'Dock Properties inspector'}).click();await expect(panel).toHaveClass(/is-docked/);
 await command(editor,'View','Restore panel layout');await expect(panel).not.toHaveClass(/is-docked/);await expect(panel.locator('.floating-inspector-body')).toBeVisible();
 await expect(editor).toHaveAttribute('data-dirty','false');
 await page.setViewportSize({width:390,height:1000});await expect(page.locator('.floating-inspector')).toHaveCount(1);
});
test('direct flourish, Undo, stale revision and navigation retain the existing draft',async({page,request})=>{
 const{project,editor}=await setup(page,request);await command(editor,'Insert','Rectangle');await command(editor,'Format','Drop shadow');
 const style=page.getByRole('dialog',{name:'Style',exact:true});await expect(style.getByRole('checkbox',{name:'Enabled',exact:true})).toBeChecked();
 await expect(style.getByRole('spinbutton',{name:'shadow blur',exact:true})).toBeVisible();
 await style.getByRole('button',{name:'Close scene controls'}).click();
 await page.route(`**/api/projects/${project.id}/scenes/**`,route=>route.request().method()==='PATCH'?route.fulfill({status:409,json:{detail:'stale revision'}}):route.continue());
 await editor.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','true');await expect(editor.locator('[role=alert]')).toBeVisible();
 await page.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Second menu scene/}).click();const guard=page.getByRole('dialog',{name:'Unsaved scene changes',exact:true});await expect(guard).toBeVisible();
 await guard.getByRole('button',{name:'Keep editing'}).click();await expect(editor).toHaveAttribute('data-dirty','true');
 await editor.getByRole('button',{name:'Undo canvas edit'}).click();await editor.getByRole('button',{name:'Undo canvas edit'}).click();await expect(editor).toHaveAttribute('data-dirty','false');
});
test('scene inspector separates notes, template and requirements',async({page,request})=>{
 const{editor}=await setup(page,request);await command(editor,'Scene','Narration and notes…');const panel=page.getByRole('dialog',{name:'Scene properties',exact:true});
 await expect(panel.getByRole('textbox',{name:'Narration',exact:true})).toBeVisible();await expect(panel.getByRole('textbox',{name:'Scene title',exact:true})).toHaveCount(0);
 await panel.getByRole('button',{name:'Requirements',exact:true}).click();await expect(panel.getByRole('checkbox',{name:'Required scene',exact:true})).toBeVisible();await expect(panel.getByRole('textbox',{name:'Narration',exact:true})).toHaveCount(0);
});
test('activity and question galleries route to the requested manual authoring model',async({page,request})=>{
 const{editor}=await setup(page,request);await command(editor,'Insert','Learner activity…');const panel=page.getByRole('dialog',{name:'Learner activities',exact:true});
 await expect(panel.getByRole('button',{name:/Branching decisions/})).toBeEnabled();await panel.getByRole('button',{name:/Hotspots/}).click();
 const native=page.getByRole('region',{name:'Manual learner interaction editor'});await expect(native).toBeVisible();await native.getByRole('button',{name:'Activities',exact:true}).click();await expect(native.getByText('Activity 1: hotspots',{exact:true})).toBeVisible();
});

test('selecting an existing object never shifts the stage or creates an edit',async({page,request})=>{
 const{editor}=await setup(page,request);const frame=editor.locator('.visual-stage-frame');const before=await frame.boundingBox();
 await editor.getByRole('button',{name:'First menu scene element',exact:true}).click();await expect(editor.getByRole('button',{name:'Properties',exact:true})).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','false');
 const after=await frame.boundingBox();expect(after.width).toBeCloseTo(before.width,0);expect(after.height).toBeCloseTo(before.height,0);
 await editor.getByRole('button',{name:'Properties',exact:true}).click();await expect(page.getByRole('dialog',{name:'Properties',exact:true})).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','false');
});
test('new scored question opens and saves its selected type without an intermediate scene-type change',async({page,request})=>{
 const{project,editor}=await setup(page,request);await command(editor,'Insert','Scored question…');const gallery=page.getByRole('dialog',{name:'Scored questions',exact:true});await gallery.getByRole('button',{name:'True / false',exact:true}).click();
 const question=page.getByRole('dialog',{name:'First menu scene',exact:true});await expect(question.getByRole('combobox',{name:'Question type',exact:true})).toHaveValue('true-false');
 await question.getByRole('textbox',{name:'Question prompt',exact:true}).fill('Is this a synthetic test?');await question.getByRole('button',{name:'Save question',exact:true}).click();await expect(question.getByRole('button',{name:'Question saved',exact:true})).toBeVisible();
 const saved=await(await request.get(`/api/projects/${project.id}`)).json();expect(saved.storyboard.scenes[0].sceneType).toBe('question');expect(saved.storyboard.scenes[0].assessmentItem.type).toBe('true-false');
});
test('saved swatches survive reopening and invalid hex never changes the scene',async({page,request})=>{
 const{project,editor}=await setup(page,request);await command(editor,'Layers','Scene background…');let panel=page.getByRole('dialog',{name:'Background',exact:true});await panel.getByRole('button',{name:/^Background color #/}).click();let picker=page.getByRole('dialog',{name:'Background color picker',exact:true});
 const hex=picker.getByRole('textbox',{name:'Background color hex',exact:true});await hex.fill('#xyzxyz');await hex.press('Enter');await expect(picker.getByRole('alert')).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','false');await hex.fill('#abc');await hex.press('Enter');await picker.getByRole('button',{name:'Save current color as swatch'}).click();
 await picker.getByRole('button',{name:'Standard colors #ffffff',exact:true}).click();await picker.getByRole('button',{name:'Close color picker'}).click();await panel.getByRole('button',{name:'Close scene controls'}).click();
 await expect(editor).toHaveAttribute('data-dirty','false');await page.reload();await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
 const menu=page.getByRole('button',{name:'Show workspace menu',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Chimera2 Studio',exact:true}).click();
 await command(page.locator('.studio-inline-editor'),'Layers','Scene background…');panel=page.getByRole('dialog',{name:'Background',exact:true});await panel.getByRole('button',{name:/^Background color #/}).click();picker=page.getByRole('dialog',{name:'Background color picker',exact:true});await expect(picker.getByRole('button',{name:'Saved swatches #aabbcc',exact:true})).toBeVisible();
 expect(await page.evaluate(id=>JSON.parse(localStorage.getItem('chimera.swatches.'+id)),project.id)).toContain('#aabbcc');
});


test('inspectors and swatches return keyboard focus and expose accessible controls',async({page,request})=>{
 const{editor}=await setup(page,request);await command(editor,'View','Properties inspector');await page.keyboard.press('Escape');await expect(editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'View',exact:true})).toBeFocused();
 await command(editor,'Layers','Scene background…');const panel=page.getByRole('dialog',{name:'Background',exact:true});const trigger=panel.getByRole('button',{name:/^Background color #/});await trigger.click();const picker=page.getByRole('dialog',{name:'Background color picker',exact:true});
 const AxeBuilder=require('@axe-core/playwright').default;const result=await new AxeBuilder({page}).include('.floating-inspector').include('.project-color-popup:popover-open').withTags(['wcag2a','wcag2aa']).analyze();expect(result.violations).toEqual([]);
 await page.keyboard.press('Escape');await expect(picker).toBeHidden();await expect(trigger).toBeFocused();await expect(panel).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','false');
});

test('project swatches stay isolated without resetting the workspace', async ({page,request}) => {
 let second=await(await request.post('/api/projects',{data:{title:'Second palette synthetic'}})).json();
 second=await(await request.post(`/api/projects/${second.id}/scenes`,{headers:{'If-Match':`"${second.storyboard.revision}"`},data:{title:'Second palette scene'}})).json();
 const {project,editor}=await setup(page,request);
 const show=page.getByRole('button',{name:'Show workspace menu',exact:true});if(await show.isVisible())await show.click();
 const selector=page.getByRole('combobox',{name:'Switch project',exact:true});
 async function palette(){await command(editor,'Layers','Scene background…');const panel=page.getByRole('dialog',{name:'Background',exact:true});await panel.getByRole('button',{name:/^Background color #/}).click();return{panel,picker:page.getByRole('dialog',{name:'Background color picker',exact:true})};}
 let {panel,picker}=await palette();await picker.getByRole('button',{name:'Save current color as swatch'}).click();await expect(picker.getByRole('button',{name:'Saved swatches #ffffff',exact:true})).toBeVisible();
 await picker.getByRole('button',{name:'Close color picker'}).click();await panel.getByRole('button',{name:'Close scene controls'}).click();
 await selector.selectOption(second.id);await expect(editor).toBeVisible();({panel,picker}=await palette());
 await expect(picker.getByRole('group',{name:'Saved swatches',exact:true})).toHaveCount(0);
 await picker.getByRole('button',{name:'Close color picker'}).click();await panel.getByRole('button',{name:'Close scene controls'}).click();
 await selector.selectOption(project.id);await expect(editor).toBeVisible();({panel,picker}=await palette());
 await expect(picker.getByRole('button',{name:'Saved swatches #ffffff',exact:true})).toBeVisible();await expect(editor).toHaveAttribute('data-dirty','false');
});
