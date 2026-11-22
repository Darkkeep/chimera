const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const modulePromise = import(pathToFileURL(path.resolve('frontend/src/progressive-events.ts')).href);
const event = (sequence, type = 'job.started', payload = null) => ({schemaVersion:1, eventId:`job:${sequence}`, jobId:'job', projectId:'project', sourceRevision:1, projectRevision:1, sequence, type,
  status:type === 'component.ready' ? 'proposed' : 'running', componentId:payload ? 'scene-1' : null, orderHint:0, payload,
  provenance:{producer:'deterministic-fixture-v1',sourceIds:[],locators:['synthetic:inspection-basics']}});

test('process labels describe observed operations and stable replay without inferred stages', async () => {
  const {progressiveProcess} = await modulePromise;
  const start=event(1);
  assert.equal(progressiveProcess([], 'idle').label, 'Ready when you are.');
  assert.equal(progressiveProcess([start], 'running').label, 'Preparing demonstration scenes…');
  for (const [type,label] of Object.entries({
    'component.ready':'Scene ready to review. Demonstration continues…',
    'component.accepted':'Scene added.',
    'component.rejected':'Scene proposal rejected. Your saved work is unchanged.',
    'component.failed':"A scene couldn't be prepared. Other proposals remain available.",
  })) {
    const log=[start,event(2,type)];
    assert.equal(progressiveProcess(log,'running').label,label);
    assert.deepEqual(progressiveProcess([...log],'running'),progressiveProcess(log,'running'));
  }
  for(const status of ['completed','cancelled','failed']) {
    const result=progressiveProcess([start,event(2,`job.${status}`)],status);
    assert.equal(result.operationKey,`job.${status}`);
    assert.doesNotMatch(result.label,/…|%|Pythia|thinking|analyzing/);
  }
  assert.equal(progressiveProcess([event(1,'job.completed'),event(2,'component.accepted')],'completed').label,'Scene added.');
});
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
