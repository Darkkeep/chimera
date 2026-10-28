const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');

for (const profile of ['scorm-12', 'scorm-2004']) {
  for (const type of ['single-choice', 'matching', 'short-answer']) {
    test(`${profile} ${type} Try again clears answers without consuming an attempt`, async ({ page, request }, testInfo) => {
      let project = await (await request.post('/api/projects', { data: { title: `Retry ${profile} ${type}` } })).json();
      const definitions = {
        'single-choice': { choices: [{ identifier: 'right', text: 'Correct answer' }, { identifier: 'wrong', text: 'Wrong answer' }], correctResponse: 'right' },
        'matching': { leftItems: [{ identifier: 'one', text: 'First' }, { identifier: 'two', text: 'Second' }], rightItems: [{ identifier: 'a', text: 'A' }, { identifier: 'b', text: 'B' }], correctMatches: [{ sourceIdentifier: 'one', targetIdentifier: 'a' }, { sourceIdentifier: 'two', targetIdentifier: 'b' }] },
        'short-answer': { acceptedAnswers: ['Correct'] },
      };
      project = await (await request.post(`/api/projects/${project.id}/scenes`, {
        headers: { 'If-Match': `"${project.storyboard.revision}"` },
        data: { title: 'Retry question', sceneType: 'question', assessmentItem: { type, identifier: 'RETRY', prompt: 'Answer the question.', ...definitions[type] }, assessmentSettings: { maxAttempts: 3 } },
      })).json();
      const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
      expect(response.ok()).toBeTruthy();
      const archive = testInfo.outputPath('retry.zip');
      const directory = testInfo.outputPath('retry');
      await fs.writeFile(archive, await response.body());
      execFileSync(python, ['-m', 'zipfile', '-e', archive, directory]);
      await page.route('http://retry.test/**', async route => {
        const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
        expect(['index.html', 'player.js', 'storyboard.json'].includes(file)).toBeTruthy();
        await route.fulfill({ body: await fs.readFile(path.join(directory, file)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' });
      });
      await page.addInitScript(profile => {
        window.lms = JSON.parse(localStorage.getItem('retry-lms') || '{}');
        const legacy = profile === 'scorm-12';
        const api = {};
        api[legacy ? 'LMSInitialize' : 'Initialize'] = () => 'true';
        api[legacy ? 'LMSGetValue' : 'GetValue'] = key => window.lms[key] || '';
        api[legacy ? 'LMSSetValue' : 'SetValue'] = (key, value) => { window.lms[key] = value; return 'true'; };
        api[legacy ? 'LMSCommit' : 'Commit'] = () => { localStorage.setItem('retry-lms', JSON.stringify(window.lms)); return 'true'; };
        api[legacy ? 'LMSFinish' : 'Terminate'] = () => 'true';
        window[legacy ? 'API' : 'API_1484_11'] = api;
      }, profile);
      await page.goto('http://retry.test/index.html');
      async function answer(correct) {
        if (type === 'single-choice') await page.getByLabel(correct ? 'Correct answer' : 'Wrong answer', { exact: true }).check();
        if (type === 'short-answer') {
          await expect(page.locator('#assessment-form input[type="text"]')).toHaveCount(1);
          await page.getByLabel('Fill in the blank', { exact: true }).fill(correct ? '  correct  ' : 'Wrong');
        }
        if (type === 'matching') {
          await page.getByRole('combobox', { name: 'First', exact: true }).selectOption(correct ? 'a' : 'b');
          await page.getByRole('combobox', { name: 'Second', exact: true }).selectOption(correct ? 'b' : 'a');
        }
      }
      const result = () => page.evaluate(() => Object.values(JSON.parse(window.lms['cmi.suspend_data']).assessments)[0]);
      await answer(false);
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('1/3 attempts');
      await page.getByRole('button', { name: 'Close feedback', exact: true }).click();
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeDisabled();
      expect(await result()).toMatchObject({ attempts: 1, response: [], matches: {}, textResponse: '', isCorrect: null });
      await expect(page.locator('#assessment-form input, #assessment-form select').first()).toBeFocused();
      await page.reload();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeDisabled();
      expect((await result()).attempts).toBe(1);
      await answer(true);
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Correct', exact: true })).toContainText('2/3 attempts');
      expect((await result()).isCorrect).toBe(true);
      expect(await page.evaluate(profile => window.lms[profile === 'scorm-12' ? 'cmi.core.score.raw' : 'cmi.score.raw'], profile)).toBe('100');
    });
  }
}
