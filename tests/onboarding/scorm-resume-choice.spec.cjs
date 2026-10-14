const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

for (const profile of ['scorm-12', 'scorm-2004']) {
  test(`${profile} asks before restoring or resetting learner progress`, async ({ page, request }, testInfo) => {
    let project = await (await request.post('/api/projects', { data: { title: 'Resume choice' } })).json();
    for (const title of ['Introduction', 'Saved lesson']) {
      project = await (await request.post(`/api/projects/${project.id}/scenes`, { data: { title }, headers: { 'If-Match': `"${project.storyboard.revision}"` } })).json();
    }
    const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
    expect(response.ok()).toBe(true);
    const archive = testInfo.outputPath('course.zip');
    const directory = testInfo.outputPath('course');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(archive, await response.body());
    execFileSync(path.resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'), ['-m', 'zipfile', '-e', archive, directory]);
    await page.route('http://resume.test/**', async route => {
      const filename = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!['index.html', 'player.js', 'storyboard.json'].includes(filename)) return route.abort();
      return route.fulfill({ body: await fs.readFile(path.join(directory, filename)), contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html' });
    });
    await page.addInitScript(({ profile, ids }) => {
      const legacy = profile === 'scorm-12';
      const location = legacy ? 'cmi.core.lesson_location' : 'cmi.location';
      const state = JSON.parse(localStorage.getItem('lms') || 'null') || {
        [location]: '1', 'cmi.suspend_data': JSON.stringify({ current: 1, visited: [ids[0]], completedAudio: ['audio'], assessments: { question: { attempts: 1, isCorrect: false } }, remediation: { assessmentSceneId: ids[0], remediationSceneId: ids[1] } }),
      };
      window.writes = [];
      const api = {};
      api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
      api[legacy ? 'LMSGetValue' : 'GetValue'] = key => state[key] || '';
      api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { window.writes.push([key, value]); state[key] = value; return 'true'; };
      api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('lms', JSON.stringify(state)); return 'true'; };
      api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
      window[legacy ? 'API' : 'API_1484_11'] = api;
    }, { profile, ids: project.storyboard.scenes.map(scene => scene.id) });
    await page.goto('http://resume.test/index.html');
    const dialog = page.getByRole('dialog', { name: 'Continue your course?', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Scene 2 of 2: Saved lesson');
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.writes)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('resume-mobile.png') });
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#scene-title')).toHaveText('Saved lesson');
    const continued = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('lms'))['cmi.suspend_data']));
    expect(continued.assessments.question.attempts).toBe(1);
    expect(continued.completedAudio).toEqual(['audio']);
    await page.reload();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.writes)).toEqual([]);
    await dialog.getByRole('button', { name: 'Start over', exact: true }).click();
    await expect(page.locator('#scene-title')).toHaveText('Introduction');
    const reset = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('lms'))['cmi.suspend_data']));
    expect(reset.current).toBe(0);
    expect(reset.visited).toEqual([project.storyboard.scenes[0].id]);
    expect(reset.completedAudio).toEqual([]);
    expect(reset.assessments).toEqual({});
    expect(reset.remediation).toBeNull();
  });
}