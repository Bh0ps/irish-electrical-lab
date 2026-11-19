import test from 'node:test';
import assert from 'node:assert/strict';
import { getLesson } from '../lib/lessons';
import { faultScore, faultStage, faultStageId, shownVolts, worktopComparisonReady } from '../lib/fault-practice';
import { validateBookmark, type LessonBookmark } from '../lib/lesson-bookmark';
import type { MeasurementEvidence } from '../lib/learning';

const circuit=getLesson(66)!.circuit;
const blank={accepted:false,repaired:false,scored:false,hints:0};
const old:LessonBookmark={version:1,path:'full',mode:'challenges',activityId:'lesson:66:repair',circuit,fault:blank};
const sample=(value:number)=>({value,mode:'voltage',unit:'V'} as MeasurementEvidence);

test('a previous fault bookmark resumes without granting a repair or a fresh test',()=>{
  assert.deepEqual(validateBookmark(old).fault,old.fault);
  assert.equal(faultStage(blank,false),'measure');
  assert.equal(faultStage(blank,true),'diagnose');
  assert.equal(faultStage({...blank,accepted:true},false),'repair');
  assert.equal(faultStage({...blank,accepted:true,repaired:true},false),'retest');
  assert.equal(faultStage({...blank,accepted:true,repaired:true,completed:true},false),'done');
  assert.equal(faultStageId(66,'repair'),'lesson:66:repair');
  assert.equal(faultStageId(66,'retest'),'lesson:66:retest');
  assert.deepEqual([0,1,2,3].map(faultScore),[100,85,70,55]);
});

test('a named fault resumes its evidence and probe points, and rejects inconsistent saves',()=>{
  const probes={red:{component:'right-switch',terminal:'OUT'},black:{component:'right',terminal:'N'}};
  const fault={...blank,worktop:true,probes,accepted:true,repaired:true,readingIds:['a','b'],completed:true};
  assert.deepEqual(validateBookmark({...old,fault}).fault,fault);
  for(const invalid of [{...fault,repaired:false},{...fault,probes:{black:{component:'missing',terminal:'N'}}},{...fault,probes:{red:{component:'right',terminal:'OUT'}}},{...fault,readingIds:[null]}]){
    assert.throws(()=>validateBookmark({...old,fault:invalid}));
  }
  assert.throws(()=>validateBookmark({...old,circuit:getLesson(7)!.circuit,activityId:'lesson:7:repair',fault}));
});

test('the comparison waits for a dark strip and a live output, and keeps the displayed polarity',()=>{
  assert.equal(worktopComparisonReady({}),false);
  assert.equal(worktopComparisonReady({strip:sample(0),switchOutput:sample(0)}),false);
  assert.equal(worktopComparisonReady({strip:sample(24),switchOutput:sample(24)}),false);
  for(const volts of [24,-24])assert.ok(worktopComparisonReady({strip:sample(0),switchOutput:sample(volts)}));
  assert.equal(shownVolts(sample(-24)),'-24 V');
  assert.equal(shownVolts({...sample(-23.98),instrument:{method:'probe-voltage',displayed:'-24',signal:'DC'} as MeasurementEvidence['instrument']}),'-24 V DC');
});
