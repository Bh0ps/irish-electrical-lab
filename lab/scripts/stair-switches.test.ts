import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_CALLS, checkStairChoice, houseJobLabels, houseStepId, savedCallStep, stairReadings } from '../lib/house-calls';
import { getLesson } from '../lib/lessons';
import { validateBookmark } from '../lib/lesson-bookmark';
import { simulate } from '../lib/simulation';
import type { CircuitDocument } from '../lib/types';

const job=HOUSE_CALLS.find(j=>j.lesson===9)!;
const original=getLesson(9)!.circuit;
function setPosition(doc:CircuitDocument,side:'near'|'far',position:number){
  return {...doc,revision:doc.revision+1,components:doc.components.map(c=>c.id===side?{...c,params:{...c.params,position}}:c)};
}
function check(doc:CircuitDocument,index:number,pin:'T1'|'T2'){
  return checkStairChoice(job,index,doc,simulate(doc),{activity:houseStepId(job,index),circuitId:doc.id,revision:doc.revision,pin});
}

test('stair job compares both strappers with neutral, and the landing contacts with COM',()=>{
  for(const volts of [230,240]){
    const doc={...original,supply:{...original.supply,voltage:volts}};
    const dark=setPosition(doc,'near',1),lit=setPosition(dark,'far',1);
    const solved=simulate(dark);
    const atLamp=stairReadings('far',dark,solved)!;
    assert.equal(atLamp.dark,true);
    assert.equal(atLamp.commonVoltage,0);
    assert.deepEqual(atLamp.wires.map(w=>w.mark),['L1','L2']);
    assert.equal(atLamp.wires[0].value,0);
    assert.ok(Math.abs(atLamp.wires[1].value!-volts)<.1);
    assert.equal(check(dark,1,'T2')?.pass,true);
    assert.equal(check(dark,1,'T1')?.pass,false);
    assert.match(check(dark,1,'T1')!.message,/L1 reads 0 V/);
    assert.equal(check(dark,2,'T2')?.pass,false);
    assert.equal(check(dark,2,'T1')?.pass,true);
    const relit=stairReadings('far',lit,simulate(lit))!;
    assert.equal(relit.dark,false);
    assert.equal(relit.wires[0].value,null);
    assert.ok(Math.abs(relit.wires[1].value!-volts)<.1);
    assert.equal(relit.answer,undefined);
  }
});

test('the landing answer follows crossed strappers and open or linked strappers cannot fake a result',()=>{
  const exchanged={...original,wires:original.wires.map(w=>w.to.component==='far'&&['T1','T2'].includes(w.to.terminal)?{...w,to:{...w.to,terminal:w.to.terminal==='T1'?'T2':'T1'}}:w)};
  const dark=setPosition(setPosition(exchanged,'far',1),'near',1);
  assert.equal(check(dark,1,'T2')?.pass,true);
  assert.equal(check(dark,2,'T2')?.pass,true);
  assert.equal(check(dark,2,'T1')?.pass,false);
  const broken={...dark,wires:dark.wires.filter(w=>w.id!=='w5')};
  assert.equal(stairReadings('far',broken,simulate(broken))!.wires[0].value,null);
  assert.equal(check(broken,2,'T2'),undefined);
  const shorted={...dark,wires:[...dark.wires,{...dark.wires[0],id:'link',from:{component:'near',terminal:'T1'},to:{component:'near',terminal:'T2'}}]};
  assert.equal(check(shorted,1,'T2'),undefined);
  const supplyOff={...dark,supply:{...dark.supply,enabled:false}};
  assert.equal(check(supplyOff,2,'T2'),undefined);
});

test('stair answers require a deliberate choice on the same activity, circuit and simulation revision',()=>{
  const dark=setPosition(original,'near',1),result=simulate(dark);
  const choice={activity:houseStepId(job,1),circuitId:dark.id,revision:dark.revision,pin:'T2' as const};
  for(const input of [undefined,{...choice,circuitId:'different'},{...choice,revision:dark.revision-1},{...choice,activity:houseStepId(job,2)}]){
    assert.equal(checkStairChoice(job,1,dark,result,input),undefined);
  }
  assert.equal(checkStairChoice(job,2,dark,result,choice),undefined);
  assert.equal(checkStairChoice(job,1,dark,simulate(original),choice),undefined);
  assert.equal(checkStairChoice(job,1,dark,{...result,converged:false},choice),undefined);
  assert.equal(checkStairChoice(job,1,dark,undefined,choice),undefined);
});

test('old and new stair job bookmarks resolve to the same pending task with the original wiring',()=>{
  const positions=['book:9:call-0','book:9:strapper-downstairs','book:9:strapper-landing','book:9:call-1','book:9:call-2'];
  const doc=setPosition(original,'near',1);
  for(const [i,id] of positions.entries()){
    assert.equal(houseStepId(job,i),id);
    const restored=validateBookmark({version:1,circuit:doc,activityId:id,path:'coursebook',mode:'explore'});
    assert.equal(savedCallStep(job,restored.activityId),i);
    assert.deepEqual(restored.circuit.wires,doc.wires);
  }
  assert.equal(houseJobLabels(doc).components.find(c=>c.id==='near')?.label,'Downstairs switch');
  const renamed={...doc,components:doc.components.map(c=>c.id==='near'?{...c,label:'Porch'}:c)};
  assert.equal(houseJobLabels(renamed).components.find(c=>c.id==='near')?.label,'Porch');
});
