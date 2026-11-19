import assert from 'node:assert/strict';
import test from 'node:test';
import {getLesson} from '../lib/lessons.ts';
import {simulate} from '../lib/simulation.ts';
import {beginDoorPress,finishDoorPress} from '../lib/door-call-feedback.ts';

const circuit=()=>structuredClone(getLesson(72)!.circuit);
function press(doc:ReturnType<typeof circuit>,id:string){
  const button=doc.components.find(c=>c.id===id)!;
  const pending=beginDoorPress(doc,simulate(doc),button)!;
  button.params.pressed=true;doc.revision++;
  return finishDoorPress(pending,doc,simulate(doc))!;
}
test('each newly active chime input gives its own single call, including with the other button held',()=>{
  const doc=circuit();
  assert.deepEqual(press(doc,'front').tones,['C1']);
  assert.deepEqual(press(doc,'back').tones,['C2']);
  assert.equal(beginDoorPress(doc,simulate(doc),doc.components.find(c=>c.id==='back')!),undefined);
});
test('swapped call wires ring the actual input; a broken call and a missing chime supply stay quiet',()=>{
  const doc=circuit();
  for(const wire of doc.wires)for(const end of [wire.from,wire.to]){
    if(end.component==='chime'&&['FRONT','REAR'].includes(end.terminal))end.terminal=end.terminal==='FRONT'?'REAR':'FRONT';
  }
  assert.deepEqual(press(doc,'front'),{tones:['C2'],caption:'Hall chime · Back call (C2)'});
  const broken=circuit();
  broken.wires=broken.wires.filter(w=>![w.from,w.to].some(end=>end.component==='back'&&end.terminal==='NO'));
  assert.deepEqual(press(broken,'back'),{tones:[],caption:'Chime quiet. Check the call wire at the chime.'});
  const off=circuit();off.supply.enabled=false;
  assert.deepEqual(press(off,'back'),{tones:[],caption:'Chime quiet. Check the supply at the chime.'});
});
test('stale results, released buttons, unresolved solves and other circuits cannot sound a chime',()=>{
  const doc=circuit(),button=doc.components.find(c=>c.id==='front')!;
  const pending=beginDoorPress(doc,simulate(doc),button)!;
  doc.revision++;
  assert.equal(finishDoorPress(pending,doc,simulate(doc)),undefined);
  button.params.pressed=true;
  const reading=simulate(doc);
  assert.equal(finishDoorPress(pending,doc,{...reading,revision:doc.revision-1}),undefined);
  assert.equal(finishDoorPress(pending,{...doc,id:'new-job'},reading),undefined);
  assert.deepEqual(finishDoorPress(pending,doc,{...reading,converged:false})?.tones,[]);
  assert.deepEqual(finishDoorPress({...pending,before:undefined},doc,reading)?.tones,[]);
});
