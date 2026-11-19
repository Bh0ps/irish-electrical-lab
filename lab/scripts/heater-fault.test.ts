import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis';
import { heaterComparisonReady, heaterFaultReadings, heaterFeed, heaterLine, heaterNeutral } from '../lib/heater-fault';
import { captureMeasurement, validateDiagnosisEvidence } from '../lib/learning';
import { getLesson } from '../lib/lessons';
import { faultMeterCheck } from '../lib/fault-checks';
import { validateBookmark } from '../lib/lesson-bookmark';
import { simulate } from '../lib/simulation';
import type { Endpoint } from '../lib/types';

function setup(legacy=false,closed=true,broken=true,voltage=240){
  const fixture=structuredClone(getLesson(20)!.circuit);
  if(legacy)fixture.components.find(c=>c.id==='fcu-switch')!.type='switch';
  const lesson=getLesson(20,fixture)!,doc=structuredClone(lesson.circuit);
  doc.supply.voltage=voltage;
  doc.components.find(c=>c.id==='fcu-switch')!.params.closed=closed;
  if(broken)doc.faults=[{type:lesson.challenge.fault,wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true}];
  const result=simulate(doc),feed=heaterFeed(doc)!;
  const read=(a:Endpoint,b:Endpoint)=>({...captureMeasurement(doc,result,{a,b,mode:'voltage'}),assisted:false});
  return {doc,result,read,feed,lesson};
}

test('both heater circuits use their own fuse output and the same heater neutral for the comparison',()=>{
  for(const legacy of [false,true])for(const supply of [230,240]){
    const {doc,result,read,feed,lesson}=setup(legacy,true,true,supply);
    assert.deepEqual(feed,legacy?{component:'fuse',terminal:'OUT'}:{component:'fcu-switch',terminal:'LOUT'});
    assert.equal(lesson.challenge.wire,'w5');
    const samples=[read(heaterNeutral,heaterLine),read(heaterNeutral,feed)];
    assert.ok(Math.abs(samples[0].value!)<.1);
    assert.ok(Math.abs(samples[1].value!-supply)<.1);
    const readings=heaterFaultReadings(doc,result,samples);
    assert.equal(readings.heater,samples[0]);assert.equal(readings.output,samples[1]);assert.ok(heaterComparisonReady(doc,readings));
    assert.ok(validateDiagnosisEvidence(doc,result,samples,lesson.challenge).accepted);
    const wrong=assessFaultDiagnosis(doc,result,'open-neutral',0,lesson.challenge,samples);
    assert.equal(wrong.accepted,false);assert.match(wrong.explanation,new RegExp(supply+' V.*0 V'));
    assert.ok(assessFaultDiagnosis(doc,result,'open-live',0,lesson.challenge,samples).accepted);
    assert.ok(faultMeterCheck(lesson,doc)!.readings.every(r=>r.b?.component==='fixed'&&r.b.terminal==='N'));
    const bookmark={version:1,mode:'challenges',path:'full',activityId:'lesson:20:fault:measure',circuit:doc,
      fault:{heater:true,scored:false,accepted:false,repaired:false,hints:0,probes:{red:heaterNeutral,black:heaterLine}}};
    assert.deepEqual(validateBookmark(bookmark).fault,bookmark.fault);
    assert.equal(getLesson(20,validateBookmark(bookmark).circuit),lesson);
    const ordinary={...bookmark,fault:{scored:true,accepted:false,repaired:false,hints:1}};
    assert.deepEqual(validateBookmark(ordinary).fault,ordinary.fault);
  }
});

test('wrong reference, held or assisted reading, stale results, switch off and intact wiring cannot unlock the heater diagnosis',()=>{
  const {doc,result,read,feed}=setup();
  const load=read(heaterLine,heaterNeutral),out=read(feed,heaterNeutral);
  for(const sample of [read(feed,{component:'supply',terminal:'N'}),{...out,assisted:true},{...out,revision:doc.revision+1},
    {...out,instrument:{model:'T6-600',method:'probe-voltage',held:true,reference:'none',displayed:'240'}} as unknown as typeof out]){
    assert.equal(heaterComparisonReady(doc,heaterFaultReadings(doc,result,[load,sample])),false);
  }
  assert.deepEqual(heaterFaultReadings(doc,{...result,converged:false},[load,out]),{});
  for(const [closed,broken] of [[false,true],[true,false]]){
    const trial=setup(false,closed,broken);
    const captured=[trial.read(heaterLine,heaterNeutral),trial.read(trial.feed,heaterNeutral)];
    assert.equal(heaterComparisonReady(trial.doc,heaterFaultReadings(trial.doc,trial.result,captured)),false);
  }
});
