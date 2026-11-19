'use client';
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { Canvas,useFrame,useThree,type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { ArrowUp,ArrowLeft,ArrowRight,ArrowDown,Footprints,LocateFixed,PanelTopOpen } from 'lucide-react';
import { mountScale,mountRoll,filledWays } from '../../lib/board-assembly';
import { DRAWING_INK } from '../../lib/installation-drawing';
import { installedWireRoute } from '../../lib/house-installation';
import { Line } from '@react-three/drei';
import { COMPONENTS } from '../../lib/components';
import { Equipment, type EquipmentProps } from '../../lib/Equipment';
import { semanticOwner } from '../../lib/blender-model';
import { getComponentTerminals } from '../../lib/terminal-layout';
import { walkStep,type JobSite,type SiteItem } from '../../lib/job-site';
import { HOME_ROOMS, STAIR_EYE, STAIR_LANDING, homeRoomAt, homeVisit, stairFloor } from '../../lib/home-floorplan';
import { serviceRoomAt,serviceVisit } from '../../lib/service-floorplan';
import type { CircuitDocument,ComponentInstance,Endpoint,SimulationResult,Vec3 } from '../../lib/types';
import InstallationRoom from './InstallationRoom';
import BellCupboard from './BellCupboard';
import {KitchenDriver,StripChannel,StripTails} from './KitchenLighting';
import {KITCHEN_LIGHTS as kitchen,stripLead} from '../../lib/kitchen-lighting';
import {CORE_COLOUR} from '../../lib/cables';
import {BELL_CUPBOARD} from '../../lib/bell-cupboard';
import SiteCablePeek from './SiteCablePeek';
import SiteMeterPads,{type SiteMeter} from './SiteMeterPads';
import {padCamera,type SiteTestStrip} from '../../lib/site-meter';
import { BATTEN_FILAMENT, CUPBOARD_HINGE, CUPBOARD_SWING, fixturePoint, installedTerminalPoint,TAPE_SECTION_LENGTH, TAPE_SECTIONS } from '../../lib/site-fixtures';

export interface SitePose {position:Vec3;yaw:number;pitch:number}
interface Rig {keys:Set<string>; turn:[number,number];zoom:number; wake:()=>void; moved:boolean; pose?:SitePose}
interface Props {
  site:JobSite; doc:CircuitDocument; result?:SimulationResult; selected?:string; terminalId?:string; wire?:string; touch:boolean; tool:string;
  jump:{id:number;component?:string}; pose:React.MutableRefObject<SitePose|undefined>; showWallSwitch?:boolean;
  testStrips:SiteTestStrip[]; meter?:SiteMeter; openMeter:(component?:string)=>void;
  onPeek:(id?:string)=>void;onPlan:(wire:string)=>void;onExplore:()=>void;
  onPart:(id:string,part:string)=>void;onTerminal:(endpoint:Endpoint)=>void;onFocus:(id:string)=>void;onService:(id:string)=>void;onList:()=>void;
}
function InstalledFixture({item, equipment, cupboardDoor, optical, pin,onTouchPick,trace,probeMode}:{
  item:SiteItem;equipment:EquipmentProps;cupboardDoor:boolean;optical:number;pin?:{id:string;anchor:Vec3};onTouchPick:(event:ThreeEvent<PointerEvent>)=>void;trace:boolean;probeMode:boolean;
}){
  const {component:c,definition:def,state}=equipment;
  const {fixture,position}=item;
  const scale=fixture?.scale??[item.scale,item.scale,item.scale] as Vec3;
  const rotation=new THREE.Euler(fixture?.tilt??0,item.rotation,fixture?.roll??0,'YXZ');
  const count=fixture?.tape?TAPE_SECTIONS:1;
  // The two halves share one component and two terminals. Only the magnet rides the leaf.
  const magnet=cupboardDoor&&<group position={CUPBOARD_HINGE} rotation={[0,c.params.closed?CUPBOARD_SWING:0,0]}>
    <group position={position.map((x,i)=>x-CUPBOARD_HINGE[i]) as Vec3} rotation={rotation} scale={[.011/.318,scale[1],scale[2]]}>
      <Equipment {...equipment} animate={false} contactPiece="magnet" />
    </group>
  </group>;
  const hasLight=['lamp','led','emergency','cctstrip'].includes(c.type);
  const illuminated=optical>0&&state?.energized&&hasLight;
  const emitter:Vec3=fixture?.tape?[0,fixture.tapeProfile?kitchen.profileZ-position[2]:0,.027]:fixture?.batten
    ? BATTEN_FILAMENT.map((axis,i)=>axis*scale[i]) as Vec3
    : [0,def.size[1]*scale[1]*.65,.055];
  const warm=Number(state?.warmWatts??0),cool=Number(state?.coolWatts??0);
  const tint=useMemo(()=>new THREE.Color('#ffe9bd').lerp(new THREE.Color('#d9eaff'),cool/Math.max(.001,warm+cool)),[warm,cool]);
  const touched=useRef<{id:number;key:string}|undefined>(undefined);
  const point=(e:ThreeEvent<PointerEvent>)=>{const o=semanticOwner(e.object);return o.terminal??o.part??'body';};
  return <group userData={{siteComponent:item.id}}
    onPointerDown={e=>{if(e.pointerType==='touch'){e.stopPropagation();touched.current={id:e.pointerId,key:point(e)};}}}
    onPointerCancel={()=>{touched.current=undefined;}}
    onPointerUp={e=>{
      const start=touched.current;touched.current=undefined;
      if(e.pointerType!=='touch'||start?.id!==e.pointerId||start.key!==point(e))return;
      e.stopPropagation();onTouchPick(e);
      const owner=semanticOwner(e.object);
      if(owner.terminal){
        if(probeMode&&fixture?.tape){
          const pad=getComponentTerminals(c,def).find(t=>t.id===owner.terminal);
          if(!pad||e.point.distanceTo(new THREE.Vector3(...installedTerminalPoint(item,c,pad)))>.003)return;
        }
        equipment.onTerminal(owner.terminal);
      }else equipment.onPart(owner.part??'body',owner.detail);
    }}>
    {magnet}
    {fixture?.bellService&&<BellCupboard part={fixture.bellService} trace={trace} select={()=>equipment.onPart('body')}/>}
    {fixture?.tapeProfile&&<StripChannel x={position[0]} open={trace||equipment.selected} level={illuminated?optical:0} tint={c.type==='cctstrip'?tint:new THREE.Color('#ffead0')} select={()=>equipment.onPart('cover')}/>}
    <group position={position} rotation={rotation}>
      {fixture?.kitchenDriver?<KitchenDriver volts={Number(c.params.outputVoltage??24)} open={trace||equipment.selected} choose={()=>equipment.onPart('body')} pick={equipment.onTerminal}/>:Array.from({length:count},(_,i)=><group key={i} position={[(i-(count-1)/2)*TAPE_SECTION_LENGTH,0,0]} scale={scale}>
        <group rotation={[0,0,mountRoll(c)]} scale={mountScale(c)}>
          <Equipment {...equipment} onTerminal={probeMode&&i>0?()=>{}:equipment.onTerminal} animate={!cupboardDoor} contactPiece={cupboardDoor?'reed':undefined} />
        </group>
      </group>)}
      {illuminated&&<pointLight position={emitter} color={c.type==='cctstrip'?tint:'#fff0d0'} intensity={.34*optical} distance={2.9}/>}
    </group>
    {pin&&!(probeMode&&fixture?.tape)&&<mesh position={installedTerminalPoint(item,c,pin)} renderOrder={15} raycast={()=>{}}>
      <sphereGeometry args={[Math.max(.0018,Math.min(.008,.065*item.scale)),12,8]}/><meshBasicMaterial color="#ffb34a" depthTest={false}/>
    </mesh>}
  </group>;
}
function WireTrace({doc,site,id}:{doc:CircuitDocument;site:JobSite;id?:string}){
  const wire=doc.wires.find(w=>w.id===id);
  const points=useMemo(()=>wire&&installedWireRoute(doc,site,wire),[doc,site,wire]);
  if(!wire||!points||points.length<2)return null;
  return <group>
    <Line points={points} color="#fff8e4" lineWidth={5} renderOrder={24} depthTest={false} depthWrite={false} raycast={()=>{}}/>
    <Line points={points} color={DRAWING_INK[wire.role]} lineWidth={2.5} renderOrder={25} depthTest={false} depthWrite={false} raycast={()=>{}}/>
    {[points[0],points[points.length-1]].map((p,i)=><mesh key={i} position={p} renderOrder={26} raycast={()=>{}}>
      <sphereGeometry args={[.0035,12,8]}/><meshBasicMaterial color="#f5bc53" depthTest={false} depthWrite={false}/>
    </mesh>)}
  </group>;
}
function aim(item:SiteItem|undefined,id:number|undefined,close=false,height=.15,touch=false):SitePose{
  if(id===9&&!close&&item?.id==='near')return {position:[-1.86,STAIR_EYE,2.40],yaw:-.31,pitch:touch?-.12:.01};
  const pose=frontView(item,id,close,height,touch);
  if(!item?.rotation)return pose;
  const [x,y,z]=item.position,dx=pose.position[0]-x,dz=pose.position[2]-z,angle=item.rotation;
  return {position:[x+dx*Math.cos(angle)+dz*Math.sin(angle),pose.position[1],z+dz*Math.cos(angle)-dx*Math.sin(angle)],yaw:pose.yaw+angle,pitch:pose.pitch};
}
function frontView(item:SiteItem|undefined,id:number|undefined,close:boolean,height:number,touch:boolean):SitePose{
  const p=item?.position??[0,1.3,-2.5];
  if(close&&item?.fixture?.kitchenDriver){
    return touch?{position:[p[0],p[1]+.49,p[2]+1.20],yaw:0,pitch:-.38}
      :{position:[p[0],p[1]+.34,p[2]+.48],yaw:0,pitch:-.59};
  }
  if(close&&item?.fixture?.tapeProfile){
    return {position:[p[0]-.251,kitchen.bottom-.128,kitchen.profileZ+.109],yaw:0,pitch:.83};
  }
  if(item?.fixture?.bellService){
    const b=BELL_CUPBOARD,d=touch?.99:.64;
    if(close&&item.fixture.bellService==='protect')return {position:[b.x-.008,b.y+.032,b.z+.32],yaw:.07,pitch:-.12};
    return {position:[b.x+.15+d*.13,b.y+.14,b.z+d],yaw:.13,pitch:-.14};
  }
  if(close&&item?.fixture?.hallChime)return {position:[p[0]-.11,p[1]+.13,p[2]+.39],yaw:-.27,pitch:-.13};
  if(close&&item?.fixture?.bellPush)return {position:[p[0]+.024,p[1]+.05,p[2]+.23],yaw:.10,pitch:-.08};
  if(id===24&&item?.id==='shaver')return {position:[p[0]-.09,p[1]+.098,p[2]+(close?.31:.51)],yaw:close?-.27:-.17,pitch:-.03};
  if(item?.fixture?.board){
    const distance=height*(close?1.63:2.28);
    return {position:[p[0]+distance*.13,p[1]+height*.53,p[2]+distance],yaw:.13,pitch:-.01};
  }
  if(!close&&id===7&&item?.id==='switch')return {position:[p[0]-.09,p[1]+.37,p[2]+1.22],yaw:-.24,pitch:0};
  if(!close&&(id===18||id===19)&&item?.id==='socket-a')
    return {position:[-4.03,1.37,-4.95],yaw:.47,pitch:-.23};
  if(close&&item?.fixture?.flushPlate)return {position:[p[0]+.115,p[1]+.075,p[2]+.365],yaw:.30,pitch:-.08};
  if(close&&item?.fixture?.batten)return {position:[p[0]-.155,p[1]+.085,p[2]+.34],yaw:-.43,pitch:-.045};
  if(close&&item?.fixture?.tape&&item.fixture.tilt)return {position:[p[0]-.08,p[1]-.24,p[2]+.43],yaw:-.17,pitch:.49};
  if(!close&&id===66)return {position:[-4.24,1.30,touch?.16:-1.07],yaw:0,pitch:.01};
  if(!close&&id!==undefined&&[13,68,69].includes(id))return {position:[-4.97,1.32,-.89],yaw:-.28,pitch:.08};
  if(!close&&id===65)return {position:[-4.14,1.76,-.88],yaw:.30,pitch:.08};
  if(!close&&id===80)return {position:[.56,1.65,4.64],yaw:-.29,pitch:.04};
  if(!close&&height<.40&&item?.room!==3)return {position:[p[0]-.35,Math.max(1.34,p[1]+.28),p[2]+1.63],yaw:-.20,pitch:p[1]>.95?-.085:-.36};
  const distance=close?Math.max(.32,Math.min(1.20,height*2.7)):item?.room===3?1.58:1.26;
  return {position:[p[0]+distance*.07,p[1]+height*.65+.025,p[2]+distance],yaw:.07,pitch:-.04};
}
function CameraRig({rig,walking,target,pose,jobKey,focusId,site,onRoom,wallSwitch,wallButton}:{focusId:number;site:JobSite;onRoom:(room:number)=>void;rig:Rig;walking:boolean;target:SitePose;pose:Props['pose'];jobKey:string;wallSwitch?:THREE.Vector3;wallButton:React.RefObject<HTMLButtonElement|null>}){
  const {camera,invalidate,size}=useThree();
  const screenPoint=useMemo(()=>new THREE.Vector3(),[]);
  const roomRef=useRef(-1);const position=useRef(new THREE.Vector3()),rotation=useRef({yaw:0,pitch:0});
  useLayoutEffect(()=>{rig.wake=invalidate;return()=>{rig.wake=()=>{};rig.keys.clear();};},[invalidate,rig]);
  useLayoutEffect(()=>{roomRef.current=-1;},[jobKey]);
  const {position:[x,y,z],yaw,pitch}=target;
  useLayoutEffect(()=>{position.current.set(x,y,z);rotation.current={yaw,pitch};rig.turn=[0,0];rig.zoom=0;rig.moved=false;invalidate();},[x,y,z,yaw,pitch,focusId,jobKey,invalidate,rig]);
  useFrame((_,dt)=>{
    const p=position.current,r=rotation.current,keys=rig.keys;
    if(rig.zoom||rig.turn[0]||rig.turn[1]||walking)rig.moved=true;
    r.yaw-=rig.turn[0]*.003;r.pitch=Math.max(-1.18,Math.min(1.18,r.pitch-rig.turn[1]*.003));rig.turn=[0,0];
    const fwd=(Number(keys.has('up'))-Number(keys.has('down')))*(walking?1:0);
    const side=(Number(keys.has('right'))-Number(keys.has('left')))*(walking?1:0);
    const distance=Math.min(dt,.045)*1.8/Math.max(1,Math.hypot(fwd,side));
    const travel=distance*fwd+rig.zoom;rig.zoom=0;
    const dx=Math.cos(r.yaw)*side*distance-Math.sin(r.yaw)*travel,dz=-Math.sin(r.yaw)*side*distance-Math.cos(r.yaw)*travel;
    if(dx||dz){const next=walkStep([p.x,p.y,p.z],dx,dz,site);p.set(...next);}
    if(walking){
      const stair=site.building.rooms[1]==='Stair hall';
      p.y=STAIR_EYE+(stair?stairFloor(p.x,p.z):0);
      const room=site.kind==='home'?homeRoomAt(p.x,p.z,stair):serviceRoomAt(site.kind,p.x,p.z);if(room!==roomRef.current){roomRef.current=room;onRoom(room);}
    }
    camera.position.copy(p);camera.rotation.order='YXZ';camera.rotation.set(r.pitch,r.yaw,0,'YXZ');camera.updateMatrixWorld();
    const button=wallButton.current;
    if(button&&wallSwitch){
      screenPoint.copy(wallSwitch).project(camera);
      const x=(screenPoint.x+1)*size.width/2,y=(1-screenPoint.y)*size.height/2;
      button.hidden=rig.moved||screenPoint.z< -1||screenPoint.z>1||x<22||x>size.width-22||y<22||y>size.height-22;
      if(!button.hidden)button.style.transform=`translate(${x-22}px, ${y-22}px)`;
    }
    pose.current={position:[p.x,p.y,p.z],...r};
    if(walking&&keys.size)invalidate();
  });
  return null;
}
function ContextRecovery({onChange}:{onChange:(lost:boolean)=>void}){
  const {gl}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{
      event.preventDefault();
      if(!canvas.isConnected)return;
      // GPU handles belong to this context. Release them before the driver restores it.
      gl.dispose();
      onChange(true);
    };
    const restored=()=>{if(canvas.isConnected)onChange(false);};
    canvas.addEventListener('webglcontextlost',lost);
    canvas.addEventListener('webglcontextrestored',restored);
    return ()=>{canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);};
  },[gl,onChange]);
  return null;
}
class SiteBoundary extends React.Component<{children:React.ReactNode;onList:()=>void},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="site-unavailable"><b>The 3D site could not open</b><button onClick={this.props.onList}>Use equipment list</button></div>:this.props.children;}
}
const directions=[['up',ArrowUp],['left',ArrowLeft],['down',ArrowDown],['right',ArrowRight]] as const;
const keyMap:Record<string,string>={KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
export default function JobSiteView({site,doc,result,selected,terminalId,wire,touch,tool,jump,pose,onPart,onTerminal,onFocus,onService,onList,showWallSwitch,onPeek,onPlan,onExplore,testStrips,meter,openMeter}:Props){
  const rig=useMemo<Rig>(()=>({keys:new Set(),turn:[0,0],zoom:0,moved:false,wake:()=>{}}),[]);
  const wallButton=useRef<HTMLButtonElement>(null);
  const lastTouchPick=useRef<{x:number;y:number;at:number}|undefined>(undefined);
  const [walkRoom,setWalkRoom]=useState(site.room);const [walking,setWalking]=useState(false),[lost,setLost]=useState(false),[loadedKey,setLoadedKey]=useState(0);

  const recoverGraphics=useCallback((paused:boolean)=>{setLost(paused);if(!paused)setLoadedKey(n=>n+1);},[]);
  const [unavailable,setUnavailable]=useState<Set<string>>(()=>new Set());
  const modelAvailability=useCallback((id:string,missing:boolean)=>setUnavailable(previous=>{
    if(previous.has(id)===missing)return previous;
    const next=new Set(previous);if(missing)next.add(id);else next.delete(id);return next;
  }),[]);
  const input=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,{x:number;y:number;startX:number;startY:number}>()),blockTap=useRef(false);
  const selectedId=selected??site.first;
  const jobKey=site.kind+':'+(doc.lessonId??doc.id);
  const stair=doc.lessonId===9;
  const [visit,setVisit]=useState<{room:number;job:string;jump:number}>();
  const meterStrip=meter?testStrips.find(strip=>strip.component.id===jump.component):undefined;
  const meterTarget=meterStrip?.component.id;
  const roomVisit=visit?.job===jobKey&&visit.jump===jump.id?visit:undefined;
  const roomTarget=useMemo(()=>{
    if(roomVisit){const view=site.kind==='home'?homeVisit(roomVisit.room,stair):serviceVisit(site,roomVisit.room);if(view)return view;}
    const id=jump.component??site.first,item=site.items.find(e=>e.id===id),c=doc.components.find(c=>c.id===id);
    return pose.current??aim(item,doc.lessonId,!!jump.component,item&&c?COMPONENTS[c.type].size[1]*item.scale:undefined,touch);
  },[jobKey,jump.id,loadedKey,roomVisit,touch]);
  const target=meterStrip?padCamera(meterStrip):roomTarget;
  const stop=useCallback(()=>{rig.keys.clear();pointers.current.clear();blockTap.current=true;},[rig]);
  useEffect(()=>{window.addEventListener('blur',stop);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    function release(e:PointerEvent){pointers.current.delete(e.pointerId);}
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);stop();};},[stop]);
  useEffect(()=>{setWalking(false);stop();},[jump.id,jobKey,tool,stop]);
  useEffect(()=>{setWalkRoom(site.room);},[jobKey,site.room]);
  function toggleWalk(){stop();if(!walking&&touch)onExplore();setWalking(!walking);rig.wake();input.current?.focus({preventScroll:true});}
  function jumpTo(id:string){stop();if(touch)onExplore();setWalking(false);onFocus(id);}
  function visitRoom(value:string){
    const room=Number(value.slice(5));
    if(site.kind==='home'?!homeVisit(room,stair):!serviceVisit(site,room))return;
    stop();if(touch)onExplore();setWalkRoom(room);setVisit({room,job:jobKey,jump:jump.id});setWalking(true);
    input.current?.focus({preventScroll:true});
  }
  const fixtureMap=new Map(doc.components.map(c=>[c.id,c]));
  const tails=useMemo(()=>site.items.filter(i=>i.fixture?.tapeProfile).flatMap(item=>{
    const c=doc.components.find(part=>part.id===item.id);if(!c)return [];
    const pads=getComponentTerminals(c,COMPONENTS[c.type]);
    return doc.wires.flatMap(w=>[w.from,w.to].filter(e=>e.component===c.id).flatMap(e=>{
      const pad=pads.find(t=>t.id===e.terminal);if(!pad)return [];
      const points=stripLead(installedTerminalPoint(item,c,pad),item.position[0],pad.id);
      return [{points,id:w.id+'-'+c.id+'-'+pad.id,colour:w.cable?CORE_COLOUR[w.cable.core]:DRAWING_INK[w.role]}];
    }));
  }),[doc,site]);
  const selectedItem=site.items.find(s=>s.id===selectedId);
  const traced=doc.wires.find(w=>w.id===wire);
  const tracedIds=traced?[traced.from.component,traced.to.component]:[];
  const visible=site.items.filter(item=>fixtureMap.has(item.id));
  const rocker=site.items.find(item=>item.id==='switch'),wallControl=fixtureMap.get('switch');
  const wallSwitch=rocker&&wallControl&&showWallSwitch&&!walking&&!lost&&!jump.component&&(tool==='select'||tool==='inspect')
    ? new THREE.Vector3(...fixturePoint(rocker.position,rocker.scale,rocker.fixture,wallControl,[0,COMPONENTS.switch.size[1]/2,.20])):undefined;
  return <div className="jobsite" data-site={site.kind}>
    <div className="site-camera" ref={input} tabIndex={0} aria-label={walking?'Walk around the site. Use WASD or the movement pad.':'Installation view. Choose equipment or enter Walk.'}
      onKeyDown={e=>{if(e.key==='Escape'){stop();setWalking(false);}const key=keyMap[e.code];if(walking&&key){e.preventDefault();rig.keys.add(key);rig.wake();}}}
      onKeyUp={e=>{rig.keys.delete(keyMap[e.code]);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))stop();}}
      onPointerDownCapture={e=>{lastTouchPick.current=undefined;if(!(e.target instanceof Element&&e.target.closest('button')))e.currentTarget.focus({preventScroll:true});blockTap.current=(walking&&!stair)||pointers.current.size>0||e.button!==0;
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});}}
      onPointerMoveCapture={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;
        if(Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>5)blockTap.current=true;
        if(pointers.current.size===2){const other=[...pointers.current.entries()].find(([k])=>k!==e.pointerId)![1];const diff=Math.hypot(e.clientX-other.x,e.clientY-other.y)-Math.hypot(old.x-other.x,old.y-other.y);rig.zoom+=diff*.003;}
        else if(blockTap.current){rig.turn[0]+=dx;rig.turn[1]+=dy;}
        old.x=e.clientX;old.y=e.clientY;rig.wake();}}
      onPointerCancelCapture={e=>{pointers.current.delete(e.pointerId);blockTap.current=true;}} onClickCapture={e=>{
        const picked=lastTouchPick.current;
        const duplicate=picked&&performance.now()-picked.at<900&&Math.hypot(e.clientX-picked.x,e.clientY-picked.y)<10;
        if(e.detail&&(blockTap.current||duplicate)){e.stopPropagation();e.preventDefault();}
      }}
      onWheel={e=>{rig.zoom+=Math.max(-.18,Math.min(.18,-e.deltaY*.001));rig.wake();}}>
      <SiteBoundary key={loadedKey} onList={onList}><Canvas shadows={!touch} frameloop="demand" dpr={touch?1:[1,1.5]} camera={{fov:49,near:.012,far:55}} gl={{antialias:!touch,powerPreference:'default'}}
        onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.99;}}>
        <ContextRecovery onChange={recoverGraphics}/>{!lost&&<><color attach="background" args={['#cddedd']}/><hemisphereLight args={['#edf3ff','#b0a697',.88]}/>
        <directionalLight castShadow={!touch} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-.0006} shadow-normalBias={.0015} position={[-2.6,2.7,1.3]} intensity={1.12} color="#fff6e7"/>
        <directionalLight position={[-4,2,1]} intensity={.27} color="#c2ddf4"/>
        <InstallationRoom site={site} economy={touch} cupboardOpen={!!fixtureMap.get('door')?.params.closed} operateCupboard={()=>{if(!blockTap.current&&!walking&&fixtureMap.has('door'))onPart('door','actuator');}}/>
        <StripTails tails={tails}/>
        {visible.map(item=>{const c=fixtureMap.get(item.id)!,def=COMPONENTS[c.type];if(!def)return null;
          const optical=Math.min(1,Math.max(0,Number(result?.deviceStates[c.id]?.lightOutputPower??result?.componentPower[c.id]??0)/Math.max(1,Number(c.params.watts??def.defaults.watts??60))));
          const focus=item.id===selectedId;const t=focus?getComponentTerminals(c,def).find(t=>t.id===terminalId):undefined;
          const cupboardDoor=doc.lessonId===65&&c.id==='door';
          const reveal=tracedIds.includes(item.id)||(item.fixture?.bellService==='protect'&&tracedIds.includes('supply'));
          return <InstalledFixture key={item.id} item={item} optical={optical} pin={t} probeMode={!!meter} cupboardDoor={cupboardDoor} trace={reveal||(tool==='meter'&&(!!item.fixture?.kitchenDriver||!!item.fixture?.tapeProfile))}
            onTouchPick={e=>{lastTouchPick.current={x:e.clientX,y:e.clientY,at:performance.now()};}} equipment={{
            filledWays:filledWays(c,doc.components),component:c,definition:def,state:result?.deviceStates[c.id],selected:focus,
            lowDetail:!focus,preferLowAsset:touch,view:'normal',showLabels:false,onModelAvailability:modelAvailability,
            onPart:part=>{if(meter){if(!blockTap.current&&testStrips.some(s=>s.component.id===c.id)&&meterTarget!==c.id)onFocus(c.id);return;}if(!blockTap.current&&(!walking||(stair&&c.type==='switch2')))onPart(c.id,cupboardDoor||part==='body'&&['switch','switch2','pushbutton'].includes(c.type)?'actuator':part);},
            onTerminal:id=>{
              if(blockTap.current||walking)return;
              if(meter&&meterTarget!==c.id){if(testStrips.some(s=>s.component.id===c.id))onFocus(c.id);return;}
              onTerminal({component:c.id,terminal:id});
            }
          }}/>;
        })}
        {meter&&meterStrip&&!walking&&<SiteMeterPads strip={meterStrip} meter={meter} pick={onTerminal} blocked={blockTap}/>}
        <WireTrace id={wire} doc={doc} site={site}/><CameraRig focusId={jump.id} rig={rig} walking={walking} target={target} pose={pose} jobKey={jobKey} site={site} onRoom={setWalkRoom} wallSwitch={wallSwitch} wallButton={wallButton}/></>}
      </Canvas></SiteBoundary>
      {wallSwitch&&<button ref={wallButton} type="button" className="site-wall-switch" hidden aria-label="Wall switch" aria-pressed={wallControl?.params.closed===true}
        onClick={e=>{e.stopPropagation();if(!e.detail||!blockTap.current)onPart('switch','actuator');}}><span>Wall switch</span></button>}
    </div>
    {!lost&&visible.some(item=>unavailable.has(item.id))&&<div className="site-model-error" role="status" aria-live="polite">Equipment model unavailable. <button onClick={onList}>Use equipment list</button></div>}
    {lost&&<div className="site-unavailable" role="status"><p>Graphics paused. Your circuit is saved in the workbench.</p><button onClick={()=>{setLost(false);setLoadedKey(n=>n+1);}}>Restart site</button><button onClick={onList}>Equipment list</button></div>}
    {!meter&&<div className="site-location"><span className="location-dot"/>{site.building.name} <span> / </span> {site.location(walking||roomVisit?walkRoom:(selectedItem?.room??site.room))}</div>}
    {meter&&!lost&&<div className="site-meter-heading"><b>{meterStrip?'Place '+meter.probe+' probe':'Choose a strip to measure'}</b>
      <select aria-label="Strip to measure" value={meterTarget??''} onChange={e=>onFocus(e.target.value)}><option value="" disabled>Choose strip</option>{testStrips.map(s=><option key={s.component.id} value={s.component.id}>{s.component.label}</option>)}</select>
    </div>}
    {!lost&&!meter&&(wire||[1,2,3,13,17,18,19,20,21,22,23,35,36,37,39,40,44,45,61,65,66,68,69,71,72].includes(doc.lessonId??0))&&
      <SiteCablePeek doc={doc} site={site} selected={selectedId} wireId={wire} onChange={onPeek} visit={jumpTo} plan={onPlan}/>}
    {!meter&&<div className="site-actions">
      <button className={walking?'chosen':''} aria-pressed={walking} onClick={toggleWalk}><Footprints size={17}/>{walking?'Finish walk':'Walk'}</button>
      <label className="site-jump"><LocateFixed size={17}/><span>Go to</span><select aria-label="Go to equipment" value="" onChange={e=>e.target.value.startsWith('room:')?visitRoom(e.target.value):jumpTo(e.target.value)}><option value="" disabled>Choose a destination</option><optgroup label="Equipment">{visible.map(v=><option key={v.id} value={v.id}>{v.ref} · {fixtureMap.get(v.id)!.label} · {site.location(v.room)}</option>)}</optgroup><optgroup label="Rooms">{(site.kind==='home'?HOME_ROOMS.map(r=>r.id).concat(stair?[STAIR_LANDING.id]:[]):[0,1,2,3,4]).map(id=><option key={id} value={'room:'+id}>{site.location(id)}</option>)}</optgroup></select></label>
      {selectedId&&!walking&&testStrips.some(s=>s.component.id===selectedId)&&<button onClick={()=>openMeter(selectedId)}>Measure</button>}
      {selectedId&&!walking&&<button aria-label="Inspect equipment on the workbench" onClick={()=>onService(selectedId)}><PanelTopOpen size={17}/><span>Inspect</span></button>}
    </div>}
    {walking&&!meter&&<div className="walking-pad" aria-label="Walk controls">{directions.map(([dir,Icon])=><button key={dir} aria-label={'Walk '+dir} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);rig.keys.add(dir);rig.wake();}} onPointerUp={()=>rig.keys.delete(dir)} onLostPointerCapture={()=>rig.keys.delete(dir)} onPointerCancel={()=>rig.keys.delete(dir)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){rig.keys.add(dir);rig.wake();}}} onKeyUp={()=>rig.keys.delete(dir)}><Icon size={19}/></button>)}</div>}
  </div>;
}
