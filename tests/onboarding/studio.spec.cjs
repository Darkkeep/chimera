const { test, expect } = require('@playwright/test');
const { guide, startChimera, createProject, saveScene } = require('./helpers.cjs');

// The preview must be explicitly enabled in the Vite dev server AND in this test.
// Ordinary 1.x CI exercises the default-off interface without this suite changing it.
test.skip(process.env.CHIMERA_STUDIO_TEST !== 'true', 'Studio preview is intentionally opt-in');

test('Studio 2.0 reuses saved scenes, existing editor and reversible classic navigation', async ({ page }) => {
  await startChimera(page);
  await createProject(page, 'Studio 2.0 synthetic smoke');
  await saveScene(page, 'Verify the new authoring shell');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Close guide' }).click();

  await page.getByRole('button', { name: 'Chimera2 Studio' }).click();
  const studio = page.getByRole('region', { name: 'Chimera 2.0 Authoring Studio' });
  await expect(studio).toBeVisible();
  await expect(studio.getByRole('navigation', { name: 'Studio scenes' })).toBeVisible();
  await expect(studio.getByText('Verify the new authoring shell').first()).toBeVisible();
  await expect(studio.getByRole('button', { name: 'Stage' })).toBeEnabled();
  await studio.getByRole('button', { name: 'Stage' }).click();
  const editor = studio.locator('.studio-inline-editor');
  await expect(editor).toBeVisible();
  await expect(page.locator('.modal-backdrop .visual-editor')).toHaveCount(0);
  // Essential editing remains visible; advanced tools don't overwhelm the canvas.
  await expect(editor.getByRole('toolbar', { name: 'Scene menus' })).toBeVisible();
  await expect(editor.getByRole('toolbar', { name: 'Stage content tools' })).toHaveCount(0);
  await expect(editor.getByRole('region', { name: 'Contextual properties' })).toBeHidden();
  await editor.getByRole('toolbar',{name:'Scene menus'}).getByRole('button',{name:'View',exact:true}).click();
  await editor.getByRole('menuitem',{name:'Properties inspector',exact:true}).click();
  await expect(editor.getByRole('textbox',{name:'Studio scene title'})).toBeVisible();
  await editor.getByRole('button',{name:'Close scene controls',exact:true}).click();
  await expect(editor.getByRole('region',{name:'Contextual properties'})).toHaveCount(0);
  const originalCount = await editor.locator('.visual-editable').count();
  await editor.getByRole('toolbar', { name: 'Scene menus' }).getByRole('button', { name: 'Insert', exact: true }).click();
  await editor.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await expect(editor.locator('.visual-editable')).toHaveCount(originalCount + 1);
  await editor.getByRole('button', { name: 'Undo canvas edit' }).click();
  await expect(editor.locator('.visual-editable')).toHaveCount(originalCount);

  await expect(studio.getByRole('navigation', { name: 'Studio scenes' })).toBeVisible();

  // Selecting an element swaps the natural inspector from scene to text controls.
  await editor.locator('.visual-editable').first().click();
  if (!await editor.getByRole('textbox',{name:'Studio selected text',exact:true}).isVisible()) await editor.getByRole('button',{name:'Properties',exact:true}).click();
  await editor.getByRole('textbox', { name: 'Studio selected text' }).fill('An inspector-authored draft');
  await expect(editor.getByRole('spinbutton', { name: 'Studio x' })).toBeVisible();

  // Genuine canvas editing uses the same state and revision-guarded save.
  await editor.getByRole('button',{name:'Close scene controls',exact:true}).click();
  await editor.locator('.visual-editable').first().dblclick();
  const textEditor = editor.getByRole('textbox', { name: 'Edit canvas text' });
  await expect(textEditor).toBeVisible();
  await textEditor.fill('A scene authored directly in Studio');
  await textEditor.press('Tab');
  await editor.getByRole('button', { name: 'Save scene' }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-dirty", "false");
  await expect(studio.getByText('A scene authored directly in Studio')).toBeVisible();

  const projectId = await page.evaluate(() => localStorage.getItem('chimera.activeProjectId'));
  const stored = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(stored.storyboard.scenes[0].visualLayout.elements.some(element =>
    element.kind === 'text' && element.text === 'A scene authored directly in Studio')).toBe(true);

  let modelPosts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /pythia|conversation/.test(request.url())) modelPosts += 1;
  });
  await studio.getByRole('button', { name: 'Pythia' }).click();
  await expect(studio.getByRole('complementary', { name: 'Pythia consultation' })).toBeVisible();
  await studio.getByRole('button', { name: 'Close Pythia panel' }).click();
  expect(modelPosts).toBe(0);

  const previewButton = studio.getByRole('button', { name: 'Learner preview', exact: true });
  await previewButton.focus();
  await page.keyboard.press('Enter');
  const preview = page.getByRole('dialog', { name: 'Studio 2.0 synthetic smoke course preview' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Close course preview' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await preview.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(preview.getByRole('button', { name: 'Close course preview' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(previewButton).toBeFocused();

  await page.getByRole('button', { name: 'Classic storyboard' }).click();
  await expect(studio).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit scene', exact: true })).toBeVisible();
});
