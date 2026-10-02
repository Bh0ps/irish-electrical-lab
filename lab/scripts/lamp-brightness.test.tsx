import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createRoot,extend,flushSync} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {applyLampBrightness,lampBrightness,prepareBlenderModel,presentBlenderModel} from '../lib/blender-model';
import {ProceduralEquipment,type EquipmentView} from '../lib/Equipment';
import {COMPONENTS} from '../lib/components';
import {equipmentAsset} from '../lib/equipment-assets';
import {createGalleryInventory} from '../components/lab/ModelGallery';
import {simulate} from '../lib/simulation';
import {LESSONS} from '../lib/lessons';
import type {ComponentInstance,DeviceState} from '../lib/types';

const state:DeviceState={energized:true,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'visual audit'};
const inventory=createGalleryInventory(),loader=new GLTFLoader();
const load=async(url:string)=>{const bytes=readFileSync(new URL('../public'+url,import.meta.url));return(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;};
const component=(type='lamp',watts=60):ComponentInstance=>({id:'lamp',type,label:'Light',position:[0,0,0],rotation:0,params:{watts}});

test('visual power normalization remains continuous below energized thresholds and refuses guessed values',()=>{
  const lamp=component();assert.equal(lampBrightness(lamp,{...state,energized:false,lightOutputPower:15}),.25);
  assert.equal(lampBrightness(lamp,{...state,lightOutputPower:.006}),.0001);
  for(const value of [undefined,NaN,Infinity,-2])assert.equal(lampBrightness(lamp,{...state,...(value===undefined?{}:{lightOutputPower:value})}),0);
  assert.equal(lampBrightness(lamp,{...state,lightOutputPower:120}),1);
  assert.equal(lampBrightness(component('led',12),{...state,lightOutputPower:3}),.25);
  assert.equal(lampBrightness(component('emergency',8),{...state,lightOutputPower:2}),.25);
  assert.equal(lampBrightness(component('indicator',2),{...state,lightOutputPower:1}),0);
});

test('actual full/distance assets dim emitters, opal covers and exposed LED banks independently in every view',async()=>{
  for(const entry of inventory.filter(item=>['lamp','led','emergency'].includes(item.component.type))){
    const asset=equipmentAsset(entry.component,COMPONENTS[entry.component.type])!;
    for(const url of [asset.url,asset.lowUrl]){
      const source=await load(url),first=prepareBlenderModel(source),second=prepareBlenderModel(source),watts=Number(entry.component.params.watts??COMPONENTS[entry.component.type].defaults.watts);
      assert.ok(first.meshes.some(mesh=>mesh.lampOutput),entry.key+' has a recognised emitting surface');
      for(const view of ['normal','open','exploded','cutaway'] as EquipmentView[]){
        presentBlenderModel(first,view,entry.component,{...state,lightOutputPower:watts*.1});presentBlenderModel(second,view,entry.component,{...state,lightOutputPower:watts*.9});
        const low=first.meshes.filter(mesh=>mesh.lampOutput),high=second.meshes.filter(mesh=>mesh.lampOutput);
        for(let i=0;i<low.length;i++){
          assert.notEqual(low[i].light,high[i].light);assert.ok(Math.abs(low[i].light!.userData.lampBrightness-.1)<1e-12);assert.ok(Math.abs(high[i].light!.userData.lampBrightness-.9)<1e-12);
          assert.ok(low[i].light!.emissiveIntensity<high[i].light!.emissiveIntensity);assert.ok(low[i].light!.color.r<high[i].light!.color.r);
        }
        presentBlenderModel(first,view,entry.component,{...state,lightOutputPower:0});assert.ok(low.every(mesh=>mesh.light!.emissiveIntensity===0&&mesh.light!.emissive.getHex()===0));
        assert.ok(high.every(mesh=>Math.abs(mesh.light!.userData.lampBrightness-.9)<1e-12),'other instance remains bright');
      }
      for(const original of first.meshes.filter(mesh=>mesh.lampOutput))assert.notEqual(original.light,original.material,'cached source material never changes');
      const status=first.meshes.find(mesh=>mesh.light&&!mesh.lampOutput);if(status){presentBlenderModel(first,'normal',entry.component,{...state,lightOutputPower:0});const intensity=status.light!.emissiveIntensity;presentBlenderModel(first,'normal',entry.component,{...state,lightOutputPower:watts});assert.equal(status.light!.emissiveIntensity,intensity,'binary status indication is independent');}
      first.owned.forEach(material=>material.dispose());second.owned.forEach(material=>material.dispose());
    }
  }
});

test('visible output follows solved topology: series control dims, bypass stays bright and disconnected lamp stays dark',()=>{
  const example=structuredClone(LESSONS.find(lesson=>lesson.id===12)!.circuit),dimmer=example.components.find(item=>item.type==='dimmer')!,lamp=example.components.find(item=>item.type==='lamp')!;
  dimmer.params.level=.25;const low=simulate(example,{},0);dimmer.params.level=1;const high=simulate(example,{},0);
  assert.ok(lampBrightness(lamp,low.deviceStates[lamp.id])<lampBrightness(lamp,high.deviceStates[lamp.id])*.1);
  dimmer.params.level=.25;example.wires.push({id:'visual-bypass',from:{component:dimmer.id,terminal:'COM'},to:{component:dimmer.id,terminal:'OUT'},role:'L',resistance:.01,bends:[]});const bypass=simulate(example,{},0);assert.ok(lampBrightness(lamp,bypass.deviceStates[lamp.id])>.99);
  example.wires=example.wires.filter(wire=>!(wire.from.component===lamp.id||wire.to.component===lamp.id));assert.equal(lampBrightness(lamp,simulate(example,{},0).deviceStates[lamp.id]),0);
});

test('procedural full/distance fallbacks and cutaway filament update real per-lamp materials without cross-talk',async()=>{
  extend(THREE as unknown as Parameters<typeof extend>[0]);
  const canvas={width:800,height:800,style:{},addEventListener(){},removeEventListener(){}};
  const gl={render(){},setSize(){},setPixelRatio(){},getPixelRatio(){return 1;},domElement:canvas,shadowMap:{enabled:false,type:1},xr:{enabled:false,isPresenting:false,addEventListener(){},removeEventListener(){},setAnimationLoop(){}},dispose(){},toneMapping:THREE.NoToneMapping,outputColorSpace:THREE.SRGBColorSpace};
  const root=createRoot(canvas as unknown as HTMLCanvasElement);await root.configure({gl:gl as unknown as THREE.WebGLRenderer,frameloop:'never',size:{width:800,height:800,top:0,left:0}});
  const draw=(power:number,view:EquipmentView,lowDetail=false)=>{let store:ReturnType<typeof root.render>;flushSync(()=>{store=root.render(<group>{[power,60].map((lightOutputPower,index)=><group key={index} name={'fixture-'+index}><ProceduralEquipment component={{...component(),id:'lamp-'+index}} definition={COMPONENTS.lamp} state={{...state,lightOutputPower}} selected={false} view={view} showLabels={false} lowDetail={lowDetail} onPart={()=>{}} onTerminal={()=>{}}/></group>)}</group>);});return store!.getState().scene;};
  const materials=(scene:THREE.Scene,index:number)=>{const values=new Set<THREE.MeshStandardMaterial>();scene.getObjectByName('fixture-'+index)!.traverse(node=>{if(node instanceof THREE.Mesh&&!Array.isArray(node.material)&&node.material instanceof THREE.MeshStandardMaterial&&node.material.userData.lampOutput)values.add(node.material);});return [...values];};
  try{
    for(const view of ['normal','cutaway'] as EquipmentView[])for(const lowDetail of [false,true]){
      const scene=draw(15,view,lowDetail);assert.ok(materials(scene,0).length,view+' fallback has a real visible output material');assert.ok(materials(scene,0).every(material=>material.userData.lampBrightness===.25));assert.ok(materials(scene,1).every(material=>material.userData.lampBrightness===1));assert.ok(materials(scene,0).every(material=>!materials(scene,1).includes(material)));
      draw(0,view,lowDetail);assert.ok(materials(scene,0).every(material=>material.emissiveIntensity===0));assert.ok(materials(scene,1).every(material=>material.emissiveIntensity>0));
    }
  }finally{root.unmount();}
});

test('material output changes visible diffuse colour as well as emission',()=>{
  const material=new THREE.MeshStandardMaterial();applyLampBrightness(material,0);const off=material.color.clone();applyLampBrightness(material,.25);const quarter=material.color.clone();applyLampBrightness(material,1);assert.ok(off.r<quarter.r&&quarter.r<material.color.r);assert.equal(material.emissiveIntensity,2.4);material.dispose();
});
