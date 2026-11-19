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

test('the standard extractor keeps its guard still while the impeller turns behind it',async()=>{
  const asset=manifest.find(a=>a.key==='fan_xf100s')!;
  const fitting:ComponentInstance={type:'fan',variant:'xf100s',id:'fan',label:'Bathroom fan',position:[0,0,0],rotation:0,params:{}};
  const state={energized:true,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:''};
  for(const url of [asset.url,asset.lowUrl]){
    const model=prepareBlenderModel(await load(url));
    presentBlenderModel(model,'normal',fitting,state);
    const parts=details(model.scene);
    const guard=meshes(parts.get('xf-intake')![0])[0],blades=meshes(parts.get('xf-impeller')![0])[0];
    const fixed=guard.matrixWorld.clone(),before=blades.matrixWorld.clone();
    animateBlenderModel(model,fitting,state,.05);model.scene.updateMatrixWorld(true);
    assert.ok(!blades.matrixWorld.equals(before)&&guard.matrixWorld.equals(fixed));
    const turning=blades.matrixWorld.clone();
    animateBlenderModel(model,fitting,{...state,energized:false},.05);model.scene.updateMatrixWorld(true);
    assert.ok(blades.matrixWorld.equals(turning));
    const spigot=new THREE.Box3().setFromObject(parts.get('xf-spigot')![0],true);
    assert.ok(Math.abs(spigot.max.x-spigot.min.x-.98)<.01&&Math.abs(spigot.min.z+.45)<.006,url);
    model.owned.forEach(m=>m.dispose());
  }
});

test('a cut section of white tape has seven LED windows at the documented pitch and two bare probe pads',async()=>{
  const asset=manifest.find(model=>model.key==='led_strip')!;
  for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url);scene.updateMatrixWorld(true);
    const size=new THREE.Box3().setFromObject(scene,true).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x-1)<.002 && Math.abs(size.y-.08)<.001 && Math.abs(size.z-.015)<.001);
    const at=(x:number,y:number,side:number)=>new THREE.Raycaster(new THREE.Vector3(x,y,side),new THREE.Vector3(0,0,-side)).intersectObject(scene,true)[0];
    for(let chip=-3;chip<=3;chip++){
      assert.equal(semanticOwner(at(chip/7,.43,1).object).detail,'smd-led-packages');
      assert.equal(semanticOwner(at(chip/7,.43,-1).object).detail,'flexible-copper-tracks');
    }
    for(const pad of asset.terminals){
      assert.equal(semanticOwner(at(pad.anchor[0],pad.anchor[1],1).object).terminal,pad.id);
      assert.equal(semanticOwner(at(pad.anchor[0],pad.anchor[1],-1).object).terminal,undefined);
    }
  }
});

test('the Sesame has two rear wire screws, a plain cover and a separate push cap at both detail levels',async()=>{
  const asset=manifest.find(model=>model.key==='pushbutton_sesame')!;
  for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url);
    scene.updateMatrixWorld(true);
    const surface=(x:number,y:number,side:number)=>semanticOwner(new THREE.Raycaster(
      new THREE.Vector3(x,y,side),new THREE.Vector3(0,0,-side)).intersectObject(scene,true)[0].object);
    assert.equal(surface(0,.55,1).detail,'sesame-plunger');
    assert.deepEqual(asset.terminals.map(t=>t.id).sort(),['COM','NO']);
    for(const terminal of asset.terminals){
      const [x,y]=terminal.anchor;
      assert.equal(surface(x-.02,y,-1).terminal,terminal.id);
      assert.equal(surface(x,y,1).detail,'sesame-cover');
    }
  }
});

test('the one-way dimmer has two recessed wire entries on the rear and a separate knob on the face',async()=>{
  const asset=manifest.find(model=>model.key==='dimmer_rotary')!;
  for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url);
    scene.updateMatrixWorld(true);
    const surface=(x:number,y:number,side:number)=>new THREE.Raycaster(
      new THREE.Vector3(x,y,side),new THREE.Vector3(0,0,-side)).intersectObject(scene,true)[0];
    assert.equal(semanticOwner(surface(0,.46,1).object).detail,'dimmer-knob');
    assert.equal(semanticOwner(surface(.30,.46,1).object).part,'mounting');
    assert.equal(semanticOwner(surface(0,.54,-1).object).detail,'dimmer-rear-case');
    for(const terminal of asset.terminals){
      const [x,y,z]=terminal.anchor;
      const insert=surface(x+.020,y,-1);
      assert.equal(semanticOwner(insert.object).terminal,terminal.id);
      assert.match((insert.object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.name,/brass/i);
      assert.ok(Math.abs(insert.point.z-z)<.001);
      assert.ok(surface(x,y,-1).point.z-z>.040,'clear bore for the wire');
      assert.equal(semanticOwner(surface(x,y,1).object).detail,'dimmer-plate');
    }
  }
});

test('the double socket exposes four recessed clamps, separate screwdriver wells and clear front shutters',async()=>{
  const asset=manifest.find(model=>model.key==='socket_default')!;
  const faceNormals:THREE.Vector3[]=[];
  for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url);
    scene.updateMatrixWorld(true);
    const cast=(from:THREE.Vector3,towards:THREE.Vector3)=>{
      const hit=new THREE.Raycaster(from,towards).intersectObject(scene,true)[0];
      assert.ok(hit,url+' expected a visible surface');
      return hit;
    };
    const rear=(x:number,y:number)=>cast(new THREE.Vector3(x,y,-1),new THREE.Vector3(0,0,1));
    const front=(x:number,y:number)=>cast(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1));
    const top=(x:number,z:number)=>cast(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));
    for(const terminal of asset.terminals){
      const [x,y,z]=terminal.anchor;
      const lip=rear(x+.044,y),inside=rear(x,y);
      assert.equal(semanticOwner(lip.object).terminal,terminal.id);
      assert.equal(semanticOwner(inside.object).terminal,terminal.id);
      assert.ok(Math.abs(lip.point.z-z)<.002 && inside.point.z-lip.point.z>.070,'cable enters a real recessed window');
      const driver=top(x+.009,z+.041),insert=top(x,z+.095);
      assert.equal(semanticOwner(driver.object).terminal,terminal.id);
      assert.equal(semanticOwner(insert.object).terminal,terminal.id);
      assert.match((driver.object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.name,/steel/i);
      assert.ok(insert.point.y-driver.point.y>.012,'the driver head sits below the white crown insert');
    }
    assert.ok(rear(0,.56).point.z-rear(.06,.56).point.z>.085,'the case has a deep central slot');
    assert.ok(rear(0,.56).point.z-rear(0,.582).point.z>.05,'a moulded tie spans the slot');
    for(const [x,y] of [[-.36,.489],[.36,.489],[.10,.3835],[-.545,.46],[.545,.46]]){
      assert.equal(semanticOwner(rear(x,y).object).detail,'linked-earth-strap');
    }
    for(const x of [-.485,-.265,.265,.485]){
      for(const dx of [-.018,0,.018]){
        assert.equal(semanticOwner(front(x+dx,.31).object).detail,'socket-contact-system','plate ribs stay clear of the shutters');
      }
    }
    // The broad face beside each aperture must retain its flat shading at distance.
    for(const [i,x] of [-.60,-.45,-.29,0,.29,.45,.60].entries()){
      const hit=front(x,.496),normal=hit.normal!.clone().transformDirection(hit.object.matrixWorld);
      if(url===asset.url)faceNormals.push(normal);
      else assert.ok(normal.distanceTo(faceNormals[i])<.01,'same plate normal in both detail levels');
    }
  }
});

test('the wall switch case screws and the retained rose knockout can be identified in both detail levels',async()=>{
  for(const suffix of ['','.low']){
    for(const key of ['switch_single-rocker','switch2_single-rocker']){
      const scene=await load('/models/'+key+suffix+'.glb');scene.updateMatrixWorld(true);
      const all=details(scene),fixings=all.get('switch-case-fixings')![0],cassette=all.get('recessed-switch-cassette')![0];
      const cast=(x:number,y:number)=>new THREE.Raycaster(new THREE.Vector3(x,y,-1),new THREE.Vector3(0,0,1)).intersectObjects(meshes(cassette),false);
      for(const [x,y] of [[-.0835,.892],[.0835,.892],[0,.445]]){
        // Pick off-centre on the face, clear of the crosshead recess.
        const hit=cast(x+.006,y+.005)[0];
        assert.equal(semanticOwner(hit?.object).detail,'switch-case-fixings',key+' '+x+' '+y);
        assert.equal(semanticOwner(hit.object).terminal,undefined);
      }
      assert.ok(meshes(fixings).length);
      assert.ok(cast(0,.427)[0].distance-cast(.072,.427)[0].distance>.045,'real recess between the feet');
    }
    const scene=await load('/models/rose_default'+suffix+'.glb');scene.updateMatrixWorld(true);
    const base=details(scene).get('cable-entry-knockouts')![0];
    const hit=(x:number,y:number)=>new THREE.Raycaster(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1)).intersectObjects(meshes(base),false);
    assert.equal(hit(.043,.385).length,0,'upper opening passes through the base');
    assert.ok(hit(.043,.277).length,'the lower knockout is still present');
    assert.equal(hit(-.277+.032,.343+.009).length,0,'the slanted fixing slot has clearance');
    assert.ok(hit(.296+.037,.559).length,'the top right hole has a round boss');
  }
});

test('all catalogue variants have actual family construction, original sources and local rendered icons',async()=>{
  assert.equal(manifest.length,113);const families=new Set<string>(),report:unknown[]=[];
  for(const asset of manifest){
    assert.equal(asset.detailRevision,3,asset.key);families.add(asset.detailFamily);
    assert.ok(asset.sourceMeshCount>asset.meshCount,asset.key+' original source keeps separately editable details');
    assert.ok(existsSync(root+'authoring/blender/models/'+asset.key+'.blend'));
    const bytes=readFileSync(root+'lab/public'+asset.thumbnailUrl);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),192);assert.equal(bytes.readUInt32BE(20),192);assert.ok(bytes.length>1500,asset.key+' actual icon pixels');
    const scene=await load(asset.url),low=await load(asset.lowUrl);
    for(const variant of [scene,low]){
      const found=details(variant);
      for(const feature of asset.detailFeatures){
        if(feature==='individual-electrical-terminations')continue;
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
  assert.equal(families.size,30);
  mkdirSync(root+'verification/model-detail',{recursive:true});writeFileSync(root+'verification/model-detail/construction-audit.json',JSON.stringify({revision:3,variants:manifest.length,families:families.size,models:report},null,2));
});

test('pressure-plate clamps have apertures, multiple materials and exactly one stable terminal identity',async()=>{
  for(const asset of manifest)for(const url of [asset.url,asset.lowUrl]){
    const scene=await load(url),found=details(scene);
    for(const terminal of asset.terminals){
      const clamp=found.get('terminal-clamp:'+terminal.id);assert.equal(clamp?.length,1,asset.key+'.'+terminal.id);
      const form=clamp![0].parent!.userData.contactForm;
      const parts=meshes(clamp![0]);assert.ok(parts.length>=(['pin','core end','solder pad','comb tooth'].includes(form)?1:3),asset.key+' attachment hardware materials');
      let identities=0;scene.traverse(node=>{if(node.userData.terminalId===terminal.id)identities++;});assert.equal(identities,1);
      const size=new THREE.Box3().setFromObject(clamp![0]).getSize(new THREE.Vector3());
      if(asset.key==='led_strip'){
        assert.ok(Math.abs(size.x-.0249)<.0004 && Math.abs(size.y-.0168)<.0004 && size.z>0 && size.z<.0011,'size of the exposed copper half-land');
      }else assert.ok(size.length()>.04);
      assert.ok(triangles(clamp![0])>(form==='pin'||form==='solder pad'||form==='comb tooth'?8:form==='core end'?18:100),asset.key+' physical contact geometry');
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
  for(const asset of manifest.filter(a=>a.detailFeatures.includes('lamp-mounting'))){
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
