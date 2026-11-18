'use client';
import React,{Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { Canvas,useFrame,useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ArrowUp,ArrowLeft,ArrowRight,ArrowDown,Footprints,LocateFixed,PanelTopOpen } from 'lucide-react';
import { mountScale,mountRoll,mountVector,filledWays } from '../../lib/board-assembly';
import { DRAWING_INK } from '../../lib/installation-drawing';
import { COMPONENTS } from '../../lib/components';
import { Equipment } from '../../lib/Equipment';
import { getComponentTerminals } from '../../lib/terminal-layout';
import { walkStep,type JobSite,type SiteItem } from '../../lib/job-site';
import type { CircuitDocument,ComponentInstance,DeviceState,Endpoint,SimulationResult,Vec3 } from '../../lib/types';
import InstallationRoom,{ContactHalf} from './InstallationRoom';

export interface SitePose {position:Vec3;yaw:number;pitch:number}
interface Rig {keys:Set<string>; turn:[number,number];zoom:number; wake:()=>void; pose?:SitePose}
interface Props {
  site:JobSite; doc:CircuitDocument; result?:SimulationResult; selected?:string; terminalId?:string; wire?:string; touch:boolean; tool:string;
  jump:{id:number;component?:string}; pose:React.MutableRefObject<SitePose|undefined>;
  onPart:(id:string,part:string)=>void;onTerminal:(endpoint:Endpoint)=>void;onFocus:(id:string)=>void;onService:(id:string)=>void;onList:()=>void;
}
const installedTape=(c:ComponentInstance)=>c.type==='cctstrip'||c.type==='led'&&c.variant==='strip';
function tapePin(c:ComponentInstance,pin:string,scale:number):Vec3{
  const pins=c.type==='cctstrip'?['+','W','C']:['L','N'];
  return [-.224/scale,(.007-pins.indexOf(pin)*.008)/scale,.004/scale];
}
function TapeDetails({points,size,y,z,body,glow,level=0}:{points:number[];size:Vec3;y:number;z:number;body:string;glow?:string;level?:number}){
  const mesh=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const batch=mesh.current;if(!batch)return;const m=new THREE.Matrix4();points.forEach((x,i)=>batch.setMatrixAt(i,m.makeTranslation(x,y,z)));batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();},[points,y,z]);
  return <instancedMesh ref={mesh} args={[undefined,undefined,points.length]}><boxGeometry args={size}/><meshStandardMaterial color={body} emissive={glow??'#000'} emissiveIntensity={level}/></instancedMesh>;
}
const chipPositions=Array.from({length:18},(_,i)=>-.195+i*.023),warmChips=chipPositions.filter((_,i)=>i%2===0),coolChips=chipPositions.filter((_,i)=>i%2===1),resistors=chipPositions.filter((_,i)=>i%3===1).map(x=>x+.009);
function InstalledTape({component:c,scale,state,power,part,terminal}:{component:ComponentInstance;scale:number;state?:DeviceState;power:number;part:(name:string)=>void;terminal:(id:string)=>void}){
  const isCct=c.type==='cctstrip',pins=isCct?['+','W','C']:['L','N'];
  const warm=isCct?Math.max(0,Number(state?.warmWatts??0)/Number(c.params.channelWatts??12)):power;
  const cool=isCct?Math.max(0,Number(state?.coolWatts??0)/Number(c.params.channelWatts??12)):0;
  return <group scale={1/scale} onClick={e=>{e.stopPropagation();part('emitter');}}>
    <mesh><boxGeometry args={[.46,.023,.003]}/><meshStandardMaterial color="#e6ddd1" roughness={.63}/></mesh>
    {[-.0085,.0085].map(y=><mesh key={y} position={[0,y,.0018]}><boxGeometry args={[.45,.001,.0005]}/><meshStandardMaterial color="#bd8d52" metalness={.42} roughness={.38}/></mesh>)}
    <TapeDetails points={chipPositions} size={[.0058,.0062,.0018]} y={0} z={.003} body="#f4f0df"/>
    <TapeDetails points={isCct?warmChips:chipPositions} size={[.004,.0048,.0012]} y={0} z={.0041} body="#f2bf66" glow="#ffdf9c" level={Math.min(2.5,2.5*warm)}/>
    {isCct&&<TapeDetails points={coolChips} size={[.004,.0048,.0012]} y={0} z={.0041} body="#f2edce" glow="#e5f2ff" level={Math.min(2.5,2.5*cool)}/>}
    <TapeDetails points={resistors} size={[.003,.005,.0015]} y={0} z={.003} body="#514d47"/>
    {pins.map(id=><mesh key={id} position={tapePin(c,id,1)} onClick={e=>{e.stopPropagation();terminal(id);}}><boxGeometry args={[.008,.005,.0008]}/><meshStandardMaterial color="#bb884d" metalness={.45}/></mesh>)}
  </group>;
}
function WireTrace({doc,site,id}:{doc:CircuitDocument;site:JobSite;id?:string}){
  const trace=useMemo(()=>{
    const wire=doc.wires.find(w=>w.id===id);if(!wire)return;
    const endpoint=(e:Endpoint)=>{const c=doc.components.find(c=>c.id===e.component),item=site.items.find(i=>i.id===e.component);
      if(!c||!item)return;const t=getComponentTerminals(c,COMPONENTS[c.type]).find(t=>t.id===e.terminal);if(!t)return;
      const v=installedTape(c)?tapePin(c,t.id,item.scale):mountVector(c,t.anchor);return new THREE.Vector3(...item.position).add(new THREE.Vector3(...v).multiplyScalar(item.scale));};
    const a=endpoint(wire.from),b=endpoint(wire.to);if(!a||!b)return;
    const points=[a,new THREE.Vector3(a.x,a.y,a.z+.03),new THREE.Vector3(a.x,2.52,a.z+.03),new THREE.Vector3(b.x,2.52,a.z+.03),new THREE.Vector3(b.x,2.52,b.z+.03),new THREE.Vector3(b.x,b.y,b.z+.03),b];
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const material=new THREE.LineDashedMaterial({color:DRAWING_INK[wire.role],dashSize:.04,gapSize:.018,depthTest:false});
    const line=new THREE.Line(geometry,material);line.computeLineDistances();line.renderOrder=25;line.raycast=()=>{};return line;
  },[doc,site,id]);
  useEffect(()=>()=>{trace?.geometry.dispose();trace?.material.dispose();},[trace]);
  return trace?<primitive object={trace}/>:null;
}
function aim(item:SiteItem|undefined,id:number|undefined,close=false,height=.15):SitePose{
  const p=item?.position??[0,1.3,-2.5];
  if(!close&&id===7&&item?.id==='switch')return {position:[p[0]-.55,p[1]+.32,p[2]+1.75],yaw:-.36,pitch:0};
  if(!close&&id===65)return {position:[-4.14,1.76,-.88],yaw:.30,pitch:.08};
  if(!close&&id===80)return {position:[.56,1.65,4.64],yaw:-.29,pitch:.04};
  if(!close&&height<.40&&item?.room!==3)return {position:[p[0]-.35,Math.max(1.34,p[1]+.28),p[2]+1.63],yaw:-.20,pitch:p[1]>.95?-.085:-.36};
  const distance=close?Math.max(.32,Math.min(1.20,height*2.7)):item?.room===3?1.58:1.26;
  return {position:[p[0]+distance*.07,p[1]+height*.65+.025,p[2]+distance],yaw:.07,pitch:-.04};
}
function CameraRig({rig,walking,target,pose,jobKey,site,onRoom}:{site:JobSite;onRoom:(room:number)=>void;rig:Rig;walking:boolean;target:SitePose;pose:Props['pose'];jobKey:string}){
  const {camera,invalidate}=useThree();
  const roomRef=useRef(-1);const position=useRef(new THREE.Vector3()),rotation=useRef({yaw:0,pitch:0});
  useLayoutEffect(()=>{rig.wake=invalidate;return()=>{rig.wake=()=>{};rig.keys.clear();};},[invalidate,rig]);
  useLayoutEffect(()=>{position.current.set(...target.position);rotation.current={yaw:target.yaw,pitch:target.pitch};rig.turn=[0,0];rig.zoom=0;invalidate();},[target,jobKey,invalidate,rig]);
  useFrame((_,dt)=>{
    const p=position.current,r=rotation.current,keys=rig.keys;
    r.yaw-=rig.turn[0]*.003;r.pitch=Math.max(-1.18,Math.min(1.18,r.pitch-rig.turn[1]*.003));rig.turn=[0,0];
    const fwd=(Number(keys.has('up'))-Number(keys.has('down')))*(walking?1:0);
    const side=(Number(keys.has('right'))-Number(keys.has('left')))*(walking?1:0);
    const distance=Math.min(dt,.045)*1.8/Math.max(1,Math.hypot(fwd,side));
    const travel=distance*fwd+rig.zoom;rig.zoom=0;
    const dx=Math.cos(r.yaw)*side*distance-Math.sin(r.yaw)*travel,dz=-Math.sin(r.yaw)*side*distance-Math.cos(r.yaw)*travel;
    if(dx||dz){const next=walkStep([p.x,p.y,p.z],dx,dz,walking?site:undefined);p.set(...next);}
    if(walking){
      const stair=site.building.rooms[1]==='Stair hall'&&p.x> -2.13&&p.x< -1.35&&p.z<1.34&&p.z> -1.13;
      p.y=1.56+(stair?Math.min(8,1+Math.floor((1.34-p.z)/.29))*.17:0);
      const room=p.z>2.8?3:p.x< -2.2?0:p.x>2.2?2:1;if(room!==roomRef.current){roomRef.current=room;onRoom(room);}
    }
    camera.position.copy(p);camera.rotation.order='YXZ';camera.rotation.set(r.pitch,r.yaw,0,'YXZ');camera.updateMatrixWorld();
    pose.current={position:[p.x,p.y,p.z],...r};
    if(walking&&keys.size)invalidate();
  });
  return null;
}
class SiteBoundary extends React.Component<{children:React.ReactNode;onList:()=>void},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="site-unavailable"><b>The 3D site could not open</b><button onClick={this.props.onList}>Use equipment list</button></div>:this.props.children;}
}
const directions=[['up',ArrowUp],['left',ArrowLeft],['down',ArrowDown],['right',ArrowRight]] as const;
const keyMap:Record<string,string>={KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
export default function JobSiteView({site,doc,result,selected,terminalId,wire,touch,tool,jump,pose,onPart,onTerminal,onFocus,onService,onList}:Props){
  const rig=useMemo<Rig>(()=>({keys:new Set(),turn:[0,0],zoom:0,wake:()=>{}}),[]);
  const [walkRoom,setWalkRoom]=useState(site.room);const [walking,setWalking]=useState(false),[lost,setLost]=useState(false),[loadedKey,setLoadedKey]=useState(0);

  const input=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,{x:number;y:number;startX:number;startY:number}>()),blockTap=useRef(false);
  const selectedId=selected??site.first;
  const jobKey=site.kind+':'+(doc.lessonId??doc.id);
  const target=useMemo(()=>{
    const id=jump.component??site.first,item=site.items.find(e=>e.id===id),c=doc.components.find(c=>c.id===id);
    return pose.current??aim(item,doc.lessonId,!!jump.component,item&&c?COMPONENTS[c.type].size[1]*item.scale:undefined);
  },[jobKey,jump.id]);
  const stop=useCallback(()=>{rig.keys.clear();pointers.current.clear();blockTap.current=true;},[rig]);
  useEffect(()=>{window.addEventListener('blur',stop);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    function release(e:PointerEvent){pointers.current.delete(e.pointerId);}
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);stop();};},[stop]);
  useEffect(()=>{setWalking(false);stop();},[jump.id,jobKey,tool,stop]);
  function toggleWalk(){stop();setWalking(!walking);rig.wake();input.current?.focus({preventScroll:true});}
  function jumpTo(id:string){stop();setWalking(false);onFocus(id);}
  const fixtureMap=new Map(doc.components.map(c=>[c.id,c]));
  const selectedItem=site.items.find(s=>s.id===selectedId);
  const visible=site.items.filter(item=>fixtureMap.has(item.id));
  return <div className="jobsite" data-site={site.kind}>
    <div className="site-camera" ref={input} tabIndex={0} aria-label={walking?'Walk around the site. Use WASD or the movement pad.':'Installation view. Choose equipment or enter Walk.'}
      onKeyDown={e=>{if(e.key==='Escape'){stop();setWalking(false);}const key=keyMap[e.code];if(walking&&key){e.preventDefault();rig.keys.add(key);rig.wake();}}}
      onKeyUp={e=>{rig.keys.delete(keyMap[e.code]);}} onBlur={stop}
      onPointerDownCapture={e=>{const el=e.currentTarget;el.focus({preventScroll:true});blockTap.current=walking||pointers.current.size>0||e.button!==0;
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});}}
      onPointerMoveCapture={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;
        if(Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>5)blockTap.current=true;
        if(pointers.current.size===2){const other=[...pointers.current.entries()].find(([k])=>k!==e.pointerId)![1];const diff=Math.hypot(e.clientX-other.x,e.clientY-other.y)-Math.hypot(old.x-other.x,old.y-other.y);rig.zoom+=diff*.003;}
        else if(blockTap.current){rig.turn[0]+=dx;rig.turn[1]+=dy;}
        old.x=e.clientX;old.y=e.clientY;rig.wake();}}
      onPointerCancelCapture={()=>{stop();}} onClickCapture={e=>{if(blockTap.current){e.stopPropagation();e.preventDefault();}}}
      onWheel={e=>{rig.zoom+=Math.max(-.18,Math.min(.18,-e.deltaY*.001));rig.wake();}}>
      <SiteBoundary key={loadedKey} onList={onList}><Canvas shadows={!touch} frameloop="demand" dpr={touch?1:[1,1.5]} camera={{fov:49,near:.012,far:55}} gl={{antialias:!touch,powerPreference:'default'}}
        onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.99;gl.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setLost(true);},{once:true});}}>
        <color attach="background" args={['#cddedd']}/><hemisphereLight args={['#fff8e5','#a0a998',1.40]}/>
        <directionalLight castShadow={!touch} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-.0006} shadow-normalBias={.009} position={[-3.3,2.62,2.9]} intensity={1.55} color="#fff2db"/>
        <directionalLight position={[-4,2,1]} intensity={.55} color="#c2ddf4"/>
        <InstallationRoom site={site} economy={touch} cupboardOpen={!!fixtureMap.get('door')?.params.closed} operateCupboard={()=>{if(!blockTap.current&&!walking&&fixtureMap.has('door'))onPart('door','actuator');}}/>
        {visible.map(item=>{const c=fixtureMap.get(item.id)!,def=COMPONENTS[c.type];if(!def)return null;
          const optical=Math.min(1,Math.max(0,Number(result?.deviceStates[c.id]?.lightOutputPower??result?.componentPower[c.id]??0)/Math.max(1,Number(c.params.watts??def.defaults.watts??60))));
          const focus=item.id===selectedId;const t=focus&&getComponentTerminals(c,def).find(t=>t.id===terminalId);
          return <group key={item.id} position={item.position} rotation={[0,item.rotation,0]} scale={item.scale} userData={{siteComponent:item.id}}>
            <group rotation={[0,0,mountRoll(c)]} scale={mountScale(c)}>{doc.lessonId===65&&c.id==='door'?<group scale={1/item.scale} onClick={e=>{e.stopPropagation();if(!blockTap.current&&!walking)onPart(c.id,'actuator');}}><ContactHalf/></group>:installedTape(c)?<InstalledTape component={c} scale={item.scale} state={result?.deviceStates[c.id]} power={optical} part={part=>{if(!blockTap.current&&!walking)onPart(c.id,part);}} terminal={id=>{if(!blockTap.current&&!walking)onTerminal({component:c.id,terminal:id});}}/>:<Suspense fallback={null}><Equipment filledWays={filledWays(c,doc.components)} component={c} definition={def} state={result?.deviceStates[c.id]} selected={focus} lowDetail={!focus} preferLowAsset={touch}
              view="normal" showLabels={false} onPart={part=>{if(!blockTap.current&&!walking)onPart(c.id,part==='body'&&['switch','switch2','pushbutton'].includes(c.type)?'actuator':part);}} onTerminal={id=>{if(!blockTap.current&&!walking)onTerminal({component:c.id,terminal:id});}}/></Suspense>}
            {t&&<mesh position={installedTape(c)?tapePin(c,t.id,item.scale):t.anchor} renderOrder={15} raycast={()=>{}}><sphereGeometry args={[.065,12,8]}/><meshBasicMaterial color="#ffb34a" depthTest={false}/></mesh>}
            {c.type==='lamp'&&site.kind==='home'&&<group position={[0,.84,.015]} onClick={e=>{e.stopPropagation();if(!blockTap.current&&!walking)onPart(c.id,'lamp');}}>
              <mesh position={[0,-.21,-.48]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.43,.43,.09,32]}/><meshStandardMaterial color="#ad9670" roughness={.46} metalness={.42}/></mesh>
              <mesh position={[0,.36,0]}><cylinderGeometry args={[.32,.49,.66,36,1,true]}/><meshStandardMaterial color="#f7f1d9" side={THREE.DoubleSide} emissive="#ffe8b5" emissiveIntensity={.61*Math.sqrt(optical)} roughness={.84}/></mesh>
              {[[.32,.69],[.49,.03]].map(([r,h])=><mesh key={r} position={[0,h,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[r,.012,6,36]}/><meshStandardMaterial color="#baa37d" roughness={.55}/></mesh>)}
            </group>}
            {result?.deviceStates[c.id]?.energized&&/^(lamp|led|emergency|ledstrip|cctstrip)$/.test(c.type)&&<pointLight position={[0,def.size[1]*.75,.25]} color="#fff1cd" intensity={.48*optical} distance={2.6}/>}
          </group></group>;})}
        <WireTrace id={wire} doc={doc} site={site}/><CameraRig rig={rig} walking={walking} target={target} pose={pose} jobKey={jobKey} site={site} onRoom={setWalkRoom}/>
      </Canvas></SiteBoundary>
    </div>
    {lost&&<div className="site-unavailable" role="status"><p>Graphics paused. Your circuit is saved in the workbench.</p><button onClick={()=>{setLost(false);setLoadedKey(n=>n+1);}}>Restart site</button><button onClick={onList}>Equipment list</button></div>}
    <div className="site-location"><span className="location-dot"/>{site.building.name} <span> / </span> {site.location(walking?walkRoom:(selectedItem?.room??site.room))}{wire&&<span> · Connection trace</span>}</div>
    <div className="site-actions">
      <button className={walking?'chosen':''} aria-pressed={walking} onClick={toggleWalk}><Footprints size={17}/>{walking?'Finish walk':'Walk'}</button>
      <label className="site-jump"><LocateFixed size={17}/><span>Go to equipment</span><select aria-label="Go to equipment" value="" onChange={e=>jumpTo(e.target.value)}><option value="" disabled>Go to equipment</option>{visible.map(v=><option key={v.id} value={v.id}>{v.ref} · {fixtureMap.get(v.id)!.label} · {site.location(v.room)}</option>)}</select></label>
      {selectedId&&!walking&&<button aria-label="Inspect equipment on the workbench" onClick={()=>onService(selectedId)}><PanelTopOpen size={17}/><span>Inspect</span></button>}
    </div>
    {walking&&<div className="walking-pad" aria-label="Walk controls">{directions.map(([dir,Icon])=><button key={dir} aria-label={'Walk '+dir} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);rig.keys.add(dir);rig.wake();}} onPointerUp={()=>rig.keys.delete(dir)} onLostPointerCapture={()=>rig.keys.delete(dir)} onPointerCancel={()=>rig.keys.delete(dir)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){rig.keys.add(dir);rig.wake();}}} onKeyUp={()=>rig.keys.delete(dir)}><Icon size={19}/></button>)}</div>}
  </div>;
}
