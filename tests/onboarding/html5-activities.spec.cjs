const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const python = require('./python.cjs');

function document(adapter = 'custom') {
  const script = `
    const adapter = ${JSON.stringify(adapter)};
    const api = adapter === 'scorm-12' ? window.API : window.API_1484_11;
    const set = (key, value) => api[adapter === 'scorm-12' ? 'LMSSetValue' : 'SetValue'](key, value);
    const get = key => api[adapter === 'scorm-12' ? 'LMSGetValue' : 'GetValue'](key);
    if(adapter !== 'custom') api[adapter === 'scorm-12' ? 'LMSInitialize' : 'Initialize']('');
    const initial = adapter === 'custom' ? ChimeraActivity.getState().suspendData : get('cmi.suspend_data');
    document.querySelector('#resume').textContent = initial || 'New activity';
    try { parent.document.body.dataset.compromised = 'yes'; } catch { document.querySelector('#isolation').textContent = 'Parent isolated'; }
    try { localStorage.setItem('should-not-write', 'yes'); } catch { document.querySelector('#storage').textContent = 'Storage isolated'; }
    document.querySelector('#bookmark').onclick = () => {
      if(adapter === 'custom') ChimeraActivity.report({suspendData:'step-two',location:'page-two'});
      else { set('cmi.suspend_data','step-two'); set(adapter==='scorm-12'?'cmi.core.lesson_location':'cmi.location','page-two'); }
    };
    document.querySelector('#finish').onclick = () => {
      if(adapter === 'custom') ChimeraActivity.report({score:85, completed:true,suspendData:'finished',location:'done'});
      else {
        const prefix = adapter==='scorm-12'?'cmi.core.score':'cmi.score';
        set(prefix+'.min','0'); set(prefix+'.max','20'); set(prefix+'.raw','17');
        document.querySelector('#invalid-result').textContent = 'Raw score '+get(prefix+'.raw');
        set('cmi.suspend_data','finished');
        set(adapter==='scorm-12'?'cmi.core.lesson_status':'cmi.completion_status','completed');
        api[adapter==='scorm-12'?'LMSCommit':'Commit']('');
      }
    };
    document.querySelector('#invalid').onclick = () => {
      const accepted = adapter === 'custom' ? ChimeraActivity.report({score:101}) :
        set(adapter==='scorm-12'?'cmi.core.score.raw':'cmi.score.raw','101') === 'true';
      document.querySelector('#invalid-result').textContent = accepted ? 'Accepted invalid score' : 'Invalid score rejected';
    };
    document.querySelector('#oversize').onclick = () => {
      const accepted = adapter === 'custom' ? ChimeraActivity.report({suspendData:'x'.repeat(2001)}) :
        set('cmi.suspend_data','x'.repeat(2001)) === 'true';
      document.querySelector('#invalid-result').textContent = accepted ? 'Accepted oversize state' : 'Oversize state rejected';
    };
    document.querySelector('#completion').onclick = () => ChimeraActivity.report({completed:true});
    document.querySelector('#zero').onclick = () => ChimeraActivity.report({score:0,completed:true});
    document.querySelector('#fail').onclick = () => { throw new Error('Synthetic activity failure'); };
  `;
  return { html: `<!doctype html><html lang="en"><head><title>Portable practice</title><link rel="stylesheet" href="assets/style.css"></head>
    <body><h1>Portable practice</h1><img src="assets/icon.svg" alt="Practice symbol">
    <p id="resume"></p><p id="isolation"></p><p id="storage"></p><p id="invalid-result" role="status"></p>
    <button id="bookmark">Save checkpoint</button><button id="finish">Finish activity</button>
    <button id="invalid">Send invalid score</button><button id="oversize">Send oversize state</button>
    <button id="completion">Report completion only</button><button id="zero">Report zero score</button>
    <button id="fail">Trigger script failure</button>
    <script src="assets/run.js"></script></body></html>`, script };
}
function zip(adapter) {
  const fixture = document(adapter);
  return execFileSync(python, ['-c', `import io,json,sys,zipfile
files=json.loads(sys.argv[1])
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as archive:
 for name,value in files.items(): archive.writestr(name,value)
sys.stdout.buffer.write(out.getvalue())`,
  JSON.stringify({ 'index.html': fixture.html, 'assets/run.js': fixture.script,
    'assets/style.css': 'body{font:18px system-ui;color:#111;background:#fff}button{padding:12px;margin:6px}',
    'assets/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="purple"/></svg>' })]);
}
async function create(request, adapter = 'custom', tracking = 'scored') {
  let project = await (await request.post('/api/projects', { data: { title: 'HTML5 delivery fixture' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { title: 'External practice' },
  })).json();
  const imported = await request.post(`/api/projects/${project.id}/html5-import`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    multipart: { file: { name: 'practice.zip', mimeType: 'application/zip', buffer: zip(adapter) },
      credit: 'Synthetic original activity; permission to redistribute', entrypoint: 'index.html' },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const result = await imported.json(); project = result.project;
  const attached = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { html5Activity: { assetId: result.assetId, title: 'Portable practice', alternative: 'Practice responding, then finish to report 85 percent.',
      tracking, scoreWeight: 2 } },
  });
  expect(attached.ok(), await attached.text()).toBeTruthy();
  return attached.json();
}
async function open(page, project) {
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/'); await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
}
async function deliver(page, request, project, profile, testInfo, initial = {}) {
  const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const archive = testInfo.outputPath('course.zip'), directory = testInfo.outputPath('course');
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(archive, await response.body());
  execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
  await page.route('http://html5-course.test/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if (!['index.html', 'player.js', 'storyboard.json'].includes(name)) return route.abort();
    return route.fulfill({ body: await fs.readFile(path.join(directory, name)),
      contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html' });
  });
  if (profile !== 'standalone') await page.addInitScript(({ legacy, initial }) => {
    const state = JSON.parse(localStorage.getItem('html5-lms') || 'null') || initial;
    const api = {};
    api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
    api[legacy ? 'LMSGetValue' : 'GetValue'] = key => state[key] || '';
    api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { state[key] = value; return 'true'; };
    api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('html5-lms', JSON.stringify(state)); return 'true'; };
    api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
    window[legacy ? 'API' : 'API_1484_11'] = api;
  }, { legacy: profile === 'scorm-12', initial });
  await page.goto(profile === 'standalone' ? pathToFileURL(path.join(directory, 'index.html')).href : 'http://html5-course.test/index.html');
}

test('author imports a package, reviews tracking, saves, reopens and removes without losing the canvas', async ({ page, request }, testInfo) => {
  let project = await (await request.post('/api/projects', { data: { title: 'HTML5 authoring' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title: 'My activity' },
    headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
  await open(page, project);
  await page.getByRole('button', { name: 'HTML5 activity', exact: true }).click();
  let dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Import credit and usage rights').fill('Original synthetic activity; permission to distribute');
  await dialog.getByLabel('Upload HTML5 file or ZIP').setInputFiles({ name: 'activity.zip', mimeType: 'application/zip', buffer: zip('custom') });
  await expect(dialog.getByRole('status').filter({ hasText: 'Imported. Review configuration' })).toBeVisible();
  await dialog.getByLabel('Activity title', { exact: true }).fill('Portable practice');
  await dialog.getByLabel('Accessible text alternative').fill('Read the example and complete the practice.');
  await dialog.getByLabel('Activity tracking').selectOption('scored');
  await dialog.getByLabel('Activity score weight').fill('2');
  await dialog.getByLabel('I reviewed the package', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Save reviewed HTML5 activity', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Reviewed HTML5 activity saved.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('html5-author.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  const preview = page.getByRole('dialog').last();
  const frame = preview.frameLocator('iframe[title="Portable practice"]');
  await expect(frame.getByRole('heading', { name: 'Portable practice' })).toBeVisible();
  await frame.getByRole('button', { name: 'Finish activity', exact: true }).click();
  await expect(preview.getByText('Activity completed. Score: 85%.', { exact: true })).toBeVisible();
  await expect(preview.getByText('Course passed · Score 85%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  await expect(page.getByRole('dialog').last().frameLocator('iframe').locator('#resume')).toHaveText('finished');
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.getByRole('button', { name: 'HTML5 activity', exact: true }).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog.getByLabel('Activity tracking')).toHaveValue('scored');
  await dialog.getByRole('button', { name: 'Remove HTML5 activity', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm remove HTML5 activity', exact: true }).click();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.storyboard.scenes[0].html5Activity).toBeNull();
  expect(saved.storyboard.assets.filter(a => a.kind === 'html5')).toHaveLength(1);
});

for (const profile of ['standalone', 'scorm-12', 'scorm-2004']) {
  for (const adapter of ['custom', 'scorm-12', 'scorm-2004']) {
    test(`${profile} hosts ${adapter} package with isolated results and resume`, async ({ page, request }, testInfo) => {
      const project = await create(request, adapter);
      await deliver(page, request, project, profile, testInfo);
      const frame = page.frameLocator('iframe[title="Portable practice"]');
      await expect(frame.locator('#isolation')).toHaveText('Parent isolated');
      await expect(frame.locator('#storage')).toHaveText('Storage isolated');
      expect(await frame.locator('img').evaluate(img => img.naturalWidth)).toBe(32);
      await frame.getByRole('button', { name: 'Send invalid score', exact: true }).click();
      await expect(frame.locator('#invalid-result')).toHaveText('Invalid score rejected');
      await frame.getByRole('button', { name: 'Send oversize state', exact: true }).click();
      await expect(frame.locator('#invalid-result')).toHaveText('Oversize state rejected');
      await frame.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
      await expect(page.locator('.html5-activity').getByRole('status')).toHaveText('Activity in progress.');
      if (profile !== 'standalone') {
        const data = await page.evaluate(() => JSON.parse(localStorage.getItem('html5-lms')));
        expect(data[profile === 'scorm-12' ? 'cmi.core.lesson_status' : 'cmi.completion_status']).toBe('incomplete');
        const progress = JSON.parse(data['cmi.suspend_data']).html5[project.storyboard.scenes[0].id];
        expect(progress.suspendData).toBe('step-two'); expect(progress.location).toBe('page-two');
        await page.reload(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(frame.locator('#resume')).toHaveText('step-two');
      }
      await frame.getByRole('button', { name: 'Finish activity', exact: true }).click();
      await expect(page.locator('.html5-activity').getByRole('status')).toHaveText('Activity completed. Score: 85%.');
      if (adapter !== 'custom') await expect(frame.locator('#invalid-result')).toHaveText('Raw score 17');
      if (profile !== 'standalone') {
        const data = await page.evaluate(() => JSON.parse(localStorage.getItem('html5-lms')));
        expect(data[profile === 'scorm-12' ? 'cmi.core.score.raw' : 'cmi.score.raw']).toBe('85');
        expect(data[profile === 'scorm-12' ? 'cmi.core.lesson_status' : 'cmi.success_status']).toBe('passed');
        await page.reload(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(frame.locator('#resume')).toHaveText('finished');
        await page.reload(); await page.getByRole('button', { name: 'Start over', exact: true }).click();
        await expect(frame.locator('#resume')).toHaveText('New activity');
      }

      expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
    });
  }
}

test('tracking modes distinguish viewing, completion, missing scores and a valid zero', async ({ page, request }) => {
        for (const tracking of ['view', 'completion', 'scored']) {
          const project = await create(request, 'custom', tracking);
          await open(page, project);
          await page.getByRole('button', { name: 'Preview course', exact: true }).click();
          const preview = page.getByRole('dialog').last();
          const frame = preview.frameLocator('iframe[title="Portable practice"]');
          await expect(frame.getByRole('heading', { name: 'Portable practice' })).toBeVisible();
          await expect(preview.getByText(tracking === 'view' ? 'Course passed · Score 100%' : '0 of 1 required scenes · 0 of 0 required audio tracks', { exact: true })).toBeVisible();
          await frame.getByRole('button', { name: 'Report completion only', exact: true }).click();
          if (tracking === 'scored') {
            await expect(preview.getByText('Activity reported completion without a score; a score is still required.', { exact: true })).toBeVisible();
            await expect(preview.getByText('0 of 1 required scenes · 0 of 0 required audio tracks', { exact: true })).toBeVisible();
            await frame.getByRole('button', { name: 'Report zero score', exact: true }).click();
            await expect(preview.getByText('Course complete · Score 0% · Pass 80%', { exact: true })).toBeVisible();
          } else await expect(preview.getByText('Course passed · Score 100%', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
        }
      });

      test('sandbox rejects forged reports and network access, and surfaces script failures', async ({ page, request }) => {
        const project = await create(request);
        await open(page, project);
        await page.getByRole('button', { name: 'Preview course', exact: true }).click();
        const preview = page.getByRole('dialog').last();
        const frame = preview.frameLocator('iframe[title="Portable practice"]');
        await expect(frame.getByRole('heading', { name: 'Portable practice' })).toBeVisible();
        const state = { completed: true, score: 100, suspendData: '', location: '' };
        await frame.locator('body').evaluate((_, state) => parent.postMessage({ type: 'chimera-html5-progress', token: 'forged', state }, '*'), state);
        await page.evaluate(state => window.postMessage({ type: 'chimera-html5-progress', token: 'forged', state }, '*'), state);
        await expect(preview.getByText('0 of 1 required scenes · 0 of 0 required audio tracks', { exact: true })).toBeVisible();
        let requests = 0;
        page.on('request', request => { if (request.url().includes('/api/health')) requests++; });
        await frame.locator('body').evaluate(async () => { try { await fetch('http://127.0.0.1:8027/api/health'); } catch { /* Expected CSP rejection. */ } });
        await expect(preview.getByRole('status').filter({ hasText: 'Activity error: The activity tried an unsupported network request' })).toBeVisible();
        expect(requests).toBe(0);
        await frame.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
        await expect(preview.locator('.html5-activity').getByRole('status')).toHaveText('Activity in progress.');
        await frame.getByRole('button', { name: 'Trigger script failure', exact: true }).click();
        await expect(preview.locator('.html5-activity').getByRole('status')).toHaveText(/Activity error: .*(Script error\.?|Synthetic activity failure).*Review the package/);
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await expect(preview.locator('iframe')).toBeHidden();
        await expect(preview.getByText('Practice responding, then finish to report 85 percent.', { exact: true })).toBeVisible();
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        await expect(preview.locator('iframe')).toBeVisible();
        await page.route('http://unsupported-navigation.test/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Unsupported navigation target</p>' }));
        await frame.locator('body').evaluate(() => { location.href = 'http://unsupported-navigation.test/'; });
        await expect(preview.getByRole('status').filter({ hasText: 'Activity navigation is unsupported.' })).toBeVisible();
        await expect(preview.locator('iframe')).toHaveCount(0);
      });

      for (const profile of ['scorm-12', 'scorm-2004']) {
        for (const policy of ['required', 'optional-included', 'optional-excluded']) {
          test(`${profile} combines native and external weighted scores: ${policy}`, async ({ page, request }, testInfo) => {
            let project = await create(request);
            project = await (await request.post(`/api/projects/${project.id}/scenes`, {
              headers: { 'If-Match': `"${project.storyboard.revision}"` },
              data: { title: 'Native check', sceneType: 'assessment',
                assessmentItem: { type: 'true-false', identifier: 'native-check', prompt: 'Check the handoff first?', correctResponse: 'true' } },
            })).json();
            const external = project.storyboard.scenes[0], native = project.storyboard.scenes[1];
            if (policy !== 'required') project = await (await request.patch(`/api/projects/${project.id}/scenes/${external.id}`, {
              headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { required: false },
            })).json();
            project = await (await request.patch(`/api/projects/${project.id}/completion-settings`, {
              headers: { 'If-Match': `"${project.storyboard.revision}"` },
              data: { ...project.storyboard.completionSettings, includeOptionalAssessments: policy === 'optional-included' },
            })).json();
            const result = { attempts: 1, isCorrect: true };
            await page.goto('/');
            const previewScore = await page.evaluate(async ({ project, externalId, nativeId, result, score }) => {
              const { evaluateCourseCompletion } = await import('/src/completion.ts');
              return evaluateCourseCompletion(project.storyboard.scenes, project.storyboard.completionSettings,
                [externalId, nativeId], [], {}, { [nativeId]: result },
                { [externalId]: { assetId: project.storyboard.scenes[0].html5Activity.assetId, completed: true, score, suspendData: '', location: '' } }).weightedScore;
            }, { project, externalId: external.id, nativeId: native.id, result, score: 85 });
            expect(previewScore).toBe(policy === 'optional-excluded' ? 100 : 90);
            await deliver(page, request, project, profile, testInfo, {
              'cmi.suspend_data': JSON.stringify({ visited: [external.id, native.id], assessments: { [native.id]: result } }),
            });
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            const frame = page.frameLocator('iframe[title="Portable practice"]');
            await frame.getByRole('button', { name: 'Finish activity', exact: true }).click();
            await expect(page.locator('.html5-activity').getByRole('status')).toHaveText('Activity completed. Score: 85%.');
            const data = await page.evaluate(() => JSON.parse(localStorage.getItem('html5-lms')));
            expect(Number(data[profile === 'scorm-12' ? 'cmi.core.score.raw' : 'cmi.score.raw'])).toBe(previewScore);
          });
        }
      }
