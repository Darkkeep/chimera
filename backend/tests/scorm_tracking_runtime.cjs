const vm = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
async function session(profile, stored, mode = 'popup') {
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
    [names[3]]: () => { assert(initialized); return 'true'; },
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
  const scenes = [{ id: 'first', title: 'First', required: true, extractedText: [], imageAssets: [], audioAssets: [] }, { id: 'second', title: 'Second', required: true, extractedText: [], imageAssets: [], audioAssets: [] }];
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
  }
  console.log('Both profiles: popup discovery, suspend/resume, completion, rejection reporting, and termination passed.');
})().catch(error => { console.error(error); process.exit(1); });