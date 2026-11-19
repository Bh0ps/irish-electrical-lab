'use client';
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { Canvas,useFrame,useThree,type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Footprints,LocateFixed,PanelTopOpen,Focus } from 'lucide-react';
import { mountScale,mountRoll,filledWays } from '../../lib/board-assembly';
import { DRAWING_INK } from '../../lib/installation-drawing';
import { installedEnd,installedWireRoute } from '../../lib/house-installation';
import { Line } from '@react-three/drei';
import { COMPONENTS } from '../../lib/components';
import { Equipment, type EquipmentProps } from '../../lib/Equipment';
import { semanticOwner } from '../../lib/blender-model';
import { getComponentTerminals } from '../../lib/terminal-layout';
import { walkStep,type JobSite,type SiteItem } from '../../lib/job-site';
import { HOME_ROOMS, STAIR_EYE, STAIR_LANDING, homeRoomAt, homeVisit, isStairStation,stairFloor,stairSwitchView } from '../../lib/home-floorplan';
import { serviceRoomAt,serviceVisit } from '../../lib/service-floorplan';
import {standingView,SiteWalkInput} from '../../lib/site-walk';
import {SiteWalkPad} from './SiteWalkPad';
import {SettledCanvas} from './SettledCanvas';
import {previousSiteView,type SavedSitePose,type SiteFocus,type SitePose} from '../../lib/site-camera';
import type { CircuitDocument,Endpoint,SimulationResult,Vec3 } from '../../lib/types';
import InstallationRoom from './InstallationRoom';
import BellCupboard from './BellCupboard';
import {FittedWireTails,KitchenDriver,RockerEnclosure,StripChannel} from './KitchenLighting';
import {KITCHEN_LIGHTS as kitchen,rockerPose} from '../../lib/kitchen-lighting';
import {connectedRockerTerminals,rockerConductiveSurface} from '../../lib/dc-rocker';
import {BathServiceBox} from './BathroomExtract';
import {BATH_EXTRACT as bath,outsideGrillePose} from '../../lib/bathroom-extract';
import {CORE_COLOUR} from '../../lib/cables';
import {BELL_CUPBOARD} from '../../lib/bell-cupboard';
import SiteCablePeek from './SiteCablePeek';
import SiteMeterPads,{type SiteMeter} from './SiteMeterPads';
import {padCamera,type SiteTestFitting} from '../../lib/site-meter';
import { BATTEN_FILAMENT, CUPBOARD_HINGE, CUPBOARD_SWING, fixturePoint, installedTerminalPoint,TAPE_SECTION_LENGTH, TAPE_SECTIONS } from '../../lib/site-fixtures';


interface Props {
  site:JobSite; doc:CircuitDocument; result?:SimulationResult; selected?:string; terminalId?:string; wire?:string; touch:boolean; tool:string;
  immersive?:boolean; toolsOpen?:boolean; repairHere?:{targets:string[];label:string;run:()=>void;powerOff?:{label:string;run:()=>void}};
  jump:SiteFocus; pose:React.MutableRefObject<SavedSitePose|undefined>; showWallSwitch?:boolean; stairGoal?:string;
  chimeOpen:boolean; setChimeOpen:(open:boolean)=>void; testFittings:SiteTestFitting[]; meter?:SiteMeter; openMeter:(component?:string)=>void; liftProbes:(component:string)=>void;
  onPeek:(id?:string)=>void;onPlan:(wire:string)=>void;onExplore:()=>void;
  onPart:(id:string,part:string)=>void;onTerminal:(endpoint:Endpoint)=>void;onFocus:(id:string)=>void;onService:(id:string)=>void;onList:()=>void;
}
function InstalledFixture({item, equipment, cupboardDoor, optical, pin,onTouchPick,trace,probeMode,wideRocker,bathroom,rockerOpen,chimeOpen}:{
  item:SiteItem;equipment:EquipmentProps;cupboardDoor:boolean;optical:number;pin?:{id:string;anchor:Vec3};onTouchPick:(event:ThreeEvent<PointerEvent>)=>void;trace:boolean;probeMode:boolean;wideRocker:boolean;bathroom:boolean;rockerOpen:boolean;chimeOpen:boolean;
}){
  const {component:c,definition:def,state}=equipment;
  const {fixture,position}=item;
  const scale=fixture?.scale??[item.scale,item.scale,item.scale] as Vec3;
  const pose=fixture?.worktopRocker?rockerPose(position,rockerOpen):item;
  const rotation=new THREE.Euler(fixture?.tilt??0,pose.rotation,fixture?.roll??0,'YXZ');
  const count=fixture?.tape?TAPE_SECTIONS:1;
  // The two halves share one component and two terminals. Only the magnet rides the leaf.
  const magnet=cupboardDoor&&<group position={CUPBOARD_HINGE} rotation={[0,c.params.closed?CUPBOARD_SWING:0,0]}>
    <group position={position.map((x,i)=>x-CUPBOARD_HINGE[i]) as Vec3} rotation={rotation} scale={[.011/.318,scale[1],scale[2]]}>
      <Equipment {...equipment} animate={false} contactPiece="magnet" />
    </group>
  </group>;
  const hasLight=['lamp','led','emergency','cctstrip'].includes(c.type);
  const illuminated=optical>0&&state?.energized&&hasLight;
  const emitter:Vec3=fixture?.ceilingLight?[0,.628*scale[1],.04]:fixture?.tape?[0,fixture.tapeProfile?kitchen.profileZ-position[2]:0,.027]:fixture?.batten
    ? BATTEN_FILAMENT.map((axis,i)=>axis*scale[i]) as Vec3
    : [0,def.size[1]*scale[1]*.65,.055];
  const warm=Number(state?.warmWatts??0),cool=Number(state?.coolWatts??0);
  const tint=useMemo(()=>new THREE.Color('#ffe9bd').lerp(new THREE.Color('#d9eaff'),cool/Math.max(.001,warm+cool)),[warm,cool]);
  const touched=useRef<{id:number;key:string}|undefined>(undefined);
  const pressedContact=useRef<string|undefined>(undefined);
  const guarded=probeMode&&(fixture?.worktopRocker||fixture?.croma);
  const point=(e:ThreeEvent<PointerEvent>)=>{const o=semanticOwner(e.object);return o.terminal??o.part??'body';};
  const conductingPart=(e:ThreeEvent<PointerEvent>)=>{
    const material=(e.object as THREE.Mesh).material;
    const hit=Array.isArray(material)?material[e.face?.materialIndex??0]:material;
    const metal=fixture?.croma?chimeOpen&&hit?.name==='K1 clamp screw steel':rockerOpen&&hit&&rockerConductiveSurface(hit.name);
    return metal?semanticOwner(e.object).terminal:undefined;
  };
  return <group userData={{siteComponent:item.id}}
    onPointerDown={e=>{
      if(guarded){e.stopPropagation();pressedContact.current=conductingPart(e);}
      if(e.pointerType==='touch'){e.stopPropagation();touched.current={id:e.pointerId,key:point(e)};}
    }}
    onPointerCancel={()=>{touched.current=undefined;pressedContact.current=undefined;}}
    onPointerUp={e=>{
      const start=touched.current;touched.current=undefined;
      if(guarded){e.stopPropagation();if(pressedContact.current!==conductingPart(e))pressedContact.current=undefined;}
      if(e.pointerType!=='touch'||start?.id!==e.pointerId||start.key!==point(e))return;
      e.stopPropagation();onTouchPick(e);
      const owner=semanticOwner(e.object);
      if(owner.terminal){
        if(guarded&&(pressedContact.current!==owner.terminal||conductingPart(e)!==owner.terminal))return;
        if(probeMode&&fixture?.tape){
          const pad=getComponentTerminals(c,def).find(t=>t.id===owner.terminal);
          if(!pad||e.point.distanceTo(new THREE.Vector3(...installedTerminalPoint(item,c,pad)))>.003)return;
        }
        equipment.onTerminal(owner.terminal);
      }else equipment.onPart(owner.part??'body',owner.detail);
    }}>
    {magnet}
    {fixture?.bellService&&<BellCupboard part={fixture.bellService} trace={trace} bathroom={bathroom} select={()=>equipment.onPart('body')}/>}
    {fixture?.tapeProfile&&<StripChannel x={position[0]} open={trace||equipment.selected} level={illuminated?optical:0} tint={c.type==='cctstrip'?tint:new THREE.Color('#ffead0')} select={()=>equipment.onPart('cover')}/>}
    {fixture?.worktopRocker&&<RockerEnclosure origin={position} open={rockerOpen} select={()=>equipment.onPart('cover')}/>}
    <group position={pose.position} rotation={rotation}>
      {wideRocker&&<mesh position={[0,.046,.014]} userData={{partId:'actuator'}} onClick={e=>{e.stopPropagation();if((e.nativeEvent as PointerEvent).pointerType!=='touch')equipment.onPart('actuator');}}>
        <planeGeometry args={[.17,.128]}/><meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false}/>
      </mesh>}
      {fixture?.serviceBox&&<BathServiceBox part={fixture.serviceBox} open={trace||fixture.serviceBox==='cpc'&&equipment.selected} choose={()=>equipment.onPart('cover')}/>}
      {fixture?.kitchenDriver?<KitchenDriver volts={Number(c.params.outputVoltage??24)} open={trace||equipment.selected} choose={()=>equipment.onPart('body')} pick={equipment.onTerminal}/>:Array.from({length:count},(_,i)=><group key={i} position={[(i-(count-1)/2)*TAPE_SECTION_LENGTH,0,0]} scale={scale}>
        <group rotation={[0,0,mountRoll(c)]} scale={mountScale(c)}>
          <Equipment {...equipment} view={fixture?.extractor&&trace||fixture?.croma&&(chimeOpen||trace)?'open':equipment.view} onTerminal={id=>{
            if(probeMode&&(i>0||(guarded&&pressedContact.current!==id)))return;
            equipment.onTerminal(id);
          }} animate={!cupboardDoor} contactPiece={cupboardDoor?'reed':undefined} />
        </group>
      </group>)}
      {illuminated&&<pointLight position={emitter} color={c.type==='cctstrip'?tint:'#fff0d0'} intensity={.34*optical} distance={2.9}/>}
    </group>
    {pin&&!fixture?.croma&&!(probeMode&&(fixture?.tape||fixture?.worktopRocker))&&<mesh position={installedTerminalPoint(item,c,pin)} renderOrder={15} raycast={()=>{}}>
      <sphereGeometry args={[Math.max(.0018,Math.min(.008,.065*item.scale)),12,8]}/><meshBasicMaterial color="#ffb34a" depthTest={false}/>
    </mesh>}
  </group>;
}
const FittingTails=React.memo(function FittingTails({doc,site,red,black,drawn}:{doc:CircuitDocument;site:JobSite;red?:string;black?:string;drawn?:string}){
  const openRockers=new Set([red,black,drawn].filter((id):id is string=>!!id));
  const fitted=new Map(site.items.filter(i=>i.fixture?.tapeProfile||i.fixture?.extractor||i.fixture?.serviceBox||i.fixture?.worktopRocker||i.fixture?.croma).map(i=>[i.id,i.fixture!]));
  if(!fitted.size)return null;
  const tails=doc.wires.flatMap(w=>[w.from,w.to].flatMap(end=>{
      const fixture=fitted.get(end.component);if(!fixture)return [];
      const points=installedEnd(doc,site,end,openRockers)?.lead;if(!points)return [];
      const core=w.cable?.core??(w.role==='PE'?'green-yellow':w.role==='N'?'blue':'brown');
      return [{points,id:w.id+'-'+end.component+'-'+end.terminal,
        colour:(fixture.tapeProfile||fixture.worktopRocker)&&!w.cable?DRAWING_INK[w.role]:core==='green-yellow'?'#308643':CORE_COLOUR[core],
        stripe:core==='green-yellow'?'#e8c63a':undefined,flexible:(fixture.worktopRocker||fixture.croma)&&core!=='green-yellow',radius:fixture.croma?.00065:(fixture.tapeProfile||fixture.worktopRocker) ? .0008 : .0014}];
  }));
  return <FittedWireTails tails={tails}/>;
});
function WireTrace({doc,site,id,openRocker}:{doc:CircuitDocument;site:JobSite;id?:string;openRocker?:ReadonlySet<string>}){
  const wire=doc.wires.find(w=>w.id===id);
  const points=useMemo(()=>wire&&installedWireRoute(doc,site,wire,openRocker),[doc,site,wire,openRocker]);
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
  if(id===36&&!close){
    // Look past the switch through the open bathroom door toward its fan and light.
    return {position:[3.28,1.29,-.78],yaw:touch?2.48:2.51,pitch:.13};
  }
  if(id===9&&isStairStation(item?.id))return stairSwitchView(item.id);
  const pose=frontView(item,id,close,height,touch);
  if(!item?.rotation)return pose;
  const [x,,z]=item.position,dx=pose.position[0]-x,dz=pose.position[2]-z,angle=item.rotation;
  return {position:[x+dx*Math.cos(angle)+dz*Math.sin(angle),pose.position[1],z+dz*Math.cos(angle)-dx*Math.sin(angle)],yaw:pose.yaw+angle,pitch:pose.pitch};
}
function frontView(item:SiteItem|undefined,id:number|undefined,close:boolean,height:number,touch:boolean):SitePose{
  const p=item?.position??[0,1.3,-2.5];
  if(item?.fixture?.extractor)return {position:[p[0]-.034,p[1]+.118,p[2]+.31],yaw:-.11,pitch:-.09};
  if(item?.fixture?.serviceBox)return {position:[p[0]-.034,p[1]+.055,p[2]+.225],yaw:-.15,pitch:-.082};
  if(item?.fixture?.ceilingLight)return {position:[bath.lightX+.028,bath.ceiling-.32,bath.lightZ+.158],yaw:.18,pitch:1.10};
  if(close&&item?.fixture?.kitchenDriver){
    return touch?{position:[p[0],p[1]+.49,p[2]+1.20],yaw:0,pitch:-.38}
      :{position:[p[0],p[1]+.34,p[2]+.48],yaw:0,pitch:-.59};
  }
  if(close&&item?.fixture?.tapeProfile){
    return {position:[p[0]-.251,kitchen.bottom-.128,kitchen.profileZ+.109],yaw:0,pitch:.83};
  }
  if(item?.fixture?.bellService){
    const b=BELL_CUPBOARD,d=touch?.99:.64;
    if(id===36)return {position:[b.x+.038,b.y+.056,b.z+.36],yaw:.12,pitch:-.12};
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
function CameraRig({rig,walking,target,pose,jobKey,focusId,roomArrival,site,onRoom,onNear,walkTargets,wallSwitch,wallButton}:{focusId:number;roomArrival:number;site:JobSite;walkTargets:SiteItem[];onNear:(id:string|undefined)=>void;onRoom:(room:number)=>void;rig:SiteWalkInput;walking:boolean;target:SitePose;pose:Props['pose'];jobKey:string;wallSwitch?:THREE.Vector3;wallButton:React.RefObject<HTMLButtonElement|null>}){
  const {camera,invalidate,size}=useThree();
  const screenPoint=useMemo(()=>new THREE.Vector3(),[]);
  const nearby=useRef<string|undefined>(undefined);
  const roomRef=useRef(-1);const position=useRef(new THREE.Vector3()),rotation=useRef({yaw:0,pitch:0});
  useLayoutEffect(()=>{rig.setWake(invalidate);return()=>{rig.setWake(()=>{});rig.stop();};},[invalidate,rig]);
  useLayoutEffect(()=>{roomRef.current=-1;},[jobKey]);
  const {position:[x,y,z],yaw,pitch}=target;
  useLayoutEffect(()=>{position.current.set(x,y,z);rotation.current={yaw,pitch};rig.startView();invalidate();},[x,y,z,yaw,pitch,focusId,roomArrival,jobKey,invalidate,rig]);
  useFrame((_,dt)=>{
    const p=position.current,r=rotation.current,keys=rig.keys;
    if(rig.zoom||rig.turn[0]||rig.turn[1]||walking)rig.markMoved();
    r.yaw-=rig.turn[0]*.003;r.pitch=Math.max(-1.18,Math.min(1.18,r.pitch-rig.turn[1]*.003));
    const fwd=walking?Number(keys.has('up'))-Number(keys.has('down'))+rig.stick[1]:0;
    const side=walking?Number(keys.has('right'))-Number(keys.has('left'))+rig.stick[0]:0;
    const distance=Math.min(dt,.045)*1.8/Math.max(1,Math.hypot(fwd,side));
    const travel=distance*fwd+rig.zoom+(walking?rig.nudge[1]:0),across=side*distance+(walking?rig.nudge[0]:0);rig.consumeMotion();
    const dx=Math.cos(r.yaw)*across-Math.sin(r.yaw)*travel,dz=-Math.sin(r.yaw)*across-Math.cos(r.yaw)*travel;
    if(dx||dz){const next=walkStep([p.x,p.y,p.z],dx,dz,site);p.set(...next);}
    if(walking){
      const stair=site.building.rooms[1]==='Stair hall';
      p.y=STAIR_EYE+(stair?stairFloor(p.x,p.z):0);
      const room=site.kind==='home'?homeRoomAt(p.x,p.z,stair):serviceRoomAt(site.kind,p.x,p.z);if(room!==roomRef.current){roomRef.current=room;onRoom(room);}
    }
    camera.position.copy(p);camera.rotation.order='YXZ';camera.rotation.set(r.pitch,r.yaw,0,'YXZ');camera.updateMatrixWorld();
    if(walking){
      // Offer one named target near the centre of the current room and floor.
      // Project actual installed positions using this camera's aspect ratio.
      let best:string|undefined,score=Infinity;
      for(const item of walkTargets){
        if(item.room!==roomRef.current)continue;
        screenPoint.set(...item.position);screenPoint.y+=.06;
        const distance=screenPoint.distanceTo(p);
        if(distance>5.8)continue;
        screenPoint.project(camera);
        if(Math.abs(screenPoint.x)>.85||Math.abs(screenPoint.y)>.78||screenPoint.z<=-1||screenPoint.z>=1)continue;
        const rank=Math.hypot(screenPoint.x,screenPoint.y)+distance*.04;
        if(rank<score){score=rank;best=item.id;}
      }
      if(nearby.current!==best){nearby.current=best;onNear(best);}
    }else if(nearby.current){nearby.current=undefined;onNear(undefined);}
    const button=wallButton.current;
    if(button&&wallSwitch){
      screenPoint.copy(wallSwitch).project(camera);
      const x=(screenPoint.x+1)*size.width/2,y=(1-screenPoint.y)*size.height/2;
      button.hidden=rig.moved||screenPoint.z< -1||screenPoint.z>1||x<22||x>size.width-22||y<22||y>size.height-22;
      if(!button.hidden){
        button.style.transform=`translate(${x-22}px, ${y-22}px)`;
        button.dataset.side=x+22+(button.firstElementChild?.clientWidth??0)>size.width-6?'left':'right';
      }
    }
    pose.current={position:[p.x,p.y,p.z],...r,job:jobKey,focus:focusId};
    if(walking&&(keys.size||rig.stick[0]||rig.stick[1]))invalidate();
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
const keyMap:Record<string,string>={KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
export default function JobSiteView({site,doc,result,selected,terminalId,wire,touch,tool,jump,pose,onPart,onTerminal,onFocus,onService,onList,showWallSwitch,stairGoal,onPeek,onPlan,onExplore,testFittings,meter,openMeter,liftProbes,chimeOpen,setChimeOpen,immersive=false,toolsOpen=false,repairHere}:Props){
  const rig=useMemo(()=>new SiteWalkInput(),[]);
  const [walkStart,setWalkStart]=useState<SitePose>(),[nearby,setNearby]=useState<string>(),[looked,setLooked]=useState(false);
  const returnWalk=useRef<{job:string;room:number;pose:SitePose}|undefined>(undefined);
  const wallButton=useRef<HTMLButtonElement>(null);
  const lastTouchPick=useRef<{x:number;y:number;at:number}|undefined>(undefined);
  const [roomArrival,setRoomArrival]=useState(0);
  const [walkRoom,setWalkRoom]=useState(site.room);const [walking,setWalking]=useState(false),[lost,setLost]=useState(false),[loadedKey,setLoadedKey]=useState(0);

  const recoverGraphics=useCallback((paused:boolean)=>{setLost(paused);if(!paused)setLoadedKey(n=>n+1);},[setLost,setLoadedKey]);
  const [unavailable,setUnavailable]=useState<Set<string>>(()=>new Set());
  const modelAvailability=useCallback((id:string,missing:boolean)=>setUnavailable(previous=>{
    if(previous.has(id)===missing)return previous;
    const next=new Set(previous);if(missing)next.add(id);else next.delete(id);return next;
  }),[]);
  const input=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,{x:number;y:number;startX:number;startY:number}>()),blockTap=useRef(false);
  const selectedId=selected??site.first;
  const jobKey=site.kind+':'+(doc.lessonId??doc.id);
  const stair=doc.lessonId===9;
  const lastStairGoal=useRef<string|undefined>(undefined);
  const [visit,setVisit]=useState<{room:number;job:string;jump:number;grille?:boolean}>();
  const meterFitting=meter?testFittings.find(fitting=>fitting.component.id===jump.component):undefined;
  const meterTarget=meterFitting?.component.id;
  const [withdrawnAt,setWithdrawnAt]=useState<number>();
  const [openedRepair,setOpenedRepair]=useState<{job:string;focus:number;id:string}>();
  const roomVisit=visit?.job===jobKey&&visit.jump===jump.id?visit:undefined;
  const repairId=immersive&&!walking&&!meter&&!lost&&!roomVisit&&jump.component&&repairHere?.targets.includes(jump.component)?jump.component:undefined;
  const repairFitting=repairId?testFittings.find(f=>f.item.id===repairId):undefined;
  const accessOpen=!!repairId&&!repairHere?.powerOff&&openedRepair?.job===jobKey&&openedRepair.focus===jump.id&&openedRepair.id===repairId;

  const redFitting=meter?.red?.component,blackFitting=meter?.black?.component;
  const pinned=meterTarget!==undefined&&(redFitting===meterTarget||blackFitting===meterTarget);
  const drawn=withdrawnAt===jump.id?meterTarget:undefined;
  const openRockers=new Set([redFitting,blackFitting,drawn,accessOpen&&repairFitting?.kind==='rocker'?repairId:undefined].filter((id):id is string=>!!id));
  const openRocker=!!meterTarget&&openRockers.has(meterTarget);

  const station=jump.component??site.first;
  const stationSwitch=stair&&isStairStation(station)&&!roomVisit?station:undefined;
  useEffect(()=>{
    const previous=lastStairGoal.current;lastStairGoal.current=stairGoal;
    if(stair&&isStairStation(stairGoal)&&station!==stairGoal&&previous!==stairGoal&&!walking&&!rig.moved&&!roomVisit&&!wire&&(!jump.component||jump.component===previous)){
      onFocus(stairGoal);
    }
  },[stair,stairGoal,station,walking,rig,roomVisit,wire,jump.component,onFocus]);
  const roomTarget=useMemo(()=>{
    if(roomVisit?.grille)return outsideGrillePose(touch);
    if(roomVisit){const view=site.kind==='home'?homeVisit(roomVisit.room,stair):serviceVisit(site,roomVisit.room);if(view)return view;}
    const id=station,item=site.items.find(e=>e.id===id),c=doc.components.find(c=>c.id===id);
    return previousSiteView(pose.current,jobKey,jump)??aim(item,doc.lessonId,!!jump.component,item&&c?COMPONENTS[c.type].size[1]*item.scale:undefined,touch);
  },[jobKey,jump,loadedKey,roomVisit,touch,station]);
  const target=walking&&walkStart?walkStart:accessOpen&&repairFitting?padCamera(repairFitting,true,touch):meterFitting?padCamera(meterFitting,meterFitting.kind==='chime'?chimeOpen:openRocker,touch):roomTarget;
  const stop=useCallback(()=>{rig.stop();pointers.current.clear();blockTap.current=true;},[rig]);
  useEffect(()=>{window.addEventListener('blur',stop);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    function release(e:PointerEvent){pointers.current.delete(e.pointerId);}
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);stop();};},[stop]);
  useEffect(()=>{setWalking(false);stop();},[jump.id,jobKey,tool,stop]);
  useEffect(()=>{setWalkRoom(site.room);},[jobKey,site.room]);
  const previousImmersion=useRef('');
  useEffect(()=>{
    const key=immersive?jobKey:'';
    if(previousImmersion.current===key)return;
    // Enter after the full-height viewport takes its first layout.
    const frame=requestAnimationFrame(()=>{
      const wasOpen=!!previousImmersion.current;
      previousImmersion.current=key;
      stop();
      if(immersive&&!meter){
        const item=site.items.find(i=>i.id===station);
        setWalkStart(standingView(site,item));setWalking(true);
      }else if(wasOpen)setWalking(false);
    });
    return()=>cancelAnimationFrame(frame);
  },[immersive,jobKey,meter,site,station,stop]);
  useEffect(()=>{
    if(toolsOpen||lost)stop();
    const hidden=()=>{if(document.hidden)stop();};
    document.addEventListener('visibilitychange',hidden);
    return()=>document.removeEventListener('visibilitychange',hidden);
  },[toolsOpen,lost,stop]);
  function toggleWalk(){
    stop();
    if(walking){setWalking(false);return;}
    if(touch)onExplore();
    const item=site.items.find(i=>i.id===station),room=item?.room??site.room;
    const previous=returnWalk.current;
    setWalkStart(previous?.job===jobKey&&previous.room===room?previous.pose:standingView(site,item));
    setWalking(true);rig.wake();input.current?.focus({preventScroll:true});
  }
  function jumpTo(id:string){
    if(walking&&pose.current) returnWalk.current={job:jobKey,room:walkRoom,pose:{...pose.current,position:[...pose.current.position]}};
    stop();if(touch&&!(stair&&isStairStation(id)))onExplore();setWalking(false);onFocus(id);}
  function visitRoom(value:string){
    if(value==='grille'){
      stop();if(touch)onExplore();setWalking(false);setWalkRoom(3);setRoomArrival(n=>n+1);
      setVisit({room:3,job:jobKey,jump:jump.id,grille:true});input.current?.focus({preventScroll:true});return;
    }
    const room=Number(value.slice(5));
    const arrival=site.kind==='home'?homeVisit(room,stair):serviceVisit(site,room);
    if(!arrival)return;
    setWalkStart(arrival);setRoomArrival(n=>n+1);
    stop();if(touch)onExplore();setWalkRoom(room);setVisit({room,job:jobKey,jump:jump.id});setWalking(true);
    input.current?.focus({preventScroll:true});
  }
  const fixtureMap=new Map(doc.components.map(c=>[c.id,c]));
  const selectedItem=site.items.find(s=>s.id===selectedId);
  const traced=doc.wires.find(w=>w.id===wire);
  const tracedIds=traced?[traced.from.component,traced.to.component]:[];
  const visible=site.items.filter(item=>fixtureMap.has(item.id));
  const wallId=stationSwitch??'switch',rocker=site.items.find(item=>item.id===wallId),wallControl=fixtureMap.get(wallId);
  const wallSwitch=rocker&&wallControl&&(stationSwitch?!wire:showWallSwitch&&!jump.component)&&!walking&&!lost&&(tool==='select'||tool==='inspect')
    ? new THREE.Vector3(...fixturePoint(rocker.position,rocker.scale,rocker.fixture,wallControl,stationSwitch?[0,.651,.067]:[0,COMPONENTS.switch.size[1]/2,.20],rocker.rotation)):undefined;
  return <div className="jobsite" data-site={site.kind} data-immersive={immersive||undefined} data-walking={walking||undefined} data-tools-open={toolsOpen||undefined}>
    <div className="site-camera" ref={input} tabIndex={0} aria-label={walking?'Walk around the site. Use WASD or the movement pad.':'Installation view. Choose equipment or enter Walk.'}
      onKeyDown={e=>{if(e.key==='Escape'){stop();setWalking(false);}const key=keyMap[e.code];if(!toolsOpen&&walking&&key){e.preventDefault();rig.keys.add(key);rig.wake();}}}
      onKeyUp={e=>{rig.keys.delete(keyMap[e.code]);}} onBlur={e=>{if(rig.thumb)rig.keys.clear();else if(!e.currentTarget.contains(e.relatedTarget))stop();}}
      onPointerDownCapture={e=>{if(toolsOpen&&walking)return;lastTouchPick.current=undefined;if(!rig.thumb&&!(e.target instanceof Element&&e.target.closest('button')))e.currentTarget.focus({preventScroll:true});blockTap.current=toolsOpen&&walking||rig.thumb||pointers.current.size>0||e.button!==0;
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});}}
      onPointerMoveCapture={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;
        if(Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>5)blockTap.current=true;
        if(pointers.current.size===2){const other=[...pointers.current.entries()].find(([k])=>k!==e.pointerId)![1];const diff=Math.hypot(e.clientX-other.x,e.clientY-other.y)-Math.hypot(old.x-other.x,old.y-other.y);rig.zoomBy(diff*.003);}
        else if(blockTap.current){const gain=touch&&walking?1.6:1;if(immersive&&walking&&!looked)setLooked(true);rig.turnBy(dx*gain,dy*gain);}
        old.x=e.clientX;old.y=e.clientY;rig.wake();}}
      onPointerCancelCapture={e=>{pointers.current.delete(e.pointerId);blockTap.current=true;}} onClickCapture={e=>{
        const picked=lastTouchPick.current;
        const duplicate=picked&&performance.now()-picked.at<900&&Math.hypot(e.clientX-picked.x,e.clientY-picked.y)<10;
        if(e.detail&&(blockTap.current||duplicate)){e.stopPropagation();e.preventDefault();}
      }}
      onWheel={e=>{if(toolsOpen&&walking)return;rig.zoomBy(Math.max(-.18,Math.min(.18,-e.deltaY*.001)));}}>
      <SiteBoundary key={loadedKey} onList={onList}><Canvas shadows={!touch} frameloop="demand" dpr={touch?1:[1,1.5]} camera={{fov:49,near:.012,far:55}} gl={{antialias:!touch,powerPreference:'default'}}
        onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.99;}}>
        <ContextRecovery onChange={recoverGraphics}/><SettledCanvas layout={[immersive,toolsOpen,jobKey,jump.id,walking,roomVisit?.room,wire,chimeOpen,openRocker,accessOpen,meterTarget].join('/')}/>{!lost&&<><color attach="background" args={['#cddedd']}/><hemisphereLight args={['#edf3ff','#b0a697',.88]}/>
        <directionalLight castShadow={!touch} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-.0006} shadow-normalBias={.0015} position={[-2.6,2.7,1.3]} intensity={1.12} color="#fff6e7"/>
        <directionalLight position={[-4,2,1]} intensity={.27} color="#c2ddf4"/>
        <InstallationRoom site={site} economy={touch} cupboardOpen={!!fixtureMap.get('door')?.params.closed} operateCupboard={()=>{if(!blockTap.current&&!walking&&fixtureMap.has('door'))onPart('door','actuator');}}/>
        <FittingTails doc={doc} site={site} red={redFitting} black={blackFitting} drawn={drawn}/>
        {visible.map(item=>{const c=fixtureMap.get(item.id)!,def=COMPONENTS[c.type];if(!def)return null;
          const optical=Math.min(1,Math.max(0,Number(result?.deviceStates[c.id]?.lightOutputPower??result?.componentPower[c.id]??0)/Math.max(1,Number(c.params.watts??def.defaults.watts??60))));
          const focus=item.id===selectedId;const t=focus?getComponentTerminals(c,def).find(t=>t.id===terminalId):undefined;
          const cupboardDoor=doc.lessonId===65&&c.id==='door';
          const reveal=accessOpen&&item.id===repairId||tracedIds.includes(item.id)||(item.fixture?.bellService==='protect'&&tracedIds.includes('supply'));
          return <InstalledFixture key={item.id} item={item} optical={optical} pin={t} probeMode={!!meter} chimeOpen={chimeOpen} rockerOpen={openRockers.has(item.id)} cupboardDoor={cupboardDoor} bathroom={doc.lessonId===36} wideRocker={doc.lessonId===36&&!jump.component&&!roomVisit&&!walking&&!meter&&!reveal&&['light-switch','fan-isolation'].includes(item.id)}
            trace={reveal||(tool==='meter'&&(!!item.fixture?.kitchenDriver||!!item.fixture?.tapeProfile))}
            onTouchPick={e=>{lastTouchPick.current={x:e.clientX,y:e.clientY,at:performance.now()};}} equipment={{
            filledWays:filledWays(c,doc.components),component:c,definition:def,state:result?.deviceStates[c.id],selected:focus,
            connectedTerminals:connectedRockerTerminals(c,doc.wires),lowDetail:!focus,preferLowAsset:touch,view:accessOpen&&item.id===repairId?'open':'normal',showLabels:false,onModelAvailability:modelAvailability,
            onPart:part=>{if(walking&&immersive){if(!blockTap.current&&!toolsOpen&&item.room===walkRoom)jumpTo(item.id);return;}if(item.fixture?.croma&&part==='cover'&&!blockTap.current&&!walking){if(!chimeOpen)setChimeOpen(true);return;}if(meter){if(!blockTap.current&&testFittings.some(s=>s.component.id===c.id)&&meterTarget!==c.id)onFocus(c.id);return;}if(!blockTap.current&&(!walking||(stair&&c.type==='switch2')))onPart(c.id,cupboardDoor||part==='body'&&['switch','switch2','pushbutton'].includes(c.type)?'actuator':part);},
            onTerminal:id=>{
              if(blockTap.current)return;
              if(walking){if(immersive&&!toolsOpen&&item.room===walkRoom)jumpTo(item.id);return;}
              if(meter&&meterTarget!==c.id){if(testFittings.some(s=>s.component.id===c.id))onFocus(c.id);return;}
              if(meter&&(item.fixture?.worktopRocker&&!openRockers.has(c.id)||item.fixture?.croma&&!chimeOpen))return;
              onTerminal({component:c.id,terminal:id});
            }
          }}/>;
        })}
        {meter&&!walking&&testFittings.filter(f=>[meterTarget,redFitting,blackFitting].includes(f.item.id)).map(f=><SiteMeterPads key={f.item.id} fitting={f} open={f.kind==='chime'?chimeOpen:openRockers.has(f.item.id)} showLabels={f.item.id===meterTarget} meter={meter} pick={onTerminal} blocked={blockTap}/>)}
        <WireTrace id={wire} doc={doc} site={site} openRocker={openRockers}/><CameraRig focusId={jump.id} roomArrival={roomArrival} rig={rig} walking={walking} target={target} pose={pose} jobKey={jobKey} site={site} onRoom={setWalkRoom} onNear={setNearby} walkTargets={immersive?visible:[]} wallSwitch={wallSwitch} wallButton={wallButton}/></>}
      </Canvas></SiteBoundary>
      {wallSwitch&&<button ref={wallButton} type="button" className="site-wall-switch" hidden aria-label={stationSwitch==='far'?'Operate landing switch':stationSwitch?'Operate downstairs switch':'Wall switch'} aria-pressed={stationSwitch?undefined:wallControl?.params.closed===true}
        onClick={e=>{e.stopPropagation();if(!e.detail||!blockTap.current)onPart(wallId,'actuator');}}><span>{stationSwitch==='far'?'Landing switch':stationSwitch?'Downstairs switch':'Wall switch'}</span></button>}
    </div>
    {!lost&&visible.some(item=>unavailable.has(item.id))&&<div className="site-model-error" role="status" aria-live="polite">Equipment model unavailable. <button onClick={onList}>Use equipment list</button></div>}
    {lost&&<div className="site-unavailable" role="status"><p>Graphics paused. Your circuit is saved in the workbench.</p><button onClick={()=>{setLost(false);setLoadedKey(n=>n+1);}}>Restart site</button><button onClick={onList}>Equipment list</button></div>}
    {!meter&&(!stair||immersive&&walking)&&<div className="site-location"><span className="location-dot"/>{site.building.name} <span> / </span> {site.location(walking||roomVisit?walkRoom:(selectedItem?.room??site.room))}</div>}
    {meter&&!lost&&<div className="site-meter-heading">
      {meterFitting?.kind!=='chime'&&<label><b>Fitting</b> <select aria-label="Fitting to measure" value={meterTarget??''} onChange={e=>onFocus(e.target.value)}><option value="" disabled>Choose a fitting</option>{testFittings.map(s=><option key={s.component.id} value={s.component.id}>{s.component.label}</option>)}</select></label>}
      {meterFitting?.kind==='chime'&&<button type="button" aria-expanded={chimeOpen} title={chimeOpen&&pinned?'Lift the meter probes and close the front cover':undefined} onClick={()=>{if(chimeOpen&&pinned)liftProbes(meterFitting.component.id);setChimeOpen(!chimeOpen);}}>{chimeOpen?(pinned?'Lift and close':'Close chime cover'):'Open chime cover'}</button>}
      {meterFitting?.kind==='rocker'&&<button type="button" aria-expanded={openRocker} aria-label={openRocker&&pinned?'Lift probe and refit':undefined} onClick={()=>{if(pinned)liftProbes(meterFitting.item.id);setWithdrawnAt(openRocker?undefined:jump.id);}}>{openRocker?(pinned?'Lift and refit':'Refit panel'):'Show back of switch'}</button>}
    </div>}
    {!lost&&!meter&&!(immersive&&walking)&&(wire||[1,2,3,9,13,17,18,19,20,21,22,23,35,36,37,39,40,44,45,61,65,66,68,69,71,72].includes(doc.lessonId??0))&&
      <div className={stair&&!wire?'stair-locations':undefined}>
        {stair&&!wire&&<nav className="stair-stations" aria-label="Stair switch locations">{(['near','far'] as const).map(id=>
          <button key={id} type="button" aria-pressed={walking||roomVisit?(walkRoom===STAIR_LANDING.id?'far':'near')===id:stationSwitch===id}
            onClick={()=>{stop();setWalking(false);onFocus(id);}}>{id==='near'?'Downstairs':'Landing'}</button>)}</nav>}
        <SiteCablePeek doc={doc} site={site} selected={selectedId} wireId={wire} onChange={onPeek} visit={jumpTo} plan={onPlan}/>
      </div>}
    {!meter&&<div className="site-actions">
      {(!immersive||!walking)&&<button className={walking?'chosen':''} aria-pressed={walking} onClick={toggleWalk}><Footprints size={17}/>{walking?'Finish walk':'Walk'}</button>}
      <label className="site-jump"><LocateFixed size={17}/><span>{immersive?'Find':'Go to'}</span><select aria-label="Go to equipment" value="" onChange={e=>e.target.value.startsWith('room:')||e.target.value==='grille'?visitRoom(e.target.value):jumpTo(e.target.value)}><option value="" disabled>Choose a destination</option><optgroup label="Equipment">{visible.map(v=><option key={v.id} value={v.id}>{v.ref} · {fixtureMap.get(v.id)!.label} · {site.location(v.room)}</option>)}</optgroup>{immersive&&stair&&<optgroup label="Floors"><option value="room:1">Downstairs</option><option value={'room:'+STAIR_LANDING.id}>First-floor landing</option></optgroup>}<optgroup label="Rooms">{(site.kind==='home'?HOME_ROOMS.map(r=>r.id).concat(stair?[STAIR_LANDING.id]:[]):[0,1,2,3,4]).filter(id=>!immersive||!stair||id!==1&&id!==STAIR_LANDING.id).map(id=><option key={id} value={'room:'+id}>{site.location(id)}</option>)}{doc.lessonId===36&&<option value="grille">Outside fan grille</option>}</optgroup></select></label>
      {selectedId&&!walking&&!repairId&&testFittings.some(s=>s.component.id===selectedId)&&<button onClick={()=>openMeter(selectedId)}>Measure</button>}
      {repairId&&!toolsOpen&&repairHere&&<button type="button" className="site-repair" onClick={()=>{
        if(repairHere.powerOff){setOpenedRepair(undefined);repairHere.powerOff.run();return;}
        if(!accessOpen){setOpenedRepair({job:jobKey,focus:jump.id,id:repairId});if(repairFitting?.kind==='chime')setChimeOpen(true);return;}
        repairHere.run();
      }}>{repairHere.powerOff?.label??(accessOpen?repairHere.label:'Open fitting')}</button>}
      {selectedId&&!walking&&!repairId&&<button aria-label="Inspect equipment on the workbench" onClick={()=>onService(selectedId)}><PanelTopOpen size={17}/><span>Inspect</span></button>}
    </div>}
    {walking&&!meter&&!toolsOpen&&!lost&&<>
      {immersive&&touch&&!looked&&<span className="site-look-guide">Drag the room to look around.</span>}
      <SiteWalkPad move={(x,y)=>{blockTap.current=true;rig.moveThumb(x,y);}}
        release={()=>rig.liftThumb()}
        nudge={dir=>rig.step(dir)}/>
      {immersive&&nearby&&<button className="site-approach" type="button" onClick={()=>jumpTo(nearby)}><Focus size={19}/><span>Go closer<b>{fixtureMap.get(nearby)?.label}</b></span></button>}
    </>}

  </div>;
}
