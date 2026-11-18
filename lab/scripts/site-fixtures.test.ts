import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LESSONS} from '../lib/lessons.ts';
import {BACK,jobSite} from '../lib/job-site.ts';
import {BATTEN_FILAMENT, fixturePoint, TAPE_SECTION_LENGTH, TAPE_SECTIONS} from '../lib/site-fixtures.ts';
import {terminalSheet} from '../lib/installation-drawing.ts';
import {simulate,measureVoltage} from '../lib/simulation.ts';
import {validateCircuit} from '../lib/storage.ts';
import {getLessonActivities} from '../lib/learning.ts';
import {COMPONENTS} from '../lib/components.ts';
import {getComponentTerminals} from '../lib/terminal-layout.ts';
import type {Vec3} from '../lib/types.ts';

const lesson=(id:number)=>LESSONS.find(l=>l.id===id)!.circuit;
async function model(name:string){
  const bytes=await readFile(new URL('../public/models/'+name+'.glb',import.meta.url));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
  return (await new GLTFLoader().parseAsync(buffer,'')).scene;
}
function near(value:number,expected:number,tolerance:number){
  assert.ok(Math.abs(value-expected)<tolerance, value+' differs from '+expected);
}

test('installed boards use the product envelopes with their rail-mounted devices at the same scale',()=>{
  for(const [id,width,height,depth] of [[2,.250,.375,.103],[53,.465,.500,.1325]]){
    const doc=lesson(id),site=jobSite(doc),board=doc.components.find(c=>['gammaboard','invictaboard'].includes(c.type))!;
    const item=site.items.find(i=>i.id===board.id)!;
    const [w,h,d]=COMPONENTS[board.type].size.map((n,i)=>n*item.fixture!.scale[i]);
    near(w,width,1e-5);near(h,height,1e-5);near(d,depth,1e-5);
    near(item.position[2]-d/2,BACK-.01,1e-5);
    for(const c of doc.components.filter(c=>c.mount?.board===board.id)) {
      const child=site.items.find(i=>i.id===c.id)!;
      assert.equal(child.scale,item.scale);
      assert.equal(child.room,item.room);
    }
  }
});

test('the loaded front plate measures 86 mm on the wall and its wired metal stays behind the plaster',async()=>{
  const doc=lesson(7),s=doc.components.find(c=>c.id==='switch')!,item=jobSite(doc).items.find(i=>i.id===s.id)!;
  for(const suffix of ['', '.low']){
    const scene=await model('switch_single-rocker'+suffix);
    const cover=scene.getObjectByName('partcover');assert.ok(cover);
    const size=new THREE.Box3().setFromObject(cover).getSize(new THREE.Vector3());
    near(size.x*item.fixture!.scale[0],.086,.001);near(size.y*item.fixture!.scale[1],.086,.001);
    for(const t of getComponentTerminals(s,COMPONENTS[s.type])){
      const end=fixturePoint(item.position,item.scale,item.fixture,s,t.anchor);
      assert.ok(end[2]<BACK-.01);
    }
  }
});

test('under-cabinet emitter face points down and the traced feed lands on the first physical pad',()=>{
  for(const id of [65,68,69]){
    const doc=lesson(id),c=doc.components.find(c=>c.type==='led'||c.type==='cctstrip')!,item=jobSite(doc).items.find(i=>i.id===c.id)!;
    const pose=item.fixture!;assert.equal(pose.tape,true);
    const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(pose.tilt,0,pose.roll));
    near(normal.y,-1,1e-6);
    const pad=getComponentTerminals(c,COMPONENTS[c.type])[0];
    const actual=fixturePoint(item.position,item.scale,pose,c,pad.anchor);
    const first=new THREE.Group(),run=new THREE.Group();
    first.position.set(-TAPE_SECTION_LENGTH*(TAPE_SECTIONS-1)/2,0,0);
    first.scale.fromArray(pose.scale);run.position.fromArray(item.position);
    run.rotation.set(pose.tilt??0,0,pose.roll??0);run.add(first);
    const anchor=first.localToWorld(new THREE.Vector3(...pad.anchor)).toArray() as Vec3;
    anchor.forEach((n,i)=>near(n,actual[i],1e-8));
  }
});

test('the B22 globe and filament in both meshes share the wall light mounting scale and light origin', async()=>{
  const doc=lesson(7), item=jobSite(doc).items.find(i=>i.id==='light')!, scale=item.fixture!.scale[0];
  for(const suffix of ['', '.low']){
    const scene=await model('lamp_bulb'+suffix);
    const bulb=scene.getObjectByName('Smooth_pear_bulb_envelope');
    const coil=scene.getObjectByName('detailtungsten-coiled-filament');
    assert.ok(bulb && coil);
    const diameter=new THREE.Box3().setFromObject(bulb).getSize(new THREE.Vector3()).x*scale;
    near(diameter,.055,.0005);
    const centre=new THREE.Box3().setFromObject(coil).getCenter(new THREE.Vector3()).toArray();
    centre.forEach((n,i)=>near(n*scale,BATTEN_FILAMENT[i]*scale,.00025));
  }
});

test('the isolated shaver outlet has two contacts in the drawing and equipment list and a measurable 230 V pair',()=>{
  const unit=LESSONS.find(l=>l.id===24)!, doc=unit.circuit, site=jobSite(doc);
  const shaver=doc.components.find(c=>c.id==='shaver')!, layout=getComponentTerminals(shaver,COMPONENTS[shaver.type]);
  assert.deepEqual(layout.map(t=>[t.id,t.label,t.role]),[['L','SEC 1','output'],['N','SEC 2','output']]);
  assert.deepEqual(terminalSheet(doc,site).blocks.find(x=>x.id==='shaver')!.pins,layout);
  assert.equal(site.first,'shaver');
  const reading=simulate(doc),pin=(terminal:string)=>({component:'shaver',terminal});
  near(measureVoltage(reading,pin('L'),pin('N')).value!,230,1);
  assert.equal(measureVoltage(reading,pin('N'),{component:'supply',terminal:'N'}).value,null);
  near(reading.componentPower.shaver,15,.2);
  const open={...doc,wires:doc.wires.filter(w=>!(w.to.component==='shaver'&&w.to.terminal==='N'))};
  assert.ok(simulate(open).componentPower.shaver<.01);
  const grounded={...doc,wires:[...doc.wires,{...doc.wires[0],id:'extra-earth',from:{component:'supply',terminal:'PE'},to:pin('N'),role:'PE' as const}]};
  const result=simulate(grounded);
  assert.ok(result.diagnostics.some(f=>f.category==='protection'&&f.id==='shaverSeparation:shaver:N'&&f.wire==='extra-earth'));
  const legacy=structuredClone(doc), old=legacy.components.find(c=>c.id==='shaver')!;
  old.type='socket';old.label='Separated shaver outlet · no PE output';
  const migrated=validateCircuit(legacy);
  assert.equal(migrated.components.find(c=>c.id==='shaver')?.type,'shaveroutlet');
  assert.deepEqual(migrated.wires,doc.wires);
  assert.deepEqual(getLessonActivities({...unit,circuit:legacy}).map(a=>a.id),getLessonActivities(unit).map(a=>a.id));
  legacy.wires.push({...legacy.wires[0],id:'learner-wire',from:{component:'supply',terminal:'PE'},to:pin('PE')});
  assert.equal(validateCircuit(legacy).components.find(c=>c.id==='shaver')?.type,'socket');
});

test('surface faceplates match their product dimensions and the internal shaver winding sits behind its plate',async()=>{
  for(const [course,id,modelName,width,height] of [[17,'socket-a','socket_default',.1465,.086],[24,'shaver','shaveroutlet_default',.086,.146]] as const){
    const doc=lesson(course),site=jobSite(doc),item=site.items.find(i=>i.id===id)!;
    for(const suffix of ['', '.low']){
      const scene=await model(modelName+suffix),face=scene.getObjectByName('partcover');
      assert.ok(face);
      const size=new THREE.Box3().setFromObject(face).getSize(new THREE.Vector3());
      near(size.x*item.scale,width,.0006);near(size.y*item.scale,height,.0006);
      near(item.position[2],BACK-.01,.0005);
    }
    if(course===24)assert.ok(site.items.find(i=>i.id==='isolation')!.position[2]<item.position[2]);
  }
});
