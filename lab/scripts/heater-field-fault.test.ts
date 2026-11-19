import test from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons';
import {assessFaultDiagnosis} from '../lib/fault-diagnosis';
import {captureMeasurement,validateDiagnosisEvidence} from '../lib/learning';
import {heaterFieldAvailable,heaterFieldReadings,heaterFieldReady,heaterIn,heaterLoad,heaterFieldPrompt} from '../lib/heater-field-fault';
import {looseHeaterPoint} from '../lib/heater-flex-point';
import {forkRead,instrumentData} from '../lib/fork-tester';
import {simulate} from '../lib/simulation';
import type {CircuitDocument,Endpoint} from '../lib/types';

function job() {
  const lesson=getLesson(20)!,doc=structuredClone(lesson.circuit);
  doc.supply.enabled=false;
  doc.components.find(c=>c.id==='fcu-switch')!.params.closed=true;
  doc.faults=[{type:'open-live',wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true,looseEnd:heaterLoad}];
  return {doc,lesson,copper:looseHeaterPoint(doc)!};
}

function read(doc:CircuitDocument,a:Endpoint,b:Endpoint){
  const result=simulate(doc),setup={method:'resistance',reference:'none',a,b} as const;
  const reading=forkRead(doc,result,setup,undefined,true),instrument=instrumentData(setup,reading);
  return {...captureMeasurement(doc,result,{mode:'resistance',source:'installed-fcu',a,b,instrument}),assisted:false};
}

test('the actual dead pole and the physical copper-to-clamp gap support an isolated diagnosis',()=>{
  for(const swap of [false,true]){
    const {doc,copper,lesson}=job(),result=simulate(doc);assert.ok(heaterFieldAvailable(doc));
    const pole=swap?read(doc,heaterLoad,heaterIn):read(doc,heaterIn,heaterLoad);
    const gap=swap?read(doc,copper,heaterLoad):read(doc,heaterLoad,copper);
    assert.equal(pole.instrument?.displayed,'0');assert.ok(pole.value!==null&&pole.value<1);
    assert.equal(gap.status,'open');assert.equal(gap.value,null);assert.equal(gap.instrument?.displayed,'OL');assert.match(gap.measuredAt!,/brown wire/i);
    const rows=heaterFieldReadings(doc,result,[gap,pole]);assert.ok(heaterFieldReady(rows));
    assert.ok(validateDiagnosisEvidence(doc,result,[gap,pole],lesson.challenge).accepted);
    const wrong=assessFaultDiagnosis(doc,result,'open-neutral',0,lesson.challenge,[gap,pole]);
    assert.equal(wrong.accepted,false);assert.match(wrong.explanation,/0 Ω.*OL/);
    assert.ok(assessFaultDiagnosis(doc,result,'open-live',0,lesson.challenge,[gap,pole]).accepted);
  }
});

test('supply state, probe positions, meter mode, origin and recorded revision must all match',()=>{
  const {doc,copper,lesson}=job(),result=simulate(doc),pole=read(doc,heaterIn,heaterLoad),gap=read(doc,heaterLoad,copper);
  const neutral={component:'fcu-switch',terminal:'NOUT'};
  for(const bad of [read(doc,heaterLoad,neutral),read(doc,heaterLoad,{component:'fixed',terminal:'L'}),
    {...gap,source:undefined},{...gap,assisted:true},{...gap,circuitId:'another'},
    {...gap,revision:gap.revision+1},{...gap,status:'unresolved' as const},{...gap,value:20,status:'value' as const},
    {...gap,instrument:{...gap.instrument!,held:true} as unknown as typeof gap.instrument}]){
    assert.equal(heaterFieldReady(heaterFieldReadings(doc,result,[pole,bad])),false);
  }
  const neutralPole=read(doc,{component:'fcu-switch',terminal:'NIN'},neutral);
  assert.match(heaterFieldPrompt(doc,{},neutralPole),/N is neutral/);
  assert.equal(heaterFieldReady(heaterFieldReadings(doc,result,[neutralPole,gap])),false);
  assert.equal(heaterFieldReady(heaterFieldReadings(doc,result,[{...pole,source:undefined},gap])),false);
  doc.components.find(c=>c.id==='fcu-switch')!.params.closed=false;
  assert.equal(heaterFieldReady(heaterFieldReadings(doc,simulate(doc),[pole,gap])),false);
  doc.supply.enabled=true;assert.equal(heaterFieldReady(heaterFieldReadings(doc,simulate(doc),[pole,gap])),false);
  doc.faults[0].looseEnd=undefined;assert.equal(heaterFieldAvailable(doc),false);
  assert.equal(assessFaultDiagnosis(doc,simulate(doc),'open-live',0,lesson.challenge,[pole,gap]).accepted,false);
});

test('a real parallel path returns resistance instead of rewarding a made-up OL',()=>{
  const {doc,lesson,copper}=job();
  const flex=doc.wires.find(w=>w.id===lesson.challenge.wire)!;
  doc.wires.push({...structuredClone(flex),id:'alternate',cable:undefined,resistance:2});
  const result=simulate(doc),pole=read(doc,heaterIn,heaterLoad),gap=read(doc,heaterLoad,copper);
  assert.equal(gap.status,'value');assert.ok(gap.value!==null&&gap.value>1);
  const rows=heaterFieldReadings(doc,result,[pole,gap]);assert.equal(heaterFieldReady(rows),false);
  assert.match(heaterFieldPrompt(doc,rows),/another path/);
  const forged={...gap,value:null,status:'open' as const,instrument:{...gap.instrument!,displayed:'OL'}};
  assert.equal(validateDiagnosisEvidence(doc,result,[pole,forged],lesson.challenge).accepted,false);
});
