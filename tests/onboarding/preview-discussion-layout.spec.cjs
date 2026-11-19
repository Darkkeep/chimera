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
async function command(editor,group,label){await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true}).focus();await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:group,exact:true}).press('ArrowDown');await editor.getByRole('menuitem',{name:label,exact:true}).click();}

for(const width of [1440,1100,390])test(`scene discussion beside preview with working review actions at ${width}`,async({page,request},info)=>{
 await page.setViewportSize({width,height:1000});await setup(page,request);await page.getByRole('button',{name:'Learner preview',exact:true}).click();const preview=page.getByRole('dialog',{name:'Floating inspectors synthetic course preview',exact:true});
 const column=preview.locator('.course-preview-player-column'),discussion=preview.getByRole('complementary',{name:'Scene discussion panel',exact:true});await expect(discussion).toBeVisible();const left=await column.boundingBox(),right=await discussion.boundingBox();
 if(width>800){expect(right.x).toBeGreaterThanOrEqual(left.x+left.width);expect(Math.abs(right.y-left.y)).toBeLessThan(2);}else{expect(right.y).toBeGreaterThanOrEqual(left.y+left.height);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const form=discussion.locator('.course-preview-comment-form');await form.getByRole('textbox',{name:'Reviewer',exact:true}).fill('Synthetic reviewer');await form.getByRole('textbox',{name:'Comment',exact:true}).fill('The player and discussion should stay adjacent.');await form.getByRole('button',{name:'Add comment',exact:true}).click();
 const thread=discussion.locator('.course-preview-comment');await expect(thread).toContainText('The player and discussion should stay adjacent.');await thread.getByRole('textbox',{name:'Reply to Synthetic reviewer',exact:true}).fill('Review controls remain available.');await thread.getByRole('button',{name:'Reply',exact:true}).click();await expect(thread).toContainText('Review controls remain available.');await thread.getByRole('button',{name:'Resolve',exact:true}).click();await expect(thread).toHaveClass(/resolved/);
 const AxeBuilder=require('@axe-core/playwright').default;const result=await new AxeBuilder({page}).include('.course-preview-discussion').withTags(['wcag2a','wcag2aa']).analyze();expect(result.violations).toEqual([]);
 await page.screenshot({path:info.outputPath(`discussion-right-${width}.png`),fullPage:true});
});
