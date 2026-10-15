const vm = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
async function session(profile, stored, mode = 'popup', sceneCount = 2) {
  const nodes = new Map();
  const events = {};
  const calls = [];
  let initialized = false;
  const legacy = profile === '12';
  const names = legacy ? ['LMSInitialize', 'LMSGetValue', 'LMSSetValue', 'LMSCommit', 'LMSFinish'] : ['Initialize', 'GetValue', 'SetValue', 'Commit', 'Terminate'];
  const api = {
    [names[0]]: () => { calls.push(['initialize']); initialized = mode !== 'init-failure'; return initialized ? 'true' : 'false'; },
    [names[1]]: key => { assert(initialized); return stored[key] || ''; },
    [names[2]]: (key, value) => { assert(initialized); calls.push([key, value]); if (mode === 'reject') return 'false'; stored[key] = value; return 'true'; },
    [names[3]]: () => { assert(initialized); calls.push(['commit']); return mode === 'commit-failure' ? 'false' : 'true'; },
    [names[4]]: () => { assert(initialized); calls.push(['terminate']); initialized = false; return 'true'; },
  };
  const opener = { [legacy ? 'API' : 'API_1484_11']: api };
  opener.parent = opener;
  const window = { opener, addEventListener: (name, handler) => { events[name] = handler; } };
  window.parent = window;
  if (mode === 'cross-origin') Object.defineProperty(window, 'parent', { get() { throw Error('cross-origin'); } });
  const document = {
    querySelector(selector) {
      if (selector === '#assessment-form' || selector === '[data-return-assessment]') return null;
      if (!nodes.has(selector)) nodes.set(selector, { textContent: '', innerHTML: '', addEventListener() {}, appendChild() {} });
      return nodes.get(selector);
    },
    createElement: () => ({ style: {}, addEventListener() {} }),
  };
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({ id: index === 0 ? 'first' : index === 1 ? 'second' : `scene-${index}`, title: index === 0 ? 'First' : index === 1 ? 'Second' : `Scene ${index}`, required: true, extractedText: [], imageAssets: [], audioAssets: [] }));
  vm.runInNewContext(input[profile], { window, document, Set, Date, fetch: async () => ({ json: async () => ({ title: 'Course', scenes, assets: [] }) }) });
  await new Promise(resolve => setImmediate(resolve));
  assert(!nodes.get('#scene-body').textContent?.includes('could not be loaded'));
  return { nodes, events, calls };
}
(async () => {
  for (const profile of ['2004', '12']) {
    const stored = {};
    const location = profile === '12' ? 'cmi.core.lesson_location' : 'cmi.location';
    const exit = profile === '12' ? 'cmi.core.exit' : 'cmi.exit';
    const status = profile === '12' ? 'cmi.core.lesson_status' : 'cmi.completion_status';
    const first = await session(profile, stored, 'cross-origin');
    assert.equal(first.nodes.get('#runtime-status').textContent, 'Connected to LMS tracking.');
    first.nodes.get('#next').onclick();
    assert.equal(stored[location], '1');
    assert.equal(stored[exit], 'suspend');
    assert.equal(stored[status], profile === '12' ? 'passed' : 'completed');
    assert.equal(stored[profile === '12' ? 'cmi.core.score.raw' : 'cmi.score.raw'], '0');
    first.events.pagehide(); first.events.beforeunload();
    assert.equal(first.calls.filter(call => call[0] === 'terminate').length, 1);
    assert.match(stored[profile === '12' ? 'cmi.core.session_time' : 'cmi.session_time'], profile === '12' ? /^\d{2}:\d{2}:\d{2}$/ : /^PT\d+S$/);
    const second = await session(profile, stored);
    assert.equal(second.nodes.get('#scene-title').textContent, 'Second');
    assert.equal(JSON.parse(stored['cmi.suspend_data']).visited.length, 2);
    const rejected = await session(profile, {}, 'reject');
    assert.match(rejected.nodes.get('#runtime-status').textContent, /LMS rejected/);
    const failed = await session(profile, {}, 'init-failure');
    assert.match(failed.nodes.get('#runtime-status').textContent, /initialization failed/);
    assert.equal(failed.calls.length, 1);

    // Existing JSON resume state remains readable; no migration or answer loss.
    const legacyState = {
      current: 0, visited: ['first'], completedAudio: ['first:audio'],
      assessments: { matching: { response: [], matches: { inspect: 'first', operate: 'second' }, textResponse: '', attempts: 1, isCorrect: false },
        ordering: { response: ['inspect', 'operate'], matches: {}, textResponse: '', attempts: 2, isCorrect: true },
        written: { response: [], matches: {}, textResponse: 'Inspect 漢字 🛠️', attempts: 1, isCorrect: null } },
      remediation: { assessmentSceneId: 'matching', remediationSceneId: 'first' },
    };
    const prior = { 'cmi.suspend_data': JSON.stringify(legacyState) };
    await session(profile, prior);
    assert.deepEqual(JSON.parse(prior['cmi.suspend_data']), legacyState);

    const limit = profile === '12' ? 4096 : 64000;
    const boundary = { current: 0, visited: ['first'], completedAudio: [], assessments: { written: { textResponse: '' } }, remediation: null };
    boundary.assessments.written.textResponse = 'x'.repeat(limit - Buffer.byteLength(JSON.stringify(boundary)));
    const exact = { 'cmi.suspend_data': JSON.stringify(boundary) };
    const atLimit = await session(profile, exact);
    assert(!atLimit.nodes.get('#runtime-status').textContent.includes('budget'));
    assert.equal(Buffer.byteLength(exact['cmi.suspend_data']), limit);
    boundary.assessments.written.textResponse += 'x';
    const oversized = { 'cmi.suspend_data': JSON.stringify(boundary), [location]: '0' };
    const original = JSON.stringify(oversized);
    const over = await session(profile, oversized);
    assert.match(over.nodes.get('#runtime-status').textContent, /above its .* tracking budget/);
    assert.equal(over.calls.filter(call => call[0] !== 'initialize').length, 0);
    over.nodes.get('#next').onclick();
    assert.equal(JSON.stringify(oversized), original, 'Overflow must not advance the bookmark, drop answers or write a grade');

    const unicode = { 'cmi.suspend_data': JSON.stringify({ ...boundary, assessments: { written: { textResponse: '漢'.repeat(Math.ceil(limit / 3)) } } }) };
    const utf8 = await session(profile, unicode);
    assert.match(utf8.nodes.get('#runtime-status').textContent, /tracking budget/);
    const large = { 'cmi.suspend_data': JSON.stringify({ current: 399, visited: ['first', 'second', ...Array.from({ length: 398 }, (_, i) => `scene-${i + 2}`)], completedAudio: [], assessments: {}, remediation: null }) };
    const many = await session(profile, large, 'popup', 400);
    if (profile === '12') assert.match(many.nodes.get('#runtime-status').textContent, /tracking budget/);
    else assert.equal(JSON.parse(large['cmi.suspend_data']).visited.length, 400);

    const commitFailure = await session(profile, {}, 'commit-failure');
    assert.match(commitFailure.nodes.get('#runtime-status').textContent, /LMS rejected/);
    assert(!commitFailure.calls.some(call => call[0] === status), 'Do not report a grade after a failed progress commit');
    const corrupt = { 'cmi.suspend_data': '{truncated', [location]: '1' };
    const unreadable = await session(profile, corrupt);
    assert.match(unreadable.nodes.get('#runtime-status').textContent, /could not be read/);
    assert.equal(corrupt['cmi.suspend_data'], '{truncated');
    assert(!unreadable.calls.some(call => call[0] === status), 'Do not overwrite unreadable progress with empty answers');
  }
  console.log('Both profiles: popup discovery, suspend/resume, completion, rejection reporting, and termination passed.');
})().catch(error => { console.error(error); process.exit(1); });
