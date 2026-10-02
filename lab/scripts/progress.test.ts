import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateProgress,recordActivity,recordEvidence,reviewQueue} from '../lib/progress.ts';
import {captureMeasurement} from '../lib/learning.ts';
import {LESSONS} from '../lib/lessons.ts';
import {simulate} from '../lib/simulation.ts';

test('legacy reading/build/fault progress migrates without claiming demonstrated activities',()=>{
  const legacy={lessons:[7],builds:[8],faults:[9],scores:{9:85}};
  const progress=migrateProgress(legacy);
  assert.equal(progress.version,2);assert.deepEqual(progress.learning,{});assert.deepEqual(progress.lessons,[7]);assert.deepEqual(progress.builds,[8]);assert.deepEqual(progress.faults,[9]);
});
test('a missed concept becomes due without recording completion or changing independent achievements',()=>{
  const original=migrateProgress(undefined),failed=recordActivity(original,7,'predict','switching',false,1000);
  assert.deepEqual(original.learning,{});assert.deepEqual(failed.learning[7].activityIds,[]);assert.deepEqual(failed.lessons,[]);assert.deepEqual(failed.builds,[]);assert.deepEqual(failed.faults,[]);
  assert.deepEqual(reviewQueue(failed,1000),[{lessonId:7,competency:'switching',attempts:1,successes:0}]);
});
test('successful practice records an activity once and schedules local review',()=>{
  let progress=recordActivity(migrateProgress(undefined),7,'inspect','terminal-purpose',true,1000);
  assert.deepEqual(progress.learning[7].activityIds,['inspect']);assert.deepEqual(reviewQueue(progress,1000),[]);
  assert.equal(reviewQueue(progress,1000+86400000).length,1);
  progress=recordActivity(progress,7,'inspect','terminal-purpose',true,1000+86400000);
  assert.deepEqual(progress.learning[7].activityIds,['inspect']);assert.equal(progress.learning[7].competencies['terminal-purpose'].nextReview,1000+4*86400000);
});
test('saved measurement evidence is bounded, detached from the evidence caller, and cannot credit a build',()=>{
  const document=structuredClone(LESSONS.find(l=>l.id===7)!.circuit),result=simulate(document,{},.1);
  let progress=migrateProgress(undefined);
  for(let i=0;i<70;i++)progress=recordEvidence(progress,7,captureMeasurement(document,result,{mode:'current',wire:document.wires[0].id},1000+i));
  assert.equal(progress.learning[7].evidence.length,60);assert.deepEqual(progress.learning[7].activityIds,[]);assert.deepEqual(progress.builds,[]);
  const before=progress.learning[7].evidence.length,entry=progress.learning[7].evidence.at(-1)!;
  progress=recordEvidence(progress,7,entry);assert.equal(progress.learning[7].evidence.length,before);entry.value=9999;assert.notEqual(progress.learning[7].evidence.at(-1)!.value,9999);
});
