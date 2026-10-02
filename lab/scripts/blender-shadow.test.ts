import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {castsEquipmentShadow,prepareBlenderModel,presentBlenderModel} from '../lib/blender-model';
import {createGalleryInventory} from '../components/lab/ModelGallery';
import {COMPONENTS} from '../lib/components';
import {equipmentAsset} from '../lib/equipment-assets';
import {lampIllumination} from '../lib/scene-settings';
import type {EquipmentView} from '../lib/Equipment';
import type {DeviceState,SimulationResult} from '../lib/types';

const loader=new GLTFLoader();
const state:DeviceState={energized:true,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'shadow evidence',lightOutputPower:60};
const lampInventory=createGalleryInventory().filter(item=>['lamp','led','emergency'].includes(item.component.type));
async function load(url:string){const bytes=readFileSync(new URL('../public'+url,import.meta.url));return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;}
const materials=(value:THREE.Material|THREE.Material[])=>Array.isArray(value)?value:[value];

test('luminous and transmitting surfaces do not occlude their own light while opaque hardware keeps shadows',()=>{
  const opaque=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.12});
  const clearPhysical=new THREE.MeshPhysicalMaterial({transmission:1}),status=new THREE.MeshStandardMaterial({emissive:'#43d57d'});
  try{
    assert.equal(castsEquipmentShadow(opaque),true);
    assert.equal(castsEquipmentShadow(opaque,true),false,'opal emitting cover is optically transmitting even when rendered opaque');
    assert.equal(castsEquipmentShadow(opaque,false,true),false,'original bulb envelope must not become an opaque shadow shell');
    assert.equal(castsEquipmentShadow(glass),false);
    assert.equal(castsEquipmentShadow(clearPhysical),false);
    assert.equal(castsEquipmentShadow(status),true,'an emissive status colour alone does not remove an opaque housing shadow');
    assert.equal(castsEquipmentShadow([glass,opaque]),true,'mixed surfaces retain their opaque mounting geometry');
  }finally{[opaque,glass,clearPhysical,status].forEach(material=>material.dispose());}
});

test('all five real full/distance lamp assets retain opaque shadows and remove emitter/envelope self-shadow in every view',async()=>{
  assert.equal(lampInventory.length,5);
  for(const entry of lampInventory){
    const asset=equipmentAsset(entry.component,COMPONENTS[entry.component.type])!;
    for(const url of [asset.url,asset.lowUrl]){
      const source=await load(url),original:THREE.Mesh[]=[];
      source.traverse(node=>{if(node instanceof THREE.Mesh)original.push(node);});
      const sourceCasting=original.map(node=>node.castShadow),sourceMaterials=original.map(node=>node.material);
      const model=prepareBlenderModel(source);
      try{
        assert.ok(model.meshes.some(mesh=>mesh.lampOutput),entry.key+' known emitting geometry');
        for(const view of ['normal','open','exploded','cutaway','normal'] as EquipmentView[]){
          presentBlenderModel(model,view,entry.component,state);
          const opaque=model.meshes.filter(mesh=>mesh.node.visible&&!mesh.lampOutput&&!mesh.node.userData.lampEnvelope&&castsEquipmentShadow(mesh.node.material));
          assert.ok(opaque.length>0,entry.key+' '+view+' opaque housing or mounting still participates in scene shadows');
          assert.ok(opaque.every(mesh=>mesh.node.castShadow));
          for(const mesh of model.meshes){
            if(mesh.lampOutput||mesh.node.userData.lampEnvelope)assert.equal(mesh.node.castShadow,false,entry.key+' '+view+' no optical self-shadow');
            if(materials(mesh.node.material).every(material=>material.transparent&&material.opacity<1))assert.equal(mesh.node.castShadow,false,entry.key+' '+view+' inspectable glass casts no solid shadow');
          }
        }
        assert.deepEqual(original.map(node=>node.castShadow),sourceCasting,'cached source shadow flags preserved');
        assert.deepEqual(original.map(node=>node.material),sourceMaterials,'cached source materials preserved');
      }finally{model.owned.forEach(material=>material.dispose());}
    }
  }
});

test('actual bulb light has a clear route to the forward bench receiver through its noncasting envelope',async()=>{
  const entry=lampInventory.find(item=>item.key==='lamp:bulb')!;
  const component={...entry.component,position:[0,0,0] as [number,number,number],rotation:0};
  const asset=equipmentAsset(component,COMPONENTS.lamp)!;
  for(const url of [asset.url,asset.lowUrl]){
    const model=prepareBlenderModel(await load(url));
    try{
      presentBlenderModel(model,'normal',component,state);model.scene.updateMatrixWorld(true);
      const ceramicCap=model.meshes.filter(mesh=>mesh.part==='cover');
      assert.ok(ceramicCap.length>0&&ceramicCap.every(mesh=>!mesh.lampOutput&&!mesh.light&&mesh.node.castShadow),'opaque ceramic B22 holder stays unlit and keeps its physical shadow');
      const light=lampIllumination(component,{deviceStates:{[component.id]:state}} as SimulationResult)!;
      const start=new THREE.Vector3(...light.position),receiver=new THREE.Vector3(0,.01,1.4),direction=receiver.clone().sub(start);
      const ray=new THREE.Raycaster(start,direction.clone().normalize(),.03,direction.length());
      const visible=model.meshes.filter(mesh=>mesh.node.visible).map(mesh=>mesh.node);
      const envelope=model.meshes.filter(mesh=>mesh.lampOutput||mesh.node.userData.lampEnvelope);
      assert.ok(envelope.length>0&&envelope.every(mesh=>!mesh.node.castShadow));
      // Shadow depth rendering sees exit faces from a point light inside the
      // envelope. Double-sided probe geometry makes the test sensitive to that
      // original failure without altering cached GLB materials or transforms.
      const depth=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
      const probe=(mesh:THREE.Mesh)=>{const copy=new THREE.Mesh(mesh.geometry,depth);copy.matrix.copy(mesh.matrixWorld);copy.matrixAutoUpdate=false;copy.updateMatrixWorld(true);return copy;};
      try{
        assert.ok(ray.intersectObjects(envelope.filter(mesh=>mesh.node.visible).map(mesh=>probe(mesh.node)),false).length>0,'fixture emitter/envelope intersects the real light-to-bench path');
        assert.equal(ray.intersectObjects(visible.filter(mesh=>mesh.castShadow).map(probe),false).length,0,url+' forward workbench illumination is not extinguished by the bulb shell');
      }finally{depth.dispose();}
    }finally{model.owned.forEach(material=>material.dispose());}
  }
});
