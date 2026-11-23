const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const title='PR54 independent release qualification '+Date.now();const out=process.env.CHIMERA_QUALIFICATION_OUTPUT||require('path').resolve('workspace/pr54-qualification'), origin='https://localhost:18002',accounts=JSON.parse(fs.readFileSync(path.join(out,'test-accounts.private.json'))),results=[];
function pass(name,details={}){results.push({name,result:'PASS',...details});console.log('PASS '+name);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
async function check(r,status=200){if(r.status()!==status)throw Error(`HTTP ${r.status()} expected ${status}: ${(await r.text()).slice(0,300)}`);return r;}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const contexts={};
 for(const label of Object.keys(accounts)){
  const c=contexts[label]=await browser.newContext({ignoreHTTPSErrors:true,baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  c.setDefaultTimeout(15000);await check(await c.request.post('/api/auth/login',{data:accounts[label]}));
 }
 pass('Four separately authenticated actors');
 const author=contexts.author.request,reviewer=contexts.reviewer.request,owner=contexts.owner.request,outsider=contexts.outsider.request;
 const p=await contexts.author.newPage();await p.goto('/');await p.getByRole('button',{name:'New Project',exact:true}).click();await p.getByRole('button',{name:'Start with an idea',exact:true}).click();await p.getByRole('textbox',{name:'Course name',exact:true}).fill(title);await p.getByRole('dialog',{name:'Name your course'}).getByRole('button',{name:'Create project',exact:true}).click();
 await expect(p.getByRole('region',{name:'Chimera 2.0 Authoring Studio'})).toBeVisible();
 let project=(await (await author.get('/api/projects')).json()).find(x=>x.title===title);
 project=await (await author.get('/api/projects/'+project.id)).json();const id=project.id;
 fs.writeFileSync(path.join(out,'project.json'),JSON.stringify({id}));
 await check(await owner.post(`/api/projects/${id}/members`,{data:{userId:accounts.reviewer.id,role:'reviewer'}}),201);
 // Real storage fixture supplies branching and assessment data; Studio edits the authored scene.
 for(const data of [
  {title:'Recognize the signal',sceneType:'content',extractedText:['Notice the warning signal and consider the context.']},
  {title:'Choose a response',sceneType:'interaction',extractedText:['Use the evidence available before acting.']},
  {title:'Check your judgment',sceneType:'question',assessmentItem:{type:'true-false',identifier:'SIGNAL-CHECK',prompt:'Is it always appropriate to act before checking the situation?',correctResponse:'false',correctFeedback:'Correct.',incorrectFeedback:'Check first.'},assessmentSettings:{maxAttempts:2,passingScore:100,scoreWeight:1}}
 ])project=await (await check(await author.post(`/api/projects/${id}/scenes`,{headers:{'If-Match':`"${project.storyboard.revision}"`},data}),201)).json();
 await p.reload();await p.getByRole('button',{name:'Resume authoring',exact:true}).click();
 const studio=p.getByRole('region',{name:'Chimera 2.0 Authoring Studio'});await expect(studio.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Recognize the signal/})).toBeVisible();
 await studio.getByRole('button',{name:/Notice the warning signal.*element/}).click();await studio.getByRole('button',{name:'Properties',exact:true}).click();await p.getByRole('textbox',{name:'Studio selected text'}).fill('Recognize the first signal');await p.getByRole('button',{name:'Close scene controls'}).click();await p.getByRole('button',{name:'Save scene',exact:true}).click();await expect(p.getByRole('button',{name:'Save scene',exact:true})).toHaveCount(0);
 project=await (await author.get(`/api/projects/${id}`)).json();pass('UI project creation, Studio text edit and save');
 await studio.getByRole('navigation',{name:'Studio scenes'}).getByRole('button',{name:/Choose a response/}).click();await studio.getByRole('button',{name:'Interaction',exact:true}).click();const native=studio.getByRole('region',{name:'Manual learner interaction editor'});await native.getByRole('button',{name:'Activities',exact:true}).click();await native.getByLabel('Decision prompt').fill('A warning appears. What should happen first?');await native.getByLabel('Choice label').nth(0).fill('Pause and collect relevant information');await native.getByLabel('Choice feedback').nth(0).fill('Gather evidence first.');await native.getByLabel('Choice label').nth(1).fill('Proceed immediately');await native.getByRole('checkbox',{name:/I reviewed the learning experience/}).check();await native.getByRole('button',{name:'Save learner interaction'}).click();await expect(native.getByRole('checkbox',{name:/I reviewed the learning experience/})).not.toBeChecked();
 project=await (await author.get(`/api/projects/${id}`)).json();pass('UI branching interaction saved');
 const revision=()=>project.storyboard.revision;
 const decision=async(req,d='approve',rev=revision())=>req.post(`/api/projects/${id}/review-approval`,{data:{decision:d,note:'Independent staging review of visible storyboard',expectedRevision:rev}});
 const status=async()=> (await reviewer.get(`/api/projects/${id}/review-approval`)).json();
 await check(await decision(author),409);await check(await decision(outsider),403);pass('Course creator and unauthorized reviewer cannot approve');
 // Owner self-approval with otherwise sufficient administrator permissions.
 let own=await (await owner.post('/api/projects',{data:{title:'PR54 owner self-approval negative'}})).json();await check(await owner.post(`/api/projects/${own.id}/review-approval`,{data:{decision:'approve',note:'Must reject self approval',expectedRevision:own.storyboard.revision}}),409);pass('Owner self approval rejected');
 await check(await owner.post(`/api/projects/${own.id}/members`,{data:{userId:accounts.author.id,role:'author'}}),201);
 await check(await author.post(`/api/projects/${own.id}/review-approval`,{data:{decision:'approve',note:'Comment-capable author cannot approve',expectedRevision:own.storyboard.revision}}),403);pass('Author comment permission does not grant approval');
 await check(await owner.delete(`/api/projects/${own.id}/members/${accounts.author.id}`));
 await check(await author.get(`/api/projects/${id}/scorm-12.zip?approved=true`),409);
 const rp=await contexts.reviewer.newPage();await rp.addInitScript(id=>localStorage.setItem('chimera.activeProjectId',id),id);await rp.goto('/');console.log('Reviewer loaded');await rp.getByRole('button',{name:'Resume authoring',exact:true}).click();await expect(rp.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const comment=await (await check(await reviewer.post(`/api/projects/${id}/review-comments`,{data:{sceneId:project.storyboard.scenes[0].id,authorLabel:'Independent Reviewer',body:'Blocking: clarify the warning instruction.'}}),201)).json();
 await check(await author.patch(`/api/projects/${id}/production-stage`,{data:{productionStage:'in-review'}}));
 console.log('Opening review preview');await rp.getByRole('button',{name:'Open course review',exact:true}).click();console.log('Review preview opened');const reviewUI=rp.getByRole('region',{name:'Human review decision'});await reviewUI.getByRole('textbox',{name:'Review decision explanation'}).fill('Blocking instruction requires clarification before release.');await reviewUI.getByRole('button',{name:'Request changes',exact:true}).click();await expect(reviewUI.getByText('Changes requested.',{exact:true})).toBeVisible();
 await check(await decision(reviewer),409);await check(await author.get(`/api/projects/${id}/scorm-12.zip?approved=true`),409);pass('Independent reviewer UI change request and blocking comment prevent approved export');
 project=await (await check(await author.patch(`/api/projects/${id}/scenes/${project.storyboard.scenes[0].id}`,{headers:{'If-Match':`"${revision()}"`},data:{extractedText:['Recognize the first signal; verify its meaning before acting.']}}))).json();
 await check(await author.post(`/api/projects/${id}/review-comments/${comment.id}/decision`,{data:{resolved:true}}));
 await rp.reload();await rp.getByRole('button',{name:'Resume authoring',exact:true}).click();console.log('Opening review preview');await rp.getByRole('button',{name:'Open course review',exact:true}).click();console.log('Review preview opened');await reviewUI.getByRole('textbox',{name:'Review decision explanation'}).fill('Independently verified the corrected exact storyboard revision.');await reviewUI.getByRole('button',{name:'Approve this revision',exact:true}).click();await expect(reviewUI.getByText('Approved for this exact storyboard revision.',{exact:true})).toBeVisible();
 const approved=await status();expect(approved.approved).toBe(true);expect(approved.lastDecision.actorId).toBe(accounts.reviewer.id);expect(approved.lastDecision.projectId).toBe(id);expect(approved.lastDecision.revision).toBe(revision());expect(approved.lastDecision.storyboardSha256).toMatch(/^[0-9a-f]{64}$/);pass('Independent reviewer UI exact-revision approval receipt',{revision:revision()});
 for(const [route,file] of [['scorm-12.zip','approved-scorm12.zip'],['scorm-2004.zip','approved-scorm2004.zip'],['standalone.zip','approved-standalone.zip']]){
  const r=await check(await author.get(`/api/projects/${id}/${route}?approved=true`));fs.writeFileSync(path.join(out,file),await r.body());pass('Approved '+route);
 }
 const draft=await check(await author.get(`/api/projects/${id}/scorm-12.zip`));pass('Explicitly supported draft export');
 const second=await (await check(await author.post(`/api/projects/${id}/review-comments`,{data:{sceneId:project.storyboard.scenes[0].id,authorLabel:'Author',body:'Post-approval discussion change'}}),201)).json();expect((await status()).approved).toBe(false);await check(await author.get(`/api/projects/${id}/scorm-12.zip?approved=true`),409);await check(await author.post(`/api/projects/${id}/review-comments/${second.id}/decision`,{data:{resolved:true}}));expect((await status()).approved).toBe(false);pass('New comment and resolved discussion snapshot require fresh approval');
 await check(await decision(reviewer));await check(await author.post(`/api/projects/${id}/review-comments/${second.id}/decision`,{data:{resolved:false}}));expect((await status()).approved).toBe(false);await check(await author.post(`/api/projects/${id}/review-comments/${second.id}/decision`,{data:{resolved:true}}));await check(await decision(reviewer));pass('Reopened review comment invalidates approval');
 const before=revision();project=await (await check(await author.patch(`/api/projects/${id}/scenes/${project.storyboard.scenes[0].id}`,{headers:{'If-Match':`"${revision()}"`},data:{actionDescription:'Post-approval edit'}}))).json();expect((await status()).approved).toBe(false);await check(await decision(reviewer,'approve',before),412);pass('Scene edit invalidation and stale approval rejection');
 await check(await owner.delete(`/api/projects/${id}/members/${accounts.reviewer.id}`));await check(await decision(reviewer),403);pass('Revoked reviewer cannot approve');
 await check(await owner.post(`/api/projects/${id}/members`,{data:{userId:accounts.reviewer.id,role:'reviewer'}}),201);
 await check(await decision(reviewer));const archive=await check(await author.get(`/api/projects/${id}/backup.zip`));const restore=await check(await author.post(`/api/projects/${id}/backup/restore`,{multipart:{file:{name:'synthetic-backup.zip',mimeType:'application/zip',buffer:await archive.body()}}}));project=await restore.json();expect((await status()).approved).toBe(false);expect((await status()).state).toBe('restored-needs-review');pass('Archive restore cannot manufacture or reinstate approval');
 await check(await reviewer.get(`/api/projects/${own.id}/review-approval`),403);await check(await author.get(`/api/projects/${own.id}/review-approval`),403);pass('Cross-project access and approval status isolation');
 await p.reload();await p.getByRole('button',{name:'Resume authoring',exact:true}).click();await expect(p.getByRole('region',{name:'Chimera 2.0 Authoring Studio'})).toBeVisible();await p.screenshot({path:path.join(out,'studio-reopened.png')});pass('Saved course reopened in Studio');
 fs.writeFileSync(path.join(out,'course-final.json'),JSON.stringify(project,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
