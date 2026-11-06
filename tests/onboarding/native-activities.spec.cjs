const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');
const experience = {
  version: 1, heading: 'Practice responding', introduction: 'Explore a response to an incident.',
  flow: [], reveals: [], conclusion: 'Use evidence to guide your actions.', motion: false,
  background: '#100818', foreground: '#E8E5EA', accent: '#FF32AA', accentText: '#100818', diagramAccent: '#8542E8',
  activities: [
    { kind: 'branching', id: 'decision', title: 'Handle an incident', startNodeId: 'start',
      variables: [{ id: 'evidence', label: 'Evidence gathered', initialValue: false }], nodes: [
      { id: 'start', prompt: 'What is your first action?', choices: [
        { label: 'Investigate', feedback: 'Gather evidence.', nextNodeId: 'review',
          setVariables: [{ variableId: 'evidence', value: true }] },
        { label: 'Ignore', feedback: 'The incident continues.', nextNodeId: null }] },
      { id: 'review', prompt: 'What follows investigation?', choices: [
        { label: 'Report', feedback: 'Share what you found.', nextNodeId: null,
          visibleWhen: { variableId: 'evidence', equals: true } },
        { label: 'Wait', feedback: 'Consider the risk of delay.', nextNodeId: null,
          visibleWhen: { variableId: 'evidence', equals: false } },
        { label: 'Ask for guidance', feedback: 'A second perspective can help.', nextNodeId: null }] }] },
    { kind: 'hotspots', id: 'diagram', title: 'Explore the system', diagramDescription: 'Sensor on the left; controller on the right.',
      hotspots: [{ id: 'sensor', label: 'Sensor', explanation: 'Measures the input.', x: 20, y: 50 },
        { id: 'controller', label: 'Controller', explanation: 'Responds to the measurement.', x: 80, y: 50 }] },
    { kind: 'sequencing', id: 'order', title: 'Order the response', instruction: 'Place the response steps in order.',
      items: [{ id: 'observe', label: 'Observe' }, { id: 'act', label: 'Act' }], feedback: 'Observe before acting.' },
    { kind: 'guided-practice', id: 'practice', title: 'Practice a response', steps: [
      { id: 'identify', prompt: 'How do you begin?', hint: 'Start with evidence.', correctChoiceId: 'gather', choices: [
        { id: 'guess', label: 'Guess', feedback: 'Guessing is unreliable.' },
        { id: 'gather', label: 'Gather facts', feedback: 'Facts guide the decision.' }] },
      { id: 'respond', prompt: 'What comes next?', hint: 'Share your findings.', correctChoiceId: 'report', choices: [
        { id: 'report', label: 'Report findings', feedback: 'Others can now act.' },
        { id: 'forget', label: 'Forget it', feedback: 'The risk remains.' }] }] },
    { kind: 'software-walkthrough', id: 'walkthrough', title: 'Walk through support request', steps: [
      { id: 'open-settings', label: 'Open settings', screenshotAssetId: 'screenshot',
        screenshotAltText: 'Settings screen with the account menu open.',
        description: 'The account menu is open in the settings screen.',
        actionPrompt: 'Open the account settings.' },
      { id: 'save-profile', label: 'Save the profile', screenshotAssetId: 'screenshot',
        screenshotAltText: 'Profile form with the Save button visible.',
        description: 'The profile form is ready to save.',
        actionPrompt: 'Save the updated profile.' }] },
    { kind: 'learner-conversation', id: 'roleplay', title: 'Practice a coaching conversation',
      role: 'A supportive coach', scenario: 'Discuss a fictional workplace decision.',
      opening: 'What would you like to consider first?',
      responses: ['What else could you try?', 'What would help you decide?'],
      offlineAlternative: 'Write a response to the scenario, then compare it with these prompts.' },
  ],
};

async function imageFixture(page) {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#28784a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(image, 'base64');
}

async function course(request, authored = true, image) {
  let project = await (await request.post('/api/projects', { data: { title: 'Native activity fixture' } })).json();
  project = await (await request.post(`/api/projects/${project.id}/scenes`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { title: 'Response practice' },
  })).json();
  if (!authored) return project;
  const uploaded = await addProjectImage(request, project, image);
  project = uploaded.project;
  const authoredExperience = structuredClone(experience);
  authoredExperience.activities.find(activity => activity.kind === 'hotspots').imageAssetId = uploaded.asset.id;
  authoredExperience.activities.find(activity => activity.kind === 'software-walkthrough')
    .steps.forEach(step => { step.screenshotAssetId = uploaded.asset.id; });
  const saved = await request.patch(`/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` }, data: { experience: authoredExperience },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  return saved.json();
}

async function addProjectImage(request, project, image) {
  let response = await request.post(`/api/projects/${project.id}/assets`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    multipart: { file: { name: 'diagram.png', mimeType: 'image/png', buffer: image } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  project = await response.json();
  const asset = project.storyboard.assets.find(item => item.filename === 'diagram.png');
  response = await request.patch(`/api/projects/${project.id}/assets/${asset.id}/attribution`, {
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
    data: { attributionText: 'Synthetic image credit', attributionStatus: 'complete' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { project: await response.json(), asset };
}

async function open(page, project) {
  await page.addInitScript(id => localStorage.setItem('chimera.activeProjectId', id), project.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume authoring', exact: true }).click();
}

async function interact(native) {
  const branch = native.getByRole('group', { name: 'Handle an incident', exact: true });
  await branch.getByRole('button', { name: 'Investigate', exact: true }).focus();
  await branch.getByRole('button', { name: 'Investigate', exact: true }).press('Enter');
  await expect(branch.getByRole('heading', { name: 'What follows investigation?', exact: true })).toBeFocused();
  await expect(branch.getByText('Investigate: Gather evidence.', { exact: true })).toBeVisible();
  await expect(branch.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
  await expect(branch.getByRole('button', { name: 'Wait', exact: true })).toBeHidden();
  await expect(branch.locator('.experience-static')).toContainText('Shown when Evidence gathered is true.');
  await expect(branch.locator('.experience-static')).toContainText('Set Evidence gathered to true.');
  await branch.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(branch.getByText('Route complete.', { exact: false })).toBeVisible();
  const hotspots = native.getByRole('group', { name: 'Explore hotspots on the image', exact: true });
  const hotspotImage = hotspots.locator('img');
  await expect(hotspotImage).toBeVisible();
  await expect(hotspotImage).toHaveJSProperty('naturalWidth', 120);
  await expect(hotspotImage).toHaveJSProperty('naturalHeight', 80);
  await expect(native.locator('.experience-asset-credit').first()).toHaveText('Image credit: diagram.png — Synthetic image credit');
  await expect(native.locator('.experience-hotspot-list > li').nth(0)).toContainText('Sensor');
  await expect(native.locator('.experience-hotspot-list > li').nth(1)).toContainText('Controller');
  const fit = await hotspots.evaluate(board => {
    const bounds = board.getBoundingClientRect();
    const image = board.querySelector('img').getBoundingClientRect();
    const marker = board.querySelector('button').getBoundingClientRect();
    return {
      imageAspect: image.width / image.height,
      markerX: (marker.left + marker.width / 2 - bounds.left) / bounds.width,
      markerY: (marker.top + marker.height / 2 - bounds.top) / bounds.height,
    };
  });
  expect(fit.imageAspect).toBeCloseTo(1.5, 1);
  expect(fit.markerX).toBeCloseTo(0.2, 1);
  expect(fit.markerY).toBeCloseTo(0.5, 1);
  await native.getByRole('button', { name: 'Explore Sensor', exact: true }).focus();
  await native.getByRole('button', { name: 'Explore Sensor', exact: true }).press('Space');
  await expect(native.locator('.experience-hotspot-list').getByText('Measures the input.', { exact: true })).toBeVisible();
  const sequence = native.getByRole('group', { name: 'Order the response', exact: true });
  await sequence.getByRole('button', { name: 'Check sequence', exact: true }).click();
  await expect(sequence.getByRole('status')).toContainText('Not yet.');
  await sequence.getByRole('button', { name: 'Move Observe up', exact: true }).focus();
  await sequence.getByRole('button', { name: 'Move Observe up', exact: true }).press('Enter');
  await sequence.getByRole('button', { name: 'Check sequence', exact: true }).click();
  await expect(sequence.getByRole('status')).toContainText('Correct sequence.');
  const practice = native.getByRole('group', { name: 'Practice a response', exact: true });
  await practice.getByRole('button', { name: 'Guess', exact: true }).click();
  await expect(practice.getByRole('status')).toHaveText('Try again. Guessing is unreliable.');
  await practice.locator('summary').filter({ hasText: 'Show hint' }).click();
  await expect(practice.getByText('Start with evidence.', { exact: true })).toBeVisible();
  await practice.getByRole('button', { name: 'Gather facts', exact: true }).click();
  await expect(practice.getByRole('heading', { name: 'Step 2 of 2: What comes next?', exact: true })).toBeFocused();
  await practice.getByRole('button', { name: 'Report findings', exact: true }).click();
  await expect(practice.getByRole('heading', { name: 'Practice complete.', exact: true })).toBeVisible();
  const walkthrough = native.getByRole('group', { name: 'Walk through support request', exact: true });
  const screenshot = walkthrough.locator('.experience-walkthrough-screen').first();
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('alt', 'Settings screen with the account menu open.');
  await expect(screenshot).toHaveJSProperty('naturalWidth', 120);
  await expect(walkthrough.locator('.experience-asset-credit').first())
    .toHaveText('Image credit: diagram.png — Synthetic image credit');
  await walkthrough.getByRole('button', { name: 'Mark action complete', exact: true }).focus();
  await walkthrough.getByRole('button', { name: 'Mark action complete', exact: true }).press('Enter');
  await expect(walkthrough.getByRole('heading', { name: 'Step 2 of 2: Save the profile', exact: true })).toBeFocused();
  await walkthrough.getByRole('button', { name: 'Mark action complete', exact: true }).click();
  await expect(walkthrough.getByRole('heading', { name: 'Walkthrough complete.', exact: true })).toBeFocused();
  await expect(walkthrough.getByText('You confirmed every action in order. All walkthrough steps are complete.', { exact: true })).toBeVisible();
  const conversation = native.getByRole('group', { name: 'Practice a coaching conversation', exact: true });
  const staticAlternative = conversation.locator('.experience-static');
  await expect(staticAlternative).toContainText('does not use AI');
  await expect(staticAlternative).toContainText('What would help you decide?');
  const consent = conversation.getByRole('checkbox', { name: /scripted, in-memory roleplay/ });
  const start = conversation.getByRole('button', { name: 'Start local roleplay', exact: true });
  await expect(start).toBeDisabled();
  await consent.check();
  await start.focus();
  await start.press('Enter');
  await expect(conversation.getByRole('log', { name: 'Roleplay conversation' }))
    .toContainText('What would you like to consider first?');
  const response = conversation.getByRole('textbox', { name: 'Your response (up to 1,000 characters)' });
  await response.fill('I would review a fictional draft.');
  await conversation.getByRole('button', { name: 'Send response', exact: true }).click();
  const transcript = conversation.getByRole('log', { name: 'Roleplay conversation' });
  await expect(transcript).toContainText('I would review a fictional draft.');
  await expect(transcript).toContainText('What else could you try?');
  await response.fill('I could ask a colleague to review it.');
  await conversation.getByRole('button', { name: 'Send response', exact: true }).click();
  await expect(conversation.getByRole('status')).toContainText('not saved or sent');
  await expect(conversation.getByRole('button', { name: 'Reset local roleplay', exact: true })).toBeFocused();
  await conversation.getByRole('button', { name: 'Reset local roleplay', exact: true }).press('Enter');
  await expect(transcript).toBeEmpty();
  await expect(consent).not.toBeChecked();
  await expect(consent).toBeFocused();
}

test('all six native activities can be authored, saved and reopened without Pythia', async ({ page, request }) => {
  let project = await course(request, false);
  const uploaded = await addProjectImage(request, project, await imageFixture(page));
  project = uploaded.project;
  let providerCalls = 0;
  page.on('request', req => {
    if (req.method() === 'POST' && /experience-treatment$|media-generation-jobs$/.test(req.url())) providerCalls++;
  });
  await open(page, project);
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  let dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: 'Start native experience without Pythia', exact: true }).click();
  const branch = dialog.getByRole('group', { name: 'Activity 1: branching', exact: true });
  await branch.getByLabel('Activity title', { exact: true }).fill('Decide what to do');
  await branch.getByRole('button', { name: 'Add variable', exact: true }).click();
  await branch.getByLabel('Variable label', { exact: true }).fill('Evidence gathered');
  await branch.getByRole('button', { name: 'Add variable assignment', exact: true }).first().click();
  await branch.getByRole('combobox', { name: 'Set to', exact: true }).first().selectOption('true');
  await branch.getByRole('button', { name: 'Add decision node', exact: true }).click();
  await branch.getByRole('textbox', { name: 'Decision prompt', exact: true }).nth(1).fill('What happens after investigation?');
  await branch.getByRole('combobox', { name: 'Show choice when', exact: true }).nth(2)
    .selectOption({ label: 'Evidence gathered is true' });
  await dialog.getByRole('button', { name: 'Add hotspots', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Diagram description', exact: true }).fill('Describe the illustrated sensor and controller.');
  await dialog.getByRole('combobox', { name: 'Background image (optional)', exact: true }).selectOption(uploaded.asset.id);
  await dialog.getByRole('textbox', { name: 'Hotspot label', exact: true }).fill('Sensor');
  await dialog.getByRole('spinbutton', { name: 'Horizontal position (%)', exact: true }).fill('20');
  const preview = dialog.getByRole('region', { name: 'Executable experience preview' });
  await expect(preview.locator('.experience-hotspot-board img')).toBeVisible();
  await expect(preview.locator('.experience-asset-credit').first()).toHaveText('Image credit: diagram.png — Synthetic image credit');
  await dialog.getByRole('button', { name: 'Add sequencing', exact: true }).click();
  await dialog.getByLabel('Sequence item', { exact: true }).first().fill('Observe');
  await dialog.getByRole('button', { name: 'Add guided practice', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Practice hint', exact: true }).fill('Look for evidence.');
  await dialog.getByRole('button', { name: 'Add software walkthrough', exact: true }).click();
  const walkthrough = dialog.getByRole('group', { name: 'Activity 5: software-walkthrough', exact: true });
  await walkthrough.getByLabel('Step label', { exact: true }).fill('Open account settings');
  await walkthrough.getByRole('combobox').first().selectOption(uploaded.asset.id);
  await walkthrough.getByRole('textbox', { name: 'Screenshot alternative text', exact: true }).fill('Settings window with the account menu expanded.');
  await walkthrough.getByRole('textbox', { name: 'What the screenshot shows', exact: true }).fill('The account menu is visible.');
  await walkthrough.getByRole('textbox', { name: 'Action prompt', exact: true }).fill('Choose account settings.');
  await walkthrough.getByRole('button', { name: 'Add walkthrough step', exact: true }).click();
  await walkthrough.getByLabel('Step label', { exact: true }).nth(1).fill('Save changes');
  await dialog.getByRole('button', { name: 'Add learner conversation roleplay', exact: true }).click();
  const conversation = dialog.getByRole('group', { name: 'Activity 6: learner-conversation', exact: true });
  await conversation.getByLabel('Conversation role', { exact: true }).fill('A reflective coach');
  await conversation.locator('textarea').nth(0).fill('Consider a fictional project delay.');
  await conversation.locator('textarea').nth(1).fill('What would you like to examine first?');
  await conversation.locator('textarea').nth(2).fill('What information would help?');
  await conversation.locator('textarea').last().fill('Write down one fictional next step.');
  await dialog.getByLabel('I reviewed the actual preview', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Save reviewed native scene edits', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Native scene edits saved.' })).toBeVisible();
  const stage = page.locator('.visual-authoring-surface .native-experience');
  await expect(stage.locator('.experience-hotspot-board img')).toBeVisible();
  await expect(stage.locator('.experience-asset-credit').first()).toHaveText('Image credit: diagram.png — Synthetic image credit');
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const value = saved.storyboard.scenes[0].experience;
  expect(value.activities.map(a => a.kind)).toEqual(['branching', 'hotspots', 'sequencing', 'guided-practice', 'software-walkthrough', 'learner-conversation']);
  expect(value.activities[1].imageAssetId).toBe(uploaded.asset.id);
  expect(value.activities[0].nodes).toHaveLength(2);
  expect(value.activities[0].nodes[0].choices[0].nextNodeId).toBe(value.activities[0].nodes[1].id);
  expect(value.activities[0].variables[0]).toMatchObject({ label: 'Evidence gathered', initialValue: false });
  expect(value.activities[0].nodes[0].choices[0].setVariables).toEqual([{ variableId: value.activities[0].variables[0].id, value: true }]);
  expect(value.activities[0].nodes[1].choices[0].visibleWhen).toEqual({ variableId: value.activities[0].variables[0].id, equals: true });
  expect(value.activities[4].steps[0]).toMatchObject({
    label: 'Open account settings', screenshotAssetId: uploaded.asset.id,
    screenshotAltText: 'Settings window with the account menu expanded.',
    description: 'The account menu is visible.', actionPrompt: 'Choose account settings.',
  });
  expect(value.activities[5]).toMatchObject({
    role: 'A reflective coach', scenario: 'Consider a fictional project delay.',
    opening: 'What would you like to examine first?', responses: ['What information would help?', 'What would help you decide?'],
    offlineAlternative: 'Write down one fictional next step.',
  });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Design experience', exact: true }).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog.getByRole('textbox', { name: 'Practice hint', exact: true })).toHaveValue('Look for evidence.');
  await expect(dialog.getByRole('textbox', { name: 'Hotspot label', exact: true })).toHaveValue('Sensor');
  await expect(dialog.getByRole('combobox', { name: 'Background image (optional)', exact: true })).toHaveValue(uploaded.asset.id);
  await expect(dialog.getByRole('textbox', { name: 'Screenshot alternative text', exact: true }).first())
    .toHaveValue('Settings window with the account menu expanded.');
  await expect(dialog.getByLabel('Conversation role', { exact: true })).toHaveValue('A reflective coach');
  await expect(dialog.getByLabel('Variable label', { exact: true })).toHaveValue('Evidence gathered');
  expect(providerCalls).toBe(0);
});

test('mobile native preview supports keyboard practice, text alternatives and retained progress', async ({ page, request }, testInfo) => {
  const project = await course(request, true, await imageFixture(page));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, project);
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  let native = page.getByRole('dialog').locator('.native-experience');
  await interact(native);
  const resumeState = await page.evaluate(id => JSON.parse(localStorage.getItem(`chimera.preview.${id}`) || '{}'), project.id);
  const savedActivityIds = Object.values(resumeState.experienceProgress || {}).flatMap(progress => Object.keys(progress || {}));
  expect(savedActivityIds).not.toContain('roleplay');
  expect(await native.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.native-experience').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('native-practice-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close course preview', exact: true }).click();
  await page.getByRole('button', { name: 'Preview course', exact: true }).click();
  native = page.getByRole('dialog').locator('.native-experience');
  await expect(native.getByRole('heading', { name: 'Practice complete.', exact: true })).toBeVisible();
  await expect(native.getByText('Route complete.', { exact: false })).toBeVisible();
  const sequence = native.getByRole('group', { name: 'Order the response', exact: true });
  await sequence.getByRole('button', { name: 'Check sequence', exact: true }).click();
  await expect(sequence.getByRole('status')).toContainText('Correct sequence.');
  await native.getByRole('button', { name: 'Restart practice', exact: true }).click();
  await expect(native.getByRole('heading', { name: 'Step 1 of 2: How do you begin?', exact: true })).toBeVisible();
  await native.getByRole('button', { name: 'Restart scenario', exact: true }).click();
  await expect(native.getByRole('button', { name: 'Investigate', exact: true })).toBeVisible();
  const walkthrough = native.getByRole('group', { name: 'Walk through support request', exact: true });
  await expect(walkthrough.getByRole('heading', { name: 'Walkthrough complete.', exact: true })).toBeVisible();
  await walkthrough.getByRole('button', { name: 'Restart walkthrough', exact: true }).click();
  await expect(walkthrough.getByRole('heading', { name: 'Step 1 of 2: Open settings', exact: true })).toBeFocused();
  for (const summary of await native.locator('.experience-static > summary').all()) await summary.click();
  await expect(native.locator('.experience-static').getByText('Observe before acting.', { exact: true })).toBeVisible();
  await expect(native.locator('.experience-static img').first()).toBeVisible();
  await expect(native.getByRole('group', { name: 'Explore the system', exact: true })
    .locator('.experience-static').getByText('Image credit: diagram.png — Synthetic image credit', { exact: true })).toBeVisible();
  await expect(walkthrough.locator('.experience-static img').first())
    .toHaveAttribute('alt', 'Settings screen with the account menu open.');
  await expect(walkthrough.locator('.experience-static').getByText('Action: Save the updated profile.', { exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(native.locator('.experience-static').first()).toBeVisible();
  await expect(native.getByRole('button', { name: 'Investigate', exact: true })).toBeHidden();
});

for (const profile of ['standalone', 'scorm-12', 'scorm-2004']) {
  test(`${profile} delivers activities and preserves formative state without changing grades`, async ({ page, request }, testInfo) => {
    const image = await imageFixture(page);
    const project = await course(request, true, image);
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const archive = testInfo.outputPath('course.zip'), directory = testInfo.outputPath('course');
    await fs.mkdir(directory, { recursive: true }); await fs.writeFile(archive, await response.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    const imageAsset = project.storyboard.assets.find(asset => asset.filename === 'diagram.png');
    expect(await fs.readFile(path.join(directory, imageAsset.path))).toEqual(image);
    const origin = 'http://native-activities.test';
    await page.route(origin + '/**', async route => {
      const filename = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!['index.html', 'player.js', 'storyboard.json', imageAsset.path].includes(filename)) return route.abort();
      return route.fulfill({ body: await fs.readFile(path.join(directory, filename)),
        contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json'
          : filename.endsWith('.png') ? 'image/png' : 'text/html' });
    });
    if (profile !== 'standalone') await page.addInitScript(legacy => {
      const data = JSON.parse(localStorage.getItem('native-lms') || '{}');
      const api = {};
      api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
      api[legacy ? 'LMSGetValue' : 'GetValue'] = key => data[key] || '';
      api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { data[key] = value; return 'true'; };
      api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('native-lms', JSON.stringify(data)); return 'true'; };
      api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
      window[legacy ? 'API' : 'API_1484_11'] = api;
    }, profile === 'scorm-12');
    await page.goto(profile === 'standalone' ? pathToFileURL(path.join(directory, 'index.html')).href : origin + '/index.html');
    let native = page.locator('.native-experience');
    await expect(native).toBeVisible();
    const initialGrade = profile === 'standalone' ? null : await page.evaluate(legacy =>
      JSON.parse(localStorage.getItem('native-lms'))[legacy ? 'cmi.core.score.raw' : 'cmi.score.raw'], profile === 'scorm-12');
    if (profile !== 'standalone') {
      const branch = native.getByRole('group', { name: 'Handle an incident', exact: true });
      await branch.getByRole('button', { name: 'Investigate', exact: true }).click();
      const walkthrough = native.getByRole('group', { name: 'Walk through support request', exact: true });
      await walkthrough.getByRole('button', { name: 'Mark action complete', exact: true }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      native = page.locator('.native-experience');
      const resumedBranch = native.getByRole('group', { name: 'Handle an incident', exact: true });
      await expect(resumedBranch.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
      await expect(resumedBranch.getByRole('button', { name: 'Wait', exact: true })).toBeHidden();
      await resumedBranch.getByRole('button', { name: 'Restart scenario', exact: true }).click();
      await expect(resumedBranch.getByRole('button', { name: 'Investigate', exact: true })).toBeVisible();
      const resumedWalkthrough = native.getByRole('group', { name: 'Walk through support request', exact: true });
      await expect(resumedWalkthrough.getByRole('heading', { name: 'Step 2 of 2: Save the profile', exact: true })).toBeVisible();
      await resumedWalkthrough.getByRole('button', { name: 'Restart walkthrough', exact: true }).click();
      await expect(resumedWalkthrough.getByRole('heading', { name: 'Step 1 of 2: Open settings', exact: true })).toBeVisible();
    }
    await interact(native);
    const conversation = native.getByRole('group', { name: 'Practice a coaching conversation', exact: true });
    await conversation.getByRole('checkbox', { name: /scripted, in-memory roleplay/ }).check();
    await conversation.getByRole('button', { name: 'Start local roleplay', exact: true }).click();
    await conversation.getByRole('textbox', { name: 'Your response (up to 1,000 characters)' })
      .fill('A fictional response for this export check.');
    await conversation.getByRole('button', { name: 'Send response', exact: true }).click();
    if (profile !== 'standalone') {
      const data = await page.evaluate(() => JSON.parse(localStorage.getItem('native-lms')));
      const progress = JSON.parse(data['cmi.suspend_data']).experiences[project.storyboard.scenes[0].id];
      expect(progress.decision.path).toEqual([0, 0]);
      expect(progress.order.order).toEqual(['observe', 'act']);
      expect(progress.practice.answers).toEqual(['gather', 'report']);
      expect(progress.diagram.opened).toEqual(['sensor']);
      expect(progress.walkthrough.completedSteps).toEqual(['open-settings', 'save-profile']);
      expect(progress.roleplay).toBeUndefined();
      expect(data[profile === 'scorm-12' ? 'cmi.core.score.raw' : 'cmi.score.raw']).toBe(initialGrade);
      await page.reload();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      native = page.locator('.native-experience');
      const resumedConversation = native.getByRole('group', { name: 'Practice a coaching conversation', exact: true });
      await expect(resumedConversation.getByRole('checkbox', { name: /scripted, in-memory roleplay/ })).not.toBeChecked();
      await expect(resumedConversation.getByRole('log', { name: 'Roleplay conversation' })).toBeEmpty();
      await expect(native.getByRole('heading', { name: 'Practice complete.', exact: true })).toBeVisible();
      await expect(native.getByText('Route complete.', { exact: false })).toBeVisible();
      await expect(native.locator('.experience-hotspot-list details').first()).toHaveAttribute('open', '');
      await expect(native.locator('.experience-hotspot-board img')).toBeVisible();
      await expect(native.getByRole('group', { name: 'Walk through support request', exact: true })
        .getByRole('heading', { name: 'Walkthrough complete.', exact: true })).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'Start over', exact: true }).click();
      await expect(native.getByRole('button', { name: 'Investigate', exact: true })).toBeVisible();
      await expect(native.getByRole('button', { name: 'Gather facts', exact: true })).toBeVisible();
    } else {
      await page.reload();
      native = page.locator('.native-experience');
      const restartedConversation = native.getByRole('group', { name: 'Practice a coaching conversation', exact: true });
      await expect(restartedConversation.getByRole('checkbox', { name: /scripted, in-memory roleplay/ })).not.toBeChecked();
      await expect(restartedConversation.getByRole('log', { name: 'Roleplay conversation' })).toBeEmpty();
    }
    await native.getByRole('button', { name: 'Reset sequence', exact: true }).click();
    await native.getByRole('button', { name: 'Check sequence', exact: true }).click();
    await expect(native.getByRole('group', { name: 'Order the response', exact: true }).getByRole('status')).toContainText('Not yet.');
  });
}
