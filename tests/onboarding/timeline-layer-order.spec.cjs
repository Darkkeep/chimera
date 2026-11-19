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
 await page.getByRole('button',{name:'Studio 2.0 preview',exact:true}).click();
 const editor=page.locator('.studio-inline-editor');await expect(editor).toBeVisible();
 const hide=page.getByRole('button',{name:'Hide workspace menu',exact:true});if(await hide.isVisible())await hide.click();
 if((page.viewportSize()?.width||1280)>760)await expect.poll(()=>page.locator('.workspace-navigation').evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(52);
 return{project,editor};
}
async function command(editor,group,label){
 const trigger=editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true});
 await trigger.focus();await trigger.press('ArrowDown');
 const menu=editor.getByRole('menu',{name:`${group} menu`,exact:true});await expect(menu).toBeVisible();
 // Keep this keyboard journey keyboard-only. Moving the pointer across another
 // menu trigger legitimately switches the active native menu on narrow screens.
 const item=menu.getByRole('menuitem',{name:label,exact:true});await item.focus();await expect(item).toBeFocused();await item.press('Enter');
}

async function prepared(page,request){
 const result=await setup(page,request),{editor}=result;
 for(const shape of ['Rectangle','Ellipse','Triangle'])await command(editor,'Insert',shape);
 await editor.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','false');
 await editor.locator('.scene-timeline > summary').click();return result;
}
const order=editor=>editor.locator('.timeline-object-row .timeline-label').allTextContents();
test('timeline drag changes canvas z-order, supports Undo/Redo and persists without timing edits',async({page,request},info)=>{
 await page.setViewportSize({width:1440,height:1000});const{project,editor}=await prepared(page,request);
 const original=await(await request.get(`/api/projects/${project.id}`)).json();const elements=original.storyboard.scenes[0].visualLayout.elements;
 expect((await order(editor)).slice(0,3)).toEqual(['triangle','ellipse','rectangle']);
 const label=name=>editor.locator('.timeline-object-row').getByRole('button',{name,exact:true});
 // Even a matching element ID supplied by an external drop cannot start a
 // reorder: the editor must have observed its own native dragstart.
 const rectangleId=await label('rectangle').locator('..').getAttribute('data-layer-id');
 await label('triangle').evaluate((node,id)=>{
  const event=new Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperties(event,{dataTransfer:{value:{getData:()=>id}},clientY:{value:node.getBoundingClientRect().top+1}});
  node.dispatchEvent(event);
 },rectangleId);
 await expect(editor).toHaveAttribute('data-dirty','false');
 expect((await order(editor)).slice(0,3)).toEqual(['triangle','ellipse','rectangle']);
 // Native dragover needs a second move in WebKit; keep real pointer input.
 // https://playwright.dev/docs/input#dragging-manually
 await label('rectangle').hover();await page.mouse.down();
 await label('triangle').hover({position:{x:20,y:4}});
 await label('triangle').hover({position:{x:20,y:4}});await page.mouse.up();
 await expect.poll(async()=>(await order(editor)).slice(0,3)).toEqual(['rectangle','triangle','ellipse']);
 await expect(editor).toHaveAttribute('data-dirty','true');
 const top=editor.getByRole('button',{name:'rectangle element',exact:true});expect(await top.evaluate(node=>Number(node.parentElement.style.zIndex))).toBe(elements.length*2-1);
 await editor.getByRole('button',{name:'Undo canvas edit'}).click();expect((await order(editor)).slice(0,3)).toEqual(['triangle','ellipse','rectangle']);await expect(editor).toHaveAttribute('data-dirty','false');
 await editor.getByRole('button',{name:'Redo canvas edit'}).click();expect((await order(editor)).slice(0,3)).toEqual(['rectangle','triangle','ellipse']);
 await command(editor,'Layers','Layer list and arrangement…');await expect(page.getByRole('dialog',{name:'Layers',exact:true}).locator('.visual-layers button').first()).toContainText('rectangle');await page.getByRole('dialog',{name:'Layers',exact:true}).getByRole('button',{name:'Close scene controls'}).click();
 await editor.locator('.scene-timeline').screenshot({path:info.outputPath('timeline-layer-order.png')});
 await editor.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','false');
 const saved=await(await request.get(`/api/projects/${project.id}`)).json(),layout=saved.storyboard.scenes[0].visualLayout;
 expect(layout.elements.at(-1).name).toBe('rectangle');expect(layout.timeline).toEqual(original.storyboard.scenes[0].visualLayout.timeline);
 expect([...layout.elements].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...elements].sort((a,b)=>a.id.localeCompare(b.id)));
 await editor.locator('.scene-timeline > summary').click();expect((await order(editor)).slice(0,3)).toEqual(['rectangle','triangle','ellipse']);
});
for(const width of [1440,1100,390])test(`keyboard timeline reorder and lock guard at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:1000});const{editor}=await prepared(page,request);
 const label=editor.locator('.timeline-object-row').getByRole('button',{name:'rectangle',exact:true});await label.focus();await page.keyboard.press('Alt+ArrowUp');
 expect((await order(editor)).slice(0,3)).toEqual(['triangle','rectangle','ellipse']);await expect(label).toBeFocused();
 await page.keyboard.press('Alt+ArrowDown');expect((await order(editor)).slice(0,3)).toEqual(['triangle','ellipse','rectangle']);await expect(editor).toHaveAttribute('data-dirty','false');
 await label.click();await command(editor,'Layers','Lock');const locked=editor.locator('.timeline-object-row .timeline-label').filter({hasText:'rectangle'});await locked.focus();await page.keyboard.press('Alt+ArrowUp');expect((await order(editor)).slice(0,3).map(text=>text.replace('🔒 ','').trim())).toEqual(['triangle','ellipse','rectangle']);await expect(locked).toHaveAttribute('draggable','false');
});
