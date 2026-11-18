import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { CircuitDocument, Endpoint, Vec3 } from '../../lib/types';
import { terminalPosition, terminalDirection, type CircuitRoutes } from '../../lib/routing';
import type { WorkshopVisual } from '../../lib/termination-practice';

const up=new THREE.Vector3(0,1,0);
const ignore:THREE.Mesh['raycast']=()=>{};
export function testerPose(doc:CircuitDocument,routing:CircuitRoutes,wireId?:string){
  const parked={position:new THREE.Vector3(doc.components[0]?.position[0]??-4,0,3),rotation:new THREE.Quaternion(),sampled:undefined};
  const w=doc.wires.find(w=>w.id===wireId);
  if(!w)return parked;
  // For multicore sheaths, seat the fork on an exposed single tail.
  const path=w.cable?routing.cables?.get(w.cable.runId)?.tails.get(w.id)?.[0]:routing.routes.get(w.id);
  if(!path||path.length<2)return parked;
  let best=0,segment=0;
  for(let i=1;i<path.length;i++){
    const a=new THREE.Vector3(...path[i-1]),b=new THREE.Vector3(...path[i]),d=b.sub(a),length=d.length();
    if(length<=best||Math.abs(d.y)>.8*length)continue;
    best=length;segment=i;
  }
  if(!segment)return parked;
  const a=new THREE.Vector3(...path[segment-1]),b=new THREE.Vector3(...path[segment]),center=a.clone().lerp(b,.5);
  // A loose core resting on the bench needs enough space under it to seat the jaws.
  // Lift just the exposed span. Its original anchors, measured branch and saved bends stay fixed.
  const lift=Math.max(0,.32-center.y);
  const sampled=lift>0?{
    path,points:[...path.slice(0,segment),...([.18,.39,.61,.82].map((t,i)=>{
      const v=a.clone().lerp(b,t);v.y+=lift*(i===1||i===2?1:.25);return v.toArray() as Vec3;
    })),...path.slice(segment)]
  }:undefined;
  center.y+=lift;
  const normal=b.clone().sub(a).normalize();
  if(normal.z<-.01||Math.abs(normal.z)<.01&&normal.x<0)normal.negate();
  const alongDesk=new THREE.Vector3().crossVectors(up,normal).normalize();
  const above=new THREE.Vector3().crossVectors(normal,alongDesk).normalize();
  const pitch=THREE.MathUtils.clamp((center.y-.28)/1.58,-.18,.65);
  const towardWire=alongDesk.multiplyScalar(Math.sqrt(1-pitch*pitch)).addScaledVector(above,pitch);
  const across=new THREE.Vector3().crossVectors(towardWire,normal).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,towardWire,normal));
  return {position:center.addScaledVector(towardWire,-1.58),rotation,sampled};
}
function Link({a,b,r,c,metal=false}:{a:THREE.Vector3;b:THREE.Vector3;r:number;c:string;metal?:boolean}){
  const delta=b.clone().sub(a),len=delta.length();
  if(len<.001)return null;
  return <mesh position={a.clone().lerp(b,.5)} quaternion={new THREE.Quaternion().setFromUnitVectors(up,delta.normalize())} raycast={ignore}><cylinderGeometry args={[r,r,len,12]}/><meshStandardMaterial color={c} roughness={metal?.26:.55} metalness={metal?.75:.02}/></mesh>;
}
export function TestLead({doc,endpoint,origin,negative}:{doc:CircuitDocument;endpoint:Endpoint;origin:THREE.Vector3;negative:boolean}){
  const shape=useMemo(()=>{
    const tip=new THREE.Vector3(...terminalPosition(doc,endpoint));
    const normal=new THREE.Vector3(...terminalDirection(doc,endpoint)).normalize();
    const shaft=tip.clone().addScaledVector(normal,.08),grip=tip.clone().addScaledVector(normal,.33);
    const outlet=origin.clone().add(new THREE.Vector3(negative?-.1:.1,.15,0));
    const slack=outlet.clone().lerp(grip,.48);slack.y=Math.max(.07,slack.y-.3);slack.z+=negative?.22:.48;
    return {tip,shaft,grip,normal,curve:new THREE.CatmullRomCurve3([outlet,slack,grip.clone().addScaledVector(normal,.18),grip])};
  },[doc,endpoint,origin,negative]);
  const c=negative?'#272a30':'#bd342e';
  return <group><mesh raycast={ignore}><tubeGeometry args={[shape.curve,30,.015,7,false]}/><meshStandardMaterial color={c}/></mesh>
    <Link a={shape.tip} b={shape.shaft} r={.012} c="#b4b7b9" metal/>
    <Link a={shape.shaft} b={shape.grip} r={.034} c={c}/>
    <Link a={shape.shaft} b={shape.shaft.clone().addScaledVector(shape.normal,.025)} r={.067} c={c}/></group>;
}
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
function SampleLabel({text,at,width,height}:{text:string;at:Vec3;width:number;height:number}){
  const map=useMemo(()=>{
    const c=document.createElement('canvas');c.width=384;c.height=80;
    const ctx=c.getContext('2d')!;ctx.fillStyle='#e1e3d8';ctx.fillRect(0,0,384,80);
    ctx.fillStyle='#283532';ctx.font='bold 53px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,41,368);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  },[text]);
  useEffect(()=>()=>map.dispose(),[map]);
  return <mesh position={at} raycast={ignore}><planeGeometry args={[width,height]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>;
}
export function MaterialSample({visual}:{visual:WorkshopVisual}){
  const {task,setting,applied,accepted}=visual;
  if(task==='torque')return <>
    <SampleLabel text={setting===undefined?'N·m':setting.toFixed(1)+' N·m'} at={[0,.655,.113]} width={.122} height={.038}/>
    <group position={[0,1.22,0]}>
      <mesh position={[0,.169,0]} raycast={ignore}><boxGeometry args={[.35,.305,.26]}/><meshStandardMaterial color="#dcded6"/></mesh>
      {[-1,1].map(side=><mesh key={side} position={[side*.137,.057,.018]} raycast={ignore}><boxGeometry args={[.058,.107,.30]}/><meshStandardMaterial color="#c2c6c0"/></mesh>)}
      <mesh position={[0,.052,.014]} raycast={ignore}><boxGeometry args={[.212,.055,.198]}/><meshStandardMaterial color="#535b5b"/></mesh>
      <mesh position={[0,.02,.014]} rotation={[0,applied?.65:0,0]} raycast={ignore}><cylinderGeometry args={[.069,.069,.032,20]}/><meshStandardMaterial color="#9b9380" metalness={.58} roughness={.35}/></mesh>
      <mesh position={[0,.003,.014]} rotation={[0,applied?.65:0,0]} raycast={ignore}><boxGeometry args={[.080,.005,.014]}/><meshStandardMaterial color="#39404a"/></mesh>
      <mesh position={[0,.11,.133]} raycast={ignore}><boxGeometry args={[.153,.069,.013]}/><meshStandardMaterial color="#3a4347"/></mesh>
      <mesh position={[0,.109,.146]} raycast={ignore}><boxGeometry args={[.117,.022,.015]}/><meshStandardMaterial color="#9b9380"/></mesh>
      <SampleLabel text="MBN106W · B6" at={[0,.21,.134]} width={.28} height={.062}/>
    </group></>;
  const cut=task==='strip'?(applied?Math.max(.1,(setting??0)*.021):0):.22;
  const y=1.095,tip=.16,shoulder=tip-cut,color='#4674a8';
  return <group><group rotation={[0,Math.PI/2,0]} position={[0,0,task==='crimp'&&applied ? .05 : .13]}><Link a={v(-.55,y,0)} b={v(shoulder,y,0)} r={.039} c={color}/>
    {task==='strip'&&<group rotation={[0,-Math.PI/2,0]} position={[-.22,.96,.23]}><mesh raycast={ignore}><boxGeometry args={[.4,.125,.17]}/><meshStandardMaterial color="#c7c8bb" transparent opacity={.68}/></mesh>{[-.124,0,.124].map(x=><mesh key={x} position={[x,.055,.022]} raycast={ignore}><boxGeometry args={[.101,.045,.143]}/><meshStandardMaterial color="#e9792e"/></mesh>)}<mesh position={[0,-.024,.09]} raycast={ignore}><boxGeometry args={[.231,.012,.006]}/><meshStandardMaterial color="#373934"/></mesh></group>}
    {task==='strip'&&cut>0&&<><Link a={v(shoulder,y,0)} b={v(tip,y,0)} r={.019} c="#b5774c" metal/><Link a={v(tip+.08,y-.12,.08)} b={v(tip+.08+cut,y-.12,.08)} r={.039} c={color}/></>}
    {task==='crimp'&&<>{Array.from({length:7},(_,i)=><Link key={i} a={v(shoulder,y+.011*Math.sin(i),.012*Math.cos(i))} b={v(tip,y+.016*Math.sin(i),.016*Math.cos(i))} r={.006} c="#b3754e" metal/>)}
      {setting!==undefined&&<group position={[applied && accepted ? .05 : .19,y,0]} scale={[1,applied && accepted ? .74 : 1,1]}>
        <Link a={v(-.11,0,0)} b={v(-.05,0,0)} r={.047} c="#777d80"/><Link a={v(-.05,0,0)} b={v(.11,0,0)} r={.028*Math.sqrt(setting/.75)} c="#b9babc" metal/></group>}</>}
  </group></group>;
}
