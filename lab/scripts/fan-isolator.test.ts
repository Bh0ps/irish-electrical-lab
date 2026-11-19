import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareBlenderModel,presentBlenderModel,semanticOwner } from '../lib/blender-model.ts';
import { connectedTerminalMissing,definitionFor } from '../lib/components.ts';
import { getLesson } from '../lib/lessons.ts';
import { equipmentChoices } from '../lib/menu-equipment.ts';
import { routeCircuit,terminalPosition } from '../lib/routing.ts';
import { simulate,measureResistance } from '../lib/simulation.ts';
import { validateCircuit } from '../lib/storage.ts';
import type { CircuitDocument,ComponentInstance } from '../lib/types.ts';
import {boardRails,fitsRail} from '../lib/board-assembly.ts';

const course=getLesson(36)!.circuit;
const isolator=course.components.find(c=>c.id==='fan-isolation')!;
const ports=definitionFor(isolator).terminals;
const point=(terminal:string)=>({component:isolator.id,terminal});

test('fan isolator has the three photographed pairs and every gallery, drawing and wiring endpoint uses the same marks',async()=>{
  assert.equal(isolator.variant,'fan-isolator');
  assert.deepEqual(ports.map(t=>[t.id,t.label,t.role]),[
    ['L1IN','L2','L'],['L2IN','L1','control'],['NIN','N','N'],
    ['L1OUT','L2','L'],['L2OUT','L1','control'],['NOUT','N','N']]);
  assert.ok(ports.filter(t=>t.id.endsWith('IN')).every(t=>t.anchor[1]>.46));
  assert.ok(ports.filter(t=>t.id.endsWith('OUT')).every(t=>t.anchor[1]<.46));
  const physical=equipmentChoices('all','fan isolator').find(c=>c.variant==='fan-isolator');
  assert.equal(physical?.type,'isolator3');
  assert.ok(!equipmentChoices('all','').some(c=>c.variant==='fan-isolator'),'default list stays compact');
  for(const suffix of ['', '.low']){
    const bytes=await readFile(new URL('../public/models/isolator3_fan-isolator'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    scene.updateMatrixWorld(true);
    const hit=(x:number,y:number,front:boolean)=>{
      const s=front?1:-1;
      return new THREE.Raycaster(new THREE.Vector3(x,y,s),new THREE.Vector3(0,0,-s)).intersectObject(scene,true)[0];
    };
    for(const t of ports){
      const [x,y,z]=t.anchor;
      const rim=hit(x+.021,y,false);
      assert.equal(semanticOwner(rim.object).terminal,t.id);
      assert.match((rim.object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.name,/alloy jaws/i);
      assert.ok(hit(x,y,false).point.z-z>.038,'open rear wire tunnel');
      assert.ok(!semanticOwner(hit(x,y,true).object).terminal,'nothing electrical protrudes through the face');
    }
    assert.equal(semanticOwner(hit(0,.46,true).object).part,'actuator');
    const cover=scene.getObjectByName('partcover');assert.ok(cover);
    const width=new THREE.Box3().setFromObject(cover).getSize(new THREE.Vector3()).x;
    assert.ok(Math.abs(.1*width-.086)<.0003);
    const copy=prepareBlenderModel(scene), rocker=copy.motions.find(m=>m.node.userData.partId==='actuator');
    assert.ok(rocker);
    const poses=[];
    for(const closed of [false,true]){
      const instance={...isolator,params:{...isolator.params,closed}};
      const state=simulate({...course,components:course.components.map(c=>c.id===isolator.id?instance:c)}).deviceStates[instance.id];
      copy.initialized=false; // Compare settled switch positions.
      presentBlenderModel(copy,'normal',instance,state);
      poses.push(rocker.node.quaternion.clone());
    }
    assert.ok(poses[0].angleTo(poses[1])>.33);
    copy.owned.forEach(m=>m.dispose());
  }
});

test('all three poles open independently of the light and only the old four-pole device accepts a fourth conductor',()=>{
  const routed=routeCircuit(course);
  assert.deepEqual(routed.issues,[]);
  for(const end of ports){
    const wire=course.wires.find(w=>[w.from,w.to].some(e=>e.component===isolator.id&&e.terminal===end.id))!;
    const r=routed.routes.get(wire.id)!;
    const start=wire.from.component===isolator.id;
    assert.deepEqual(start?r[0]:r.at(-1),terminalPosition(course,point(end.id)));
  }
  for(const closed of [false,true]){
    const installed={...isolator,params:{...isolator.params,closed}};
    const doc={...course,components:course.components.map(c=>c.id===isolator.id?installed:c)};
    const result=simulate(doc);
    assert.equal(result.deviceStates.fan.energized,closed);
    assert.ok(result.deviceStates.light.energized,'the light has a separate path');
    const passive={...doc,supply:{...doc.supply,enabled:false},components:[installed],wires:[]};
    for(const pair of ['L1','L2','N']){
      const r=measureResistance(passive,point(pair+'IN'),point(pair+'OUT'));
      if(closed)assert.ok(r.value!==null&&r.value<.05);
      else assert.equal(r.reason,'open');
    }
    assert.equal(measureResistance(passive,point('L1IN'),point('L2OUT')).reason,'open');
  }
  const standard:ComponentInstance={...isolator,variant:undefined};
  assert.equal(definitionFor(standard).terminals.length,8);
  const industrial=getLesson(54)!.circuit;
  assert.equal(industrial.components.find(c=>c.id==='socket-isolation')!.variant,undefined);
  const old:CircuitDocument={...course,components:course.components.map(c=>c.id===standard.id?standard:c),wires:[...course.wires,{...course.wires[0],id:'existing-fourth-pole',to:point('L3IN')}]};
  assert.equal(validateCircuit(old).components.find(c=>c.id===standard.id)!.variant,undefined);
  assert.equal(connectedTerminalMissing(old,isolator),'L3IN');
  assert.throws(()=>validateCircuit({...old,components:course.components}),/missing component or terminal/);
  const board={...isolator,type:'gammaboard'};
  assert.equal(fitsRail(isolator,board,boardRails(board.type)[0]),false);
  assert.equal(fitsRail(standard,board,boardRails(board.type)[0]),true);
});
