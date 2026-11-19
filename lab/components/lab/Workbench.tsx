'use client';
import React, { Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, events as pointerEvents, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mountScale, mountRoll, filledWays } from '../../lib/board-assembly';
import { createBoundedWireCurve, Equipment } from '../../lib/Equipment';
import { COMPONENTS } from '../../lib/components';
import { prioritizeTerminalHit } from '../../lib/terminal-picking';
import { CABLE_CORE_LABEL, CORE_COLOUR } from '../../lib/cables';
import { coreRadius } from '../../lib/cable-form';
import { createBareTip, createCableMesh } from '../../lib/cable-mesh';
import { getComponentTerminals } from '../../lib/terminal-layout';
import { terminalDirection, terminalPosition, WIRE_RADIUS, type CableGeometry, type CircuitRoutes } from '../../lib/routing';
import { endpointEquals, hasOperatingAnimation, pathMatches, placementClear, sceneBounds, selectedPartBounds, snapWorkbenchPoint, tracePresentationPaths, type PathFilter, type RenderQuality } from '../../lib/workbench-presentation';
import { ToolGeometry } from './ToolGeometry';
import { MaterialSample, testerPose, TestLead } from './ToolPlacement';
import type { WorkshopVisual } from '../../lib/termination-practice';
import { BenchStage } from './BenchStage';
import { SceneLighting } from './SceneLighting';
import { GraphicEffects } from './GraphicEffects';
import { adaptWorkbenchDpr, type SceneryId } from '../../lib/scene-settings';
import { useCircuitRouting } from './useCircuitRouting';
import CameraNavigation from './CameraNavigation';
import type { CameraMode } from '../../lib/camera-navigation';
import RoutingWorker from '../../lib/routing.worker?worker';
import type { CableCore, CableRun, CircuitDocument, ComponentInstance, DeviceState, Endpoint, SimulationResult, Vec3, Wire } from '../../lib/types';
export { terminalPosition } from '../../lib/routing';
export type { CameraMode } from '../../lib/camera-navigation';
export type Tool = 'select'|'place'|'wire'|'inspect'|'meter';
export type InspectionView = 'normal'|'open'|'exploded'|'cutaway';
export interface WorkbenchMetrics { fps:number;drawCalls:number;triangles:number;dpr:number;quality:RenderQuality;idle:boolean }
export interface WorkbenchProps {
  onListView?:()=>void;
  onModelAvailability?:(id:string,unavailable:boolean)=>void;
  document:CircuitDocument; result?:SimulationResult; tool:Tool; mode:string; selected?:string; selectedWire?:string;
  selectedPart?:string; view:InspectionView; labels:boolean; paths:boolean; wireStart?:Endpoint; probes:(Endpoint|undefined)[];
  cameraCommand:{id:number;action:string}; onSelect:(id:string,part?:string,detail?:string)=>void; onTerminal:(e:Endpoint)=>void;
  /** Notify only an actual change of the hovered terminal, including leaving it. */
  onTerminalHover?:(endpoint:Endpoint|undefined)=>void;
  onWire:(id:string)=>void; onCable?:(id:string)=>void; onPlace:(position:Vec3)=>void; onMove:(id:string,position:Vec3,stage:'start'|'move'|'end')=>void;
  onFps:(fps:number)=>void; meterReading:string; meterMode:string; instrumentType?:string; workshop?:WorkshopVisual; instrumentParams?:ComponentInstance['params'];
  cameraMode?:CameraMode;cameraSpeed?:number;scenery?:SceneryId;
  pathFilter?:PathFilter;guidanceEndpoints?:Endpoint[];placeType?:string;quality?:RenderQuality;onMetrics?:(metrics:WorkbenchMetrics)=>void;
  touchLayout?:boolean;
  touchMove?:boolean;
}
const createRoutingWorker=()=>new RoutingWorker();
const ignoreRaycast:THREE.Mesh['raycast']=()=>{};
// Tube UVs run lengthwise in U and around the core in V. Both colour bands
// share the original indexed tube, including the rings used for wire picking.
const earthStripe=new THREE.DataTexture(new Uint8Array([39,117,64,255,233,205,48,255]),1,2);
earthStripe.colorSpace=THREE.SRGBColorSpace;
earthStripe.magFilter=THREE.NearestFilter;
earthStripe.minFilter=THREE.NearestFilter;
earthStripe.needsUpdate=true;
const workbenchEvents: typeof pointerEvents = store => ({
  ...pointerEvents(store),
  filter: (hits, state) => prioritizeTerminalHit(hits, state.pointer, state.camera, state.size),
});
const colours:Record<string,string>={L:'#995039',N:'#2687d8',PE:'#a4da45',L1:'#9e5737',L2:'#36383c',L3:'#899097',control:'#936bc4',output:'#c28036','DC+':'#c34550','DC-':'#465866'};

function Label({label,position,selected=false,width=1.5}:{label:string;position:Vec3;selected?:boolean;width?:number}) {
  const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=selected?'#194b46eb':'#23393beb';ctx.beginPath();ctx.roundRect(2,2,764,124,18);ctx.fill();ctx.strokeStyle=selected?'#90e0c7':'#91a7a7';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#f5faf8';ctx.font='34px Segoe UI, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label.length>46?label.slice(0,43)+'…':label,384,64,730);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;},[label,selected]);
  useEffect(()=>()=>texture.dispose(),[texture]);return <sprite position={position} scale={[width,width/6,1]} renderOrder={20} raycast={ignoreRaycast}><spriteMaterial map={texture} transparent depthTest={false} depthWrite={false}/></sprite>;
}
function Insulation({points,role,core,radius=WIRE_RADIUS,wireId,selected=false,emphasis=false,dim=false,onClick}:{points:Vec3[];role:Wire['role'];core?:CableCore;radius?:number;wireId?:string;selected?:boolean;emphasis?:boolean;dim?:boolean;onClick?:()=>void}) {
  const striped=core?core==='green-yellow':role==='PE';
  const colour=striped?'#ffffff':core?CORE_COLOUR[core]:colours[role];
  const geometry=useMemo(()=>{
    const curve=createBoundedWireCurve(points);
    return new THREE.TubeGeometry(curve,curve.tubularSegments,radius,12,false);
  },[radius,points]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} userData={wireId?{wireId}:undefined} raycast={onClick?THREE.Mesh.prototype.raycast:ignoreRaycast}
    onClick={onClick?e=>{e.stopPropagation();onClick();}:undefined} castShadow={!dim}>
    <meshStandardMaterial map={striped?earthStripe:null} color={colour} roughness={.52} metalness={.04} transparent={dim} opacity={dim?.3:1} depthWrite={!dim}
      emissive={selected?'#e0ae4b':emphasis?'#738879':'#000000'} emissiveIntensity={selected?.32:emphasis?.1:0}/>
  </mesh>;
}
function LooseCore({kind,core,points}:{kind:CableRun['kind'];core:CableCore;points:Vec3[]}) {
  const tip=useMemo(()=>createBareTip(kind,core,points),[kind,core,points]);
  useEffect(()=>()=>tip.dispose(),[tip]);
  return <><Insulation core={core} role="output" radius={coreRadius(kind)} points={points}/>
    <mesh geometry={tip} raycast={ignoreRaycast}><meshStandardMaterial vertexColors roughness={.34} metalness={.35}/></mesh></>;
}

function CableSheath({run,geometry,highlight,onClick}:{run:CableRun;geometry:CableGeometry;highlight:boolean;onClick?:()=>void}) {
  const shell=useMemo(()=>geometry.sheath.length>=2?createCableMesh(run.kind,geometry.sheath,geometry.faces):undefined,[run.kind,geometry]);
  useEffect(()=>()=>shell?.dispose(),[shell]);
  return <group>
    {shell&&<mesh geometry={shell} userData={{cableId:run.id}} castShadow raycast={onClick?THREE.Mesh.prototype.raycast:ignoreRaycast}
      onClick={onClick?e=>{e.stopPropagation();onClick();}:undefined}><meshStandardMaterial vertexColors roughness={.55}
        emissive={highlight?'#d9b96a':'#000000'} emissiveIntensity={highlight?.23:0}/></mesh>}
    {geometry.open.map(({core,points,side})=><LooseCore key={side+'-'+core} kind={run.kind} core={core} points={points}/>)}
  </group>;
}
const EquipmentItem=memo(function EquipmentItem({component,ways,state,selected,view,labels,lowDetail,preferLowAsset,onModelAvailability,onSelect,onTerminal,register,onDown,onMove,onUp}:{component:ComponentInstance;ways?:string;state?:DeviceState;selected:boolean;view:InspectionView;labels:boolean;lowDetail:boolean;preferLowAsset?:boolean;onModelAvailability?:WorkbenchProps['onModelAvailability'];onSelect:(id:string,part?:string,detail?:string)=>void;onTerminal:(endpoint:Endpoint)=>void;register:(id:string,node:THREE.Group|null)=>void;onDown:(event:ThreeEvent<PointerEvent>,component:ComponentInstance)=>void;onMove:(event:ThreeEvent<PointerEvent>)=>void;onUp:(event:ThreeEvent<PointerEvent>)=>void}) {
  const [near,setNear]=useState(false),last=useRef(0),group=useRef<THREE.Group>(null);const def=COMPONENTS[component.type];
  const part=useCallback((id:string,detail?:string)=>onSelect(component.id,id,detail),[component.id,onSelect]),terminal=useCallback((id:string)=>onTerminal({component:component.id,terminal:id}),[component.id,onTerminal]),node=useCallback((value:THREE.Group|null)=>{group.current=value;register(component.id,value);},[component.id,register]);
  useFrame(({camera},dt)=>{last.current+=dt;if(last.current>.4){last.current=0;const close=!!group.current&&camera.position.distanceTo(group.current.getWorldPosition(new THREE.Vector3()))<7.5;if(close!==near)setNear(close);}});
  if(!def)return null;return <group ref={node} position={component.position} rotation={[0,component.rotation,0]} onPointerDown={event=>onDown(event,component)} onPointerMove={onMove} onPointerUp={onUp}><group rotation={[0,0,mountRoll(component)]} scale={mountScale(component)}><Equipment filledWays={ways} component={component} definition={def} state={state} selected={selected} view={view} showLabels={false} lowDetail={lowDetail} preferLowAsset={preferLowAsset} onPart={part} onTerminal={terminal} onModelAvailability={onModelAvailability}/></group>{labels&&(selected||near)&&<Label label={component.label} selected={selected} position={[0,component.mount?1.78:def.size[1]+.23,0]} width={selected?2:1.55}/>}</group>;
},(a,b)=>a.component===b.component&&a.ways===b.ways&&a.selected===b.selected&&a.view===b.view&&a.labels===b.labels&&a.lowDetail===b.lowDetail&&a.preferLowAsset===b.preferLowAsset&&a.onModelAvailability===b.onModelAvailability&&a.onSelect===b.onSelect&&a.onTerminal===b.onTerminal&&a.register===b.register&&a.onDown===b.onDown&&a.onMove===b.onMove&&a.onUp===b.onUp&&(['energized','closed','tripped','level','direction','details','moving','elapsed','contactLevel','lightOutputPower','warmWatts','coolWatts','meterWatts'] as const).every(key=>a.state?.[key]===b.state?.[key]));
function SelectionOutline({component,part,nodes,view}:{component?:ComponentInstance;part?:string;nodes:Map<string,THREE.Group>;view:InspectionView}) {
  const [bounds,setBounds]=useState<THREE.Box3>();const {invalidate}=useThree();useEffect(()=>{const frame=requestAnimationFrame(()=>{setBounds(component?selectedPartBounds(component,part,nodes.get(component.id)).expandByScalar(.018):undefined);invalidate();});return()=>cancelAnimationFrame(frame);},[component,part,nodes,view,invalidate]);
  const geometry=useMemo(()=>{if(!bounds)return null;const size=bounds.getSize(new THREE.Vector3()),box=new THREE.BoxGeometry(size.x,size.y,size.z),edges=new THREE.EdgesGeometry(box);box.dispose();return edges;},[bounds]);useEffect(()=>()=>geometry?.dispose(),[geometry]);return bounds&&geometry?<lineSegments position={bounds.getCenter(new THREE.Vector3())} geometry={geometry} renderOrder={8}><lineBasicMaterial color="#2d8f78" transparent opacity={.8} depthTest={false}/></lineSegments>:null;
}
function EndpointMarker({document,endpoint,color,onHover,onClick,label}:{document:CircuitDocument;endpoint:Endpoint;color:string;onHover?:(endpoint?:Endpoint)=>void;onClick?:(endpoint:Endpoint)=>void;label?:string}) {
  const component=document.components.find(c=>c.id===endpoint.component),definition=component&&COMPONENTS[component.type];if(!component||!definition)return null;const terminal=getComponentTerminals(component,definition).find(t=>t.id===endpoint.terminal);if(!terminal)return null;
  const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...terminalDirection(document,endpoint)));
  return <group position={terminalPosition(document,endpoint)} quaternion={orientation}>{onClick&&<mesh userData={{terminalId:endpoint.terminal,terminalMarker:true}} onPointerOver={e=>{e.stopPropagation();onHover?.(endpoint);}} onPointerOut={()=>onHover?.(undefined)} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onClick(endpoint);}}><sphereGeometry args={[.09,12,8]}/><meshBasicMaterial color={color} transparent opacity={.12} depthWrite={false}/></mesh>}<mesh position={[0,0,.032]} renderOrder={10} raycast={ignoreRaycast}><torusGeometry args={[.067,.009,6,24]}/><meshBasicMaterial color={color} depthTest={false}/></mesh>{label&&<Label label={label} selected position={[0,.24,.03]} width={Math.max(.7,Math.min(1.6,label.length*.07))}/>}</group>;
}
function PreviewLine({points,color}:{points:Vec3[];color:string}) {
  const object=useMemo(()=>{const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineDashedMaterial({color,dashSize:.075,gapSize:.045,transparent:true,opacity:.85,depthTest:false}),line=new THREE.Line(geometry,material);line.computeLineDistances();line.renderOrder=14;return line;},[points,color]);useEffect(()=>()=>{object.geometry.dispose();object.material.dispose();},[object]);return <primitive object={object}/>;
}
function RenderController({props,dragging,onDpr}:{props:WorkbenchProps;dragging:boolean;onDpr:(value:number)=>void}) {
  const {invalidate,gl,camera}=useThree(),stats=useRef({time:0,frames:0,renderMs:0,activeFrames:0,fastSamples:0,budget:0,dpr:1.5,reported:false,camera:new THREE.Vector3(),quaternion:new THREE.Quaternion()}),latest=useRef(props);useLayoutEffect(()=>{latest.current=props;},[props]);
  const quality=props.quality??'auto',animated=hasOperatingAnimation(props.document,props.result?.deviceStates),stateKey=JSON.stringify(Object.entries(props.result?.deviceStates??{}).map(([id,state])=>[id,state.energized,state.closed,state.tripped,state.level,state.direction,state.moving,state.contactLevel,state.lightOutputPower]));
  const publish=useCallback((fps:number,idle:boolean)=>{const metrics:WorkbenchMetrics={fps,drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,dpr:gl.getPixelRatio(),quality:latest.current.quality??'auto',idle};latest.current.onMetrics?.(metrics);window.dispatchEvent(new CustomEvent('electrical-lab-metrics',{detail:metrics}));latest.current.onFps(idle?0:fps);},[gl]);
  useEffect(()=>{stats.current.budget=performance.now()+450;invalidate();},[props.document,stateKey,props.view,props.selected,props.selectedPart,props.labels,props.tool,props.wireStart,props.pathFilter,props.guidanceEndpoints,props.meterReading,props.instrumentType,props.instrumentParams?.held,props.instrumentParams?.dialPosition,props.instrumentParams?.backlight,props.instrumentParams?.validReference,props.instrumentParams?.hazard,props.workshop,props.scenery,props.cameraMode,invalidate]);
  const maxDpr=props.touchLayout?1.25:quality==='high'?2:1.5;
  useEffect(()=>{const ratio=quality==='economy'?1:Math.min(maxDpr,window.devicePixelRatio||1);stats.current.dpr=ratio;stats.current.fastSamples=0;onDpr(ratio);invalidate();},[quality,maxDpr,onDpr,invalidate]);
  useEffect(()=>{if(animated||dragging)return;const timer=setTimeout(()=>publish(0,true),550);return()=>clearTimeout(timer);},[animated,dragging,stateKey,props.document,props.cameraCommand,publish]);
  useFrame(()=>{const capture=(window as Window&{__electricalGraphicsDiagnostics?:{frames:number[]}}).__electricalGraphicsDiagnostics;if(capture?.frames&&capture.frames.length<6000)capture.frames.push(performance.now());});
  useFrame((_,dt)=>{
    const now=performance.now(),sample=stats.current;
    const moved=sample.camera.distanceToSquared(camera.position)>1e-9||Math.abs(sample.quaternion.dot(camera.quaternion))<.999999;
    sample.camera.copy(camera.position);sample.quaternion.copy(camera.quaternion);
    if(moved)sample.budget=now+160;
    const busy=animated||dragging||now<sample.budget;
    // Skip the first interval after waking from on-demand sleep.
    if(sample.frames>0){sample.renderMs+=Math.min(dt,.25)*1000;sample.activeFrames++;}
    sample.frames++;
    if(!sample.time)sample.time=now;
    if(busy)invalidate();
    if(!sample.reported){sample.reported=true;publish(0,!busy);}
    if(busy&&(now-sample.time<=350||sample.frames<4))return;
    const fps=Math.round(sample.frames*1000/Math.max(1,now-sample.time));
    publish(busy?fps:0,!busy);
    if(quality==='auto'&&busy&&sample.activeFrames>=3){
      const next=adaptWorkbenchDpr(sample.dpr,Math.min(maxDpr,window.devicePixelRatio||1),sample.renderMs/sample.activeFrames,sample.fastSamples);
      sample.fastSamples=next.fastSamples;
      if(Math.abs(next.dpr-sample.dpr)>.025){sample.dpr=next.dpr;onDpr(next.dpr);}
    }else if(!busy)sample.fastSamples=0;
    sample.time=now;sample.frames=0;sample.renderMs=0;sample.activeFrames=0;
  });return null;
}
function Scene(props:WorkbenchProps&{routing:CircuitRoutes;routingPending:boolean;onDpr:(value:number)=>void}) {
  const {camera,gl,scene,get,invalidate}=useThree();
  const [dragging,setDragging]=useState(false),[hover,setHover]=useState<Endpoint>(),hoverRef=useRef<Endpoint|undefined>(undefined),[placement,setPlacement]=useState<Vec3>(),[pointer,setPointer]=useState<Vec3>(),drag=useRef<{id:string;offset:THREE.Vector3;position:Vec3}|null>(null),[nodes]=useState(()=>new Map<string,THREE.Group>()),latest=useRef(props);useLayoutEffect(()=>{latest.current=props;},[props]);
  const [touchMovePreview, setTouchMovePreview] = useState<{id:string;position:Vec3}>();
  const plane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,1,0),0),[]),bounds=useMemo(()=>sceneBounds(props.document,props.routing.routes),[props.document,props.routing.routes]),paths=useMemo(()=>tracePresentationPaths(props.document),[props.document]),filter=props.paths===false?'none':props.pathFilter??'all',chosen=props.document.components.find(c=>c.id===props.selected);
  const testPose=useMemo(()=>testerPose(props.document,props.routing,props.tool==='meter'&&props.instrumentType==='forktester'&&props.instrumentParams?.fork?props.selectedWire:undefined),[props.document,props.routing,props.tool,props.instrumentType,props.instrumentParams?.fork,props.selectedWire]);
  const cableTypes=useMemo(()=>new Map(props.document.cableRuns?.map(run=>[run.id,run.kind])),[props.document.cableRuns]);
  const components=useMemo(()=>props.document.components.map(c=>['multimeter','clamp','forktester'].includes(c.type)?{...c,params:{...c.params,...(c.type==='forktester'?props.instrumentParams:{}),reading:c.type==='forktester'&&props.instrumentType!=='forktester'?'—':props.meterReading}}:['source','source3'].includes(c.type)?{...c,params:{...c.params,studyVoltage:props.document.supply.voltage}}:c),[props.document.components,props.document.supply.voltage,props.meterReading,props.instrumentType,props.instrumentParams?.dialPosition,props.instrumentParams?.held,props.instrumentParams?.redOut,props.instrumentParams?.blackOut,props.instrumentParams?.validReference,props.instrumentParams?.signal,props.instrumentParams?.backlight,props.instrumentParams?.hazard]);
  const inspectingTester=props.tool==='meter'&&['focus-instrument','rear-instrument'].includes(props.cameraCommand.action);
  const register=useCallback((id:string,node:THREE.Group|null)=>{if(node)nodes.set(id,node);else nodes.delete(id);},[nodes]),registerInstrument=useCallback((node:THREE.Group|null)=>{if(node)nodes.set('@meter',node);else nodes.delete('@meter');},[nodes]),onSelect=useCallback((id:string,part?:string,detail?:string)=>latest.current.onSelect(id,part,detail),[]),onTerminal=useCallback((endpoint:Endpoint)=>latest.current.onTerminal(endpoint),[]);
  const terminalHover=useCallback((endpoint?:Endpoint)=>{if(endpointEquals(hoverRef.current,endpoint)||!hoverRef.current&&!endpoint)return;const next=endpoint?{...endpoint}:undefined;hoverRef.current=next;setHover(next);latest.current.onTerminalHover?.(next);},[]);
  useEffect(()=>{const endpoint=hoverRef.current,component=endpoint&&props.document.components.find(item=>item.id===endpoint.component);if(endpoint&&(!component||!COMPONENTS[component.type]?.terminals.some(terminal=>terminal.id===endpoint.terminal)))terminalHover(undefined);},[props.document.components,terminalHover]);
  // Actuator clicks operate controls; only the housing begins a placement drag.
  const down=useCallback((e:ThreeEvent<PointerEvent>,component:ComponentInstance)=>{const current=latest.current;if(e.pointerType==='touch'||current.tool!=='select'||current.mode!=='build'||e.button!==0)return;let hit:THREE.Object3D|null=e.object;while(hit){if(hit.userData.partId==='actuator')return;hit=hit.parent;}e.stopPropagation();const point=new THREE.Vector3();if(!e.ray.intersectPlane(plane,point))return;drag.current={id:component.id,offset:point.sub(new THREE.Vector3(...component.position)),position:component.position};setDragging(true);current.onMove(component.id,component.position,'start');(e.target as unknown as {setPointerCapture:(id:number)=>void}).setPointerCapture?.(e.pointerId);},[plane]);
  const previewMove = useCallback((next?: {id:string;position:Vec3}) => {
    setTouchMovePreview(next);
    invalidate();
  },[invalidate]);
  const commitTouchMove = useCallback((id:string,position:Vec3) => {
    const current=latest.current,component=current.document.components.find(item=>item.id===id);
    if (!current.touchMove || current.tool!=='select' || current.mode!=='build' || current.selected!==id || !component) return;
    current.onMove(id,component.position,'start');
    current.onMove(id,position,'end');
  },[]);
  const move=useCallback((e:ThreeEvent<PointerEvent>)=>{if(!drag.current)return;e.stopPropagation();const point=new THREE.Vector3();if(e.ray.intersectPlane(plane,point)){point.sub(drag.current.offset);const position=snapWorkbenchPoint(point.toArray() as Vec3);drag.current.position=position;latest.current.onMove(drag.current.id,position,'move');}},[plane]);const up=useCallback((e:ThreeEvent<PointerEvent>)=>{if(!drag.current)return;e.stopPropagation();latest.current.onMove(drag.current.id,drag.current.position,'end');drag.current=null;setDragging(false);(e.target as unknown as {releasePointerCapture:(id:number)=>void}).releasePointerCapture?.(e.pointerId);},[]);
  const endpoints=useMemo(()=>props.document.components.flatMap(c=>getComponentTerminals(c,COMPONENTS[c.type]).map(t=>({component:c.id,terminal:t.id}))),[props.document.components]),preview=useMemo(()=>{if(!props.wireStart)return null;const from=terminalPosition(props.document,props.wireStart),to=hover?terminalPosition(props.document,hover):pointer;if(!to)return null;return [from,[from[0],from[1],from[2]-.3] as Vec3,[to[0],to[1],to[2]-.3] as Vec3,to];},[props.document,props.wireStart,hover,pointer]);useEffect(()=>{const frame=requestAnimationFrame(()=>{terminalHover(undefined);setPlacement(undefined);});return()=>cancelAnimationFrame(frame);},[props.tool,props.document.id,terminalHover]);
  useEffect(()=>{
    // Read-only diagnostics for the installed application's own QA process.
    // Coordinates come from the live scene/camera, not a second renderer.
    if(!('electricalDesktop' in window))return;
    const report=(event:Event)=>{
      const rect=gl.domElement.getBoundingClientRect(),current=latest.current;camera.updateMatrixWorld(true);
      const wirePickingRequested=(event as CustomEvent<{wirePicking?:boolean}>).detail?.wirePicking===true;
      const describe=(component:ComponentInstance)=>{
        const root=nodes.get(component.id),parts:Record<string,number>={},terminals:Record<string,number>={},assets=new Set<string>(),detailLevels=new Set<string>();root?.updateWorldMatrix(true,true);
        root?.traverse(node=>{if(node.userData.assetKey){assets.add(String(node.userData.assetKey));if(node.userData.lod)detailLevels.add(String(node.userData.lod));}if(node.userData.terminalId)terminals[String(node.userData.terminalId)]=(terminals[String(node.userData.terminalId)]??0)+1;if(node instanceof THREE.Mesh){let owner:THREE.Object3D|null=node;while(owner&&!owner.userData.partId)owner=owner.parent;const part=String(owner?.userData.partId??'decorative');parts[part]=(parts[part]??0)+1;}});
        const projected=getComponentTerminals(component,COMPONENTS[component.type]).map(terminal=>{const point=new THREE.Vector3(...terminalPosition(current.document,{component:component.id,terminal:terminal.id})),screen=point.clone().project(camera);return {id:terminal.id,canonical:point.toArray(),screen:{x:rect.left+(screen.x+1)*rect.width/2,y:rect.top+(1-screen.y)*rect.height/2},inView:Math.abs(screen.x)<=1&&Math.abs(screen.y)<=1&&screen.z>=-1&&screen.z<=1,instances:terminals[terminal.id]??0};});
        const partScreens=Object.fromEntries(Object.keys(parts).map(part=>{const center=selectedPartBounds(component,part,root).getCenter(new THREE.Vector3()).project(camera);return [part,{x:rect.left+(center.x+1)*rect.width/2,y:rect.top+(1-center.y)*rect.height/2,inView:Math.abs(center.x)<=1&&Math.abs(center.y)<=1&&center.z>=-1&&center.z<=1}];}));
        const physicalTerminals:{id:string;position:number[]}[]=[];root?.traverse(node=>{if(node.userData.terminalId)physicalTerminals.push({id:String(node.userData.terminalId),position:node.getWorldPosition(new THREE.Vector3()).toArray()});});
        return {id:component.id,type:component.type,assetKeys:[...assets],detailLevels:[...detailLevels],parts,partScreens,terminals:projected,physicalTerminals};
      };
      const components=current.document.components.map(describe),instruments=current.tool==='meter'?[describe({id:'@meter',type:current.instrumentType??(current.meterMode==='current'?'clamp':'multimeter'),label:'Virtual instrument',position:[current.document.components[0]?.position[0]??-4,0,3],rotation:0,params:{reading:current.meterReading}})]:[];
      const wireMeshes=new Map<string,THREE.Mesh>();scene.updateMatrixWorld(true);scene.traverse(node=>{if(node instanceof THREE.Mesh&&typeof node.userData.wireId==='string')wireMeshes.set(node.userData.wireId,node);});
      const raycaster=new THREE.Raycaster(),pickable=current.tool!=='wire'&&(current.tool!=='meter'||current.meterMode==='current'),interactiveObjects=get().internal.interaction;
      const hitDescription=(hit:THREE.Intersection|undefined)=>{if(!hit)return undefined;let owner:THREE.Object3D|null=hit.object,partId:string|undefined,wireId:string|undefined;while(owner){if(typeof owner.userData.partId==='string'&&!partId)partId=owner.userData.partId;if(typeof owner.userData.wireId==='string'&&!wireId)wireId=owner.userData.wireId;owner=owner.parent;}return {name:hit.object.name,type:hit.object.type,wireId,partId,distance:hit.distance};};
      const wires=current.document.wires.map(wire=>{
        const mesh=wireMeshes.get(wire.id),positions=mesh?.geometry.getAttribute('position');
        if(!mesh||!positions)return {id:wire.id,pickPoints:[]};
        // Centres of the rendered tube's actual rings, excluding the duplicated seam vertex.
        // Expensive visibility raycasts run only for an explicit native picking QA request.
        const radialSegments=(mesh.geometry as THREE.TubeGeometry).parameters.radialSegments,ringWidth=radialSegments+1,ringCount=Math.floor(positions.count/ringWidth);
        const sampleCount=wirePickingRequested?24:8;
        const pickPoints=Array.from({length:sampleCount},(_,sample)=>{
          const ring=Math.min(ringCount-1,Math.max(0,Math.round((sample+.5)*(ringCount-1)/sampleCount))),point=new THREE.Vector3();
          for(let index=0;index<radialSegments;index++)point.add(new THREE.Vector3().fromBufferAttribute(positions,ring*ringWidth+index));
          point.divideScalar(radialSegments).applyMatrix4(mesh.matrixWorld);const projected=point.clone().project(camera),inView=Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&projected.z>=-1&&projected.z<=1;
          let frontmost=false,nearest:ReturnType<typeof hitDescription>,wireHit:ReturnType<typeof hitDescription>;if(wirePickingRequested&&pickable&&inView){raycaster.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);const first=raycaster.intersectObjects(interactiveObjects,true)[0];nearest=hitDescription(first);wireHit=hitDescription(raycaster.intersectObject(mesh,false)[0]);frontmost=first?.object===mesh;}
          return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2,inView,frontmost,...(wirePickingRequested?{nearest,wireHit}: {})};
        });return {id:wire.id,pickPoints};
      });
      const groundPoints=[-3,-1,1,3].map(x=>{const world:[number,number,number]=[x,0,0],screen=new THREE.Vector3(...world).project(camera);return {world,screen:{x:rect.left+(screen.x+1)*rect.width/2,y:rect.top+(1-screen.y)*rect.height/2},inView:Math.abs(screen.x)<=1&&Math.abs(screen.y)<=1&&screen.z>=-1&&screen.z<=1};});
      window.dispatchEvent(new CustomEvent('electrical-lab-scene',{detail:{circuitId:current.document.id,revision:current.document.revision,view:current.view,routingPending:current.routingPending,components,instruments,wires,wirePickingRequested,...(wirePickingRequested?{wirePickingDebug:{tool:current.tool,pickable,interactiveObjects:interactiveObjects.length,wireMeshes:wireMeshes.size}}:{}),groundPoints}}));
    };
    window.addEventListener('electrical-lab-scene-request',report);return()=>window.removeEventListener('electrical-lab-scene-request',report);
  },[camera,gl,nodes,scene,get]);
  return <><SceneLighting bounds={bounds} document={props.document} result={props.result} scenery={props.scenery} quality={props.quality} selected={props.selected}/><BenchStage bounds={bounds} scenery={props.scenery} quality={props.quality} grid={props.mode==='build'||props.tool==='place'} onPointerMove={e=>{if(props.tool==='place')setPlacement(snapWorkbenchPoint(e.point.toArray() as Vec3));if(props.tool==='wire'&&props.wireStart)setPointer([e.point.x,.08,e.point.z]);move(e);}} onPointerOut={()=>setPlacement(undefined)} onClick={e=>{if(props.tool==='place'){e.stopPropagation();props.onPlace(snapWorkbenchPoint(e.point.toArray() as Vec3));}}}/>
    {props.document.cableRuns?.map(run=>{const geometry=props.routing.cables?.get(run.id);
      const highlight=geometry && [...geometry.tails.keys()].some(id=>props.selectedWire===id || filter!=='all'&&filter!=='none'&&pathMatches(paths.get(id),filter));
      return geometry?<CableSheath key={run.id} run={run} geometry={geometry} highlight={!!highlight}
        onClick={props.onCable&&props.tool==='select'?()=>props.onCable?.(run.id):undefined}/>:null;})}
    {props.document.wires.map(wire=>{
      const single=props.routing.routes.get(wire.id),parts=wire.cable?props.routing.cables?.get(wire.cable.runId)?.tails.get(wire.id):single?[single]:undefined;
      const cableKind=wire.cable&&cableTypes.get(wire.cable.runId);
      const emphasis=pathMatches(paths.get(wire.id),filter),pickable=props.tool!=='wire'&&(props.tool!=='meter'||props.meterMode==='current');
      const mark=parts?.[0]?.[1],showMark=mark&&props.labels&&props.selectedWire===wire.id&&props.tool!=='meter';
      return <React.Fragment key={wire.id}>{parts?.map((points,i)=>points.length>=2?<Insulation key={i} role={wire.role} core={wire.cable?.core} radius={cableKind?coreRadius(cableKind):WIRE_RADIUS} points={testPose.sampled?.path===points?testPose.sampled.points:points} wireId={wire.id}
        selected={props.selectedWire===wire.id} emphasis={filter!=='none'&&emphasis} dim={filter!=='all'&&filter!=='none'&&!emphasis&&props.selectedWire!==wire.id}
        onClick={pickable?()=>props.onWire(wire.id):undefined}/>:null)}
        {showMark&&<Label selected position={[mark[0],mark[1]+.16,mark[2]]} width={1.1} label={wire.cable?CABLE_CORE_LABEL[wire.cable.core]+' · '+wire.role:wire.role+' conductor'}/>}
      </React.Fragment>;
    })}
    {components.map(component=>{const selected=component.id===props.selected||!!(component.params.gangGroup&&component.params.gangGroup===chosen?.params.gangGroup);return <EquipmentItem key={component.id} component={component} ways={filledWays(component,components)} state={props.result?.deviceStates[component.id]} onModelAvailability={props.onModelAvailability} selected={selected} view={selected?props.view:'normal'} labels={props.labels&&!inspectingTester} lowDetail={props.touchLayout?!selected||['wire','meter','place'].includes(props.tool):props.quality==='economy'&&!selected} preferLowAsset={props.touchLayout} onSelect={onSelect} onTerminal={onTerminal} register={register} onDown={down} onMove={move} onUp={up}/>;})}<SelectionOutline component={chosen} part={props.selectedPart} nodes={nodes} view={props.view}/>
    {(props.tool==='wire'||(props.tool==='meter'&&!inspectingTester&&props.meterMode!=='current'))&&endpoints.map(endpoint=><EndpointMarker key={`${endpoint.component}.${endpoint.terminal}`} document={props.document} endpoint={endpoint} color={endpointEquals(hover,endpoint)?'#ffd871':'#8dbeb7'} onHover={terminalHover} onClick={onTerminal} label={endpointEquals(hover,endpoint)?`${endpoint.component} · ${endpoint.terminal}`:undefined}/>)}{(props.tool==='wire'||props.tool==='meter'||props.view!=='normal'||props.selectedPart==='terminals')&&!inspectingTester&&props.guidanceEndpoints?.map(endpoint=><EndpointMarker key={'guide'+endpoint.component+endpoint.terminal} document={props.document} endpoint={endpoint} color="#31c9a0" label={`Next: ${endpoint.terminal}`}/>)}{props.wireStart&&<EndpointMarker document={props.document} endpoint={props.wireStart} color="#ffca58" label={`From ${props.wireStart.terminal}`}/>} {preview&&<PreviewLine points={preview} color={hover?'#e9bc56':'#aaccc5'}/>}
    {placement&&props.tool==='place'&&props.placeType&&COMPONENTS[props.placeType]&&(()=>{const definition=COMPONENTS[props.placeType!],clear=placementClear(props.document,props.placeType!,placement);return <PlacementGhost position={placement} size={definition.size} label={`${definition.name} · ${clear?'click to place':'equipment overlaps'}`} color={clear?'#5ad0aa':'#e5a05b'}/>;})()}
    {touchMovePreview&&chosen?.id===touchMovePreview.id&&props.touchMove&&<PlacementGhost position={touchMovePreview.position} size={COMPONENTS[chosen.type].size} label={`Move ${chosen.label}`} color="#5ad0aa" rotation={chosen.rotation}/>}
    {props.tool==='meter'&&<group ref={registerInstrument} position={testPose.position} quaternion={testPose.rotation}>{props.workshop?<group onClick={e=>{e.stopPropagation();props.onSelect('@meter','actuator');}}><ToolGeometry type={props.workshop.type} jawClosed={props.workshop.applied}/><MaterialSample visual={props.workshop}/></group>:<Equipment component={{id:'@meter',type:props.instrumentType??(props.meterMode==='current'?'clamp':'multimeter'),label:'Virtual instrument',position:[0,0,0],rotation:0,params:{reading:props.meterReading,...props.instrumentParams}}} definition={COMPONENTS[props.instrumentType??(props.meterMode==='current'?'clamp':'multimeter')]} selected={false} view="normal" showLabels={false} onModelAvailability={props.onModelAvailability} lowDetail={props.touchLayout&&!inspectingTester} preferLowAsset={props.touchLayout} onPart={part=>props.onSelect('@meter',part)} onTerminal={()=>{}}/>}</group>}{props.tool==='meter'&&props.instrumentType==='forktester'&&props.probes.map((endpoint,index)=>endpoint&&<TestLead key={'lead'+index} doc={props.document} endpoint={endpoint} origin={testPose.position} rotation={testPose.rotation} negative={index===1}/>)}{props.tool==='meter'&&!props.workshop&&props.probes.map((endpoint,index)=>endpoint&&<EndpointMarker key={'probe'+index} document={props.document} endpoint={endpoint} color={index===0?'#e64c52':'#172127'} label={`${index===0?'Red':'Black'} probe`}/>)}
    <CameraNavigation document={props.document} routing={props.routing} routingPending={props.routingPending} selected={props.selected} selectedPart={props.selectedPart} selectedWire={props.selectedWire} cameraCommand={props.cameraCommand} dragging={dragging} nodes={nodes} mode={props.cameraMode} speed={props.cameraSpeed} tool={props.tool} touchMove={props.mode==='build'&&props.touchMove} onTouchMovePreview={previewMove} onTouchMoveCommit={commitTouchMove}/><RenderController props={props} dragging={dragging} onDpr={props.onDpr}/><GraphicEffects scenery={props.scenery} quality={props.quality}/></>;
}
function PlacementGhost({position,size,label,color,rotation=0}:{position:Vec3;size:Vec3;label:string;color:string;rotation?:number}) {
  return <group position={position} rotation={[0,rotation,0]}>
    <mesh position={[0,size[1]/2,0]} raycast={ignoreRaycast}><boxGeometry args={size}/><meshBasicMaterial color={color} transparent opacity={.12} depthWrite={false}/></mesh>
    <mesh position={[0,size[1]/2,0]} raycast={ignoreRaycast}><boxGeometry args={size}/><meshBasicMaterial color={color} wireframe transparent opacity={.65}/></mesh>
    <Label position={[0,size[1]+.3,0]} label={label} selected width={2.4}/>
  </group>;
}
function CanvasRecovery({onContextLost}:{onContextLost:(lost:boolean)=>void}) {
  const {gl,invalidate}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onContextLost(true);};
    const restored=()=>{onContextLost(false);invalidate();};
    canvas.addEventListener('webglcontextlost',lost);
    canvas.addEventListener('webglcontextrestored',restored);
    return ()=>{
      canvas.removeEventListener('webglcontextlost',lost);
      canvas.removeEventListener('webglcontextrestored',restored);
    };
  },[gl,invalidate,onContextLost]);
  return null;
}
class CanvasBoundary extends React.Component<{children:React.ReactNode;onRetry:()=>void;onListView?:()=>void},{error:boolean}> {state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="canvas-error" role="alert"><h3>The 3D view could not start</h3><p>This view needs WebGL 2. Your saved circuit is preserved.</p>{this.props.onListView&&<button type="button" onClick={this.props.onListView}>Use equipment list</button>}<button type="button" onClick={this.props.onRetry}>Retry 3D view</button></div>:this.props.children;}}
export default function Workbench(props:WorkbenchProps) {
  // Canvas reapplies its DPR prop on a parent render, including a new FPS report.
  const [pixelRatio,setPixelRatio]=useState(1);
  const {routing,pending,error}=useCircuitRouting(props.document,createRoutingWorker);
  const [contextLost,setContextLost]=useState(false),[canvasKey,setCanvasKey]=useState(0);
  const [missingModels,setMissingModels]=useState<Set<string>>(()=>new Set());
  const availability=useCallback((id:string,unavailable:boolean)=>setMissingModels(previous=>{
    if(previous.has(id)===unavailable)return previous;
    const next=new Set(previous);
    if(unavailable)next.add(id);else next.delete(id);
    return next;
  }),[]);
  const retry=()=>{setContextLost(false);setCanvasKey(key=>key+1);};
  const quality=props.touchLayout&&(!props.quality||props.quality==='auto')?'economy':props.quality;
  return <><CanvasBoundary key={canvasKey} onRetry={retry} onListView={props.onListView}><Canvas events={workbenchEvents} shadows={quality!=='economy'} frameloop="demand" dpr={pixelRatio} camera={{position:[6,8,12],fov:43,near:.025,far:140}} gl={{antialias:!props.touchLayout,powerPreference:props.touchLayout?'default':'high-performance'}} onCreated={({gl})=>{gl.shadowMap.type=THREE.PCFSoftShadowMap;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;}}><CanvasRecovery onContextLost={setContextLost}/><Suspense fallback={null}><Scene {...props} onDpr={setPixelRatio} onModelAvailability={availability} quality={quality} routing={routing} routingPending={pending}/></Suspense></Canvas></CanvasBoundary>
    {!contextLost&&missingModels.size>0&&<div className="model-download-notice" role="status"><span>{missingModels.size===1?'A 3D model could not open.':missingModels.size+' models could not open.'}</span> <button type="button" onClick={retry}>Retry models</button> {props.onListView&&<button type="button" onClick={props.onListView}>Equipment list</button>}</div>}
    {contextLost&&<div className="canvas-error" role="status"><h3>Graphics paused</h3><p>Your circuit is still here. Wait for the 3D view to recover or restart it.</p>{props.onListView&&<button type="button" onClick={props.onListView}>Use equipment list</button>}<button type="button" onClick={retry}>Restart 3D view</button></div>}
    {(pending||error)&&<div className="routing-status" role="status" style={{position:'absolute',left:12,bottom:42,zIndex:8,maxWidth:'calc(100% - 24px)',padding:'6px 10px',borderRadius:6,background:'#293547f2',color:error?'#f6ddb1':'#dce7e7',fontSize:12,pointerEvents:'none'}}>{error??'Routing wires…'}</div>}
    {!!routing.issues.length&&<details className="routing-notice" role="status" style={{position:'absolute',left:12,right:12,bottom:42,zIndex:8,maxHeight:160,overflowY:'auto',overflowWrap:'anywhere',whiteSpace:'normal',padding:'8px 11px',borderRadius:6,border:'1px solid #ad8a4e',background:'#293547f2',color:'#f6ddb1',fontSize:12,lineHeight:1.45}}><summary style={{cursor:'pointer',fontWeight:600}}>Routing needs attention: {routing.issues.length} {routing.issues.length===1?'wire':'wires'}</summary><p style={{margin:'6px 0'}}>Move equipment or adjust the listed bends to make room. Select a wire below to inspect it.</p><ul style={{margin:0,paddingLeft:18}}>{routing.issues.map((issue,index)=>{const wire=props.document.wires.find(item=>item.id===issue.wire),label=wire?`${wire.from.component}.${wire.from.terminal} → ${wire.to.component}.${wire.to.terminal}`:issue.wire;return <li key={`${issue.wire}-${index}`} style={{marginTop:4}}><button type="button" onClick={()=>props.onWire(issue.wire)} style={{padding:0,border:0,background:'none',color:'#ffe8b5',textDecoration:'underline',cursor:'pointer',whiteSpace:'normal',overflowWrap:'anywhere',textAlign:'left'}}>{label}</button>: {issue.message}</li>;})}</ul></details>}
  </>;
}
