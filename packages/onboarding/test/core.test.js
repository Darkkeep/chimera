import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJourney } from '../src/core.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(overrides = {}) {
  const data = new Map();
  const options = { namespace: 'test', scope: 'one', storage: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) },
    journey: { id: 'task', version: 1, title: 'Task', steps: [{ id: 'save', title: 'Save', instruction: 'Save', event: 'saved' }, { id: 'review', title: 'Review', instruction: 'Review' }] },
    adapter: { context: () => ({}) }, ...overrides };
  return { controller: createJourney(options), options, data };
}
test('only matching scoped outcomes advance action steps; acknowledgments finish review', async () => {
  const { controller: c } = setup(); c.start(); await tick();
  c.next(); c.signal({ type: 'clicked', scope: 'one' }); c.signal({ type: 'saved', scope: 'two' });
  assert.equal(c.snapshot().index, 0);
  c.signal({ type: 'saved', scope: 'one' }); await tick(); c.next();
  assert.equal(c.snapshot().status, 'complete'); c.dispose();
});
test('skipping is distinct from completing', async () => {
  const { controller: c } = setup(); c.start(); await tick(); c.skip(); await tick(); c.next();
  assert.equal(c.snapshot().status, 'finished'); assert.deepEqual(c.snapshot().skipped, ['save']); c.dispose();
});
test('finished journeys remain ended on start and reload until explicitly restarted', async () => {
  const { controller: c, options } = setup();
  c.start(); await tick(); c.skip(); await tick(); c.next();
  c.start(); await tick();
  assert.equal(c.snapshot().status, 'finished');
  const restored = createJourney(options);
  restored.start(); await tick();
  assert.equal(restored.snapshot().status, 'finished');
  assert.deepEqual(restored.snapshot().skipped, ['save']);
  restored.start({ restart: true }); await tick();
  assert.equal(restored.snapshot().status, 'active');
  assert.equal(restored.snapshot().index, 0);
  assert.deepEqual(restored.snapshot().completed, []);
  assert.deepEqual(restored.snapshot().skipped, []);
  c.dispose(); restored.dispose();
});
test('pause invalidates pending navigation and ignores signals', async () => {
  let resolve;
  const { controller: c } = setup({ adapter: { context: () => ({}), prepare: () => new Promise(r => { resolve = r; }) } });
  c.start(); c.pause(); resolve(); await tick(); c.signal({ type: 'saved', scope: 'one' });
  assert.equal(c.snapshot().status, 'paused'); assert.equal(c.snapshot().index, 0); c.dispose();
});
test('scope changes restore independent progress; intentional carry preserves project creation', async () => {
  const { controller: c } = setup(); c.start(); await tick(); c.signal({ type: 'saved', scope: 'one' }); await tick();
  c.setScope('two'); assert.equal(c.snapshot().index, 0); c.setScope('one'); assert.equal(c.snapshot().index, 1);
  c.start(); await tick(); c.setScope('three', { carry: true }); assert.equal(c.snapshot().index, 1); c.dispose();
});
test('reload resumes paused; stale versions and corrupted storage start fresh', async () => {
  const { controller: c, options } = setup(); c.start(); await tick(); c.signal({ type: 'saved', scope: 'one' }); await tick();
  const resumed = createJourney(options); assert.equal(resumed.snapshot().status, 'paused'); assert.equal(resumed.snapshot().index, 1);
  const updated = createJourney({ ...options, journey: { ...options.journey, version: 2 } }); assert.equal(updated.snapshot().index, 0);
  const corrupt = createJourney({ ...options, storage: { getItem: () => '{broken', setItem() {} } }); assert.equal(corrupt.snapshot().status, 'idle');
  [c, resumed, updated, corrupt].forEach(x => x.dispose());
});
test('resume reconciles a confirmed application fact', async () => {
  const { controller: c } = setup({ journey: { id: 'task', version: 1, title: 'Task', steps: [{ id: 'saved', title: 'Save', instruction: 'Save', event: 'saved', isComplete: ctx => ctx.persisted === true }] }, adapter: { context: () => ({ persisted: true }) } });
  c.start(); await tick(); assert.equal(c.snapshot().status, 'complete'); c.dispose();
});
test('navigation failure can retry; denied prerequisites and unavailable storage are recoverable', async () => {
  let fail = true;
  const { controller: c } = setup({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, adapter: { context: () => ({}), prepare() { if (fail) throw new Error('Save unavailable'); } } });
  c.start(); await tick(); assert.equal(c.snapshot().status, 'blocked'); fail = false; c.start(); await tick(); assert.equal(c.snapshot().status, 'active'); c.dispose();
});
test('unmet prerequisite blocks preparation, and disposed controllers cannot advance', async () => {
  let prepared = false;
  const { controller: c } = setup({ journey: { id: 'task', version: 1, title: 'Task', steps: [{ id: 'save', title: 'Save', instruction: 'Save', prerequisite: () => false }] }, adapter: { context: () => ({}), prepare() { prepared = true; } } });
  c.start(); await tick(); assert.equal(c.snapshot().status, 'blocked'); assert.equal(prepared, false);
  c.dispose(); c.skip(); c.start(); c.setScope('two'); assert.equal(c.snapshot().scope, 'one'); assert.equal(c.snapshot().status, 'blocked');
});
test('pause aborts asynchronous adapter work and navigation timeout is recoverable', async () => {
  let signal;
  const { controller: c } = setup({ timeout: 15, adapter: { context: () => ({}), prepare(step, context, options) { signal = options.signal; return new Promise(() => {}); } } });
  c.start(); c.pause(); assert.equal(signal.aborted, true); await tick(); assert.equal(c.snapshot().status, 'paused');
  c.start(); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(c.snapshot().status, 'blocked'); c.dispose();
});
test('completed scopes remain completed after switching away and back', async () => {
  const { controller: c } = setup(); c.start(); await tick(); c.signal({ type: 'saved', scope: 'one' }); await tick(); c.next();
  c.setScope('two'); c.setScope('one'); assert.equal(c.snapshot().status, 'complete'); c.dispose();
});
