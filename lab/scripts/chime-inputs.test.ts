import test from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons.ts';
import {measureVoltage,simulate} from '../lib/simulation.ts';
import {forkRead} from '../lib/fork-tester.ts';
import type {Endpoint} from '../lib/types.ts';

const make=()=>structuredClone(getLesson(72)!.circuit);
const at=(component:string,terminal:string):Endpoint=>({component,terminal});
const chime=(pin:string)=>at('chime',pin);
const item=(doc:ReturnType<typeof make>,id:string)=>doc.components.find(c=>c.id===id)!;
const read=(doc:ReturnType<typeof make>)=>{
  const r=simulate(doc);assert.ok(r.converged,JSON.stringify(r.diagnostics));return r;
};
test('the hall chime reads either voltage input with the steady supply still connected',()=>{
  const d=make();
  for(const [front,back,want] of [[false,false,'Idle'],[true,false,'Front'],[false,true,'Rear'],[true,true,'Both']] as const){
    item(d,'front').params.pressed=front;item(d,'back').params.pressed=back;
    const r=read(d);
    assert.equal(r.deviceStates.chime.call,want);
    assert.equal(Math.round(measureVoltage(r,chime('FRONT'),chime('AC2')).value!),front?12:0);
    assert.equal(Math.round(measureVoltage(r,chime('AC1'),chime('AC2')).value!),12);
    assert.equal(measureVoltage(r,chime('V'),chime('AC2')).value,null);
  }
  d.wires=d.wires.filter(w=>![w.from,w.to].some(e=>e.component==='chime'&&e.terminal==='AC1'));
  assert.equal(read(d).deviceStates.chime.call,'Idle');
});
test('a volt-free door button calls through V and does not get a made-up sensing voltage',()=>{
  const d=make();
  for(const button of ['front','back']){
    const feed=d.wires.find(w=>w.to.component===button&&w.to.terminal==='COM')!;
    feed.from=chime('V');
  }
  const r=read(d);
  assert.equal(r.deviceStates.chime.call,'Idle');
  item(d,'front').params.pressed=true;
  const held=read(d);
  assert.equal(held.deviceStates.chime.call,'Front');
  for(const point of [at('front','COM'),at('front','NO'),chime('FRONT')]){
    assert.equal(measureVoltage(held,point,chime('AC2')).value,null);
    assert.equal(forkRead(d,held,{a:point,b:chime('AC2'),method:'probe-voltage',reference:'none'}).status,'unresolved');
  }
  assert.equal(Math.round(measureVoltage(held,chime('AC1'),chime('AC2')).value!),12);
  const broken=d.wires.find(w=>w.from.component==='front'&&w.from.terminal==='NO')!;
  d.faults.push({type:'open-wire',enabled:true,wire:broken.id});
  assert.equal(read(d).deviceStates.chime.call,'Idle');
  d.faults=[];item(d,'back').params.pressed=true;assert.equal(read(d).deviceStates.chime.call,'Both');
});
test('a positive DC call is accepted, a reversed DC call and an out-of-range supply are rejected',()=>{
  const d=make(),tx=item(d,'tx');
  tx.type='dcsupply';item(d,'front').params.pressed=true;
  for(const v of [8,12,6,24]){
    tx.params.outputVoltage=v;
    const r=read(d);
    assert.equal(r.deviceStates.chime.call,v===8||v===12?'Front':'Idle');
    assert.equal(!!r.diagnostics.find(f=>f.id==='chime-supply:chime'),v===6||v===24);
  }
  tx.params.outputVoltage=12;
  for(const w of d.wires) for(const p of [w.from,w.to]){
    if(p.component==='tx' && ['+','-'].includes(p.terminal))p.terminal=p.terminal==='+'?'-':'+';
  }
  assert.equal(read(d).deviceStates.chime.call,'Idle');
  for(const w of d.wires) for(const p of [w.from,w.to]){
    if(p.component==='tx' && ['+','-'].includes(p.terminal))p.terminal=p.terminal==='+'?'-':'+';
  }
  delete item(d,'chime').variant;
  assert.equal(read(d).deviceStates.chime.call,'Idle');
});
