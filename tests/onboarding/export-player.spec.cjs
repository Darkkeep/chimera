const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const python = require('./python.cjs');
const runtime = JSON.parse(execFileSync(python, ['-c', 'import json; from backend.app.scorm import PLAYER_HTML,PLAYER_JS,_scorm_12_player; print(json.dumps({"html":PLAYER_HTML,"2004":PLAYER_JS,"12":_scorm_12_player()}))'], { encoding: 'utf8', maxBuffer: 4000000 }));
function wav() {
  const samples = 44100 * 3, b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  return 'data:audio/wav;base64,' + b.toString('base64');
}
for (const profile of ['12', '2004']) test(`exported ${profile} player fits, plays narration, and navigates`, async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const layout = { version: 1, enabled: true, width: 1280, height: 720, backgroundColor: '#ffffff', backgroundAsset: 'background', elements: [{ id: 'heading', kind: 'text', text: 'Welcome to the course', x: 80, y: 80, width: 1000, height: 100, fontSize: 40, fontFamily: 'sans-serif', color: '#142638', rotation: 0 }], timeline: { version: 1, durationMs: 3000, printTimeMs: 0, cues: [], clips: [{ id: 'narration', kind: 'audio', assetId: 'voice', name: 'Scene 01 - Welcome - Narration - Take 1', startMs: 0, sourceInMs: 0, sourceOutMs: 3000, volume: 1, fadeInMs: 0, fadeOutMs: 0 }] } };
  const scenes = ['Welcome', 'Next lesson'].map((title, index) => ({ id: `scene-${index}`, title, required: true, layoutMode: 'native', visualLayout: index === 0 ? layout : null, extractedText: ['A clear learning experience.'], imageAssets: index === 0 ? ['background'] : [], audioAssets: [], videoAssets: [], mediaPlacements: [] }));
  const storyboard = { title: 'Course player review', scenes, assets: [{ id: 'voice', kind: 'audio', filename: 'Welcome narration.wav', path: wav() }, { id: 'background', kind: 'image', role: 'background', path: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }] };
  await page.addInitScript(({ profile }) => {
    window.tracking = {}; window.scormErrors = [];
    const api = { Initialize: () => 'true', GetValue: key => window.tracking[key] || '', SetValue: (key, value) => { if (profile === '12' && !['cmi.suspend_data','cmi.core.lesson_location','cmi.core.exit','cmi.core.lesson_status','cmi.core.score.min','cmi.core.score.max','cmi.core.score.raw','cmi.core.session_time'].includes(key)) { window.scormErrors.push(key); return 'false'; } window.tracking[key] = value; return 'true'; }, Commit: () => 'true', Terminate: () => 'true' };
    window[profile === '12' ? 'API' : 'API_1484_11'] = profile === '12' ? { LMSInitialize: api.Initialize, LMSGetValue: api.GetValue, LMSSetValue: api.SetValue, LMSCommit: api.Commit, LMSFinish: api.Terminate } : api;
  }, { profile });
  await page.route('https://player.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ contentType: path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : 'text/html', body: path.endsWith('.js') ? runtime[profile] : path.endsWith('.json') ? JSON.stringify(storyboard) : runtime.html });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('https://player.test/');
  await expect(page.getByRole('navigation', { name: 'Lessons', exact: true })).toBeVisible();
  await expect(page.locator('#scene-media img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(902);
  await expect.poll(() => page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT?.media[0].node.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Play scene', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.media[0].node.currentTime)).toBeGreaterThan(0.05);
  await page.getByRole('button', { name: 'Mute audio', exact: true }).click();
  expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.media[0].node.volume)).toBe(0);
  await page.getByRole('button', { name: 'Pause scene', exact: true }).click();
  expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.playing)).toBe(false);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#scene-title')).toHaveText('Next lesson');
  expect(await page.evaluate(({ profile }) => window.tracking[profile === '12' ? 'cmi.core.lesson_location' : 'cmi.location'], { profile })).toBe('1');
  await page.getByRole('navigation', { name: 'Lessons', exact: true }).getByRole('button', { name: 'Welcome', exact: true }).click();
  await expect(page.locator('#scene-title')).toHaveText('Welcome');
  await page.screenshot({ path: testInfo.outputPath('player-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('combobox', { name: 'Contents', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('combobox', { name: 'Contents', exact: true }).selectOption('1');
  await expect(page.locator('#scene-title')).toHaveText('Next lesson');
  await page.screenshot({ path: testInfo.outputPath('player-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.scormErrors)).toEqual([]);
  await expect(page.locator("#runtime-status")).not.toContainText("LMS rejected");
});
