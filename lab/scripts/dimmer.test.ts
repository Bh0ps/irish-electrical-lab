import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, measureVoltage, measureResistance, getDimmerEquivalentResistance } from '../lib/simulation.ts';
import { LESSONS } from '../lib/lessons.ts';
import { runLessonScenarios } from '../lib/scenarios.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Parameters, SimulationResult, Wire } from '../lib/types.ts';
const e=(component:string,terminal:string):Endpoint=>({component,terminal});
const item=(type:string,id:string,params:Parameters={}):ComponentInstance=>({type,id,label:id,params,position:[0,0,0],rotation:0});
function fixture(ohms=960,referenceOhms=960):CircuitDocument{
  const wires:[Endpoint,Endpoint,Wire['role']][]=[[e('source','L'),e('dimmer','COM'),'L'],[e('dimmer','OUT'),e('load','L'),'L'],[e('load','N'),e('source','N'),'N'],[e('load','PE'),e('source','PE'),'PE']];
  return {version:1,id:'dimmer-test',name:'Dimmer electrical test',revision:1,supply:{enabled:true,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[item('source','source'),item('dimmer','dimmer',{level:.65,closed:true,referenceOhms}),item('lamp','load',{ohms,watts:60,nominalVoltage:240})],wires:wires.map(([from,to,role],i)=>({id:`w${i}`,from,to,role,resistance:.01,bends:[]})),faults:[]};
}
function setting(d:CircuitDocument,level:number){d.components.find(c=>c.id==='dimmer')!.params.level=level;}
function close(actual:number|null,expected:number,tolerance=1e-5){assert.notEqual(actual,null);assert.ok(Math.abs(actual!-expected)<=Math.max(tolerance,Math.abs(expected)*tolerance),`${actual} should approximate ${expected}`);}
const current=(r:SimulationResult,id:string)=>Math.hypot(r.branchCurrents[`${id}.dimming`]?.re??0,r.branchCurrents[`${id}.dimming`]?.im??0);

test('levels 0,.25,.65,.9,1 change actual series resistance, load voltage/current/power, and emitter power',()=>{
  const d=fixture(),before=structuredClone(d);let previous:SimulationResult|undefined,lastPower=-1,lastVoltage=-1,lastCurrent=-1,lastResistance=Infinity;
  for(const level of [0,.25,.65,.9,1]){
    setting(d,level);const expected=getDimmerEquivalentResistance(level),r=simulate(d,previous?.deviceStates,.1);assert.equal(r.converged,true,JSON.stringify(r.diagnostics));
    const v=measureVoltage(r,e('load','L'),e('load','N')).value,p=r.componentPower.load??0,i=current(r,'dimmer');
    assert.ok(v!==null);assert.ok(p>lastPower);assert.ok(v>lastVoltage);assert.ok(i>lastCurrent);close(Number(r.deviceStates.load.lightOutputPower),p);
    assert.equal(r.deviceStates.dimmer.voltageDropResolved,true);
    if(expected===null){assert.equal(r.deviceStates.dimmer.dimmerResistance,'open');close(p,0);close(v,0);close(i,0);}
    else{assert.ok(expected<lastResistance);close(Number(r.deviceStates.dimmer.dimmerResistance),expected);const calculatedI=240/(960+expected+.15001);close(i,calculatedI);close(v,calculatedI*960);close(p,calculatedI**2*960);close(r.componentPower.dimmer,calculatedI**2*expected);close(r.totalPower,r.componentPower.dimmer+p+i*i*.15001);lastResistance=expected;}
    lastPower=p;lastVoltage=v;lastCurrent=i;previous=r;
  }
  setting(d,.65);assert.deepEqual(d,before);
});
test('fixed reference behaves according to a custom connected resistor rather than finding a standard nearby lamp',()=>{
  for(const level of [.25,.65,.9,1]){const d=fixture(480,120);setting(d,level);const r=simulate(d);assert.equal(r.converged,true);const resistance=getDimmerEquivalentResistance(level,120)!;const i=240/(480+resistance+.15001);close(current(r,'dimmer'),i);close(r.componentPower.load,i*i*480);close(measureVoltage(r,e('load','L'),e('load','N')).value,i*480);}
});
test('isolated COM–OUT passive resistance follows the setting and OFF reads an actual open circuit',()=>{
  const d=fixture();d.supply.enabled=false;d.wires=[];
  for(const level of [0,.25,.65,.9,1]){setting(d,level);const reading=measureResistance(d,e('dimmer','COM'),e('dimmer','OUT'));const expected=getDimmerEquivalentResistance(level);if(expected===null){assert.equal(reading.value,null);assert.match(reading.explanation,/Open circuit/);}else close(reading.value,expected);}
  setting(d,.65);d.components.find(c=>c.id==='dimmer')!.params.closed=false;const off=measureResistance(d,e('dimmer','COM'),e('dimmer','OUT'));assert.equal(off.value,null);assert.match(off.explanation,/Open circuit/);
});
test('an actual bypass maintains load power even at dimmer zero and an ohmmeter sees the parallel path',()=>{
  const d=fixture();d.wires.push({id:'bypass',from:e('dimmer','COM'),to:e('dimmer','OUT'),role:'L',resistance:.01,bends:[]});let prior=0;
  for(const level of [0,.25,.65,.9,1]){setting(d,level);const r=simulate(d);assert.equal(r.converged,true);assert.ok(r.componentPower.load>59.9);assert.ok(Number(r.deviceStates.load.lightOutputPower)>59.9);if(prior)close(r.componentPower.load,prior,.001);prior=r.componentPower.load;d.supply.enabled=false;const resistance=measureResistance(d,e('dimmer','COM'),e('dimmer','OUT')).value;const nominal=getDimmerEquivalentResistance(level);close(resistance,nominal===null?.01:1/(1/.01+1/nominal));d.supply.enabled=true;}
});
test('unconnected and interrupted dimmers neither infer a load resistance nor create illumination',()=>{
  for(const kind of ['unconnected','missing-output','open-neutral','lamp-bypasses'] as const){const d=fixture();if(kind==='unconnected')d.wires=[];if(kind==='missing-output')d.wires=d.wires.filter(w=>w.id!=='w1');if(kind==='open-neutral')d.wires=d.wires.filter(w=>w.id!=='w2');if(kind==='lamp-bypasses'){d.wires=d.wires.filter(w=>w.id!=='w1');d.wires.push({id:'separate-feed',from:e('source','L'),to:e('load','L'),role:'L',resistance:.01,bends:[]});}
    for(const level of [.25,.65,.9]){setting(d,level);const r=simulate(d,{dimmer:{energized:true,closed:true,tripped:false,level:1,direction:0,elapsed:0,resetToken:0,details:'old',dimmerResistance:123456}});assert.equal(r.converged,true,JSON.stringify(r.diagnostics));close(Number(r.deviceStates.dimmer.dimmerResistance),getDimmerEquivalentResistance(level)!);close(current(r,'dimmer'),0);if(kind==='unconnected'){assert.equal(r.deviceStates.dimmer.voltageDropResolved,false);assert.equal(r.deviceStates.dimmer.voltageDrop,'unresolved');}if(kind==='lamp-bypasses')assert.ok(Number(r.deviceStates.load.lightOutputPower)>59.9);else close(Number(r.deviceStates.load.lightOutputPower),0);}
  }
});
test('two series dimmers and an isolated secondary use actual node drops without feedback instability',()=>{
  const d=fixture();d.components.push(item('dimmer','second',{level:.65,referenceOhms:240}));d.wires.find(w=>w.id==='w1')!.from=e('second','OUT');d.wires.push({id:'between',from:e('dimmer','OUT'),to:e('second','COM'),role:'L',resistance:.01,bends:[]});const r=simulate(d);assert.equal(r.converged,true);const resistance=getDimmerEquivalentResistance(.65)!+getDimmerEquivalentResistance(.65,240)!;close(r.componentPower.load,(240/(960+resistance+.16001))**2*960);
  const isolated=fixture(48,48);isolated.components[0]=item('transformer','source',{nominalVoltage:240,outputVoltage:24});isolated.components.push(item('source','mains'));isolated.wires[0].from=e('source','+');isolated.wires[2].to=e('source','-');isolated.wires[3].to=e('mains','PE');isolated.components.find(c=>c.id==='load')!.params.nominalVoltage=24;isolated.components.find(c=>c.id==='load')!.params.watts=12;isolated.wires.push({id:'primaryL',from:e('mains','L'),to:e('source','L'),role:'L',resistance:.01,bends:[]},{id:'primaryN',from:e('mains','N'),to:e('source','N'),role:'N',resistance:.01,bends:[]},{id:'transformerPE',from:e('mains','PE'),to:e('source','PE'),role:'PE',resistance:.01,bends:[]});let last=0;
  for(const level of [.25,.65,.9,1]){setting(isolated,level);const out=simulate(isolated);assert.equal(out.converged,true,JSON.stringify(out.diagnostics));assert.ok(out.componentPower.load>last);last=out.componentPower.load;close(Number(out.deviceStates.load.lightOutputPower),last);}
});
test('closed control takes precedence over the legacy on alias and a disabled supply makes no emitter output',()=>{
  const d=fixture();d.components.find(c=>c.id==='dimmer')!.params.on=true;d.components.find(c=>c.id==='dimmer')!.params.closed=false;const open=simulate(d);close(Number(open.deviceStates.load.lightOutputPower),0);assert.equal(open.deviceStates.dimmer.dimmerResistance,'open');d.components.find(c=>c.id==='dimmer')!.params.closed=true;d.supply.enabled=false;const off=simulate(d);close(Number(off.deviceStates.load.lightOutputPower),0);
});
test('nonzero levels below the generic energized threshold still carry their actual light-output power',()=>{
  const d=fixture();setting(d,.01);const r=simulate(d);assert.equal(r.deviceStates.load.energized,false);assert.ok(Number(r.deviceStates.load.lightOutputPower)>0);close(Number(r.deviceStates.load.lightOutputPower),r.componentPower.load);
});
test('emergency charging standby does not glow; maintained and backup emitter power are distinct',()=>{
  for(const id of [44,45]){const d=structuredClone(LESSONS.find(l=>l.id===id)!.circuit);let r=simulate(d);if(id===44){assert.ok(r.componentPower.emergency>0);close(Number(r.deviceStates.emergency.lightOutputPower),0);}else{assert.ok(Number(r.deviceStates.emergency.lightOutputPower)>0);close(Number(r.deviceStates.emergency.lightOutputPower),r.componentPower.emergency);d.components.find(c=>c.id==='normal-switch')!.params.closed=false;r=simulate(d,r.deviceStates);close(Number(r.deviceStates.emergency.lightOutputPower),0);}
    d.components.find(c=>c.id==='emergency')!.params.emergencyWatts=3;d.supply.enabled=false;r=simulate(d,r.deviceStates);assert.equal(r.deviceStates.emergency.emergencyActive,true);close(Number(r.deviceStates.emergency.lightOutputPower),3);close(r.componentPower.emergency??0,0);
    d.components.find(c=>c.id==='emergency')!.params.battery=false;r=simulate(d,r.deviceStates);close(Number(r.deviceStates.emergency.lightOutputPower),0);
  }
});
test('the lesson12 low→high actual-power objective remains executable',()=>{
  const doc=structuredClone(LESSONS.find(l=>l.id===12)!.circuit),before=structuredClone(doc);const failures=runLessonScenarios(doc).filter(c=>c.status!=='pass');assert.deepEqual(failures,[]);assert.deepEqual(doc,before);
});
test('bounded extreme settings remain finite and converge without a persistent iterative resistance guess',()=>{
  const d=fixture();setting(d,Number.MIN_VALUE);const r=simulate(d);assert.equal(r.converged,true,JSON.stringify(r.diagnostics));assert.equal(r.deviceStates.dimmer.dimmerResistance,1e9);assert.ok(Number.isFinite(r.totalPower));assert.equal(getDimmerEquivalentResistance(-10),null);assert.equal(getDimmerEquivalentResistance(10),.001);assert.equal(getDimmerEquivalentResistance(Number.NaN),getDimmerEquivalentResistance(.65));
});
