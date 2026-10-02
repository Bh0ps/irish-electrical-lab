import React from 'react';
import { createRoot, extend, flushSync } from '@react-three/fiber';
import * as THREE from 'three';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ProceduralEquipment } from '../lib/Equipment.tsx';
import { COMPONENTS } from '../lib/components.ts';
import { getComponentTerminals } from '../lib/terminal-layout.ts';
import { createGalleryInventory } from '../components/lab/ModelGallery.tsx';

// A headless THREE scene graph export, not browser automation or a WebGL render.
extend(THREE as unknown as Parameters<typeof extend>[0]);
const canvas={width:800,height:800,style:{},addEventListener(){},removeEventListener(){}};
const gl={render(){},setSize(){},setPixelRatio(){},getPixelRatio(){return 1;},domElement:canvas,shadowMap:{enabled:false,type:1},xr:{enabled:false,isPresenting:false,addEventListener(){},removeEventListener(){},setAnimationLoop(){}},dispose(){},toneMapping:THREE.NoToneMapping,outputColorSpace:THREE.SRGBColorSpace};
const root=createRoot(canvas as unknown as HTMLCanvasElement);
await root.configure({gl:gl as unknown as THREE.WebGLRenderer,frameloop:'never',size:{width:800,height:800,top:0,left:0}});
const output=fileURLToPath(new URL('../../authoring/blender/recipes/',import.meta.url));mkdirSync(output,{recursive:true});
const inventory=createGalleryInventory();
const onlyIndex=process.argv.indexOf('--only'),only=onlyIndex<0?null:new Set(process.argv[onlyIndex+1]?.split(','));
const state={energized:false,closed:true,tripped:false,level:1,direction:1,elapsed:0,resetToken:0,details:'Asset reference state'};
const manifest=[];
const rgb=(value:unknown)=>typeof value==='string'||typeof value==='number'?new THREE.Color(value).toArray():value&&typeof value==='object'&&'r' in value?[(value as THREE.Color).r,(value as THREE.Color).g,(value as THREE.Color).b]:[0,0,0];
for(const entry of inventory){
  if(only&&!only.has(entry.key)&&!only.has(entry.key.replace(/[^a-z0-9_-]+/gi,'_')))continue;
  const component=entry.component,definition=COMPONENTS[component.type];
  const store=root.render(<ProceduralEquipment component={component} definition={definition} state={state} selected={false} view="open" authoring showLabels={false} lowDetail={false} onPart={()=>{}} onTerminal={()=>{}}/>);
  // The first render mounts synchronously; later updates commit in flushSync.
  flushSync(()=>root.render(<ProceduralEquipment key={entry.key} component={component} definition={definition} state={state} selected={false} view="open" authoring showLabels={false} lowDetail={false} onPart={()=>{}} onTerminal={()=>{}}/>));
  const scene=store.getState().scene;scene.updateMatrixWorld(true);
  const geometries:Record<string,unknown>={},materials:Record<string,unknown>={};let count=0,vertices=0;
  const serialize=(object:THREE.Object3D):unknown=>{
    const mesh=object as THREE.Mesh;const node:Record<string,unknown>={name:object.name||`node-${count++}`,position:object.position.toArray(),rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:object.scale.toArray(),data:object.userData};
    if(mesh.isMesh){const geometry=mesh.geometry;if(!geometries[geometry.uuid]){const p=geometry.getAttribute('position'),index=geometry.index;const normal=geometry.getAttribute('normal');geometries[geometry.uuid]={position:Array.from(p.array),normal:normal?Array.from(normal.array):null,index:index?Array.from(index.array):Array.from({length:p.count},(_,i)=>i)};vertices+=p.count;}node.geometry=geometry.uuid;const material=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as THREE.MeshStandardMaterial;if(!materials[material.uuid])materials[material.uuid]={color:rgb(material.color),roughness:material.roughness??.55,metalness:material.metalness??0,opacity:material.opacity,transparent:material.transparent,emissive:rgb(material.emissive),emissiveIntensity:material.emissiveIntensity??0};node.material=material.uuid;}
    node.children=object.children.map(serialize);return node;
  };
  const nodes=scene.children.map(serialize),key=entry.key.replace(/[^a-z0-9_-]+/gi,'_');
  const item={key,file:key+'.json',galleryKey:entry.key,name:entry.name,component,definition,terminals:getComponentTerminals(component,definition),meshNodes:count,vertices};
  writeFileSync(output+key+'.json',JSON.stringify({...item,materials,geometries,nodes}));manifest.push(item);
}
const all=only?JSON.parse(readFileSync(output+'inventory.json','utf8')) as typeof manifest:[];
const merged=new Map(all.map(item=>[item.key,item]));manifest.forEach(item=>merged.set(item.key,item));
writeFileSync(output+'inventory.json',JSON.stringify([...merged.values()],null,2));
console.log(`Exported ${manifest.length} original typed geometry recipes for Blender.`);
root.unmount();
