import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPONENTS} from '../lib/components';
import {electricalKey} from '../lib/simulation-identity';
import {getLesson} from '../lib/lessons';
import {jobSite,walkStep} from '../lib/job-site';
import {FCU_BOX,FCU_OUTLET,heaterFlexPath,heaterFlexRun,fusedPlatePose,fusedPlateView,fittedHeaterView} from '../lib/fused-heater-site';
import {PLXE_BODY_BOTTOM,PLXE_BODY_SIZE,PLXE_FLEX_EXIT} from '../lib/plxe';
import {PerspectiveCamera,Vector3} from 'three';
import {installedWireRoute} from '../lib/house-installation';
import {fixturePoint,installedTerminalPoint} from '../lib/site-fixtures';
import {getComponentTerminals} from '../lib/terminal-layout';
import {installedTestFittings,siteContacts,padCamera,fusedProbePose} from '../lib/site-meter';
import {fcuProbeContact} from '../lib/bg851';
import type {Vec3} from '../lib/types';

const length=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const same=(a:Vec3,b:Vec3)=>assert.ok(length(a,b)<.000001,JSON.stringify([a,b]));
test('the fitted heater switch can be tested only at its six exposed screw heads',()=>{
  const doc=getLesson(20)!.circuit,site=jobSite(doc),original=electricalKey(doc);
  const fittings=installedTestFittings(doc,site);
  assert.deepEqual(fittings.map(f=>[f.kind,f.item.id]),[['fcu','fcu-switch']]);
  const [fcu]=fittings,pose=fusedPlatePose(fcu.item,true);
  assert.deepEqual(siteContacts(fcu,false),[]);
  const points=siteContacts(fcu,true);
  assert.deepEqual(points.map(p=>p.label).sort(),['L · IN','N · IN','L · LOAD','N · LOAD','E','E2'].sort());
  for(const {endpoint,position} of points){
    const screw=fcuProbeContact(endpoint.terminal)!,second=fusedProbePose(fcu.item,fcu.component,endpoint.terminal,true)!;
    same(position,fixturePoint(pose.position,fcu.item.scale,fcu.item.fixture,fcu.component,screw.position,pose.rotation));
    assert.ok(length(position,second.position)>.0008,'a second tip has its own seat on the same screw');
    const port=getComponentTerminals(fcu.component,COMPONENTS.fcu).find(t=>t.id===endpoint.terminal)!;
    const mouth=fixturePoint(pose.position,fcu.item.scale,fcu.item.fixture,fcu.component,port.anchor,pose.rotation);
    assert.ok(length(position,mouth)>.003,'wire mouth and metal testing surface are distinct');
    for(const id of [undefined,endpoint.terminal])for(const aspect of [320/690,390/794,844/335]){
      const view=padCamera(fcu,true,true,id,aspect);
      const camera=new PerspectiveCamera(49,aspect,.012,55);
      camera.position.set(...view.position);camera.rotation.set(view.pitch,view.yaw,0,'YXZ');camera.updateMatrixWorld();
      const projected=new Vector3(...position).project(camera);
      assert.ok(Math.abs(projected.x)<.96&&Math.abs(projected.y)<.95&&projected.z> -1&&projected.z<1,'screw within installed camera at '+aspect);
      if(id)assert.ok(Math.abs(projected.x)<.001&&Math.abs(projected.y)<.001,'chosen screw centred');
    }
  }
  const legacy=getLesson(20,{...doc,components:doc.components.map(c=>c.id==='fcu-switch'?{...c,type:'switch'}:c)})!.circuit;
  assert.deepEqual(installedTestFittings(legacy,jobSite(legacy)),[]);
  assert.equal(electricalKey(doc),original);
});
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
    assert.ok(points.every(p=>p[0]<-2.26&&p[1]<.87&&p[1]>.18),'the 930 mm fitted lead clears the floor and skirting, including the full 6.4 mm jacket');
    same(points.at(-1)!,fixturePoint(heater.position,heater.scale,heater.fixture,fixed,PLXE_FLEX_EXIT,heater.rotation));
    const under=points.at(-2)!,exit=points.at(-1)!;
    assert.ok(under[1]<exit[1]&&Math.hypot(under[0]-exit[0],under[2]-exit[2])<.003,'flex approaches the lower-right gland from underneath');
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
  for(const routed of lengths)assert.ok(Math.abs(routed-.93)<.001,'both plate positions use the same shortened factory lead');
  assert.equal(electricalKey(doc),before);doc.wires=doc.wires.filter(w=>w!==wires[0]);
  assert.equal(heaterFlexRun(doc)?.id,run.id);assert.equal(doc.wires.filter(w=>w.cable?.runId===run.id).length,2);
});
test('the wall brackets, clearances and approach agree with the installed appliance in each room',()=>{
  for(const id of [19,20]){
    const doc=getLesson(id)!.circuit,site=jobSite(doc),heater=site.items.find(i=>i.fixture?.panelHeater)!,switchbox=site.items.find(i=>i.fixture?.fusedHeater)!;
    const s=heater.scale;
    assert.deepEqual(PLXE_BODY_SIZE.map(n=>Math.round(1000*s*n)),[450,430,108]);
    assert.equal(heater.position[1]+PLXE_BODY_BOTTOM*s,.32);
    const footprint=site.floorObstacle!;
    if(id===20){
      const edge=heater.position[2]-.225;
      assert.ok(edge-(-2.49+.59/2)>.15,'gap from the end of the cabinets');
      assert.ok(.325-(switchbox.position[2]+.043)>.15,'FCU and heater clear the door opening');
      const stop=walkStep([-4,1.56,heater.position[2]],3,0,site);
      assert.ok(Math.abs(stop[0]-(footprint.x-footprint.w/2-.16))<.00001,'walking stops in front of the metal panel');
    }else{
      assert.equal(site.room,0);assert.equal(heater.room,7);
      const curtainEdge=.46+1.63/2+.10+.026;
      assert.ok(heater.position[0]-.225-curtainEdge>1,'over a metre between the outlet and the curtain');
      assert.ok(heater.position[0]-.225-(.28+1.38/2)>.15,'clear of the desk');
      assert.ok((-5.94-1.14/2)-(heater.position[2]+.108)>.3,'open floor before the bookcase');
      const stop=walkStep([heater.position[0],1.56,-6.65],0,-1,site);
      assert.ok(Math.abs(stop[2]-(footprint.z+footprint.d/2+.16))<.00001);
    }
    const end=heaterFlexPath(switchbox,heater,false).at(-1)!;
    for(const w of doc.wires.filter(w=>w.cable?.runId===heaterFlexRun(doc)!.id)){
      const trace=installedWireRoute(doc,site,w)!;
      assert.ok(length(trace.at(-1)!,end)<.004,'individual core trace ends inside the factory entry');
    }
  }
});
test('portrait and landscape frame the panel and the rocker together on arrival, then fit the whole heater at close range',()=>{
  const site=jobSite(getLesson(20)!.circuit),heater=site.items.find(i=>i.fixture?.panelHeater)!,switchbox=site.items.find(i=>i.fixture?.fusedHeater)!;
  const corners=(x:number,y:number,z:number,w:number,h:number,d:number):Vec3[]=>[-1,1].flatMap(i=>[-1,1].flatMap(j=>[0,1].map(k=>[x-d*k,y+h*j/2,z+w*i/2] as Vec3)));
  const panel=corners(heater.position[0],.535,heater.position[2],.45,.43,.108),plate=corners(switchbox.position[0],.896,switchbox.position[2],.086,.086,.016);
  for(const ratio of [320/794,390/794,375/310,844/340,1280/680]){
    for(const shot of ['overview','walk','appliance'] as const){
      const pose=fittedHeaterView(heater,shot,ratio),camera=new PerspectiveCamera(49,ratio,.012,55);
      camera.position.set(...pose.position);camera.rotation.set(pose.pitch,pose.yaw,0,'YXZ');camera.updateMatrixWorld();
      const visible=(shot==='appliance'?panel:[...panel,...plate]).map(p=>new Vector3(...p).project(camera));
      assert.ok(visible.every(p=>Math.abs(p.x)<.95&&Math.abs(p.y)<.90),shot+' at '+ratio);
      assert.ok(pose.position[2]>-2.19&&pose.position[0]<-2.55,'the viewpoint is in the kitchen and clear of the cabinet');
    }
  }
});
test('with the cover withdrawn the faulty LOAD L tail is clear of the real mouth, with supply wiring still entering the back box',()=>{
  const lesson=getLesson(20)!,doc=structuredClone(lesson.circuit),site=jobSite(doc),fcu=site.items.find(i=>i.id==='fcu-switch')!;
  const open=fusedPlatePose(fcu,true),view=fusedPlateView(fcu,true,true);
  assert.ok(length(open.position,fcu.position)>.10);assert.ok(Math.cos(open.rotation-fcu.rotation)<-.95);
  assert.ok(view.position[0]<open.position[0]-.25&&Math.abs(view.position[1]-open.position[1])<.08);
  const line=doc.wires.find(w=>w.id===lesson.challenge.wire)!,supply=doc.wires.find(w=>w.to.component===fcu.id&&w.to.terminal==='LIN')!;
  const before=installedWireRoute(doc,site,line,fcu.id)!,seated=installedWireRoute(doc,site,line)!;
  doc.faults=[{type:lesson.challenge.fault,wire:line.id,component:lesson.challenge.component,enabled:true}];
  assert.deepEqual(installedWireRoute(doc,site,line,fcu.id),before,'an open reading without a known break location leaves the flex intact');
  doc.faults[0].looseEnd={component:fcu.id,terminal:'LOUT'};
  const loose=installedWireRoute(doc,site,line,fcu.id)!;
  assert.ok(length(loose[0],before[0])>.007);assert.deepEqual(loose.slice(2),before.slice(2));
  const concealed=installedWireRoute(doc,site,line)!;
  assert.ok(length(seated[0],concealed[0])>.007,'closing the plate conceals the loose end while the fault remains');
  assert.deepEqual(seated.slice(2),concealed.slice(2));
  const a=installedWireRoute(doc,site,supply)!,b=installedWireRoute(doc,site,supply,fcu.id)!;
  assert.ok(length(a.at(-1)!,b.at(-1)!)>.07);same(a[0],b[0]);
  assert.ok(b.some(p=>Math.abs(p[0]+2.261)<.0015),'incoming cores pass the rear of the surface box');
});
