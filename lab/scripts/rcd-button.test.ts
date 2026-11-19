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
  assert.match(testResult.deviceStates[rcbo.id].details,/internal test resistor/);
  assert.doesNotMatch(testResult.deviceStates[rcbo.id].details,/earth/);
  assert.equal(testResult.preTrip?.explanation,testResult.deviceStates[rcbo.id].details);
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
  const unpowered=simulate(doc,states).deviceStates[rcbo.id];
  assert.equal(unpowered.tripped,false);
  assert.match(unpowered.details,/No current passed through the T test path/);
  doc.supply.enabled=true;
  doc.wires=doc.wires.filter(w=>w.to.component!==rcbo.id||w.to.terminal!=='NIN');
  assert.equal(simulate(doc).deviceStates[rcbo.id].tripped,false);
});

test('balanced current through a shared RCCB has no overload timing, even above its carrying rating',()=>{
  const doc=structuredClone(getLesson(2)!.circuit),group=doc.components.find(c=>c.id==='group')!;
  group.params.rating=40;
  for(const item of doc.components){
    if(item.id.startsWith('branch'))item.params.rating=63;
    if(item.id.startsWith('load'))item.params.watts=6000;
  }
  let result=simulate(doc);
  for(let step=0;step<3;step++){
    result=simulate(doc,result.deviceStates,10);
    assert.ok(result.totalCurrent>40);
    assert.equal(result.deviceStates.group.tripped,false);
    assert.equal(result.deviceStates.group.elapsed,0);
    assert.match(result.deviceStates.group.details,/Line current .* A\. Imbalance 0\.0 mA/);
    assert.doesNotMatch(result.deviceStates.group.details,/overload/);
  }
  group.params.closed=false;
  assert.match(simulate(doc,result.deviceStates).deviceStates.group.details,/handle is off/);
});

test('an earth fault persists across reset, and a borrowed neutral earns a different explanation',()=>{
  const doc=structuredClone(getLesson(2)!.circuit),group=doc.components.find(c=>c.id==='group')!;
  doc.faults.push({type:'earth-fault',component:'load1',enabled:true});
  let result=simulate(doc);
  assert.match(result.deviceStates.group.details,/path to a protective earth terminal carried/);
  assert.doesNotMatch(result.deviceStates.group.details,/button|test resistor/);
  group.params.resetToken=1;
  result=simulate(doc,result.deviceStates);
  assert.ok(result.events.some(e=>e.component==='group'&&e.title==='Residual-current trip'));
  assert.match(result.deviceStates.group.details,/protective earth/);
  doc.faults=[];
  group.params.resetToken=2;
  const neutral=doc.wires.find(w=>w.from.component==='group'&&w.from.terminal==='NOUT'&&w.to.component==='load1')!;
  neutral.from={component:'supply',terminal:'N'};
  result=simulate(doc,result.deviceStates);
  assert.equal(result.deviceStates.group.tripped,true);
  assert.match(result.deviceStates.group.details,/outside the monitored conductors/);
  assert.doesNotMatch(result.deviceStates.group.details,/earth|button|test resistor/);
});

test('attribution uses solved test current, including a simultaneous leak and an unpowered T on another phase',()=>{
  const doc=structuredClone(getLesson(2)!.circuit),group=doc.components.find(c=>c.id==='group')!;
  group.params.testPressed=true;
  doc.faults.push({type:'earth-fault',component:'load1',enabled:true});
  const mixed=simulate(doc);
  assert.ok(Number(mixed.deviceStates.group.tripResidual)>2);
  assert.match(mixed.deviceStates.group.details,/T test resistor carried/);
  assert.match(mixed.deviceStates.group.details,/path to a protective earth terminal carried/);

  // Both paths carry similar currents on opposite sides of the sensor. The
  // device responds to their signed sum, even while the T button is held.
  const lamp=doc.components.find(c=>c.id==='load1')!;
  lamp.params.faultResistance=230/(2*.03);
  const cancelling=simulate(doc);
  assert.equal(cancelling.deviceStates.group.tripped,false);
  assert.ok(Math.abs(cancelling.branchCurrents['group.testResistor'].re)>.03);
  assert.ok(Math.abs(cancelling.branchCurrents['fault:load1:earth'].re)>.03);
  assert.ok(Number(cancelling.deviceStates.group.imbalance)<.03);
  group.params.testPressed=false;
  assert.equal(simulate(doc,cancelling.deviceStates).deviceStates.group.tripped,true);
  group.params.testPressed=true;delete lamp.params.faultResistance;

  doc.components.find(c=>c.id==='supply')!.type='source3';
  doc.supply.phase='three';doc.supply.voltage=400;
  group.type='rcd3';
  for(const wire of doc.wires)for(const end of [wire.from,wire.to]){
    if(end.component==='supply'&&end.terminal==='L')end.terminal='L2';
    if(end.component==='group'&&end.terminal.startsWith('L'))end.terminal=end.terminal.replace('L','L2');
  }
  const otherPhase=simulate(doc);
  assert.ok(Number(otherPhase.deviceStates.group.tripResidual)>2);
  assert.match(otherPhase.deviceStates.group.details,/protective earth/);
  assert.doesNotMatch(otherPhase.deviceStates.group.details,/button|test resistor/);
});

test('an RCBO and a branch MCB still open on excessive balanced load current',()=>{
  for(const id of [2,7]){
    const doc=structuredClone(getLesson(id)!.circuit);
    const breaker=doc.components.find(c=>id===2?c.id==='branch1':c.type==='rcbo')!;
    const load=doc.components.find(c=>c.type==='lamp')!;
    breaker.params.rating=1;load.params.watts=2400;
    const result=simulate(doc);
    assert.equal(result.deviceStates[breaker.id].tripped,true);
    assert.ok(result.events.some(e=>e.component===breaker.id&&e.title==='Overcurrent trip'));
    assert.match(result.deviceStates[breaker.id].details,/carried .* A before it opened/);
    if(id===2)assert.equal(result.deviceStates.group.tripped,false);
  }
});
