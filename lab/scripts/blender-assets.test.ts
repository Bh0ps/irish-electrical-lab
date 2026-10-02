import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGalleryInventory } from '../components/lab/ModelGallery';
import { COMPONENTS } from '../lib/components';
import { equipmentAsset } from '../lib/equipment-assets';
import { getComponentTerminals } from '../lib/terminal-layout';
import { animateBlenderModel,prepareBlenderModel,presentBlenderModel } from '../lib/blender-model';
import type { EquipmentView } from '../lib/Equipment';
import type { ComponentInstance,DeviceState } from '../lib/types';

const root=fileURLToPath(new URL('../../',import.meta.url)),loader=new GLTFLoader(),inventory=createGalleryInventory();
const state:DeviceState={energized:false,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'asset audit'};
const scenes=new Map<string,THREE.Group>(),reports:unknown[]=[];
async function load(url:string){let scene=scenes.get(url);if(!scene){const bytes=readFileSync(root+'lab/public'+url),array=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);scene=(await loader.parseAsync(array,'')).scene;scenes.set(url,scene);}return scene;}
function terminals(scene:THREE.Object3D){scene.updateMatrixWorld(true);const found=new Map<string,THREE.Object3D[]>();scene.traverse(node=>{if(node.userData.terminalId){const id=String(node.userData.terminalId);found.set(id,[...(found.get(id)??[]),node]);}});return found;}
function geometryDigest(scene:THREE.Group,materials=false){const hash=createHash('sha256');scene.updateMatrixWorld(true);scene.traverse(node=>{if(node instanceof THREE.Mesh){hash.update(Buffer.from(node.geometry.getAttribute('position').array.buffer));hash.update(JSON.stringify(node.matrixWorld.toArray().map(n=>Math.round(n*1e6)/1e6)));if(materials)for(const material of Array.isArray(node.material)?node.material:[node.material])if(material instanceof THREE.MeshStandardMaterial)hash.update(JSON.stringify([material.color.toArray(),material.metalness,material.roughness]));}});return hash.digest('hex');}

test('all 87 authored variants have original Blender sources and full/distance offline GLBs',async()=>{
  assert.equal(inventory.length,87);const keys=new Set<string>();let total=0,lowTotal=0;
  for(const entry of inventory){
    const definition=COMPONENTS[entry.component.type],asset=equipmentAsset(entry.component,definition);assert.ok(asset,entry.key);assert.ok(!keys.has(asset.key));keys.add(asset.key);
    const source=root+'authoring/blender/models/'+asset.key+'.blend';assert.ok(existsSync(source),source);const header=readFileSync(source).subarray(0,4);assert.ok(header.subarray(0,2).toString()==='BL'||header[0]===0x1f&&header[1]===0x8b||header.equals(Buffer.from([0x28,0xb5,0x2f,0xfd])),'Blender, gzip or zstd-compressed Blender source');
    const full=await load(asset.url),low=await load(asset.lowUrl);const expected=getComponentTerminals(entry.component,definition);
    for(const scene of [full,low]){
      const found=terminals(scene);assert.equal(found.size,expected.length,entry.key+' terminal count');
      for(const terminal of expected){const matches=found.get(terminal.id);assert.equal(matches?.length,1,entry.key+'.'+terminal.id+' exactly once');const position=matches![0].getWorldPosition(new THREE.Vector3());assert.ok(position.distanceTo(new THREE.Vector3(...terminal.anchor))<1e-5,entry.key+'.'+terminal.id+' canonical rear port');assert.ok(terminal.anchor[2]<0,entry.key+' rear wiring');}
    }
    assert.ok(asset.lowTriangles<asset.triangles*.65,entry.key+' distance detail reduction');total+=asset.triangles;lowTotal+=asset.lowTriangles;
    reports.push({key:entry.key,source:true,full:asset.triangles,distance:asset.lowTriangles,terminalCount:expected.length,geometryDigest:geometryDigest(full)});
  }
  mkdirSync(root+'verification/blender',{recursive:true});writeFileSync(root+'verification/blender/asset-audit.json',JSON.stringify({variants:inventory.length,fullTriangles:total,distanceTriangles:lowTotal,models:reports},null,2));
});

test('normal/open/exploded/cutaway keep every real terminal fixed and preserve original model data',async()=>{
  for(const entry of inventory){
    const asset=equipmentAsset(entry.component,COMPONENTS[entry.component.type])!,source=await load(asset.url),before=geometryDigest(source),instance=prepareBlenderModel(source),original=terminals(instance.scene);
    const positions=new Map([...original].map(([id,nodes])=>[id,nodes[0].getWorldPosition(new THREE.Vector3())]));
    for(const view of ['normal','open','exploded','cutaway'] as EquipmentView[]){
      presentBlenderModel(instance,view,entry.component,state);const after=terminals(instance.scene);
      for(const [id,position] of positions)assert.ok(after.get(id)![0].getWorldPosition(new THREE.Vector3()).distanceTo(position)<1e-7,entry.key+'.'+id+' '+view+' invariant');
      for(const mesh of instance.meshes)if(mesh.part==='cover')assert.equal(mesh.node.visible,view!=='cutaway');
    }
    assert.equal(geometryDigest(source),before,entry.key+' cached source unchanged');
    const clone=prepareBlenderModel(source);assert.equal(instance.meshes[0].node.geometry,clone.meshes[0].node.geometry,'immutable geometries shared');
    instance.owned.forEach(material=>material.dispose());clone.owned.forEach(material=>material.dispose());
  }
});

test('authored forms differ in actual geometry or functional materials, rather than names alone',async()=>{
  const groups=new Map<string,{key:string;digest:string}[]>();
  for(const entry of inventory){const asset=equipmentAsset(entry.component,COMPONENTS[entry.component.type])!;groups.set(entry.component.type,[...(groups.get(entry.component.type)??[]),{key:entry.key,digest:geometryDigest(await load(asset.url),true)}]);}
  for(const variants of groups.values())if(variants.length>1)assert.equal(new Set(variants.map(v=>v.digest)).size,variants.length,variants.map(v=>v.key).join(', '));
});

test('virtual instrument selectors and probe assemblies have distinct selectable geometry',async()=>{
  for(const type of ['multimeter','clamp']){
    const entry=inventory.find(e=>e.component.type===type)!,asset=equipmentAsset(entry.component,COMPONENTS[type])!;
    for(const url of [asset.url,asset.lowUrl]){
      const model=prepareBlenderModel(await load(url));presentBlenderModel(model,'normal',entry.component,state);
      assert.ok(model.meshes.some(mesh=>mesh.part==='actuator'&&mesh.node.visible),type+' visible mode selector');
      assert.ok(model.meshes.some(mesh=>mesh.part==='display'&&mesh.node.visible),type+' separate working display');
      const functional=type==='multimeter'?'probes':'sensing';
      assert.ok(model.meshes.some(mesh=>mesh.part===functional&&mesh.node.visible),type+' separate '+functional);
      model.owned.forEach(material=>material.dispose());
    }
  }
});

test('switches, contactors, valve mechanisms and machinery respond to operating state',async()=>{
  for(const type of ['switch','switch2','intermediate','dimmer','selector','pushbutton','mcb','contactor','relay','valve','valve3','fan','motor','motor3','pump','heatpump']){
    const entry=inventory.find(e=>e.component.type===type)!;const asset=equipmentAsset(entry.component,COMPONENTS[type])!,model=prepareBlenderModel(await load(asset.url));
    assert.ok(model.motions.length,type+' has operating mechanism');
    const closedComponent:ComponentInstance={...entry.component,params:{...entry.component.params,position:0,on:true,level:1}};
    presentBlenderModel(model,'open',closedComponent,{...state,energized:true});
    const before=model.motions.map(m=>m.node.matrix.clone());
    const stoppedComponent:ComponentInstance={...closedComponent,params:{...closedComponent.params,position:1,on:false,level:0}};
    animateBlenderModel(model,stoppedComponent,{...state,closed:false,energized:false},.05,true);model.scene.updateMatrixWorld(true);
    let changed=model.motions.some((m,i)=>!m.node.matrix.equals(before[i]));
    if(['fan','motor','motor3','pump','heatpump'].includes(type)){const rotation=model.motions.map(m=>m.node.quaternion.clone());animateBlenderModel(model,closedComponent,{...state,energized:true},.05);changed=model.motions.some((m,i)=>!m.node.quaternion.equals(rotation[i]));}
    assert.ok(changed,type+' animation changes actual geometry');model.owned.forEach(material=>material.dispose());
  }
});
