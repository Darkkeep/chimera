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

async function prepared(page,request){
 const result=await setup(page,request),{editor}=result;
 await command(editor,'Insert','Text');await command(editor,'Animate','Bounce into place');await page.getByRole('dialog',{name:'Motion',exact:true}).getByRole('button',{name:'Close scene controls'}).click();
 await editor.locator('.scene-timeline > summary').click();const duration=editor.getByRole('spinbutton',{name:'Scene duration (s)',exact:true});await duration.fill('12');await duration.press('Enter');
 await editor.getByRole('button',{name:'Save scene',exact:true}).click();await expect(editor).toHaveAttribute('data-dirty','false');return result;
}
for(const width of [1440,1100,390])test(`professional preview transport, clocked motion and keyboard at ${width}`,async({page,request},info)=>{
 await page.setViewportSize({width,height:1000});await prepared(page,request);await page.getByRole('button',{name:'Learner preview',exact:true}).click();const preview=page.getByRole('dialog',{name:'Floating inspectors synthetic course preview',exact:true});
 const player=preview.getByRole('region',{name:'Scene playback',exact:true});await expect(player).toHaveCount(1);await expect(preview.getByRole('button',{name:'Play motion',exact:true})).toHaveCount(0);await expect(preview.getByRole('button',{name:'Replay motion',exact:true})).toHaveCount(0);
 const slider=player.getByRole('slider',{name:'Scene playback time',exact:true});await expect(slider).toHaveValue('0');await expect(player.locator('output').last()).toHaveText('00:12');
 const animations=()=>preview.locator('[data-scene-element]').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations().map(a=>({state:a.playState,time:a.currentTime}))));
 await expect.poll(async()=> (await animations()).length).toBeGreaterThan(0);expect((await animations()).every(a=>a.state==='paused'&&a.time===0)).toBe(true);
 await slider.fill('350');await expect.poll(async()=> (await animations())[0].time).toBe(350);
 await player.getByRole('button',{name:'Forward 5 seconds'}).click();await expect(slider).toHaveValue('5350');await player.getByRole('button',{name:'Back 5 seconds'}).click();await expect(slider).toHaveValue('350');
 await slider.focus();await page.keyboard.press('End');await expect(slider).toHaveValue('12000');await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('12000');await page.keyboard.press('Home');await expect(slider).toHaveValue('0');
 await player.getByRole('button',{name:'Play scene',exact:true}).focus();await page.keyboard.press('Space');await expect(player.getByRole('button',{name:'Pause scene',exact:true})).toBeVisible();await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(100);
 await player.getByRole('button',{name:'Pause scene',exact:true}).click();const stopped=await slider.inputValue();await page.waitForTimeout(150);await expect(slider).toHaveValue(stopped);
 await player.getByRole('button',{name:'Stop scene'}).click();await expect(slider).toHaveValue('0');await expect(player.getByRole('button',{name:'Play scene',exact:true})).toBeVisible();
 const bounds=await player.boundingBox();expect(bounds.width).toBeGreaterThan(width===390?250:500);expect(bounds.height).toBeLessThan(110);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
 const AxeBuilder=require('@axe-core/playwright').default;const scan=await new AxeBuilder({page}).include('.course-preview-shell .scene-player-bar').withTags(['wcag2a','wcag2aa']).analyze();expect(scan.violations).toEqual([]);
 await player.screenshot({path:info.outputPath(`preview-player-${width}.png`)});
 await page.screenshot({path:info.outputPath(`preview-stage-${width}.png`),fullPage:true});
});
test('scene-only preview uses one transport and replay really restarts playback',async({page,request})=>{
 const{editor}=await prepared(page,request);await command(editor,'Preview','This scene');const preview=page.getByRole('dialog',{name:'Floating inspectors synthetic scene preview',exact:true});const player=preview.getByRole('region',{name:'Scene playback'}),slider=player.getByRole('slider',{name:'Scene playback time'});
 await expect(preview.locator('.course-preview-navigation')).toHaveCount(0);await slider.fill('11000');await player.getByRole('button',{name:'Restart',exact:true}).click();await expect(player.getByRole('button',{name:'Pause scene'})).toBeVisible();expect(Number(await slider.inputValue())).toBeLessThan(2000);
 await player.getByRole('button',{name:'Stop scene'}).click();const fullscreen=player.getByRole('button',{name:'Enter fullscreen'});if(await fullscreen.isVisible()){await fullscreen.click();await expect(preview.locator('.scene-player-surface:fullscreen')).toHaveCount(1);await player.getByRole('button',{name:'Exit fullscreen'}).click();await expect(preview.locator('.scene-player-surface:fullscreen')).toHaveCount(0);}
});

test('mute and captions control real media without changing authored settings or seek credit',async({page,request})=>{
 const{project,editor}=await prepared(page,request);let current=await(await request.get(`/api/projects/${project.id}`)).json();
 const file=require('node:fs').readFileSync('tests/fixtures/timeline-qualification.mp4');let response=await request.post(`/api/projects/${project.id}/assets`,{headers:{'If-Match':`"${current.storyboard.revision}"`},multipart:{file:{name:'Player controls synthetic.mp4',mimeType:'video/mp4',buffer:file}}});expect(response.ok()).toBeTruthy();current=await response.json();const asset=current.storyboard.assets.find(item=>item.filename==='Player controls synthetic.mp4');
 response=await request.patch(`/api/projects/${project.id}/assets/${asset.id}/metadata`,{headers:{'If-Match':`"${current.storyboard.revision}"`},data:{transcript:'Synthetic test pattern.',captionsVtt:'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nTest pattern.',language:'en'}});expect(response.ok()).toBeTruthy();current=await response.json();
 const scene=current.storyboard.scenes[0],layout=scene.visualLayout;layout.timeline.clips=[{id:'player-video',assetId:asset.id,name:asset.filename,kind:'video',startMs:0,sourceInMs:0,sourceOutMs:3000,sourceDurationMs:3000,volume:.6,required:true,thresholdPercent:90,x:0,y:0,width:320,height:180,fadeInMs:0,fadeOutMs:0}];
 response=await request.patch(`/api/projects/${project.id}/scenes/${scene.id}`,{headers:{'If-Match':`"${current.storyboard.revision}"`},data:{visualLayout:layout}});expect(response.ok()).toBeTruthy();current=await response.json();
 await page.reload();await page.getByRole('button',{name:'Resume authoring',exact:true}).click();await page.getByRole('button',{name:'Preview course',exact:true}).click();const preview=page.getByRole('dialog',{name:'Floating inspectors synthetic course preview',exact:true}),player=preview.getByRole('region',{name:'Scene playback'}),video=preview.locator('video');
 await player.getByRole('button',{name:'Mute scene'}).click();await expect.poll(()=>video.evaluate(node=>node.muted)).toBe(true);await player.getByRole('button',{name:'Unmute scene'}).click();await expect.poll(()=>video.evaluate(node=>node.muted)).toBe(false);
 const captions=player.getByRole('button',{name:'Captions',exact:true});await expect(captions).toHaveAttribute('aria-pressed','true');await captions.click();await expect.poll(()=>video.evaluate(node=>node.textTracks[0]?.mode)).toBe('disabled');await captions.click();await expect.poll(()=>video.evaluate(node=>node.textTracks[0]?.mode)).toBe('showing');
 await player.getByRole('slider',{name:'Scene playback time'}).fill('12000');await expect(preview).toContainText('0 of 1 required media clips');const stored=await(await request.get(`/api/projects/${project.id}`)).json();expect(stored.storyboard.revision).toBe(current.storyboard.revision);expect(stored.storyboard.scenes[0].visualLayout.timeline.clips[0].volume).toBe(.6);
});

test('author Replay animations keeps working without starting a second motion clock',async({page,request})=>{
 const{editor}=await prepared(page,request);await command(editor,'Animate','Replay animations');const player=editor.getByRole('region',{name:'Scene playback',exact:true});await expect(player.getByRole('button',{name:'Pause scene',exact:true})).toBeVisible();
 await command(editor,'Animate','Stop animation preview');await expect(editor.locator('.scene-player-bar')).toHaveCount(0);await expect(editor).toHaveAttribute('data-dirty','false');
 await page.getByRole('button',{name:'Learner preview',exact:true}).click();const preview=page.getByRole('dialog',{name:'Floating inspectors synthetic course preview',exact:true});await expect(preview.getByRole('button',{name:'Play scene',exact:true})).toBeVisible();await expect(preview.getByRole('slider',{name:'Scene playback time'})).toHaveValue('0');
});
