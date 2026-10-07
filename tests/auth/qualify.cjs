/* Real HTTPS frontend/API tests. All accounts, keys and passwords are disposable. */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-auth-browser-'));
const output = path.join(root, 'workspace/auth-qualification');
fs.mkdirSync(output, { recursive: true });
const python = process.env.CHIMERA_TEST_PYTHON || path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const openssl = process.env.OPENSSL_BINARY || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
const password = crypto.randomBytes(24).toString('base64url');
const replacement = crypto.randomBytes(24).toString('base64url');
const cert = path.join(temporary, 'cert.pem'), key = path.join(temporary, 'key.pem');
const certificate = spawnSync(openssl, ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',key,'-out',cert], { windowsHide: true, encoding: 'utf8' });
if(certificate.status !== 0) throw new Error('Test certificate generation failed; set OPENSSL_BINARY to OpenSSL.');
let backend, browser, server, currentPage;
let backendLog = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async()=>{
  const portProbe = http.createServer();
  await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
  const apiPort=portProbe.address().port;
  await new Promise(resolve=>portProbe.close(resolve));
  server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    if(req.url.startsWith('/api/')) {
      const upstream=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);});
      upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;
    }
    const pathname=decodeURIComponent(req.url.split('?')[0]);
    const dist=path.join(root,'frontend/dist');
    let file=path.resolve(dist,'.'+pathname);
    if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`https://127.0.0.1:${server.address().port}`;
  const environment={...process.env,CHIMERA_DEPLOYMENT_PROFILE:'darkrogue',CHIMERA_PUBLIC_ORIGIN:origin,CHIMERA_WORKSPACE:path.join(temporary,'workspace'),CHIMERA_REVIEW_ACCESS:'authenticated',CHIMERA_TEST_PASSWORD:password};
  const seed=spawnSync(python,[path.join(__dirname,'seed.py')],{cwd:root,env:environment,windowsHide:true,encoding:'utf8'});
  if(seed.status!==0)throw new Error('Hosted fixture setup failed: '+seed.stderr);
  const fixture=JSON.parse(seed.stdout.trim());
  delete environment.CHIMERA_TEST_PASSWORD;
  backend=spawn(python,['-m','uvicorn','app.main:app','--host','127.0.0.1','--port',String(apiPort),'--no-access-log'],{cwd:path.join(root,'backend'),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  backend.stdout.on('data',chunk=>backendLog+=chunk);backend.stderr.on('data',chunk=>backendLog+=chunk);
  for(let attempt=0;attempt<120;attempt++){
    if(backend.exitCode!==null)throw new Error('Hosted API exited: '+backendLog);
    try{const health=await fetch(`http://127.0.0.1:${apiPort}/api/health`);if(health.ok)break;}catch{}
    if(attempt===119)throw new Error('Hosted API did not become ready.');
    await pause(250);
  }
  try{browser=await chromium.launch();}catch{browser=await chromium.launch({channel:'msedge'});}
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1536,height:1024}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  currentPage = page;
  const login=async(email,pw)=>{await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(pw);await page.getByRole('button',{name:'Sign in',exact:true}).click();};
  await page.goto(origin);await page.getByRole('heading',{name:'Sign in to Chimera',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'login-desktop.png'),fullPage:true});
  const AxeBuilder=require('@axe-core/playwright').default;
  const accessibility=await new AxeBuilder({page}).analyze();
  assert.deepEqual(accessibility.violations.map(v=>v.id),[]);
  await login('operator@example.test','wrong password');
  await page.getByRole('alert').filter({hasText:'Email or password is incorrect'}).waitFor();
  await page.getByRole('button',{name:'Forgot password?'}).click();
  await page.getByRole('heading',{name:'Request a password reset link'}).waitFor();
  await page.screenshot({path:path.join(output,'recovery-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'login-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1536,height:1024});
  await login('operator@example.test',password);await page.getByLabel('Workspace navigation').getByText('Test Operator',{exact:true}).waitFor();
  const cookies=await context.cookies();const session=cookies.find(c=>c.name==='__Host-chimera-session');assert(session&&session.secure&&session.httpOnly&&session.sameSite==='Strict');
  await page.getByLabel('Switch project').selectOption(fixture.projectId);
  await page.getByRole('button',{name:'Resume authoring',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Project access',exact:true}).click();
  await page.getByRole('heading',{name:/Project access/}).waitFor();await page.locator('table').getByText('Test Reviewer').waitFor();
  await page.screenshot({path:path.join(output,'project-access.png'),fullPage:true});
  const reviewerContext=await browser.newContext({ignoreHTTPSErrors:true});const reviewerPage=await reviewerContext.newPage();
  await reviewerPage.goto(fixture.reviewUrl);await reviewerPage.getByLabel('Email',{exact:true}).fill('reviewer@example.test');await reviewerPage.getByLabel('Password',{exact:true}).fill(password);await reviewerPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await reviewerPage.getByRole('heading',{name:'Review the learning objective',exact:true}).waitFor();
  assert.equal(await reviewerPage.getByRole('button',{name:'Enhance',exact:true}).count(),0);
  const denied=await reviewerContext.request.get(`${origin}/api/projects/${fixture.otherProjectId}`);assert.equal(denied.status(),403);
  await reviewerPage.getByLabel('Comment',{exact:true}).fill('HTTPS reviewer feedback');await reviewerPage.getByRole('button',{name:'Add comment'}).click();await reviewerPage.getByText('HTTPS reviewer feedback',{exact:true}).waitFor();
  await reviewerPage.screenshot({path:path.join(output,'authenticated-review.png'),fullPage:true});
  await reviewerContext.close();
  await page.goto(origin+'/#reset='+fixture.resetToken);await page.getByRole('heading',{name:'Reset your password'}).waitFor();
  await page.getByLabel('New password',{exact:true}).fill(replacement);await page.getByLabel('Confirm password',{exact:true}).fill(replacement+'mismatch');await page.getByRole('button',{name:'Save password'}).click();await page.getByRole('alert').filter({hasText:'Passwords do not match'}).waitFor();
  await page.getByLabel('Confirm password',{exact:true}).fill(replacement);await page.screenshot({path:path.join(output,'reset-password.png'),fullPage:true});await page.getByRole('button',{name:'Save password'}).click();await page.getByRole('status').filter({hasText:'Password saved'}).waitFor();
  await login('operator@example.test',replacement);await page.getByLabel('Workspace navigation').getByText('Test Operator',{exact:true}).waitFor();
  await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin}});await page.evaluate(()=>fetch('/api/projects'));await page.getByRole('heading',{name:'Sign in to Chimera'}).waitFor();await page.getByRole('alert').filter({hasText:'session expired'}).waitFor();
  await login('operator@example.test',replacement);await page.getByLabel('Workspace navigation').getByText('Test Operator',{exact:true}).waitFor();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Sign in to Chimera'}).waitFor();
  assert.deepEqual(errors,[]);
  const results={https:true,invalidPassword:true,login:true,secureCookie:true,recoveryGuidance:true,passwordReset:true,projectMembers:true,authenticatedReview:true,reviewerIsolation:true,comment:true,sessionExpiry:true,logout:true,mobileOverflow:false,axeViolations:accessibility.violations.length,javascriptErrors:errors,scope:'Isolated HTTPS proxy, disposable workspace and accounts; not live darkrogue.io'};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} )().catch(async error=>{if(currentPage)await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(backend&&backend.exitCode===null){backend.kill();await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),pause(5000)]);}
  if(server)await new Promise(resolve=>server.close(resolve));
  const resolvedTemporary=path.resolve(temporary), tempRoot=path.resolve(os.tmpdir());
  if(resolvedTemporary.startsWith(tempRoot+path.sep)&&path.basename(resolvedTemporary).startsWith('chimera-auth-browser-'))fs.rmSync(resolvedTemporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});
