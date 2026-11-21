const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const modulePromise = import(pathToFileURL(path.resolve('frontend/src/progressive-events.ts')).href);
const event = (sequence, type = 'job.started', payload = null) => ({schemaVersion:1, eventId:`job:${sequence}`, jobId:'job', projectId:'project', sourceRevision:1, projectRevision:1, sequence, type,
  status:type === 'component.ready' ? 'proposed' : 'running', componentId:payload ? 'scene-1' : null, orderHint:0, payload,
  provenance:{producer:'deterministic-fixture-v1',sourceIds:[],locators:['synthetic:inspection-basics']}});
test('reconnect and duplicate events yield one complete ordered proposal', async () => {
  const {mergeProgressiveEvents} = await modulePromise;
  const start=event(1); const ready=event(2,'component.ready',{title:'Inspect',extractedText:['Check first.'],sceneType:'content',layoutMode:'native'});
  const log=mergeProgressiveEvents([], [ready,start], 'job','project');
  assert.deepEqual(log,[start,ready]);
  assert.deepEqual(mergeProgressiveEvents(log,[start,ready],'job','project'),log);
});
test('conflicting duplicates, gaps, wrong scope and incomplete scenes are withheld', async () => {
  const {mergeProgressiveEvents} = await modulePromise; const start=event(1);
  for (const incoming of [[event(3)], [{...start,projectId:'other'}], [{...start,schemaVersion:2}],
      [event(2,'component.ready',{title:'Incomplete',extractedText:[],sceneType:'content',layoutMode:'native'})]]) {
    assert.throws(()=>mergeProgressiveEvents([start],incoming,'job','project'));
  }
  assert.throws(()=>mergeProgressiveEvents([start],[{...start,projectRevision:2}],'job','project'));
});
