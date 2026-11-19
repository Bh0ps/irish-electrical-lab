import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMeasurement, getLessonActivities, validateDiagnosisEvidence } from '../lib/learning';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis';
import { getLesson } from '../lib/lessons';
import { simulate } from '../lib/simulation';
import type { Endpoint } from '../lib/types';
import { worktopFaultPoints as points, worktopFaultReadings } from '../lib/worktop-fault';

function exercise(broken=true){
  const lesson=getLesson(66)!,doc=structuredClone(lesson.circuit);
  if(broken)doc.faults=[{type:lesson.challenge.fault,wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true}];
  const result=simulate(doc);
  const probe=(a:Endpoint,b:Endpoint,reverse=false)=>({
    ...captureMeasurement(doc,result,{mode:'voltage',a:reverse?b:a,b:reverse?a:b,
      instrument:{model:'T6-600',method:'probe-voltage',held:false,reference:'none',displayed:''}}),
    assisted:false,
  });
  return {lesson,doc,result,probe};
}

test('a learner can compare the two ends of the broken worktop feed with the same return',()=>{
  for(const reversed of [false,true]){
    const {lesson,doc,result,probe}=exercise(), strip=probe(points.strip.a,points.strip.b);
    const output=probe(points.switchOutput.a,points.switchOutput.b,reversed);
    assert.equal(strip.instrument?.displayed,'0');
    assert.equal(output.instrument?.displayed,reversed?'-24':'24');
    const evidence=[output,strip], match=worktopFaultReadings(doc,result,evidence);
    assert.deepEqual(match,{strip,switchOutput:output});
    const verdict=assessFaultDiagnosis(doc,result,lesson.challenge.fault,0,lesson.challenge,evidence);
    assert.equal(verdict.accepted,true);
    assert.ok(verdict.explanation.includes(output.instrument!.displayed+' V at the switch'));
    const retry=assessFaultDiagnosis(doc,result,'open-neutral',0,lesson.challenge,evidence);
    assert.equal(retry.accepted,false);
    assert.ok(retry.explanation.includes(output.instrument!.displayed+' V at the switch'));
    assert.doesNotMatch(retry.explanation,/There’s a break/);
    assert.deepEqual(worktopFaultReadings(doc,result,[output,strip,{...strip,assisted:true}]),match);
  }
});

test('wrong strip, different reference, stale samples, and auto-placed or held probes do not establish the comparison',()=>{
  const {lesson,doc,result,probe}=exercise(),left={component:'left',terminal:'N'};
  const strip=probe(points.strip.a,points.strip.b),output=probe(points.switchOutput.a,points.switchOutput.b);
  for(const other of [
    probe(points.switchOutput.a,left),probe({component:'left',terminal:'L'},points.strip.b),
    {...output,assisted:true},{...output,value:230},{...output,revision:doc.revision+1},
    {...output,instrument:{...output.instrument!,displayed:'999'}},
  ]){
    assert.equal(worktopFaultReadings(doc,result,[strip,other]).switchOutput,undefined);
    assert.equal(assessFaultDiagnosis(doc,result,lesson.challenge.fault,0,lesson.challenge,[strip,other]).accepted,false);
  }
  assert.equal(worktopFaultReadings(doc,undefined,[strip,output]).strip,undefined);
  const held={...output,instrument:{...output.instrument!,held:true}} as unknown as typeof output;
  assert.equal(worktopFaultReadings(doc,result,[held]).switchOutput,undefined);
});

test('an earlier kitchen lesson gives the markings on each actual rocker',()=>{
  const original=getLesson(66)!,doc=structuredClone(original.circuit);
  delete doc.components.find(c=>c.id==='right-switch')!.variant;
  const earlier=getLesson(66,doc)!;
  const task=getLessonActivities(earlier).find(step=>step.wire===original.challenge.wire)!;
  assert.match(task.instruction,/right worktop switch · L1/i);
  assert.match(getLessonActivities(original).find(step=>step.wire===original.challenge.wire)!.instruction,/right worktop switch · 1/i);
  assert.deepEqual(earlier.circuit.wires,original.circuit.wires);
  assert.equal(getLesson(66,doc),earlier);
});
test('opposite DC probe polarity across a healthy feed cannot create evidence of a break',()=>{
  const {lesson,doc,result,probe}=exercise(false);
  const a=probe(points.strip.a,points.strip.b),b=probe(points.switchOutput.a,points.switchOutput.b,true);
  assert.ok(a.value!>23&&b.value!< -23);
  assert.equal(validateDiagnosisEvidence(doc,result,[a,b],lesson.challenge).accepted,false);
});
