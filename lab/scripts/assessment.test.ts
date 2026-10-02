import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { LESSONS } from '../lib/lessons.ts';
import { simulate } from '../lib/simulation.ts';
import { assessBuild } from '../lib/assessment.ts';
import TestReport from '../components/lab/TestReport.tsx';
import type { CircuitDocument, Endpoint } from '../lib/types.ts';

const example = LESSONS.find(l=>l.id===7)!.circuit;
const circuit = () => structuredClone(example);
const report = (d:CircuitDocument) => assessBuild(d, simulate(d), example);
const extra = (d:CircuitDocument, from:Endpoint, to:Endpoint, role:'L'|'PE'='PE') => d.wires.push({id:'extra',from,to,role,resistance:.01,bends:[]});
const fails = (d:CircuitDocument,id:string) => {const a=report(d);assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.id===id&&c.status==='fail'));return a;};

test('correct one-way lesson tests both switch positions and preserves user controls',()=>{
  for(const closed of [true,false]){
    const d=circuit();d.components.find(c=>c.id==='switch')!.params.closed=closed;
    const before=structuredClone(d);const a=report(d);
    assert.equal(a.passed,true,JSON.stringify(a.checks.filter(c=>c.status==='fail')));
    assert.ok(a.checks.some(c=>c.id==='switch-off'&&c.status==='pass'));
    assert.ok(a.checks.some(c=>c.id==='switch-on'&&c.status==='pass'));
    assert.deepEqual(d,before);
  }
});
test('extra neutral-out earth connection fails with switch ON or OFF',()=>{
  for(const closed of [true,false]){
    const d=circuit();d.components.find(c=>c.id==='switch')!.params.closed=closed;
    extra(d,{component:'supply',terminal:'PE'},{component:'protect',terminal:'NOUT'});
    const a=fails(d,'extra:extra');
    assert.ok(a.checks.some(c=>c.category==='protection'&&c.status==='fail'));
    if(closed)assert.equal(simulate(d).deviceStates.protect.tripped,true);
  }
});
test('a bypass retains every original wire but fails the actual switch-OFF objective',()=>{
  const d=circuit();extra(d,{component:'protect',terminal:'LOUT'},{component:'light',terminal:'L'},'L');
  assert.ok(simulate(d).componentPower.light>50);
  const a=fails(d,'switch-off');assert.ok(a.checks.some(c=>c.id==='extra:extra'&&c.status==='fail'));
});
test('missing live or neutral stops load and reports the exact missing connection',()=>{
  for(const id of ['w4','w5']){const d=circuit();d.wires=d.wires.filter(w=>w.id!==id);assert.ok((simulate(d).componentPower.light??0)<.05);fails(d,`connection:${id}`);}
});
test('missing protective conductor fails even though lamp still illuminates',()=>{
  const d=circuit();d.wires=d.wires.filter(w=>w.role!=='PE');assert.ok(simulate(d).componentPower.light>50);const a=report(d);assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.category==='protection'&&c.status==='fail'));
});
test('changing wire identification cannot change physics and cannot pass the guided objective',()=>{
  const d=circuit();d.wires.find(w=>w.id==='w4')!.role='N';assert.ok(simulate(d).componentPower.light>50);fails(d,'identity:w4');
});
test('duplicating an existing conductor is detected rather than silently passing',()=>{
  const d=circuit();d.wires.push({...structuredClone(d.wires[3]),id:'duplicate'});fails(d,'extra:duplicate');
});
test('wire IDs, direction, order and visual layout do not decide the electrical test',()=>{
  const d=circuit();d.wires.reverse();for(const w of d.wires){[w.from,w.to]=[w.to,w.from];w.id='new-'+w.id;w.bends=[[10,2,4]];}for(const c of d.components){c.position=[15,3,20];c.rotation=1;}assert.equal(report(d).passed,true);
});
test('supply OFF and stale results cannot claim test success',()=>{
  const d=circuit();d.supply.enabled=false;fails(d,'supply');
  const enabled=circuit();const result=simulate(enabled);enabled.revision++;
  const a=assessBuild(enabled,result,example);assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.id==='solution'&&c.status==='fail'));
});
test('injected open-live cannot pass as intact lesson',()=>{
  const d=circuit();d.faults=[{type:'open-live',wire:'w4',enabled:true}];const a=report(d);assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.title==='Study fault is still enabled'));
});
test('test panel renders immediate activity, lasting verdict, actionable faults and stale warning',()=>{
  const running=renderToStaticMarkup(React.createElement(TestReport,{running:true,stale:false,onSelect:()=>{}}));assert.match(running,/Testing your circuit/);
  const d=circuit();extra(d,{component:'supply',terminal:'PE'},{component:'protect',terminal:'NOUT'});
  const a=report(d);const html=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:false,onSelect:()=>{}}));assert.match(html,/Test failed/);assert.match(html,/FAIL/);assert.match(html,/Extra connection/);
  const success=renderToStaticMarkup(React.createElement(TestReport,{assessment:report(circuit()),running:false,stale:false,onSelect:()=>{}}));assert.match(success,/Test passed/);assert.match(success,/passed checks/);
  const stale=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:true,onSelect:()=>{}}));assert.match(stale,/Circuit changed/);
});
