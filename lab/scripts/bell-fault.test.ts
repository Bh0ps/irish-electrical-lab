import test from 'node:test';
import assert from 'node:assert/strict';
import {bellReadings,bellComparisonReady,bellInput,bellReturn,backPushOutput} from '../lib/bell-fault';
import {assessFaultDiagnosis} from '../lib/fault-diagnosis';
import {captureMeasurement,validateDiagnosisEvidence} from '../lib/learning';
import {getLesson} from '../lib/lessons';
import {validateBookmark} from '../lib/lesson-bookmark';
import {simulate} from '../lib/simulation';
import type {Endpoint} from '../lib/types';

function bench(legacy=false,broken=true,back=true,front=false){
  const example=structuredClone(getLesson(72)!.circuit);
  if(legacy)example.components.find(c=>c.id==='chime')!.variant=undefined;
  const lesson=getLesson(72,example)!,doc=structuredClone(lesson.circuit);
  doc.components.find(c=>c.id==='back')!.params.pressed=back;
  doc.components.find(c=>c.id==='front')!.params.pressed=front;
  if(broken)doc.faults=[{type:lesson.challenge.fault,wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true}];
  const result=simulate(doc);
  return {doc,result,lesson,read:(a:Endpoint,b:Endpoint)=>({...captureMeasurement(doc,result,{a,b,mode:'voltage'}),assisted:false})};
}

test('the held back push and its chime input localise the open back-call conductor on either saved fitting',()=>{
  for(const old of [false,true])for(const reversed of [false,true]){
    const {doc,result,read,lesson}=bench(old),points=[bellInput,backPushOutput];
    const readings=points.map(point=>reversed?read(bellReturn,point):read(point,bellReturn));
    assert.deepEqual(readings.map(r=>Math.round(r.value!)),[0,12]);
    const found=bellReadings(doc,result,readings);assert.ok(bellComparisonReady(found));
    assert.ok(validateDiagnosisEvidence(doc,result,readings,lesson.challenge).accepted);
    const wrong=assessFaultDiagnosis(doc,result,'wrong-control',0,lesson.challenge,readings);
    assert.equal(wrong.accepted,false);assert.match(wrong.explanation,new RegExp('12 V.*'+(old?'REAR':'C2')+'.*0 V'));
    assert.ok(assessFaultDiagnosis(doc,result,'open-wire',0,lesson.challenge,readings).accepted);
    const saved={version:1,circuit:doc,path:'full',mode:'challenges',activityId:'lesson:72:fault:measure',
      fault:{scored:false,accepted:false,repaired:false,hints:0,chime:true,probes:{red:bellReturn,black:bellInput}}};
    assert.deepEqual(validateBookmark(saved).fault,saved.fault);
  }
});
test('a fresh independent call and button reading are both needed',()=>{
  const {doc,result,read}=bench();const a=read(bellInput,bellReturn),b=read(backPushOutput,bellReturn);
  for(const bad of [read({component:'chime',terminal:'AC1'},bellReturn),{...b,assisted:true},{...b,revision:doc.revision+1},
    {...b,instrument:{model:'T6-600',method:'probe-voltage',held:true,reference:'none',displayed:'12'}} as unknown as typeof b]){
    assert.equal(bellComparisonReady(bellReadings(doc,result,[a,bad])),false);
  }
  assert.equal(bellComparisonReady(bellReadings(doc,{...result,revision:result.revision+1},[a,b])),false);
  for(const [broken,back,front] of [[false,true,false],[true,false,false],[true,true,true]]){
    const t=bench(false,broken,back,front);
    assert.equal(bellComparisonReady(bellReadings(t.doc,t.result,[t.read(bellInput,bellReturn),t.read(backPushOutput,bellReturn)])),false);
  }
});
