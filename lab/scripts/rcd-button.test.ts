import assert from 'node:assert/strict';
import test from 'node:test';
import { getLesson } from '../lib/lessons';
import { simulate } from '../lib/simulation';

test('the supply meter reads its own active power and clears an old reading when its supply floats',()=>{
  const doc=structuredClone(getLesson(1)!.circuit);
  const meter=doc.components.find(item=>item.type==='meter')!;
  const result=simulate(doc);
  assert.ok(result.converged);
  const watts=result.deviceStates[meter.id].meterWatts;
  assert.equal(typeof watts,'number');
  assert.ok(Math.abs(Number(watts)-result.totalPower)<result.totalPower*.01);
  doc.wires=doc.wires.filter(wire=>wire.from.component!==meter.id&&wire.to.component!==meter.id);
  assert.equal(simulate(doc,result.deviceStates).deviceStates[meter.id].meterWatts,undefined);
});

test('the residual test button needs a powered test loop, trips independently from the lever, and releases before reset',()=>{
  const doc=structuredClone(getLesson(7)!.circuit);
  const rcbo=doc.components.find(c=>c.type==='rcbo')!;
  let states=simulate(doc).deviceStates;
  assert.equal(states[rcbo.id].tripped,false);
  rcbo.params.testPressed=true;
  const testResult=simulate(doc,states);
  assert.equal(testResult.deviceStates[rcbo.id].tripped,true);
  assert.ok(Number(testResult.deviceStates[rcbo.id].tripResidual)>.03);
  assert.equal(rcbo.params.closed,true);
  assert.ok(!testResult.deviceStates.light.energized);
  rcbo.params.testPressed=false;
  states=simulate(doc,testResult.deviceStates).deviceStates;
  assert.equal(states[rcbo.id].tripped,true);
  rcbo.params.resetToken=1;
  states=simulate(doc,states).deviceStates;
  assert.equal(states[rcbo.id].tripped,false);
  assert.ok(states.light.energized);
  doc.supply.enabled=false;
  rcbo.params.testPressed=true;
  assert.equal(simulate(doc,states).deviceStates[rcbo.id].tripped,false);
  doc.supply.enabled=true;
  doc.wires=doc.wires.filter(w=>w.to.component!==rcbo.id||w.to.terminal!=='NIN');
  assert.equal(simulate(doc).deviceStates[rcbo.id].tripped,false);
});
