import assert from 'node:assert/strict';
import test from 'node:test';
import {getLesson} from '../lib/lessons';
import {simulate} from '../lib/simulation';
import {validateCircuit} from '../lib/storage';
import {looseBellWire,reseatBellWire} from '../lib/bell-connection';
import type {FaultSetting} from '../lib/types';

const end={component:'chime',terminal:'REAR'};
function job(){
  const lesson=getLesson(72)!,doc=structuredClone(lesson.circuit);
  const fault:FaultSetting={type:'open-wire',wire:lesson.challenge.wire,component:'chime',enabled:true,looseEnd:{...end}};
  doc.faults=[fault];doc.components.find(c=>c.id==='back')!.params.pressed=true;
  return {doc,fault};
}

test('a saved loose end belongs to a real end of the broken wire and survives import',()=>{
  const {doc,fault}=job();
  assert.equal(looseBellWire(validateCircuit(JSON.parse(JSON.stringify(doc))))?.id,fault.wire);
  for(const change of [{looseEnd:{...end,terminal:'AC1'}},{looseEnd:{component:'missing',terminal:'REAR'}},{type:'overload'}]){
    assert.throws(()=>validateCircuit({...doc,faults:[{...fault,...change}]}));
  }
  assert.equal(looseBellWire({...doc,faults:[{...fault,looseEnd:undefined}]}),undefined);
  assert.equal(looseBellWire({...doc,faults:[{...fault,enabled:false}]}),undefined);
});

test('only the loose end can be reseated with the simulated supply off; an independent break stays put',()=>{
  const {doc,fault}=job();
  assert.equal(simulate(doc).deviceStates.chime.call,'Idle');
  assert.equal(reseatBellWire(doc,fault,end),undefined);
  doc.supply.enabled=false;
  assert.equal(reseatBellWire(doc,fault,{component:'back',terminal:'NO'}),undefined);
  assert.equal(reseatBellWire(doc,{...fault},end),undefined);
  const other:FaultSetting={type:'open-wire',enabled:true,wire:doc.wires.find(w=>[w.from,w.to].some(e=>e.component==='front'))!.id};
  doc.faults.push(other);
  const fixed=reseatBellWire(doc,fault,end)!;
  assert.deepEqual(fixed.faults,[other]);assert.deepEqual(doc.faults,[fault,other]);
  assert.equal(looseBellWire(fixed),undefined);assert.deepEqual(fixed.components,doc.components);
  assert.equal(simulate({...fixed,supply:{...fixed.supply,enabled:true}}).deviceStates.chime.call,'Rear');
});
