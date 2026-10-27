const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

for (const profile of ['scorm-12', 'scorm-2004']) {
  test(`${profile} tiles nest beside targets and rejected drops do not use attempts`, async ({ page, request }, testInfo) => {
    test.setTimeout(60000);
    let response = await request.post('/api/projects', { data: { title: 'Drag and drop export' } });
    expect(response.ok()).toBe(true);
    let project = await response.json();
    response = await request.post(`/api/projects/${project.id}/scenes`, {
      headers: { 'If-Match': `"${project.storyboard.revision}"` },
      data: {
        title: 'Drag the letters', sceneType: 'question',
        assessmentItem: {
          identifier: 'LETTERS', type: 'drag-drop', prompt: 'Match the letters.',
          draggables: [{ identifier: 'a', text: 'Tile A' }, { identifier: 'b', text: 'Tile B' }],
          targets: [{ identifier: 'target-a', text: 'A' }, { identifier: 'target-b', text: 'B' }],
          correctMatches: [{ sourceIdentifier: 'a', targetIdentifier: 'target-a' }, { sourceIdentifier: 'b', targetIdentifier: 'target-b' }],
        },
      },
    });
    expect(response.ok()).toBe(true);
    project = await response.json();
    response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok()).toBe(true);
    const archive = testInfo.outputPath('course.zip');
    const directory = testInfo.outputPath('course');
    await fs.writeFile(archive, await response.body());
    execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
    await page.route('http://drag-drop.test/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      expect(['index.html', 'player.js', 'storyboard.json'].includes(file)).toBe(true);
      await route.fulfill({ body: await fs.readFile(path.join(directory, file)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' });
    });
    await page.addInitScript(profile => {
      window.lms = JSON.parse(localStorage.getItem('drag-lms') || '{}');
      const legacy = profile === 'scorm-12';
      const api = {};
      api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
      api[legacy ? 'LMSGetValue' : 'GetValue'] = key => window.lms[key] || '';
      api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { window.lms[key] = value; return 'true'; };
      api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('drag-lms', JSON.stringify(window.lms)); return 'true'; };
      api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
      window[legacy ? 'API' : 'API_1484_11'] = api;
    }, profile);
    await page.goto('http://drag-drop.test/index.html');
    const bank = page.getByRole('group', { name: 'Draggable answers', exact: true });
    const targets = page.locator('.course-preview-drop-target');
    const check = page.getByRole('button', { name: 'Check answer', exact: true });
    await bank.getByRole('button', { name: 'Tile A', exact: true }).dragTo(targets.nth(1));
    await expect(page.getByRole('status').filter({ hasText: 'It has returned home' })).toBeVisible();
    await expect(bank.getByRole('button', { name: 'Tile A', exact: true })).toBeVisible();
    await expect(check).toBeDisabled();
    await bank.getByRole('button', { name: 'Tile A', exact: true }).dragTo(targets.nth(0));
    await expect(targets.nth(0).locator('button')).toHaveText('Tile A');
    await expect(bank.getByRole('button', { name: 'Tile A', exact: true })).toHaveCount(0);
    const result = () => page.evaluate(() => Object.values(JSON.parse(window.lms['cmi.suspend_data']).assessments)[0]);
    expect(await result()).toMatchObject({ attempts: 0, matches: { a: 'target-a' } });
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(targets.nth(0).locator('button')).toHaveText('Tile A');
    await bank.getByRole('button', { name: 'Tile B', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Place selected tile beside B', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(targets.nth(1).locator('button')).toHaveText('Tile B');
    await expect(bank).toHaveText('All tiles placed.');
    await check.click();
    await expect(page.getByRole('dialog', { name: 'Correct', exact: true })).toContainText('1/2 attempts');
    expect(await result()).toMatchObject({ attempts: 1, isCorrect: true });
  });
}
