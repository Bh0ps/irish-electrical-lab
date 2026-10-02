import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LESSONS} from '../lib/lessons';
import {captureTestRecord,testRecordMatches,validateTestRecord} from '../lib/test-record';
import {migrateProgress} from '../lib/progress';
import {simulate} from '../lib/simulation';
import {assessBuild} from '../lib/assessment';

test('a completed report survives progress serialization and still identifies the actual circuit',()=>{
  const doc=structuredClone(LESSONS[6].circuit),result=simulate(doc,{},.1),report=assessBuild(doc,result,LESSONS[6].circuit);
  const record=captureTestRecord(doc,report,1234),progress=migrateProgress(undefined);progress.lastTest=record;
  const restored=migrateProgress(JSON.parse(JSON.stringify(progress)));
  assert.deepEqual(restored.lastTest,record);assert.ok(testRecordMatches(restored.lastTest!,doc));
  record.assessment.checks[0].title='Changed caller';assert.notEqual(restored.lastTest!.assessment.checks[0].title,'Changed caller');
});
test('layout changes retain electrical report identity while a neutral-earth join or another circuit cannot reuse a pass',()=>{
  const doc=structuredClone(LESSONS[6].circuit),record=captureTestRecord(doc,assessBuild(doc,simulate(doc,{},.1),doc));
  const visual=structuredClone(doc);visual.revision++;visual.components[0].rotation=1;visual.components[0].position=[4,0,2];assert.ok(testRecordMatches(record,visual));
  const wrong=structuredClone(doc);wrong.wires.push({id:'wrong-earth',from:{component:'protect',terminal:'NOUT'},to:{component:'supply',terminal:'PE'},role:'PE',resistance:.01,bends:[]});assert.equal(testRecordMatches(record,wrong),false);
  visual.id='different';assert.equal(testRecordMatches(record,visual),false);
});
test('malformed and contradictory saved reports cannot enter progress or overwrite their caller',()=>{
  const doc=structuredClone(LESSONS[6].circuit),record=captureTestRecord(doc,assessBuild(doc,simulate(doc,{},.1),doc));
  for(const mutate of [(r:typeof record)=>{r.version=2 as 1;},(r:typeof record)=>{r.assessment.revision=-1;},(r:typeof record)=>{r.assessment.passed=true;r.assessment.checks[0].status='fail';},(r:typeof record)=>{r.fingerprint='bad';}]){const bad=structuredClone(record);mutate(bad);assert.throws(()=>validateTestRecord(bad));}
  assert.throws(()=>captureTestRecord({...doc,revision:doc.revision+1},record.assessment));
  assert.ok(testRecordMatches(record,doc));
});
test('a damaged local report is omitted while ordinary study progress and evidence remain intact',()=>{
  const progress=migrateProgress(undefined);progress.lessons=[7];progress.builds=[7];progress.scores={'7':85};
  const local={...progress,lastTest:{version:999}};
  const recovered=migrateProgress(local as typeof progress);
  assert.deepEqual(recovered.lessons,[7]);assert.deepEqual(recovered.builds,[7]);assert.deepEqual(recovered.scores,{'7':85});assert.equal(recovered.lastTest,undefined);
});
