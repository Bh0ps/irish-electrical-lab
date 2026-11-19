import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, getLesson } from '../lib/lessons.ts';
import { captureMeasurement, validateDiagnosisEvidence } from '../lib/learning.ts';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis.ts';
import { faultClue, faultMeterCheck } from '../lib/fault-checks.ts';
import { lessonFaultChoices } from '../lib/fault-practice.ts';
import { simulate } from '../lib/simulation.ts';

test('all 80 fault exercises offer two real meter checks without changing or solving the bench for the learner',()=>{
  for(const lesson of LESSONS){
    const doc=structuredClone(lesson.circuit),challenge=lesson.challenge;
    doc.faults=[{type:challenge.fault,wire:challenge.wire,component:challenge.component,enabled:true}];
    const before=structuredClone(doc);
    const steps=[0,1,2,3].map(level=>faultClue(lesson,doc,level,false));
    assert.equal(steps[0],'');
    assert.equal(new Set(steps).size,4,lesson.title);
    assert.ok(!steps.includes(challenge.answer),lesson.title);
    const check=faultMeterCheck(lesson,doc)!;
    assert.ok(check,lesson.title);
    assert.equal(check.instruction,steps[3]);
    assert.deepEqual(doc,before);
    if(check.powerOff)doc.supply.enabled=false;
    if([43,72,80].includes(lesson.id))doc.components.find(p=>p.id===(lesson.id===72?'back':'push'))!.params.pressed=true;
    if(lesson.id===78)doc.components.find(p=>p.id==='sensor')!.params.active=true;
    const result=simulate(doc,{},1);
    const readings=check.readings.map((r,i)=>({...captureMeasurement(doc,result,r,100+i),assisted:false}));
    assert.ok(readings.every(r=>r.status==='open'||r.status==='value'),lesson.id+' '+JSON.stringify(readings));
    assert.equal(validateDiagnosisEvidence(doc,result,readings,challenge).accepted,true,lesson.id+' '+check.instruction);
    const verdict=assessFaultDiagnosis(doc,result,challenge.fault,0,challenge,readings);
    assert.equal(verdict.accepted,true,lesson.id+' '+verdict.explanation);
    const choices=lessonFaultChoices(lesson.id);
    assert.ok(choices.some(([id])=>id===challenge.fault),lesson.id+' '+challenge.fault);
    assert.equal(new Set(choices.map(([id])=>id)).size,choices.length);
    for(const [id] of choices.filter(([id])=>id!==challenge.fault))
      assert.equal(assessFaultDiagnosis(doc,result,id,0,challenge,readings).accepted,false,lesson.title);
  }
});

test('isolated circuits use their actual terminal names for diagnoses and comparisons',()=>{
  for(const id of [13,24,43])assert.doesNotMatch(lessonFaultChoices(id).flatMap(([,text])=>text).join(' '),/neutral|\(N\)/i);
  const original=getLesson(72)!,older=structuredClone(original.circuit);
  delete older.components.find(c=>c.id==='chime')!.variant;
  assert.match(faultClue(original,original.circuit,3,false),/=\/~.*C2/);
  assert.match(faultClue(getLesson(72,older)!,older,3,false),/AC2.*REAR/);
});
