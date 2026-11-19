import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPONENTS} from '../lib/components';
import {electricalKey} from '../lib/simulation-identity';
import {getLesson} from '../lib/lessons';
import {jobSite} from '../lib/job-site';
import {FCU_BOX,FCU_OUTLET,heaterFlexPath,heaterFlexRun,fusedPlatePose,fusedPlateView} from '../lib/fused-heater-site';
import {installedWireRoute} from '../lib/house-installation';
import {fixturePoint,installedTerminalPoint} from '../lib/site-fixtures';
import {getComponentTerminals} from '../lib/terminal-layout';
import type {Vec3} from '../lib/types';

const length=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const same=(a:Vec3,b:Vec3)=>assert.ok(length(a,b)<.000001,JSON.stringify([a,b]));
test('the kitchen fused unit sits on its own 50 mm box beside the heater, clear of the counter and doorway',()=>{
  const doc=getLesson(20)!.circuit,site=jobSite(doc);
  const fcu=site.items.find(i=>i.id==='fcu-switch')!,heater=site.items.find(i=>i.id==='fixed')!;
  assert.equal(site.first,fcu.id);assert.equal(fcu.fixture?.fusedHeater,true);assert.deepEqual(fcu.fixture.scale,[.1,.1,.1]);
  assert.equal(fcu.rotation,heater.rotation);assert.equal(fcu.room,0);
  assert.ok(Math.abs(fcu.position[0]+2.26+FCU_BOX.depth)<1e-7);
  assert.ok(fcu.position[2]>heater.position[2]+.38&&fcu.position[2]<.32-.15);
  const d=getLesson(20,{...doc,components:doc.components.map(c=>c.id==='fcu-switch'?{...c,type:'switch'}:c)})!.circuit;
  const earlier=jobSite(d);assert.ok(earlier.items.some(i=>i.id==='fuse'));assert.equal(heaterFlexRun(d),undefined);
  assert.ok(earlier.items.filter(i=>i.id==='fcu-switch'||i.id==='fuse').every(i=>i.rotation===0&&!i.fixture?.fusedHeater));
});
test('three individually traceable cores share the actual grip, local flex and heater; a removed core adds no connection',()=>{
  const doc=structuredClone(getLesson(20)!.circuit),site=jobSite(doc),fcu=site.items.find(i=>i.id==='fcu-switch')!,heater=site.items.find(i=>i.id==='fixed')!;
  const run=heaterFlexRun(doc)!,wires=doc.wires.filter(w=>w.cable?.runId===run.id),unit=doc.components.find(c=>c.id===fcu.id)!,fixed=doc.components.find(c=>c.id===heater.id)!;
  const before=electricalKey(doc);
  assert.equal(wires.length,3);
  for(const open of [false,true]){
    const points=heaterFlexPath(fcu,heater,open),pose=fusedPlatePose(fcu,open);
    same(points[0],fixturePoint(pose.position,fcu.scale,fcu.fixture,unit,FCU_OUTLET,pose.rotation));
    assert.ok(points.every(p=>p[0]<-2.26&&p[1]<.87&&p[1]>.20),'the flex stays on the kitchen side, above the floor');
    for(const wire of wires){
      const out=installedWireRoute(doc,site,wire,open?fcu.id:undefined)!;
      const terminal=getComponentTerminals(unit,COMPONENTS.fcu).find(t=>t.id===wire.from.terminal)!;
      const h=getComponentTerminals(fixed,COMPONENTS.heater).find(t=>t.id===wire.to.terminal)!;
      same(out[0],fixturePoint(pose.position,fcu.scale,fcu.fixture,unit,terminal.anchor,pose.rotation));
      same(out.at(-1)!,installedTerminalPoint(heater,fixed,h));
      assert.deepEqual(out.slice(6,6+points.length),points);
      assert.ok(out.every(p=>p[1]<1));
      const reverse=installedWireRoute(doc,site,{...wire,from:wire.to,to:wire.from},open?new Set([fcu.id]):undefined)!;
      assert.deepEqual(reverse,[...out].reverse());
    }
  }
  const lengths=[false,true].map(open=>heaterFlexPath(fcu,heater,open).reduce((s,p,i,a)=>s+(i?length(p,a[i-1]):0),0));
  assert.ok(Math.abs(lengths[0]-lengths[1])<.012,'the service position uses the slack in the flex');
  assert.equal(electricalKey(doc),before);doc.wires=doc.wires.filter(w=>w!==wires[0]);
  assert.equal(heaterFlexRun(doc)?.id,run.id);assert.equal(doc.wires.filter(w=>w.cable?.runId===run.id).length,2);
});
test('with the cover withdrawn the faulty LOAD L tail is clear of the real mouth, with supply wiring still entering the back box',()=>{
  const lesson=getLesson(20)!,doc=structuredClone(lesson.circuit),site=jobSite(doc),fcu=site.items.find(i=>i.id==='fcu-switch')!;
  const open=fusedPlatePose(fcu,true),view=fusedPlateView(fcu,true,true);
  assert.ok(length(open.position,fcu.position)>.10);assert.ok(Math.cos(open.rotation-fcu.rotation)<-.95);
  assert.ok(view.position[0]<open.position[0]-.25&&Math.abs(view.position[1]-open.position[1])<.08);
  const line=doc.wires.find(w=>w.id===lesson.challenge.wire)!,supply=doc.wires.find(w=>w.to.component===fcu.id&&w.to.terminal==='LIN')!;
  const before=installedWireRoute(doc,site,line,fcu.id)!,seated=installedWireRoute(doc,site,line)!;
  doc.faults=[{type:lesson.challenge.fault,wire:line.id,enabled:true}];
  const loose=installedWireRoute(doc,site,line,fcu.id)!;
  assert.ok(length(loose[0],before[0])>.007);assert.deepEqual(loose.slice(2),before.slice(2));
  assert.deepEqual(seated,installedWireRoute(doc,site,line));
  const a=installedWireRoute(doc,site,supply)!,b=installedWireRoute(doc,site,supply,fcu.id)!;
  assert.ok(length(a.at(-1)!,b.at(-1)!)>.07);same(a[0],b[0]);
  assert.ok(b.some(p=>Math.abs(p[0]+2.261)<.0015),'incoming cores pass the rear of the surface box');
});
