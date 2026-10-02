import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import manifest from '../public/models/manifest.json';
import {COMPONENTS} from '../lib/components';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import type {ComponentInstance} from '../lib/types';

const root=fileURLToPath(new URL('../../',import.meta.url));
const loader=new GLTFLoader();
const cache=new Map<string,THREE.Group>();
async function load(url:string){let scene=cache.get(url);if(!scene){const bytes=readFileSync(root+'lab/public'+url);scene=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;cache.set(url,scene);}return scene;}
function meshes(parent:THREE.Object3D){const result:THREE.Mesh[]=[];parent.traverse(node=>{if(node instanceof THREE.Mesh)result.push(node);});return result;}
function triangles(parent:THREE.Object3D){return meshes(parent).reduce((total,m)=>total+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3,0);}
function details(scene:THREE.Object3D){const nodes=new Map<string,THREE.Object3D[]>();scene.traverse(node=>{if(node.userData.detailId){const id=String(node.userData.detailId);nodes.set(id,[...(nodes.get(id)??[]),node]);}});return nodes;}

test('all 87 variants have actual family construction, original sources and local rendered icons',async()=>{
  assert.equal(manifest.length,87);const families=new Set<string>(),report:unknown[]=[];
  for(const asset of manifest){
    assert.equal(asset.detailRevision,2,asset.key);families.add(asset.detailFamily);
    assert.ok(asset.sourceMeshCount>asset.meshCount,asset.key+' original source keeps separately editable details');
    assert.ok(existsSync(root+'authoring/blender/models/'+asset.key+'.blend'));
    const bytes=readFileSync(root+'lab/public'+asset.thumbnailUrl);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),192);assert.equal(bytes.readUInt32BE(20),192);assert.ok(bytes.length>1500,asset.key+' actual icon pixels');
    const scene=await load(asset.url),low=await load(asset.lowUrl);
    for(const variant of [scene,low]){
      const found=details(variant);
      for(const feature of asset.detailFeatures){
        if(feature==='rear-pressure-plate-terminals')continue;
        const nodes=found.get(feature);assert.ok(nodes?.length,asset.key+' '+feature);
        assert.ok(nodes!.some(node=>meshes(node).length>0&&triangles(node)>=12),asset.key+' '+feature+' contains real construction meshes');
        for(const node of nodes!)assert.ok(typeof node.userData.detailPurpose==='string'&&node.userData.detailPurpose.length>35,asset.key+' purpose');
      }
      for(const mesh of meshes(variant)){
        const owner=semanticOwner(mesh);assert.ok(owner.part&&COMPONENTS[asset.type].parts.some(p=>p.id===owner.part),asset.key+' selectable part '+owner.part);
        for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value),asset.key+' finite mesh');
      }
    }
    report.push({key:asset.key,family:asset.detailFamily,features:asset.detailFeatures,sourceMeshes:asset.sourceMeshCount,runtimeMeshes:asset.meshCount,triangles:triangles(scene),lowTriangles:triangles(low),icon:asset.thumbnailUrl});
  }
  assert.equal(families.size,29);
  mkdirSync(root+'verification/model-detail',{recursive:true});writeFileSync(root+'verification/model-detail/construction-audit.json',JSON.stringify({revision:2,variants:87,families:families.size,models:report},null,2));
});

test('pressure-plate clamps have apertures, multiple materials and exactly one stable terminal identity',async()=>{
  for(const asset of manifest)for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url),found=details(scene);
    for(const terminal of asset.terminals){
      const clamp=found.get('terminal-clamp:'+terminal.id);assert.equal(clamp?.length,1,asset.key+'.'+terminal.id);
      const parts=meshes(clamp![0]);assert.ok(parts.length>=3,asset.key+' cage, pressure plate, insulation and fixing materials');
      let identities=0;scene.traverse(node=>{if(node.userData.terminalId===terminal.id)identities++;});assert.equal(identities,1);
      const box=new THREE.Box3().setFromObject(clamp![0]);assert.ok(box.getSize(new THREE.Vector3()).length()>.04);
      assert.ok(triangles(clamp![0])>100,asset.key+' true threaded/cage construction');
    }
  }
});

test('converter families have distinct physical architectures and lamp cutaway exposes its power-driven filament',async()=>{
  const transformer=manifest.find(a=>a.type==='transformer')!,driver=manifest.find(a=>a.type==='driver')!;
  assert.notEqual(transformer.triangles,driver.triangles);
  const lineCore=details(await load(transformer.url)).get('converter-specific-core')![0];
  const switchedCore=details(await load(driver.url)).get('converter-specific-core')![0];
  const lineExtent=new THREE.Box3().setFromObject(lineCore).getSize(new THREE.Vector3());
  const switchedExtent=new THREE.Box3().setFromObject(switchedCore).getSize(new THREE.Vector3());
  assert.ok(lineExtent.y>switchedExtent.y*1.15,'line-frequency laminated core and switched ferrite board have distinct real construction bounds');
  const lamp=manifest.find(a=>a.key==='lamp_bulb')!,scene=await load(lamp.url),prepared=prepareBlenderModel(scene);
  const component:ComponentInstance={id:'test',type:'lamp',label:'Lamp',position:[0,0,0],rotation:0,params:{watts:60}};
  presentBlenderModel(prepared,'cutaway',component,{energized:true,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'test',lightOutputPower:15});
  assert.ok(prepared.meshes.some(m=>m.filament&&m.lampOutput&&m.node.visible));
  assert.ok(prepared.meshes.some(m=>m.node.userData.lampEnvelope&&m.cutaway instanceof THREE.MeshStandardMaterial&&m.cutaway.transparent));
  for(const mesh of prepared.meshes.filter(m=>m.filament))assert.equal(mesh.light?.userData.lampBrightness,.25);
  const filament=details(prepared.scene).get('tungsten-coiled-filament')![0];
  const filamentCentre=new THREE.Box3().setFromObject(filament).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(filamentCentre.x)<.05&&filamentCentre.y>.6&&filamentCentre.y<1.1,'filament lies inside the bulb envelope rather than rotating around the assembly origin');
  prepared.owned.forEach(m=>m.dispose());
});

test('all appliance variants retain a solid outer enclosure and usable operating parts',async()=>{
  for(const asset of manifest.filter(a=>a.detailFamily==='appliance')){
    const scene=await load(asset.url);let housing=0;
    for(const mesh of meshes(scene)){
      if(semanticOwner(mesh).part!=='body')continue;
      let detail=false;for(let owner:THREE.Object3D|null=mesh;owner;owner=owner.parent)detail ||= Boolean(owner.userData.detailId);
      if(!detail&&mesh.geometry.getAttribute('position').count>=8)housing++;
    }
    assert.ok(housing>0,asset.key+' real housing remains after process assembly replacement');
  }
});

test('pump impeller and induction cage follow the real shaft animation while their casings stay stationary',async()=>{
  for(const type of ['pump','motor','motor3']){
    const asset=manifest.find(a=>a.type===type)!;
    for(const url of [asset.url,asset.lowUrl]){
      const prepared=prepareBlenderModel(await load(url));
      const component:ComponentInstance={id:'rotor',type,label:type,position:[0,0,0],rotation:0,params:{}};
      const state={energized:true,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'rotor evidence'};
      presentBlenderModel(prepared,'cutaway',component,state);
      const feature=details(prepared.scene).get(type==='pump'?'pump-rotating-impeller':'motor-rotor-cage')![0];
      const mesh=meshes(feature)[0];assert.ok(mesh.visible);
      const before=mesh.matrixWorld.clone();animateBlenderModel(prepared,component,state,.05);prepared.scene.updateMatrixWorld(true);
      assert.ok(!mesh.matrixWorld.equals(before),type+' actual detailed rotor geometry moves');
      if(type==='pump')assert.ok(prepared.meshes.some(m=>semanticOwner(m.node).part==='body'&&m.cutaway&&m.node.visible),'fixed volute is inspectable through the cutaway');
      prepared.owned.forEach(m=>m.dispose());
    }
  }
});

test('normal lamp and gang-module retaining hardware lies on its physical assembly',async()=>{
  for(const asset of manifest.filter(a=>a.detailFamily==='lamp')){
    const scene=await load(asset.url),hardware=details(scene).get('lamp-mounting')![0];
    const definition=COMPONENTS[asset.type],scaleY=definition.size[1]/1.45;
    const centre=new THREE.Box3().setFromObject(hardware).getCenter(new THREE.Vector3());
    if(asset.key==='lamp_bulb')assert.ok(centre.y<.28*scaleY,'bulb pedestal fixings stay at its base');
    else assert.ok(centre.y>.45*scaleY&&centre.y<.9*scaleY,asset.key+' hardware stays near the fitting rather than below it');
  }
  const right=manifest.find(a=>a.key==='switch_gang-module-right')!;
  const retainers=details(await load(right.url)).get('faceplate-fixing')![0];
  const extent=new THREE.Box3().setFromObject(retainers).getSize(new THREE.Vector3());
  assert.ok(extent.x<.4*COMPONENTS.switch.size[0]/1.3,'right cassette does not inherit detached full-plate screws');
});

test('conduit saddle fixings and heating-mat sensing details remain physically seated in every inspection mode',async()=>{
  const conduit=manifest.find(a=>a.key==='conduit_conduit-gland')!,mat=manifest.find(a=>a.key==='heater_mat')!;
  for(const asset of [conduit,mat])for(const url of [asset.url,asset.lowUrl]){
    const prepared=prepareBlenderModel(await load(url));
    const component:ComponentInstance={id:'hardware',type:asset.type,label:asset.name,position:[0,0,0],rotation:0,params:{}};
    for(const view of ['normal','open','exploded','cutaway'] as const){
      presentBlenderModel(prepared,view,component,undefined);
      const assembly=details(prepared.scene).get(asset===mat?'thermal-protection':'cable-management-fixing')![0];
      const bounds=new THREE.Box3().setFromObject(assembly),scale=COMPONENTS[asset.type].size.map((n,i)=>n/[1.3,1.45,.85][i]);
      if(asset===mat)assert.ok(bounds.max.y<.2*scale[1],'mat inspection cannot reveal a cut-out hovering above the floor');
      else{
        assert.ok(bounds.max.y<.4*scale[1]&&bounds.min.y>.27*scale[1],'saddle bolts align with the mounting tabs');
        assert.ok(bounds.max.x<0,'both bolts follow the two left-side saddles rather than a generic symmetric duct pattern');
      }
    }
    prepared.owned.forEach(material=>material.dispose());
  }
});
