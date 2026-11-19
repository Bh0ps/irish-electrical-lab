import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { equipmentAsset } from './equipment-assets';
import { animateBlenderModel, disposeBlenderTerminalBatches, prepareBlenderModel, presentBlenderModel, semanticOwner } from './blender-model';
import type { EquipmentProps } from './Equipment';
import {rockerConductiveSurface} from './dc-rocker';

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
    if(entry.source)disposeBlenderTerminalBatches(entry.source);
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

interface VisibleModel { key: string; url: string; source: THREE.Group; entry: CachedAsset }

function releaseAsset(entry: CachedAsset) {
  entry.users--;
  trimIdleAssets();
}

/** Keep the displayed GLB leased until its replacement has been parsed.
 * Offline inspection uses the same authored assembly at reduced detail. */
function useBlenderAsset(key: string, preferred?: string, other?: string, bootstrap?: string) {
  const { invalidate } = useThree();
  const held = useRef<VisibleModel | undefined>(undefined);
  const [visible, setVisible] = useState<VisibleModel>();
  const [missing, setMissing] = useState<string>();
  useEffect(() => () => {
    if (held.current) releaseAsset(held.current.entry);
    held.current = undefined;
  }, []);
  useEffect(() => {
    let active = true;
    async function adopt(url?: string) {
      if (!url || !active) return false;
      if (held.current?.url === url) return true;
      const entry = acquireAsset(url);
      try {
        const source = entry.source ?? await entry.pending;
        if (!active) { releaseAsset(entry); return false; }
        const previous = held.current;
        const next = { key, url, source, entry };
        held.current = next;
        setVisible(next);
        setMissing(undefined);
        invalidate();
        if (previous) releaseAsset(previous.entry);
        return true;
      } catch {
        releaseAsset(entry);
        return false;
      }
    }
    async function request() {
      if (bootstrap && bootstrap !== preferred && held.current?.key !== key && preferred && !assets.get(preferred)?.source) {
        await adopt(bootstrap);
      }
      if (!active || await adopt(preferred)) return;
      if (held.current?.key !== key && !await adopt(other) && active) setMissing(key);
      if (active) window.addEventListener('online', request, { once: true });
    }
    void request();
    return () => { active = false; window.removeEventListener('online', request); };
  }, [key, preferred, other, bootstrap, invalidate]);
  return { model: visible?.key === key ? visible : undefined, missing: !preferred || missing === key };
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

function RatingText({node,text}:{node:THREE.Object3D;text:string}){
  const map=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.fillStyle='#edece7';ctx.fillRect(0,0,320,80);
    ctx.fillStyle='#182127';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 50px Arial';
    ctx.fillText(text,160,41,310);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[text]);
  useEffect(()=>()=>map?.dispose(),[map]);
  return map?createPortal(<mesh position={[0,.008,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.268,.065]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>,node):null;
}

export function BlenderEquipment(props:EquipmentProps&{children?:React.ReactNode}){
  const entry=equipmentAsset(props.component,props.definition),[far,setFar]=useState(false),{invalidate}=useThree();
  const lowUrl=entry?.lowUrl;
  const lowOnly=!!lowUrl&&(props.preferLowAsset?!!props.lowDetail:!props.selected&&(!!props.lowDetail||far));
  const {model:loaded,missing}=useBlenderAsset(entry?.galleryKey??props.component.type,lowOnly?lowUrl:entry?.url,lowOnly?entry?.url:lowUrl,props.preferLowAsset?lowUrl:undefined);
  const source=loaded?.source;
  const {onModelAvailability}=props, id=props.component.id;
  useEffect(()=>{
    if(!missing || !onModelAvailability)return;
    onModelAvailability(id,true);
    return ()=>onModelAvailability(id,false);
  },[missing,onModelAvailability,id]);
  const batchDistantTerminals=lowOnly&&loaded?.url===lowUrl&&!props.selected&&props.view==='normal'&&!props.contactPiece;
  const presentation=useMemo(()=>source?prepareBlenderModel(source,batchDistantTerminals):undefined,[source,batchDistantTerminals]);
  useEffect(()=>()=>presentation?.owned.forEach(material=>material.dispose()),[presentation]);
  useEffect(()=>{if(presentation){presentBlenderModel(presentation,props.view,props.component,props.state,props.contactPiece,props.connectedTerminals);invalidate();}},[presentation,props.view,props.component,props.state,props.contactPiece,props.connectedTerminals,invalidate]);
  useFrame(({camera},dt)=>{if(presentation){
    if(!props.preferLowAsset&&!props.selected&&!props.lowDetail){const distance=camera.position.distanceTo(presentation.scene.getWorldPosition(new THREE.Vector3())),next=distance>(far?12:14);if(next!==far)setFar(next);}
    if(props.animate!==false&&animateBlenderModel(presentation,props.component,props.state,dt))invalidate();
  }});
  if(!entry||!presentation)return null;
  const pick=(event:ThreeEvent<MouseEvent>)=>{
    const owner=semanticOwner(event.object);event.stopPropagation();
    if(owner.terminal&&props.component.variant==='dc-rocker'&&event.object instanceof THREE.Mesh){
      const mat=event.object.material, surfaces=Array.isArray(mat)?mat:[mat];
      if(!surfaces.some(m=>rockerConductiveSurface(m.name))){props.onPart('terminals');return;}
    }
    if(owner.terminal)props.onTerminal(owner.terminal);else props.onPart(owner.part??'body',owner.detail);
  };
  const displays:THREE.Object3D[]=[],ratingPlates:THREE.Object3D[]=[];presentation.scene.traverse(node=>{if(node.userData.partId==='display')displays.push(node);if(node.userData.ratingPlate)ratingPlates.push(node);});
  const type=props.component.type,active=!!props.state?.energized;
  const reading=(()=>{
    if(['multimeter','clamp','forktester'].includes(type))return String(props.component.params.reading??'—');
    if(type==='meter')return typeof props.state?.meterWatts==='number'?(props.state.meterWatts/1000).toFixed(3)+' kW':'—';
    if(type==='source'||type==='source3')return active?String(props.component.params.studyVoltage??(type==='source3'?400:240))+' V':'OFF';
    if(type==='vfd')return (active?Number(props.component.params.frequency??50).toFixed(1):'0.0')+' Hz';
    if(type==='plc')return active?'I/O ONLINE':'I/O OFF';
    if(type==='ev')return active?'CHARGING':'READY';
    return active?'RUN':'OFF';
  })();
  const values={...props.definition.defaults,...props.component.params};
  const amp=Number(values.rating??values.currentRating??16),residual=Number(values.residualRating??Number(values.tripMa??30)/1000)*1000;
  const rating=type==='rcbo'?`${amp} A · ${Number(residual.toFixed(2))} mA`:['rcd','rcd3'].includes(type)?`${Number(residual.toFixed(2))} mA`:`${amp} A`;
  return <group userData={{equipmentSource:'Blender',assetKey:entry.galleryKey,lod:loaded?.url.endsWith('.low.glb')?'distance':'full'}} onClick={pick}><primitive object={presentation.scene} dispose={null}/>{props.children}{type!=='forktester'&&displays.map(node=><DisplayText key={node.uuid} node={node} reading={reading}/>)}{ratingPlates.map(node=><RatingText key={node.uuid} node={node} text={rating}/>)}</group>;
}
