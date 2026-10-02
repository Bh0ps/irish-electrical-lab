'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COMPONENTS } from '../../lib/components';
import { getComponentTerminals } from '../../lib/terminal-layout';
import { sceneBounds, selectedPartBounds } from '../../lib/workbench-presentation';
import {
  cameraFarPlane, cameraHasMotion, cameraLookQuaternion, createCameraNavigationState, createCameraTransition,
  DEFAULT_CAMERA_SPEED, queueCameraGesture, sampleCameraTransition, stepCameraNavigation, stopCameraNavigation,
  type CameraInput, type CameraMode, type CameraPose, type CameraQuaternion, type CameraTransition,
} from '../../lib/camera-navigation';
import type { CircuitRoutes } from '../../lib/routing';
import type { CircuitDocument, Vec3 } from '../../lib/types';

export interface CameraNavigationProps {
  document:CircuitDocument; routing:CircuitRoutes; routingPending:boolean;
  selected?:string; selectedPart?:string; cameraCommand:{id:number;action:string};
  dragging:boolean; nodes:Map<string,THREE.Group>; mode?:CameraMode; speed?:number;
  tool:'select'|'place'|'wire'|'inspect'|'meter';
}
const navigationKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ShiftLeft','ShiftRight']);
const hasOpenModal=()=>!!document.querySelector('[role="dialog"]:not([data-state="closed"]),[role="alertdialog"]:not([data-state="closed"])');
const heldInput=(keys:Set<string>):CameraInput=>({
  forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),
  right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),
  up:Number(keys.has('KeyE')||keys.has('ArrowUp'))-Number(keys.has('KeyQ')||keys.has('ArrowDown')),
  fast:keys.has('ShiftLeft')||keys.has('ShiftRight'),
});
function presetPose(props:CameraNavigationProps,camera:THREE.Camera):CameraPose {
  const action=props.cameraCommand.action,selected=props.document.components.find(c=>c.id===props.selected),focus=!!selected&&['focus','rear'].includes(action);
  const bounds=focus?selectedPartBounds(selected!,action==='rear'?'terminals':props.selectedPart,props.nodes.get(selected!.id)):sceneBounds(props.document,props.routing.routes);
  const target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),perspective=camera as THREE.PerspectiveCamera,aspect=perspective.aspect||1,fov=THREE.MathUtils.degToRad(perspective.fov||43);
  const distance=focus?Math.max(.8,Math.max(size.x/aspect,size.y,size.z)*1.55/Math.tan(fov/2)):Math.max(6.3,Math.max(size.x/aspect,size.z,size.y)*1.75);
  const offset=new THREE.Vector3(3.7,5.8,9).normalize().multiplyScalar(distance);
  if(action==='top')offset.set(0,distance,.01);
  if(action==='front')offset.set(0,distance*.25,distance);
  const definition=selected&&COMPONENTS[selected.type],rear=action==='rear'||action==='focus'&&selected&&definition&&getComponentTerminals(selected,definition).some(t=>props.selectedPart==='terminals'||t.id===props.selectedPart);
  if(focus){offset.set(action==='rear'?.12:.28,.2,rear?-1:1).normalize().multiplyScalar(distance);offset.applyAxisAngle(new THREE.Vector3(0,1,0),selected!.rotation);}
  else if(action==='rear')offset.set(0,distance*.25,-distance);
  const position=target.clone().add(offset).toArray() as Vec3,to=target.toArray() as Vec3;
  return {position,target:to,quaternion:cameraLookQuaternion(position,to)};
}

/** Owns navigation only. It never captures ordinary equipment clicks or an equipment placement drag. */
export default function CameraNavigation(props:CameraNavigationProps) {
  const {camera,gl,invalidate,scene,get}=useThree(),latest=useRef(props),keys=useRef(new Set<string>()),gesture=useRef<{pointer:number;kind:'look'|'pan';x:number;y:number}|null>(null),transition=useRef<CameraTransition|null>(null),lastCommand=useRef(-1),lastFrame=useRef(0),modalOpen=useRef(false);
  const clippingBounds=useMemo(()=>{const box=sceneBounds(props.document,props.routing.routes);return {min:box.min.toArray() as Vec3,max:box.max.toArray() as Vec3};},[props.document,props.routing.routes]),clipping=useRef(clippingBounds);
  const navigation=useRef(createCameraNavigationState({position:camera.position.toArray() as Vec3,quaternion:camera.quaternion.toArray() as CameraQuaternion,target:new THREE.Vector3(0,0,-Math.max(1,camera.position.length())).applyQuaternion(camera.quaternion).add(camera.position).toArray() as Vec3}));
  useLayoutEffect(()=>{latest.current=props;},[props]);
  useLayoutEffect(()=>{clipping.current=clippingBounds;},[clippingBounds]);
  useEffect(()=>{invalidate();},[props.cameraCommand,props.routingPending,invalidate]);
  useLayoutEffect(()=>{
    keys.current.clear();gesture.current=null;navigation.current=stopCameraNavigation(navigation.current);lastFrame.current=0;
    if(props.dragging)transition.current=null;
    invalidate();
  },[props.mode,props.dragging,invalidate]);
  useEffect(()=>{
    const canvas=gl.domElement,previousTabIndex=canvas.getAttribute('tabindex'),previousLabel=canvas.getAttribute('aria-label'),previousTouchAction=canvas.style.touchAction;
    canvas.setAttribute('tabindex','0');canvas.setAttribute('aria-label','3D electrical workbench. Free camera: W A S D move, Q and E lower and raise, hold Shift to move faster. Right drag looks, middle drag pans.');canvas.style.setProperty('touch-action','none');
    const clear=()=>{keys.current.clear();gesture.current=null;navigation.current=stopCameraNavigation(navigation.current);lastFrame.current=0;invalidate();};
    const wake=()=>{if(!transition.current&&!cameraHasMotion(navigation.current,heldInput(keys.current)))lastFrame.current=0;};
    const canNavigate=()=>!latest.current.dragging&&!document.hidden&&!hasOpenModal();
    const observeModal=()=>{const open=hasOpenModal();if(open&&!modalOpen.current){transition.current=null;clear();}modalOpen.current=open;};
    const modalObserver=new MutationObserver(observeModal);modalObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['role','data-state']});observeModal();
    const isEquipmentHit=(event:PointerEvent)=>{
      const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/Math.max(1,rect.width)*2-1,1-(event.clientY-rect.top)/Math.max(1,rect.height)*2),camera);
      const hit=ray.intersectObjects(get().internal.interaction,true)[0];let owner:THREE.Object3D|undefined=hit?.object;
      while(owner){if(owner.userData.partId||owner.userData.terminalId||owner.userData.wireId)return true;owner=owner.parent??undefined;}
      return false;
    };
    const pointerDown=(event:PointerEvent)=>{
      if(!canNavigate()||event.ctrlKey||event.metaKey||event.altKey)return;
      canvas.focus({preventScroll:true});const current=latest.current,mode=current.mode??'orbit';
      if(event.button===0&&(mode==='free'||!['select','inspect'].includes(current.tool)||isEquipmentHit(event)))return;
      if(![0,1,2].includes(event.button))return;
      event.preventDefault();wake();transition.current=null;gesture.current={pointer:event.pointerId,kind:mode==='free'&&event.button===2||mode==='orbit'&&event.button===0?'look':'pan',x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);invalidate();
    };
    const pointerMove=(event:PointerEvent)=>{
      const active=gesture.current;if(!active||active.pointer!==event.pointerId||!canNavigate())return;
      const dx=event.clientX-active.x,dy=event.clientY-active.y;active.x=event.clientX;active.y=event.clientY;
      wake();navigation.current=queueCameraGesture(navigation.current,active.kind==='look'?{look:[dx*.004,dy*.004]}:{pan:[dx,dy]});event.preventDefault();invalidate();
    };
    const pointerUp=(event:PointerEvent)=>{if(gesture.current?.pointer!==event.pointerId)return;gesture.current=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
    const wheel=(event:WheelEvent)=>{
      if(!canNavigate()||event.ctrlKey||event.metaKey)return;
      event.preventDefault();wake();transition.current=null;const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?Math.max(1,canvas.clientHeight):1);
      navigation.current=queueCameraGesture(navigation.current,{wheel:THREE.MathUtils.clamp(pixels,-1500,1500)});invalidate();
    };
    const keyDown=(event:KeyboardEvent)=>{
      if(event.target!==canvas||document.activeElement!==canvas||!canNavigate()||(latest.current.mode??'orbit')!=='free'||event.ctrlKey||event.metaKey||event.altKey||!navigationKeys.has(event.code))return;
      event.preventDefault();event.stopPropagation();wake();keys.current.add(event.code);transition.current=null;invalidate();
    };
    const keyUp=(event:KeyboardEvent)=>{if(!keys.current.has(event.code))return;keys.current.delete(event.code);event.preventDefault();event.stopPropagation();invalidate();};
    const contextMenu=(event:MouseEvent)=>event.preventDefault();
    const visibility=()=>{if(document.hidden)clear();};
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);canvas.addEventListener('lostpointercapture',pointerUp);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('keydown',keyDown);canvas.addEventListener('keyup',keyUp);canvas.addEventListener('blur',clear);canvas.addEventListener('contextmenu',contextMenu);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);
    return()=>{
      canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);canvas.removeEventListener('lostpointercapture',pointerUp);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',keyDown);canvas.removeEventListener('keyup',keyUp);canvas.removeEventListener('blur',clear);canvas.removeEventListener('contextmenu',contextMenu);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);
      modalObserver.disconnect();
      if(previousTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',previousTabIndex);
      if(previousLabel===null)canvas.removeAttribute('aria-label');else canvas.setAttribute('aria-label',previousLabel);canvas.style.setProperty('touch-action',previousTouchAction);
    };
  },[camera,gl,invalidate,scene,get]);
  useEffect(()=>{
    if(!('electricalDesktop' in window))return;
    const report=()=>window.dispatchEvent(new CustomEvent('electrical-lab-camera',{detail:{mode:latest.current.mode??'orbit',speed:latest.current.speed??DEFAULT_CAMERA_SPEED,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:[...navigation.current.target],moving:!!transition.current||cameraHasMotion(navigation.current,heldInput(keys.current)),canvasFocused:document.activeElement===gl.domElement,dragging:latest.current.dragging,heldKeys:[...keys.current]}}));
    const receiver=(event:Event)=>{
      const requested=(event as CustomEvent<{points?:{id:string;point:Vec3}[]}>).detail?.points??[],rect=gl.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
      const samples=requested.slice(0,32).filter(sample=>typeof sample.id==='string'&&Array.isArray(sample.point)&&sample.point.length===3&&sample.point.every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)).map(sample=>{
        const projected=new THREE.Vector3(...sample.point).project(camera),inView=Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>=-1&&projected.z<=1;ray.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
        const hit=inView?ray.intersectObjects(scene.children,true).find(candidate=>{let owner:THREE.Object3D|null=candidate.object;while(owner){if(!owner.visible)return false;owner=owner.parent;}return true;}):undefined;
        const material=hit?.object instanceof THREE.Mesh?hit.object.material:undefined,chosen=Array.isArray(material)?material[hit?.face?.materialIndex??0]:material;
        return {id:sample.id,point:[...sample.point],inView,screen:{x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2},hit:hit?{name:hit.object.name,type:hit.object.type,point:hit.point.toArray(),workbenchPlacementSurface:hit.object.userData.workbenchPlacementSurface===true,material:chosen?{name:chosen.name,type:chosen.type}:undefined}:undefined};
      });
      window.dispatchEvent(new CustomEvent('electrical-lab-receiver',{detail:{samples,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),viewport:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}}));
    };
    window.addEventListener('electrical-lab-camera-request',report);window.addEventListener('electrical-lab-receiver-request',receiver);return()=>{window.removeEventListener('electrical-lab-camera-request',report);window.removeEventListener('electrical-lab-receiver-request',receiver);};
  },[camera,gl,scene]);
  useFrame(({camera:frameCamera})=>{
    const current=latest.current,now=performance.now(),dt=lastFrame.current?(now-lastFrame.current)/1000:1/60;lastFrame.current=now;
    if(modalOpen.current||current.dragging)return;
    if(current.cameraCommand.id!==lastCommand.current&&!(current.routingPending&&current.cameraCommand.action==='fit')) {
      lastCommand.current=current.cameraCommand.id;keys.current.clear();navigation.current=stopCameraNavigation(navigation.current);transition.current=createCameraTransition(navigation.current,presetPose(current,frameCamera));invalidate();
    }
    if(transition.current){
      transition.current.elapsed+=Math.min(dt,.1);navigation.current=createCameraNavigationState(sampleCameraTransition(transition.current,transition.current.elapsed));
      if(transition.current.elapsed>=transition.current.duration)transition.current=null;
    } else navigation.current=stepCameraNavigation(navigation.current,current.mode??'orbit',heldInput(keys.current),dt,{height:gl.domElement.clientHeight,fov:(camera as THREE.PerspectiveCamera).fov??43},current.speed??DEFAULT_CAMERA_SPEED);
    const next=navigation.current;frameCamera.position.set(...next.position);frameCamera.quaternion.set(...next.quaternion);frameCamera.updateMatrixWorld();
    // Imported workbenches may be much larger than the default lesson room.
    if(frameCamera instanceof THREE.PerspectiveCamera){const far=cameraFarPlane(next.position,clipping.current);if(Math.abs(far-frameCamera.far)>.1){frameCamera.far=far;frameCamera.updateProjectionMatrix();}}
    if(transition.current||cameraHasMotion(next,heldInput(keys.current)))invalidate();
  });
  return null;
}
