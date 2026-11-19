import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMeasurement, getLessonActivities, validateDiagnosisEvidence } from '../lib/learning';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis';
import { assessBuild } from '../lib/assessment';
import { getLesson } from '../lib/lessons';
import { simulate } from '../lib/simulation';
import type { Endpoint } from '../lib/types';
import { reseatWorktopConnector, worktopFaultPoints as points, worktopFaultReadings, worktopLampStatus, worktopLooseEnd } from '../lib/worktop-fault';

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

test('only the fitted output lead on the right DC rocker has a loose push-on',()=>{
  const {lesson,doc}=exercise(),lead=doc.wires.find(w=>w.id===lesson.challenge.wire)!;
  assert.deepEqual(worktopLooseEnd(doc),points.switchOutput.a);
  assert.equal(worktopLooseEnd(doc,doc.wires.find(w=>w.id!==lead.id)!),undefined);
  [lead.from,lead.to]=[lead.to,lead.from];
  assert.deepEqual(worktopLooseEnd(doc,lead),points.switchOutput.a);
  lead.from={component:'left',terminal:'L'};
  assert.equal(worktopLooseEnd(doc),undefined);
  lead.from=points.strip.a;
  doc.faults[0].enabled=false;
  assert.equal(worktopLooseEnd(doc),undefined);
  doc.faults[0].enabled=true;
  doc.components.find(c=>c.id==='right-switch')!.variant=undefined;
  assert.equal(worktopLooseEnd(doc),undefined);
});

test('reseating requires isolation and the selected blade, and preserves other faults and protection settings',()=>{
  const {lesson,doc}=exercise(),wire=lesson.challenge.wire!,out=points.switchOutput.a;
  assert.equal(reseatWorktopConnector(doc,wire,out),undefined);
  doc.supply.enabled=false;
  const alternate={...doc.components[0],id:'backup',type:'battery',params:{on:true}};
  const withBattery={...doc,components:[...doc.components,alternate]};
  assert.equal(reseatWorktopConnector(withBattery,wire,out),undefined);
  assert.equal(reseatWorktopConnector(doc,wire,{...out,terminal:'COM'}),undefined);
  assert.equal(reseatWorktopConnector(doc,wire,{...out,component:'left-switch'}),undefined);
  assert.equal(reseatWorktopConnector(doc,'missing-wire',out),undefined);
  const other={enabled:true,type:'missing-earth',wire:doc.wires.find(w=>w.role==='PE')!.id};
  doc.faults.push(other);
  const fixed=reseatWorktopConnector(doc,wire,out)!;
  assert.deepEqual(fixed.faults,[other]);
  assert.equal(fixed.components,doc.components);
  assert.equal(fixed.wires,doc.wires);
  assert.equal(doc.faults.length,2);
  assert.equal(reseatWorktopConnector(fixed,wire,out),undefined);
  assert.equal(simulate(fixed).deviceStates.right.energized,false);
  assert.equal(worktopLampStatus(fixed,simulate(fixed)),'Left strip dark · Right strip dark');
  const restored={...fixed,supply:{...fixed.supply,enabled:true},revision:fixed.revision+1};
  assert.equal(worktopLampStatus(restored,simulate(fixed)),undefined);
  assert.equal(worktopLampStatus(restored,simulate(restored)),'Left strip lit · Right strip lit');
  const report=assessBuild(restored,simulate(restored),lesson.circuit);
  assert.equal(report.passed,false);
  assert.ok(report.checks.some(item=>item.category==='protection'&&item.status==='fail'));
});

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
