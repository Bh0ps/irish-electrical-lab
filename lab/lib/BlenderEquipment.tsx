import { useEffect, useMemo, useState } from 'react';
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { equipmentAsset } from './equipment-assets';
import { animateBlenderModel, prepareBlenderModel, presentBlenderModel, semanticOwner } from './blender-model';
import type { EquipmentProps } from './Equipment';

interface CachedAsset {
  pending: Promise<THREE.Group>;
  source?: THREE.Group;
  users: number;
}

const assets = new Map<string, CachedAsset>();
const MAX_IDLE_ASSETS = 12;

function trimIdleAssets() {
  const idle = Array.from(assets.entries()).filter(([, entry]) => entry.users === 0 && entry.source);
  for (const [url, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_ASSETS))) {
    const geometry = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    entry.source?.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometry.add(node.geometry);
      const surfaces = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of surfaces) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const item of geometry) item.dispose();
    for (const item of materials) item.dispose();
    for (const item of textures) item.dispose();
    assets.delete(url);
  }
}

function acquireAsset(url: string): CachedAsset {
  let entry = assets.get(url);
  if (!entry) {
    const asset: CachedAsset = {
      users: 0,
      pending: new GLTFLoader().loadAsync(url).then(gltf => {
        asset.source = gltf.scene;
        trimIdleAssets();
        return gltf.scene;
      }).catch(error => {
        if (assets.get(url) === asset) assets.delete(url);
        throw error;
      }),
    };
    entry = asset;
  }
  // Retain recently used objects and keep every asset which still has a consumer.
  entry.users++;
  assets.delete(url);
  assets.set(url, entry);
  return entry;
}

function useBlenderAsset(url?: string) {
  const { invalidate } = useThree();
  const [, refresh] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(() => {
    if (!url) return;
    let active = true;
    let entry: CachedAsset;
    const release = () => {
      entry.users--;
      trimIdleAssets();
    };
    const request = () => {
      entry = acquireAsset(url);
      entry.pending.then(() => {
        if (active) {
          refresh(value => value + 1);
          invalidate();
        }
      }).catch(() => {
        if (active) {
          setFailedUrl(url);
          invalidate();
          window.addEventListener('online', retry, { once: true });
        }
      });
    };
    const retry = () => {
      release();
      request();
    };
    request();
    return () => {
      active = false;
      window.removeEventListener('online', retry);
      release();
    };
  }, [url, invalidate]);
  const source = url ? assets.get(url)?.source : undefined;
  return source ? { url: url!, source } : url && failedUrl === url ? { url, failed: true } : undefined;
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
  const entry=equipmentAsset(props.component,props.definition),[far,setFar]=useState(false),{invalidate}=useThree();
  const lowUrl=entry?.lowUrl;
  const lowOnly=!!lowUrl&&(props.preferLowAsset?!!props.lowDetail:!props.selected&&(!!props.lowDetail||far));
  const full=useBlenderAsset(lowOnly?undefined:entry?.url);
  const low=useBlenderAsset(lowOnly||props.preferLowAsset||full?.failed?lowUrl:undefined);
  const loaded=full?.source?full:low;
  const source=loaded?.source;
  const presentation=useMemo(()=>source?prepareBlenderModel(source):undefined,[source]);
  useEffect(()=>()=>presentation?.owned.forEach(material=>material.dispose()),[presentation]);
  useEffect(()=>{if(presentation){presentBlenderModel(presentation,props.view,props.component,props.state);invalidate();}},[presentation,props.view,props.component,props.state,invalidate]);
  useFrame(({camera},dt)=>{if(presentation){
    if(!props.preferLowAsset&&!props.selected&&!props.lowDetail){const distance=camera.position.distanceTo(presentation.scene.getWorldPosition(new THREE.Vector3())),next=distance>(far?12:14);if(next!==far)setFar(next);}
    if(props.animate!==false&&animateBlenderModel(presentation,props.component,props.state,dt))invalidate();
  }});
  if(!entry||!presentation)return props.fallback;
  const pick=(event:ThreeEvent<MouseEvent>)=>{
    const owner=semanticOwner(event.object);event.stopPropagation();
    if(owner.terminal)props.onTerminal(owner.terminal);else props.onPart(owner.part??'body');
  };
  const displays:THREE.Object3D[]=[];presentation.scene.traverse(node=>{if(node.userData.partId==='display')displays.push(node);});
  const type=props.component.type,active=!!props.state?.energized,reading=['multimeter','clamp'].includes(type)?String(props.component.params.reading??'—'):['source','source3','meter'].includes(type)?`${props.component.params.studyVoltage??(type==='source3'?400:240)} V`:type==='vfd'?`${active?Number(props.component.params.frequency??50).toFixed(1):'0.0'} Hz`:type==='plc'?(active?'I/O ONLINE':'I/O OFF'):type==='ev'?(active?'CHARGING':'READY'):active?'RUN':'OFF';
  return <group userData={{equipmentSource:'Blender',assetKey:entry.galleryKey,lod:loaded?.url.endsWith('.low.glb')?'distance':'full'}} onClick={pick}><primitive object={presentation.scene} dispose={null}/>{displays.map(node=><DisplayText key={node.uuid} node={node} reading={reading}/>)}</group>;
}
