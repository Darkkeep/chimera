const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

(async () => {
  const fixtureDir = path.resolve(process.env.CHIMERA_GUIDE_DIR || 'workspace/user-guide-20261027');
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, 'fixture.json'), 'utf8'));
  const images = path.resolve('docs/user-guide/images');
  const browser = await chromium.launch();
  const captures = [];
  try {
    const page = await browser.newPage({
      baseURL: process.env.GUIDE_URL || 'http://127.0.0.1:5178',
      viewport: { width: 1500, height: 1400 }, colorScheme: 'light',
    });
    const projectsResponse = await page.request.get('/api/projects');
    expect(projectsResponse.ok()).toBe(true);
    const projects = await projectsResponse.json();
    if (projects.length !== 1 || projects[0].id !== fixture.projectId) {
      throw new Error('Requires the isolated documentation fixture, never a user workspace.');
    }
    await page.route('**/api/pythia/**', route => route.abort());
    await page.addInitScript(id => {
      localStorage.setItem('chimera.activeProjectId', id);
      localStorage.setItem('chimera.appearance', 'light');
    }, fixture.projectId);
    const button = name => page.getByRole('button', { name, exact: true });
    async function shot(name, locator) {
      await expect(locator).toBeVisible();
      await locator.screenshot({ path: path.join(images, `${name}.png`) });
      captures.push({ file: `${name}.png` });
      console.log(name);
    }
    await page.goto('/');
    await button('Resume authoring').click();
    await shot('workspace', page.locator('.app-shell'));
    await shot('scene-sequence', page.locator('.scene-list'));
    await button('Project background').click();
    const background = page.getByRole('dialog', { name: 'Project background', exact: true });
    await shot('project-background-current', background);
    await background.getByRole('button', { name: 'Cancel', exact: true }).click();
    await button('Review tools').click();
    await shot('review-tools', page.locator('#review-tools'));
    await button('Assessments').click();
    const bank = page.getByRole('dialog', { name: 'Assessments', exact: true });
    await shot('question-bank-current', bank);
    const editAssessment = bank.getByRole('button', { name: 'Edit Documentation knowledge check', exact: true });
    if (await editAssessment.count()) {
      await editAssessment.click();
    } else {
      await bank.getByRole('button', { name: 'Create assessment', exact: true }).click();
    }
    await bank.getByLabel('Assessment title', { exact: true }).fill('Documentation knowledge check');
    await bank.getByRole('checkbox', { name: /Knowledge check/ }).check();
    await bank.getByRole('checkbox', { name: /Final review/ }).check();
    await shot('assessments-editor', bank);
    await bank.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await expect(editAssessment).toBeVisible();
    await shot('assessments-list', bank);
    await bank.getByRole('button', { name: 'Import questions', exact: true }).click();
    const template = await page.request.get(`/api/projects/${fixture.projectId}/question-import/template.csv`);
    expect(template.ok()).toBe(true);
    await bank.getByLabel('Question file', { exact: true }).setInputFiles({
      name: 'questions.csv', mimeType: 'text/csv', buffer: await template.body(),
    });
    await bank.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(bank.getByText('7 selected of 7 reviewed questions. Nothing has been added yet.', { exact: true })).toBeVisible();
    await shot('question-import-current', bank);
    await bank.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await bank.getByRole('button', { name: 'Edit question and metadata', exact: true }).first().click();
    const editor = page.getByRole('dialog', { name: 'Knowledge check', exact: true });
    for (const type of ['single-choice', 'multiple-response', 'true-false', 'ordering', 'drag-drop', 'matching', 'short-answer']) {
      await editor.getByLabel('Question type').selectOption(type);
      if (type === 'short-answer') {
        await editor.getByLabel('Enter one accepted answer per line').fill('Preview and validate\nPreview and validate the course');
      }
      await shot(`question-${type}`, editor);
    }
    await shot('question-metadata-collapsed', editor.locator('.question-metadata'));
    await editor.getByText('Tags and learning-objective references', { exact: true }).click();
    for (const [singular, value] of [['tag', 'Safety'], ['learning-objective reference', 'OBJ-1']]) {
      const search = editor.getByRole('combobox', { name: `Search or create a ${singular}`, exact: true });
      await search.fill(value);
      await search.press('Enter');
    }
    await editor.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(editor.getByText(/^Saved to/)).toBeVisible();
    await button('Close question editor').click();
    await button('Assessments').click();
    await bank.getByRole('button', { name: 'Edit question and metadata', exact: true }).nth(1).click();
    const second = page.getByRole('dialog', { name: 'Final review', exact: true });
    await second.getByText('Tags and learning-objective references', { exact: true }).click();
    for (const [singular, value, name] of [
      ['tag', 'Saf', 'question-tags-current'],
      ['learning-objective reference', 'OBJ', 'question-objectives-current'],
    ]) {
      const search = second.getByRole('combobox', { name: `Search or create a ${singular}`, exact: true });
      await search.fill(value);
      await expect(second.getByRole('option', { name: singular === 'tag' ? 'Safety' : 'OBJ-1', exact: true })).toBeVisible();
      await second.getByRole('listbox').scrollIntoViewIfNeeded();
      await shot(name, second);
      await search.press('Escape');
    }
    await second.getByText('Question metadata', { exact: true }).click();
    await second.getByLabel('Language tag', { exact: true }).scrollIntoViewIfNeeded();
    await shot('question-metadata-current', second);
    await button('Close question editor').click();
    await fs.writeFile(path.resolve('docs/user-guide/refresh-manifest-2026-10-27.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      workingTree: 'Includes uncommitted navigation and documentation changes.',
      fixture: path.basename(fixtureDir),
      scope: 'Assessment/navigation refresh only. Earlier screenshots retain their original provenance. No user data or provider requests.',
      captures,
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
