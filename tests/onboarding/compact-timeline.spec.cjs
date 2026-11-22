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

for(const width of [1440,1100,390])test(`compact layer animations and icon transport at ${width}`,async({page,request},info)=>{
  await page.setViewportSize({width,height:1000});const {editor}=await setup(page,request);
  await command(editor,'Insert','Text');
  await command(editor,'Animate','Motion inspector…');
  const dialog=page.getByRole('dialog').last();
  await dialog.getByLabel('entrance effect',{exact:true}).selectOption('fade');
  await dialog.getByRole('button',{name:'Emphasis',exact:true}).click();
  await dialog.getByLabel('presentation effect',{exact:true}).selectOption('pulse');
  await dialog.getByRole('button',{name:'Exit',exact:true}).click();
  await dialog.getByLabel('exit effect',{exact:true}).selectOption('fade');
  await dialog.getByRole('button',{name:'Close scene controls'}).click();
  const timeline=editor.locator('.scene-timeline');await timeline.locator(':scope > summary').click();
  const row=timeline.locator('.timeline-object-row').filter({has:page.getByRole('button',{name:'Move entrance animation',exact:true})});
  await expect(row).toHaveCount(1);
  const rail=await row.locator('.timeline-rail').boundingBox();expect(rail.height).toBeLessThanOrEqual(40);
  for(const phase of ['entrance','presentation','exit']) {
    const block=row.getByRole('button',{name:`Move ${phase} animation`,exact:true});
    const box=await block.boundingBox();expect(box.y).toBeGreaterThanOrEqual(rail.y);expect(box.y+box.height).toBeLessThanOrEqual(rail.y+rail.height);
  }
  const entrance=row.getByRole('button',{name:'Move entrance animation',exact:true});
  await entrance.focus();await page.keyboard.press('ArrowRight');
  await expect(timeline.getByRole('spinbutton',{name:'entrance scene start (s)',exact:true})).toHaveValue('0.1');
  await timeline.getByRole('button',{name:'Forward 5 seconds'}).click();
  await expect(timeline.getByRole('spinbutton',{name:'Playhead (s)',exact:true})).toHaveValue('5');
  await timeline.getByRole('button',{name:'Restart',exact:true}).click();
  await expect(timeline.getByRole('spinbutton',{name:'Playhead (s)',exact:true})).toHaveValue('0');
  await timeline.getByRole('button',{name:'Play',exact:true}).click();await expect(timeline.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await timeline.getByRole('button',{name:'Pause',exact:true}).click();
  await timeline.screenshot({path:info.outputPath(`compact-timeline-${width}.png`)});
});
