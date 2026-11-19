import assert from 'node:assert/strict';
import test from 'node:test';
import {applyEquipmentVariant,equipmentPurpose} from '../lib/components.ts';
import {getLesson} from '../lib/lessons.ts';
import {getCoursebookActivities,createCoursebookBuild} from '../lib/coursebook.ts';
import {measureVoltage,simulate} from '../lib/simulation.ts';
import {runLessonScenarios} from '../lib/scenarios.ts';
import {validateCircuit} from '../lib/storage.ts';
import {validateProgress} from '../lib/study-backup.ts';
import {addCableConnection,cableCores,suggestedCableChoice} from '../lib/cables.ts';
import {routeCircuit} from '../lib/routing.ts';
import {electricalKey} from '../lib/simulation-identity.ts';

const doc=(id:number)=>structuredClone(getLesson(id)!.circuit);
const ep=(component:string,terminal:string)=>({component,terminal});
test('inspection uses the fitted LED driver and door switch when explaining a circuit',()=>{
  const cupboard=doc(65), modules=doc(70);
  const purpose=(d:typeof cupboard,id:string)=>equipmentPurpose(d.components.find(part=>part.id===id)!);
  assert.match(purpose(cupboard,'door'),/door moves this switch/i);
  assert.match(purpose(cupboard,'driver'),/steady DC voltage/i);
  assert.match(purpose(modules,'cc'),/keep the current/i);
  const saved={...modules.components.find(part=>part.id==='cc')!, variant:undefined};
  assert.equal(equipmentPurpose(saved),purpose(modules,'cc'));
});
test('AC bell migration preserves software endpoints and existing deliberate conductor changes',()=>{
  const current=doc(43),old=structuredClone(current);
  for(const w of old.wires.slice(-3))w.role=w.from.terminal==='-'?'DC-':'DC+';
  assert.deepEqual(validateCircuit(old),current);
  old.wires.at(-1)!.role='control';assert.equal(validateCircuit(old).wires.at(-1)?.role,'control');
  const r=simulate(current);
  assert.equal(r.terminalVoltages['tx.+'].frequency,50);
  const dc=doc(65);assert.equal(simulate(dc).terminalVoltages['driver.+'].frequency,0);
});
test('230 V and 240 V presets retain an isolated DC output and the AC bell follows turns ratio',()=>{
  const d=doc(80);d.supply.voltage=230;
  d.components.find(c=>c.id==='push')!.params.pressed=true;
  const r=simulate(d);
  assert.ok(r.converged);
  assert.ok(Math.abs(measureVoltage(r,ep('tx','+'),ep('tx','-')).value!-11.5)<.1);
  assert.ok(Math.abs(measureVoltage(r,ep('courtesy','L'),ep('courtesy','N')).value!-24)<.15);
  assert.equal(measureVoltage(r,ep('driver','-'),ep('tx','-')).value,null);
  d.wires.push({id:'bond-back',from:ep('driver','-'),to:ep('tx','-'),role:'control',resistance:.01,bends:[]});
  assert.ok(runLessonScenarios(d).some(check=>check.status!=='pass'));
});
test('reversing the cupboard strip leaves a signed reverse voltage and suppresses light',()=>{
  const d=doc(65);
  for(const w of d.wires)if(w.to.component==='strip')w.to.terminal=w.to.terminal==='L'?'N':'L';
  const r=simulate(d); assert.ok(r.converged);
  assert.ok(r.deviceStates.strip.reverseBlocked&&r.componentPower.strip<.001);
  assert.ok(r.diagnostics.some(diag=>diag.id==='reverseDC:strip'));
});
test('PWM output power follows duty and switched measurements are withheld while the input remains measurable',()=>{
  const d=doc(68),c=d.components.find(i=>i.id==='pwm')!;
  let r=simulate(d);
  assert.ok(r.converged&&r.pwmTerminals?.includes('strip.N'));
  assert.equal(measureVoltage(r,ep('strip','L'),ep('strip','N')).value,null);
  assert.ok(measureVoltage(r,ep('pwm','+'),ep('pwm','-')).value!>23.9);
  const key=electricalKey(d);c.variant='tunable-white';assert.notEqual(electricalKey(d),key);c.variant='single-channel';
  c.params.level=0;r=simulate(d);assert.ok(Math.abs(r.componentPower.strip)<1e-8);
  c.params.level=1;r=simulate(d);assert.ok(r.componentPower.strip>11.9);
  const bad=d.wires.find(w=>w.to.component==='strip'&&w.to.terminal==='N')!;
  bad.from=ep('driver','-');
  assert.ok(runLessonScenarios(d).some(check=>check.status==='fail'));
});
test('every multichannel core has its own path; unused and removed cores remain open through a save',()=>{
  const d=doc(69),run=d.cableRuns!.find(r=>r.kind==='multi-strip')!,warm=d.wires.find(w=>w.cable?.runId===run.id&&w.cable.core==='white')!;
  assert.deepEqual(cableCores(run.kind),['red','white','yellow','black']);
  const broken=structuredClone(d);broken.wires=broken.wires.filter(w=>w.id!==warm.id);
  const r=simulate(validateCircuit(broken));assert.ok(r.converged);
  assert.ok(Number(r.deviceStates.tape.warmWatts)<.01&&Number(r.deviceStates.tape.coolWatts)>5.8);
  assert.equal(routeCircuit(broken).cables?.get(run.id)?.open.length,4);
  const choice=suggestedCableChoice(broken,warm,d);
  assert.equal(choice.runId,run.id);assert.equal(choice.core,'white');
  const restored=addCableConnection(broken,warm,choice).document;
  assert.ok(Number(simulate(restored).deviceStates.tape.warmWatts)>5.8);
  assert.throws(()=>addCableConnection(broken,warm,{kind:'multi-strip',runId:run.id,core:'green-yellow'}),/core present/);
});
test('new chapter practical starts unwired; progress accepts lesson 80 and excludes out-of-range lessons',()=>{
  const l=getLesson(80)!;assert.equal(createCoursebookBuild(l,'practical').wires.length,0);
  assert.equal(getCoursebookActivities(l).filter(a=>a.kind==='connect').length,l.circuit.wires.length);
  const progress={lessons:[80],builds:[80],faults:[80],scores:{80:80}};
  assert.deepEqual(validateProgress(progress),progress);
  assert.throws(()=>validateProgress({...progress,scores:{81:1}}));
});
test('a bell-cable sample used on the mains side is identified by its real connections',()=>{
  const d=doc(71),w=d.wires[0];
  const c=addCableConnection({...d,wires:d.wires.slice(1)},w,{kind:'bell-pair',core:'red'}).document;
  assert.ok(simulate(c).diagnostics.some(v=>v.id==='elvCable:'+w.id));
});


test('choosing a series module and constant-current driver in Sandbox updates electrical operation',()=>{
  const d=doc(70),cc=d.components.find(c=>c.id==='cc')!;
  cc.variant=undefined;cc.params={outputVoltage:24};
  Object.assign(cc,applyEquipmentVariant(cc,'constant-current'));
  for(const item of d.components.filter(c=>c.type==='led')){
    item.variant='strip';item.params={ratedVoltage:24,watts:12};
    Object.assign(item,applyEquipmentVariant(item,'series-module'));
  }
  const result=simulate(d),value=measureVoltage(result,ep('first','L'),ep('first','N')).value;
  assert.ok(result.converged&&value!==null&&Math.abs(value-9)<.1);
  assert.equal(applyEquipmentVariant(cc,undefined).params.mode,'constant-voltage');
  assert.equal(applyEquipmentVariant(cc,cc.variant).params,cc.params);
});
