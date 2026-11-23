const {chromium,expect}=require('@playwright/test'),fs=require('fs'),path=require('path'),http=require('http');
const root=process.env.CHIMERA_QUALIFICATION_OUTPUT||path.resolve('workspace/pr54-qualification'),results=[];
(async()=>{const browser=await chromium.launch();try{
for(const [folder,profile] of [['approved-scorm12','1.2'],['approved-scorm2004','2004'],['approved-standalone','standalone']]){
 const dir=path.join(root,folder);const server=http.createServer((req,res)=>{
  if(req.url==='/harness'){
   res.setHeader('Content-Type','text/html');res.end(`<html><title>Isolated ${profile} runtime test player</title><script>
window.state=JSON.parse(localStorage.getItem('tracking')||'{}');window.calls=[];
const api={};const record=(m,k,v)=>{calls.push([m,k,v]);if(m.includes('SetValue')){state[k]=v;localStorage.setItem('tracking',JSON.stringify(state));}return m.includes('GetValue')?(state[k]||''):'true'};
for(const m of ['LMSInitialize','LMSFinish','LMSCommit','LMSGetValue','LMSSetValue','Initialize','Terminate','Commit','GetValue','SetValue'])api[m]=(k,v)=>record(m,k,v);
api.LMSGetLastError=api.GetLastError=()=> '0';api.LMSGetErrorString=api.GetErrorString=()=>'';
window.${profile==='2004'?'API_1484_11':'API'}=api;</script><iframe title="Course" style="width:100%;height:95vh" src="/index.html"></iframe></html>`);return;
  }
  const file=path.resolve(dir,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const context=await browser.newContext();let p=await context.newPage();
 try{
 await p.goto(origin+'/harness');let sco=p.frameLocator('iframe');await expect(sco.locator('#scene-title')).toBeVisible();await sco.getByRole('button',{name:'Next',exact:true}).click();await expect(sco.getByRole('button',{name:'Pause and collect relevant information',exact:true})).toBeVisible();
 if(profile!=='standalone'){
  expect(await p.evaluate(()=>calls.some(x=>/Initialize/.test(x[0])))).toBe(true);
  await p.close();p=await context.newPage();await p.goto(origin+'/harness');sco=p.frameLocator('iframe');await expect(sco.getByRole('button',{name:'Continue',exact:true})).toBeVisible();await sco.getByRole('button',{name:'Continue',exact:true}).click();await expect(sco.getByRole('button',{name:'Pause and collect relevant information',exact:true})).toBeVisible();
 }
 await sco.getByRole('button',{name:'Pause and collect relevant information',exact:true}).click();await sco.getByRole('button',{name:'Next',exact:true}).click();await sco.getByRole('radio',{name:'False',exact:true}).check();await sco.getByRole('button',{name:'Check answer',exact:true}).click();
 if(profile!=='standalone'){
  const state=await p.evaluate(()=>state);expect(Number(state[profile==='1.2'?'cmi.core.score.raw':'cmi.score.raw'])).toBe(100);
  if(profile==='1.2')expect(state['cmi.core.lesson_status']).toBe('passed');else{expect(state['cmi.completion_status']).toBe('completed');expect(state['cmi.success_status']).toBe('passed');}
 }
 await p.screenshot({path:path.join(root,'runtime-'+profile.replace('.','')+'.png')});results.push({profile,launch:'PASS',branching:'PASS',assessment:'PASS',tracking:profile==='standalone'?'not applicable':'PASS',freshLaunchResume:profile==='standalone'?'not tested':'PASS',scope:'Standalone test player; not LMS certification'});console.log('PASS runtime '+profile);
 }finally{await context.close();await new Promise(r=>server.close(r));}
}
}finally{fs.writeFileSync(path.join(root,'runtime-results.json'),JSON.stringify(results,null,2));await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
