import test from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons';
import {validateCircuit} from '../lib/storage';
import {assessBuild} from '../lib/assessment';
import {startHeaterPress,finishHeaterPress,heaterRunReady} from '../lib/heater-fault';
import {faultClue} from '../lib/fault-checks';
import {simulate} from '../lib/simulation';
import {heaterFlexEnd,looseHeaterWire} from '../lib/heater-connection';
import {reseatHeaterWire} from '../lib/heater-repair';
import type {FaultSetting} from '../lib/types';

function newJob(){
  const lesson=getLesson(20)!,doc=structuredClone(lesson.circuit);
  const {wire,component,fault:type}=lesson.challenge;
  const fault:FaultSetting={type,wire,component,enabled:true,looseEnd:heaterFlexEnd(doc,wire)};
  doc.faults=[fault];
  return {doc,fault};
}
const clamp={component:'fcu-switch',terminal:'LOUT'};

test('a new heater repair identifies only the outgoing end of the installed flex, including after import',()=>{
  const {doc,fault}=newJob();
  assert.deepEqual(fault.looseEnd,clamp);
  assert.equal(looseHeaterWire(validateCircuit(JSON.parse(JSON.stringify(doc))))?.id,fault.wire);
  const incoming=doc.wires.find(w=>[w.from,w.to].some(e=>e.component==='fcu-switch'&&e.terminal==='LIN'))!;
  assert.throws(()=>validateCircuit({...doc,faults:[{...fault,wire:incoming.id}]}));
  assert.equal(looseHeaterWire({...doc,faults:[{...fault,looseEnd:undefined}]}),undefined);
  assert.equal(looseHeaterWire({...doc,faults:[{...fault,looseEnd:{component:'fixed',terminal:'L'}}]}),undefined);
});

test('a correct heater repair changes only the named fault with the simulated sources off',()=>{
  const {doc,fault}=newJob();
  const demand=doc.components.find(c=>c.id==='fcu-switch')!;demand.params.closed=true;
  assert.equal(simulate(doc).deviceStates.fixed.heaterSupplied,false);
  assert.equal(reseatHeaterWire(doc,fault,clamp),undefined);
  doc.supply.enabled=false;
  for(const terminal of ['LIN','NOUT','NIN','PE']){
    assert.equal(reseatHeaterWire(doc,fault,{...clamp,terminal}),undefined);
  }
  assert.equal(reseatHeaterWire(doc,{...fault},clamp),undefined);
  const other={type:'missing-earth',enabled:true,wire:doc.wires.find(w=>w.role==='PE')!.id};
  doc.faults.push(other);
  const fixed=reseatHeaterWire(doc,fault,clamp)!;
  assert.deepEqual(fixed.faults,[other]);assert.deepEqual(doc.faults,[fault,other]);
  assert.deepEqual(fixed.components,doc.components);assert.equal(looseHeaterWire(fixed),undefined);
  assert.equal(simulate({...fixed,supply:{...fixed.supply,enabled:true}}).deviceStates.fixed.heaterSupplied,true);
});

test('a working heater can switch both ways with an earth fault still outstanding in the test report',()=>{
  const {doc}=newJob(),switchId='fcu-switch',sw=doc.components.find(c=>c.id===switchId)!;
  doc.faults=[{type:'missing-earth',enabled:true,wire:doc.wires.find(w=>w.role==='PE'&&[w.from,w.to].some(e=>e.component==='fixed'))!.id}];
  sw.params.closed=true;
  const off=startHeaterPress(doc,simulate(doc),switchId)!;
  sw.params.closed=false;doc.revision++;
  const stopped=simulate(doc),first=finishHeaterPress(doc,stopped,off);
  assert.ok(first&&first.stopped<1);
  const on=startHeaterPress(doc,stopped,switchId)!;
  sw.params.closed=true;doc.revision++;
  const live=simulate(doc),passed=finishHeaterPress(doc,live,on,first);
  assert.ok(heaterRunReady(doc,live,passed));
  const report=assessBuild(doc,live,getLesson(20)!.circuit);
  assert.equal(report.passed,false);
  assert.ok(report.checks.some(c=>c.status==='fail'&&/earth|protective/i.test(c.title+' '+c.explanation)));
});

test('the installed heater clues match an isolated resistance check',()=>{
  const {doc}=newJob(),lesson=getLesson(20)!;
  assert.equal(faultClue(lesson,doc,0,false,true),'');
  assert.match(faultClue(lesson,doc,1,false,true),/supply off/);
  assert.match(faultClue(lesson,doc,2,false,true),/ohms/);
  assert.match(faultClue(lesson,doc,3,false,true),/brown flex end/);
  assert.match(faultClue(lesson,doc,1,false),/voltage/);
});
