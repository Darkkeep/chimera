const {test, expect} = require('@playwright/test');
const {execFileSync} = require('node:child_process');
const {openWorkspaceMenu} = require('../onboarding/helpers.cjs');
const AxeBuilder = require('@axe-core/playwright').default;
test.setTimeout(90000);
async function open(page, surface = 'My Work') {
  await page.route('**/api/projects', async route => route.request().method() === 'GET' ? route.fulfill({json:[]}) : route.continue());
  await page.goto('/');
  if (surface === 'workspace') await openWorkspaceMenu(page);
  const trigger = surface === 'My Work' ? page.getByRole('button', {name:'New Project',exact:true}) : page.getByRole('button', {name:'Create project',exact:true});
  await trigger.click();
  const choice = page.getByRole('dialog', {name:'New Project',exact:true});
  await expect(choice.getByRole('button', {name:'Start from a file'})).toBeFocused();
  await choice.getByRole('button', {name:'Start from a file'}).press('Enter');
  return page.getByRole('dialog',{name:'Start Experience from Import'});
}
for (const surface of ['My Work', 'workspace']) test(`${surface} primary New Project: Pythia JSON preview, explicit create, review, accept and edit`, async ({page}, info) => {
  const dialog = await open(page, surface);
  const writes=[];
  page.on('request', r=>{if(r.method()==='POST' && /\/api\/projects(?:$|\/)/.test(new URL(r.url()).pathname)) writes.push(r.url());});
  await dialog.getByLabel('Experience import file').setInputFiles('backend/tests/fixtures/production-handoff-v1.json');
  await expect(dialog.getByRole('heading',{name:'Pythia production handoff'})).toBeVisible();
  await expect(dialog.getByText(/question scene withheld/)).toBeVisible();
  expect(writes).toEqual([]);
  const axe = await new AxeBuilder({page}).include('[role="dialog"]').analyze();
  expect(axe.violations).toEqual([]);
  await dialog.screenshot({path:info.outputPath('import-preview.png')});
  await dialog.getByRole('button',{name:'Create experience and review scenes'}).click();
  const panel=page.getByRole('region',{name:'Progressive scene proposals'});
  const proposal=panel.getByRole('article',{name:'Draft proposal: Leave by a marked exit'});
  await expect(proposal).toBeVisible();
  const id=await page.evaluate(()=>localStorage.getItem('chimera.activeProjectId'));
  expect((await (await page.request.get(`/api/projects/${id}`)).json()).storyboard.scenes).toHaveLength(0);
  await proposal.getByRole('button',{name:'Accept and edit',exact:true}).click();
  const editor=page.locator('.studio-inline-editor');
  await editor.locator('.visual-editable').first().dblclick();
  await editor.getByRole('textbox',{name:'Edit canvas text'}).fill('Owner reviewed and edited this imported scene.');
  await editor.getByRole('textbox',{name:'Edit canvas text'}).press('Tab');
  await editor.getByRole('button',{name:'Save scene',exact:true}).click();
  await expect(editor).toHaveAttribute('data-dirty','false');
  const saved=await (await page.request.get(`/api/projects/${id}`)).json();
  expect(JSON.stringify(saved.storyboard)).toContain('Owner reviewed and edited');
});
test('bad and unknown JSON cannot create or overwrite a project; cancel restores focus', async ({page})=>{
  const dialog=await open(page);
  for (const content of ['{broken',JSON.stringify({title:'Unknown',scenes:[]})]) {
    await dialog.getByLabel('Experience import file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(content)});
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button',{name:/Create experience/})).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'New Project',exact:true})).toBeFocused();
});
test('PowerPoint preview and creation use the existing deck importer', async ({page})=>{
  const dialog=await open(page);
  const buffer=execFileSync(process.env.CHIMERA_TEST_PYTHON || 'python3',['tests/onboarding/make-pptx.py']);
  await dialog.getByLabel('Experience import file').setInputFiles({name:'Owner slides.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer});
  await expect(dialog.getByRole('heading',{name:'PowerPoint presentation'})).toBeVisible();
  const imported = page.waitForResponse(response => /\/source$/.test(response.url()) && response.request().method() === 'POST', {timeout:60000});
  await dialog.getByRole('button',{name:'Create experience and import'}).click();
  expect((await imported).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  const id=await page.evaluate(()=>localStorage.getItem('chimera.activeProjectId'));
  expect((await (await page.request.get(`/api/projects/${id}`)).json()).storyboard.scenes.length).toBeGreaterThan(0);
});

test('drop a native storyboard backup and explicitly restore into a separate new project', async ({page})=>{
  const dialog=await open(page);
  const source=await (await page.request.post('/api/projects',{data:{title:'Original stays safe'}})).json();
  const scene=await (await page.request.post(`/api/projects/${source.id}/scenes`,{headers:{'If-Match':`"${source.storyboard.revision}"`},data:{title:'Restored lesson',extractedText:['Native backup text']}})).json();
  const raw=JSON.stringify(scene.storyboard);
  const transfer=await page.evaluateHandle(raw=>{const transfer=new DataTransfer();transfer.items.add(new File([raw],'backup.json',{type:'application/json'}));return transfer;},raw);
  await dialog.getByLabel('Experience import file').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(dialog.getByRole('heading',{name:'Chimera storyboard backup'})).toBeVisible();
  await page.setViewportSize({width:320,height:900});
  expect(await dialog.evaluate(element=>element.scrollWidth <= element.clientWidth+1)).toBe(true);
  await dialog.getByRole('button',{name:'Create experience and import'}).click();
  await expect(dialog).toHaveCount(0);
  const id=await page.evaluate(()=>localStorage.getItem('chimera.activeProjectId'));
  expect(id).not.toBe(source.id);
  const restored=await (await page.request.get(`/api/projects/${id}`)).json();
  expect(restored.storyboard.scenes[0].title).toBe('Restored lesson');
  const original=await (await page.request.get(`/api/projects/${source.id}`)).json();
  expect(original.storyboard).toEqual(scene.storyboard);
});

for (const surface of ['My Work', 'workspace']) test(`${surface} New Project keyboard, responsive choice and idea creation`, async ({page}) => {
  await page.route('**/api/projects', async route => route.request().method() === 'GET' ? route.fulfill({json:[]}) : route.continue());
  await page.goto('/');
  if (surface === 'workspace') await openWorkspaceMenu(page);
  const trigger = surface === 'My Work' ? page.getByRole('button', {name:'New Project',exact:true}) : page.getByRole('button', {name:'Create project',exact:true});
  await trigger.focus();
  await trigger.press('Enter');
  const choice = page.getByRole('dialog', {name:'New Project',exact:true});
  await expect(choice.getByRole('button', {name:'Start from a file'})).toBeFocused();
  await page.setViewportSize({width:320,height:900});
  expect(await choice.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.keyboard.press('Shift+Tab');
  await expect(choice.getByRole('button', {name:'Cancel',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(choice.getByRole('button', {name:'Start from a file'})).toBeFocused();
  await page.keyboard.press('Escape');
  if (surface === 'workspace') {
    await expect(page.locator('.workspace-menu-toggle')).toBeFocused();
    await openWorkspaceMenu(page);
  } else await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await choice.getByRole('button', {name:'Start with an idea'}).click();
  const form = page.getByRole('dialog', {name:'Name your course'});
  await expect(form.getByLabel('Course name', {exact:true})).toBeFocused();
  await form.getByLabel('Course name', {exact:true}).fill('Owner idea path');
  await expect(form.getByLabel('Attach course design documents')).toBeVisible();
  await form.getByRole('button', {name:'Create project',exact:true}).click();
  await expect(form).toHaveCount(0);
  const id = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  expect((await (await page.request.get(`/api/projects/${id}`)).json()).title).toBe('Owner idea path');
});
