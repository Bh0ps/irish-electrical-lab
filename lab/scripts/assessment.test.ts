import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { getLesson, LESSONS } from '../lib/lessons.ts';
import { measureResistance, measureVoltage, simulate } from '../lib/simulation.ts';
import { captureMeasurement } from '../lib/learning.ts';
import { assessBuild, assessConnections, investigationReport } from '../lib/assessment.ts';
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
  const html=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:false,onSelect:()=>{}}));
  assert.match(html.split('All checks')[0],/Hall light still draws power with the switch off/);
  assert.match(html,/Switch off<\/dt><dd>240 V[\s\S]+Switch on<\/dt><dd>240 V/);
});
test('a neutral-earth link is reported once through a trip and never points to a broken parallel wire',()=>{
  const d=circuit(), from={component:'supply',terminal:'PE'}, to={component:'protect',terminal:'NOUT'};
  d.wires.push({id:'broken',from,to,role:'PE',resistance:.01,bends:[]});
  extra(d,to,from);d.faults=[{wire:'broken',type:'open-wire',enabled:true}];
  const r=simulate(d), a=assessBuild(d,r,example);
  const links=a.checks.filter(c=>c.id.startsWith('finding:neutralEarth:'));
  assert.deepEqual(links.map(c=>c.wire),['extra']);
  assert.equal(links[0].component,'protect');
  assert.match(links[0].explanation,/Hall light is off.*N · Load.*PE.*tripped/);
  assert.ok(!investigationReport(a).checks.some(c=>c.id.startsWith('finding:neutralEarth:') || c.id.startsWith('fault:')));
  const html=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:false,onSelect:()=>{},undoWire:{id:'extra',undo:()=>{}}}));
  assert.match(html,/Show connection/);assert.match(html,/Undo this wire/);
});

test('the ring feeds all three cores at socket B. A blown fuse only opens line, and an earlier saved branch still passes its own wiring',()=>{
  const d=structuredClone(getLesson(19)!.circuit), spur=d.components.find(c=>c.id==='branch-fuse')!;
  assert.equal(spur.type,'fcu');
  for(const run of d.cableRuns!.filter(run=>[run.from.component,run.to.component].includes(spur.id))){
    assert.equal(d.wires.filter(w=>w.cable?.runId===run.id).length,3);
  }
  assert.equal(d.wires.filter(w=>w.from.component==='socket-b'&&w.to.component===spur.id).length,3);
  d.faults.push({type:'overload',component:'fixed',enabled:true});
  const r=simulate(d,{},1);
  assert.equal(r.deviceStates[spur.id].tripped,true);assert.equal(r.deviceStates.protect.tripped,false);
  assert.ok(r.componentPower['socket-a']>70);assert.ok((r.componentPower.fixed??0)<1e-8);
  const feed=r.terminalVoltages[spur.id+'.NIN'],out=r.terminalVoltages[spur.id+'.NOUT'];
  assert.equal(feed.reference,'mains');assert.equal(out.reference,feed.reference);
  assert.ok(Math.hypot(feed.re-out.re,feed.im-out.im)<.01);
  const old=getLesson(19,{...d,components:d.components.map(c=>c.id===spur.id?{...c,type:'fuse'}:c)})!;
  assert.equal(old.circuit.wires.find(w=>w.id==='w17')!.from.component,'protect');
  assert.equal(assessBuild(old.circuit,simulate(old.circuit),getLesson(19)!.circuit).passed,true);
});
test('the heater switch has two switched poles, a permanent earth and a separately testable flex',()=>{
  const lesson=getLesson(20)!, d=structuredClone(lesson.circuit);
  const spur=d.components.find(c=>c.id==='fcu-switch')!;
  assert.equal(spur.type,'fcu');assert.equal(spur.params.rating,3);
  assert.equal(d.components.some(c=>c.type==='fuse'),false);
  assert.deepEqual(d.cableRuns!.map(run=>[run.kind,d.wires.filter(w=>w.cable?.runId===run.id).length]),[['flat',3],['flex',3]]);
  const pin=(terminal:string,component=spur.id)=>({component,terminal});
  assert.ok(simulate(d).componentPower.fixed>295);
  d.faults=[{type:'open-live',enabled:true,wire:lesson.challenge.wire}];
  const faulty=simulate(d);
  assert.ok((measureVoltage(faulty,pin('LOUT'),pin('N','fixed')).value??0)>235);
  assert.ok((measureVoltage(faulty,pin('L','fixed'),pin('N','fixed')).value??Infinity)<1);
  assert.equal(assessBuild(d,faulty,lesson.circuit).passed,false);
  d.faults=[];d.supply.enabled=false;spur.params.closed=false;
  for(const pair of [['LIN','LOUT'],['NIN','NOUT']])assert.equal(measureResistance(d,pin(pair[0]),pin(pair[1])).reason,'open');
  assert.ok((measureResistance(d,pin('PE'),pin('PE2')).value??1)<.1);
  const legacy=getLesson(20,{...d,components:d.components.map(c=>c.id===spur.id?{...c,type:'switch'}:c)})!;
  assert.equal(legacy.challenge.wire,'w5');
  assert.equal(legacy.circuit.wires.find(w=>w.id==='w5')!.from.component,'fuse');
  assert.equal(assessBuild(legacy.circuit,simulate(legacy.circuit),lesson.circuit).passed,true);
});

test('a blown cartridge stays open on the ohmmeter after switching off the supply',()=>{
  const d=structuredClone(getLesson(20)!.circuit),fitting=d.components.find(c=>c.type==='fcu')!;
  d.faults=[{type:'overload',enabled:true,component:'fixed'}];
  const blown=simulate(d,{},1);assert.equal(blown.deviceStates[fitting.id].tripped,true);
  d.supply.enabled=false;d.revision++;
  const isolated=simulate(d,blown.deviceStates);
  for(const [side,open] of [['L',true],['N',false]] as const){
    const pair={a:{component:fitting.id,terminal:side+'IN'},b:{component:fitting.id,terminal:side+'OUT'}};
    const reading=captureMeasurement(d,isolated,{mode:'resistance',...pair});
    assert.equal(reading.status,open?'open':'value');
    if(!open)assert.ok(reading.value!==null&&reading.value<.1);
  }
});

test('missing live or neutral stops load and reports the exact missing connection',()=>{
  for(const id of ['w4','w5']){const d=circuit();d.wires=d.wires.filter(w=>w.id!==id);assert.ok((simulate(d).componentPower.light??0)<.05);fails(d,`connection:${id}`);}
});
test('missing wires name the supply and load banks even when both terminals are marked N',()=>{
  const d=circuit(); d.wires=d.wires.filter(w=>w.id!=='w2'&&w.id!=='w5');
  const checks=assessConnections(d,example);
  assert.match(checks.find(c=>c.id==='connection:w2')!.explanation,/N · Supply/);
  assert.match(checks.find(c=>c.id==='connection:w5')!.explanation,/N · Load/);
  assert.ok(checks.filter(c=>c.id==='connection:w2'||c.id==='connection:w5').every(c=>c.status==='fail'));
});
test('a missing earth reports the lamp’s actual output without inventing a reading',()=>{
  const d=circuit();d.wires=d.wires.filter(w=>![w.from,w.to].some(e=>e.component==='light'&&e.terminal==='PE'));
  for(const on of [true,false]){
    d.components.find(c=>c.id==='switch')!.params.closed=on;
    const result=simulate(d);
    const finding=assessBuild(d,result,example).checks.find(c=>c.id==='finding:cpc:light')!;
    assert.equal(finding.status,'fail');
    assert.match(finding.explanation,on?/Hall light is drawing 60 W/:/Hall light is off/);
    assert.match(finding.explanation,/earth terminal \(PE\)/);
    const unresolved=assessBuild(d,{...result,converged:false},example).checks.find(c=>c.id==='finding:cpc:light')!;
    assert.doesNotMatch(unresolved.explanation,/drawing|is off/);
  }
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
  const a=assessBuild(enabled,result,example);assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.id==='solution'&&c.status==='unresolved'));
});
test('injected open-live cannot pass as intact lesson',()=>{
  const d=circuit();d.faults=[{type:'open-live',wire:'w4',enabled:true}];const a=report(d);assert.equal(a.passed,false);
  const check=a.checks.find(c=>c.id==='fault:open-live:w4')!;assert.equal(check.status,'fail');assert.doesNotMatch(check.explanation,/open-live|injected/);
});
test('test panel renders immediate activity, lasting verdict, actionable faults and stale warning',()=>{
  const running=renderToStaticMarkup(React.createElement(TestReport,{running:true,stale:false,onSelect:()=>{}}));assert.match(running,/Testing your circuit/);
  const d=circuit();extra(d,{component:'supply',terminal:'PE'},{component:'protect',terminal:'NOUT'});
  const a=report(d);const html=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:false,onSelect:()=>{}}));assert.match(html,/Test failed/);assert.match(html,/FAIL/);assert.match(html,/Extra connection/);
  const success=renderToStaticMarkup(React.createElement(TestReport,{assessment:report(circuit()),running:false,stale:false,onSelect:()=>{}}));assert.match(success,/Test passed/);assert.match(success,/passed checks/);
  const stale=renderToStaticMarkup(React.createElement(TestReport,{assessment:a,running:false,stale:true,onSelect:()=>{}}));assert.match(stale,/Circuit changed/);
});

test('both earth entries on the socket and fused unit share a real bond',()=>{
  for(const type of ['socket','fcu']){
    const d=circuit();
    delete d.lessonId;
    const source=d.components.find(c=>c.type==='source')!;
    const item={id:'fitting',label:type,type,position:[2,0,0] as [number,number,number],rotation:0,params:{}};
    d.components=[source,item];d.wires=[];
    const a={component:item.id,terminal:'PE'},b={component:item.id,terminal:'PE2'};
    d.wires.push({id:'earth',from:{component:source.id,terminal:'PE'},to:b,role:'PE',resistance:.01,bends:[]});
    const r=simulate(d);
    assert.ok(r.bondedEarthTerminals?.includes(item.id+'.PE'));
    assert.ok(r.bondedEarthTerminals?.includes(item.id+'.PE2'));
    assert.ok(!r.diagnostics.some(f=>f.id==='cpc:'+item.id));
    const isolated={...d,supply:{...d.supply,enabled:false}};
    const resistance=measureResistance(isolated,a,b).value;
    assert.ok(resistance!==null&&resistance<.1);
    const without={...d,wires:d.wires.filter(w=>![w.from,w.to].some(e=>e.component===item.id&&e.terminal==='PE2'))};
    assert.ok(simulate(without).diagnostics.some(f=>f.id==='cpc:'+item.id));
    extra(d,b,{component:item.id,terminal:type==='socket'?'N':'NOUT'});
    assert.ok(simulate(d).diagnostics.some(f=>f.id.startsWith('neutralEarth:')));
  }
});

test('an unpowered custom circuit can be measured for continuity without claiming powered operation passed',()=>{
  const d=circuit();delete d.lessonId;
  d.components=d.components.filter(c=>c.id==='switch'||c.id==='light');
  d.wires=d.wires.filter(w=>[w.from,w.to].every(e=>d.components.some(c=>c.id===e.component)));
  assert.ok(d.wires.length);
  const report=assessBuild(d,simulate(d));
  assert.ok(report.checks.some(c=>c.id==='supply'&&c.status==='not-run'));
  assert.equal(report.passed,false);
});
