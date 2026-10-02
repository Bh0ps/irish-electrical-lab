import { useEffect, useMemo, useState } from 'react';
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { equipmentAsset } from './equipment-assets';
import { animateBlenderModel, prepareBlenderModel, presentBlenderModel, semanticOwner } from './blender-model';
import type { EquipmentProps } from './Equipment';

const assets=new Map<string,Promise<THREE.Group>>();
function loadAsset(url:string):Promise<THREE.Group>{
  let pending=assets.get(url);
  if(!pending){pending=new GLTFLoader().loadAsync(url).then(gltf=>gltf.scene);assets.set(url,pending);}
  return pending;
}
function DisplayText({node,reading}:{node:THREE.Object3D;reading:string}){
  const map=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#092c29';ctx.font='600 92px Consolas, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(reading,384,96,740);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[reading]);
  useEffect(()=>()=>map.dispose(),[map]);
  // Screen axes were converted from the original Y-up source into glTF local
  // coordinates by Blender. Attach to the actual selectable display carrier.
  const screen=useMemo(()=>{
    const bounds=new THREE.Box3();node.updateWorldMatrix(true,true);const inverse=node.matrixWorld.clone().invert();
    for(const child of node.children)if(child instanceof THREE.Mesh){child.geometry.computeBoundingBox();const local=child.geometry.boundingBox?.clone().applyMatrix4(inverse.clone().multiply(child.matrixWorld));if(local)bounds.union(local);}
    if(bounds.isEmpty())return null;const dimensions=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    return {dimensions,position:[center.x,bounds.max.y+.002,center.z] as [number,number,number]};
  },[node]);
  if(!screen||screen.dimensions.x<.2||screen.dimensions.z<.075)return null;
  return createPortal(<mesh position={screen.position} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[screen.dimensions.x*.89,screen.dimensions.z*.77]}/><meshBasicMaterial map={map} transparent toneMapped={false} depthWrite={false}/></mesh>,node);
}

export function BlenderEquipment(props:EquipmentProps&{fallback:React.ReactNode}){
  const entry=equipmentAsset(props.component,props.definition),[loaded,setLoaded]=useState<{key:string;url:string;source:THREE.Group}>(),[far,setFar]=useState(false),{invalidate}=useThree();
  const low=!!props.lowDetail||far,lowUrl=(entry as typeof entry&{lowUrl?:string})?.lowUrl,url=entry&&(low&&!props.selected&&lowUrl?lowUrl:entry.url);
  useEffect(()=>{
    if(!entry||!url)return;let cancelled=false;
    loadAsset(url).then(source=>{if(!cancelled){setLoaded({key:entry.galleryKey,url,source});invalidate();}}).catch(error=>{if(!cancelled)window.dispatchEvent(new CustomEvent('electrical-lab-model-error',{detail:{asset:entry.galleryKey,message:String(error)}}));});
    return()=>{cancelled=true;};
  },[entry,url,invalidate]);
  const presentation=useMemo(()=>loaded&&entry?.galleryKey===loaded.key?prepareBlenderModel(loaded.source):undefined,[loaded,entry]);
  useEffect(()=>()=>presentation?.owned.forEach(material=>material.dispose()),[presentation]);
  useEffect(()=>{if(presentation){presentBlenderModel(presentation,props.view,props.component,props.state);invalidate();}},[presentation,props.view,props.component,props.state,invalidate]);
  useFrame(({camera},dt)=>{if(presentation){const distance=camera.position.distanceTo(presentation.scene.getWorldPosition(new THREE.Vector3())),next=distance>13;if(next!==far)setFar(next);if(props.animate!==false&&animateBlenderModel(presentation,props.component,props.state,dt))invalidate();}});
  if(!entry||!presentation)return props.fallback;
  const pick=(event:ThreeEvent<MouseEvent>)=>{
    const owner=semanticOwner(event.object);event.stopPropagation();
    if(owner.terminal)props.onTerminal(owner.terminal);else props.onPart(owner.part??'body');
  };
  const displays:THREE.Object3D[]=[];presentation.scene.traverse(node=>{if(node.userData.partId==='display')displays.push(node);});
  const type=props.component.type,active=!!props.state?.energized,reading=['multimeter','clamp'].includes(type)?String(props.component.params.reading??'—'):['source','source3','meter'].includes(type)?`${props.component.params.studyVoltage??(type==='source3'?400:240)} V`:type==='vfd'?`${active?Number(props.component.params.frequency??50).toFixed(1):'0.0'} Hz`:type==='plc'?(active?'I/O ONLINE':'I/O OFF'):type==='ev'?(active?'CHARGING':'READY'):active?'RUN':'OFF';
  return <group userData={{equipmentSource:'Blender',assetKey:entry.galleryKey,lod:loaded?.url.endsWith('.low.glb')?'distance':'full'}} onClick={pick}><primitive object={presentation.scene} dispose={null}/>{displays.map(node=><DisplayText key={node.uuid} node={node} reading={reading}/>)}</group>;
}
