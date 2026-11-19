import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Group,Mesh,Object3D,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {COMPONENTS,definitionFor} from '../lib/components';
import {getComponentTerminals} from '../lib/terminal-layout';
import {equipmentAssetKey} from '../lib/equipment-assets';
import {PLXE_BODY_BOTTOM,PLXE_BODY_SIZE,PLXE_FLEX_EXIT} from '../lib/plxe';
import type {ComponentInstance,DeviceState,Vec3} from '../lib/types';
const c:ComponentInstance={type:'heater',variant:'plx050e',label:'Kitchen heater',id:'fixed',params:{watts:500,nominalVoltage:240,setpoint:21,temperature:18},rotation:0,position:[0,0,0]};
const thermal:DeviceState={energized:true,heaterSupplied:true,elementWatts:500,closed:true,tripped:false,elapsed:0,level:1,resetToken:0,direction:1,details:'Manual'};
const vec=(pt:Vec3)=>new Vector3(...pt);
async function model(suffix:string){
  const bytes=readFileSync(new URL('../public/models/heater_plx050e'+suffix+'.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return prepareBlenderModel(gltf.scene,suffix!=='' );
}
function detail(root:Group,id:string){
  let match:Object3D|undefined;
  root.traverse(n=>{if(n.userData.detailId===id)match=n;});
  assert.ok(match,'detail '+id);return match;
}
function ray(root:Group,from:Vector3,dir:Vector3){
  const meshes:Mesh[]=[];root.traverseVisible(n=>{if(n instanceof Mesh)meshes.push(n);});
  return new Raycaster(from,dir).intersectObjects(meshes,false)[0];
}
test('PLX050E original has the actual case size, clear touch keys, lower-right cord and no glowing panel',async()=>{
  for(const suffix of ['', '.low']){
    const m=await model(suffix);
    presentBlenderModel(m,'normal',c,thermal,undefined,'',true);m.scene.updateMatrixWorld(true);
    const bounds=new Box3();m.scene.traverseVisible(n=>{if(n instanceof Mesh&&!n.userData.terminalBatch)bounds.expandByObject(n,true);});
    const size=bounds.getSize(new Vector3());
    assert.ok(Math.abs(size.x-PLXE_BODY_SIZE[0])<.002&&Math.abs(bounds.max.y-PLXE_BODY_BOTTOM-PLXE_BODY_SIZE[1])<.002);
    assert.ok(Math.abs(bounds.max.z-PLXE_BODY_SIZE[2])<.004&&Math.abs(bounds.min.z)<.004);
    const gland=new Box3().setFromObject(detail(m.scene,'plxe-fitted-flex'),true);
    const exit=vec(PLXE_FLEX_EXIT);assert.ok(Math.abs(gland.min.y-exit.y)<.0005&&Math.abs(gland.getCenter(new Vector3()).x-exit.x)<.0005);
    const axis=new Vector3(0,Math.sin(1.3),Math.cos(1.3));
    for(const id of ['plxe-temperature-up','plxe-temperature-down','plxe-screen']){
      const centre=new Box3().setFromObject(detail(m.scene,id),true).getCenter(new Vector3());
      const hit=ray(m.scene,centre.clone().addScaledVector(axis,.8),axis.clone().negate());
      assert.ok(hit,id);assert.equal(semanticOwner(hit.object).detail,id,'Control touch struck '+hit.object.name);
    }
    assert.ok(!m.meshes.some(x=>x.light&&x.part==='element'),'the heater does not glow like an exposed lamp');
    assert.equal(m.looseHeaterLead?.visible,false);
    for(const mat of m.owned)mat.dispose();
  }
});
test('three flexible cores are free wire ends on the bench and the fitted heater uses one continuous flex',async()=>{
  const old={...c,variant:undefined};
  assert.equal(equipmentAssetKey(c,COMPONENTS.heater),'heater:plx050e');
  assert.equal(equipmentAssetKey(old,COMPONENTS.heater),'heater:storage');
  assert.equal(definitionFor(old),COMPONENTS.heater);
  const ports=getComponentTerminals(c,COMPONENTS.heater);assert.deepEqual(ports.map(t=>t.id),['L','N','PE']);
  for(const suffix of ['','.low']){
    const m=await model(suffix);
    for(const view of ['normal','open','exploded','cutaway'] as const){
      presentBlenderModel(m,view,c,thermal);m.scene.updateMatrixWorld(true);
      for(const port of ports){
        const tip=vec(port.anchor),approach=new Vector3(0,0,-1);
        const hit=ray(m.scene,tip.clone().addScaledVector(approach,.20),approach.negate());
        assert.ok(hit,port.id);assert.equal(semanticOwner(hit.object).terminal,port.id);
        assert.ok(hit.point.distanceTo(tip)<.0008,'Physical stranded tip stays at the electrical end '+port.id);
      }
    }
    presentBlenderModel(m,'normal',c,thermal,undefined,'',true);m.scene.updateMatrixWorld(true);
    for(const port of ports){
      const tip=vec(port.anchor);assert.ok(!ray(m.scene,tip.clone().add(new Vector3(0,0,-.2)),new Vector3(0,0,1)),'no duplicate loose core behind the installed appliance');
    }
    for(const mat of m.owned)mat.dispose();
  }
});
