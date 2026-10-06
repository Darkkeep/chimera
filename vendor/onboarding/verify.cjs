const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const file = 'guided-workflows-onboarding-0.1.1.tgz';
const expected = readFileSync(path.join(__dirname, 'SHA256SUMS'), 'utf8').trim().split(/\s+/);
assert.equal(expected[1], file);
assert.equal(createHash('sha256').update(readFileSync(path.join(__dirname, file))).digest('hex'), expected[0]);
const helpers = require('@guided-workflows/onboarding/playwright');
assert.equal(typeof helpers.guide, 'function');
assert.equal(typeof helpers.expectStep, 'function');
(async () => {
  const { createJourney } = await import('@guided-workflows/onboarding');
  const { mountJourney } = await import('@guided-workflows/onboarding/dom');
  assert.equal(typeof createJourney, 'function'); assert.equal(typeof mountJourney, 'function');
  console.log('Pinned onboarding artifact checksum and installed exports verified');
})().catch(error => { console.error(error); process.exitCode = 1; });
