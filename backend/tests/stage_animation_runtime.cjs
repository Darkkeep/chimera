const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const records = [];
let reduced = false;
const listeners = new Set();
const sandbox = { matchMedia: () => ({ matches: reduced, addEventListener: (_, handler) => listeners.add(handler), removeEventListener: (_, handler) => listeners.delete(handler) }) };
const source = fs.readFileSync(path.join(__dirname, '../app/static/stage-animations.js'), 'utf8').replace('export function', 'function');
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const root = { querySelectorAll: () => [{ dataset: { sceneElement: 'element' }, animate: (frames, options) => {
  const animation = { frames, options, cancelled: false, currentTime: 0, cancel() { this.cancelled = true; } };
  records.push(animation);
  return animation;
} }] };
for (const effect of ['fade', 'slide-up', 'slide-left', 'zoom', 'bounce']) {
  const stop = sandbox.playStageAnimations(root, [{ id: 'element', animations: { entrance: { effect, durationMs: 600, delayMs: 150 } } }], 100);
  assert.equal(records.at(-1).currentTime, 100);
  assert.equal(records.at(-1).options.fill, 'backwards');
  stop();
}
for (const effect of ['pulse', 'sway', 'highlight']) {
  const stop = sandbox.playStageAnimations(root, [{ id: 'element', animations: { entrance: { effect: 'fade', durationMs: 600, delayMs: 150 }, presentation: { effect, durationMs: 800, delayMs: 200, iterations: 2 } } }]);
  assert.equal(records.at(-1).options.delay, 950);
  assert.equal(records.at(-1).options.iterations, 2);
  stop();
}
for (const effect of ['fade', 'slide-up', 'slide-left', 'zoom']) {
  const stop = sandbox.playStageAnimations(root, [{ id: 'element', animations: { exit: { effect, durationMs: 400, delayMs: 3000 } } }]);
  assert.equal(records.at(-1).options.delay, 3000);
  assert.equal(records.at(-1).options.fill, 'forwards');
  assert.equal(records.at(-1).frames.at(-1).opacity, 0);
  stop();
}
const stop = sandbox.playStageAnimations(root, [{ id: 'element', animations: { entrance: { effect: 'fade', durationMs: 600, delayMs: 0 } } }]);
listeners.forEach(handler => handler({ matches: true }));
assert.equal(records.at(-1).cancelled, true);
stop();
const count = records.length;
reduced = true;
sandbox.playStageAnimations(root, [{ id: 'element', animations: { entrance: { effect: 'fade' } } }])();
assert.equal(records.length, count);
assert.equal(listeners.size, 0);
assert.equal(records.every(record => record.cancelled), true);
console.log(JSON.stringify({ effects: 12, cleanup: true, reducedMotion: true }));