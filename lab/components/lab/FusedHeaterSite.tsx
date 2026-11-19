'use client';
import {useEffect,useMemo,useRef,type RefObject} from 'react';
import * as THREE from 'three';
import {FCU_BOX,fusedIncomingLead,heaterFlexPath,gripEnd,heaterFlexRoute,heaterFlexRun,heaterExposedCopper} from '../../lib/fused-heater-site';
import {heaterInsulationStart,makeHeaterCopperGeometry} from '../../lib/heater-copper';
import type {JobSite,SiteItem} from '../../lib/job-site';
import {CORE_COLOUR} from '../../lib/cables';
import type {CircuitDocument,Vec3,Wire} from '../../lib/types';
import {FittedWireTails} from './KitchenLighting';

function rounded(s:number,r:number) {
  const path=new THREE.Shape(),a=s/2;
  path.moveTo(-a+r,-a);path.lineTo(a-r,-a);path.quadraticCurveTo(a,-a,a,-a+r);
  path.lineTo(a,a-r);path.quadraticCurveTo(a,a,a-r,a);path.lineTo(-a+r,a);path.quadraticCurveTo(-a,a,-a,a-r);
  path.lineTo(-a,-a+r);path.quadraticCurveTo(-a,-a,-a+r,-a);return path;
}
/** Original BG 877-style surface pattress, 86 × 86 × 50 mm. The case stays on the wall
 * when the faceplate is released. The rear opening admits only the incoming supply. */
export function HeaterSwitchBox({item,select}:{item:SiteItem;select:()=>void}){
  const [shell,base,boss]=useMemo(()=>{
    const rim=rounded(FCU_BOX.width,.0045);
    const inside=rounded(FCU_BOX.width-.0046,.0025);
    rim.holes.push(new THREE.Path(inside.getPoints(5).reverse()));
    const back=rounded(FCU_BOX.width,.0045);
    const entry=new THREE.Path();entry.absellipse(0,.016,.008,.008,0,Math.PI*2,true,0);back.holes.push(entry);
    const lug=new THREE.Shape();lug.absarc(0,0,.0044,0,Math.PI*2,false);
    const thread=new THREE.Path();thread.absarc(0,0,.0018,0,Math.PI*2,true);lug.holes.push(thread);
    return [rim,back,lug];
  },[]);
  return <group position={item.position} rotation={[0,item.rotation,0]} userData={{fusedSurfaceBox:true,partId:'body'}}
    onClick={e=>{e.stopPropagation();if((e.nativeEvent as PointerEvent).pointerType!=='touch')select();}}>
    <group position={[0,.046,-FCU_BOX.depth]}>
      <mesh><extrudeGeometry args={[shell,{depth:FCU_BOX.depth,bevelEnabled:false,curveSegments:6}]}/><meshStandardMaterial color="#e4e1d8" roughness={.51}/></mesh>
      <mesh><extrudeGeometry args={[base,{depth:.0018,bevelEnabled:false,curveSegments:10}]}/><meshStandardMaterial color="#dedbd0" roughness={.58}/></mesh>
      {[-1,1].map(sign=><group key={sign} position={[sign*FCU_BOX.fixingPitch/2,0,.002]}>
        <mesh><extrudeGeometry args={[boss,{depth:FCU_BOX.depth-.005,bevelEnabled:false,curveSegments:8}]}/><meshStandardMaterial color="#d7d4cb"/></mesh>
        <mesh position={[0,0,FCU_BOX.depth-.004]}><ringGeometry args={[.00175,.0028,16]}/><meshStandardMaterial color="#a49769" metalness={.62} roughness={.45}/></mesh>
      </group>)}
      <mesh position={[0,.016,.0024]}><ringGeometry args={[.0063,.0085,18]}/><meshStandardMaterial color="#49494a" roughness={.9}/></mesh>
    </group>
  </group>;
}
function colour(wire:Wire){
  const core=wire.cable?.core??(wire.role==='N'?'blue':wire.role==='PE'?'green-yellow':'brown');
  return {colour:CORE_COLOUR[core],stripe:core==='green-yellow'?'#e0bb49':undefined};
}
type CopperHit={onCopperPick?:(wire:Wire)=>void;blocked?:RefObject<boolean>};
function LooseCopper({wire,frame,onCopperPick,blocked}:{wire:Wire;frame:THREE.Matrix4}&CopperHit){
  const copper=useMemo(()=>makeHeaterCopperGeometry(),[]);
  useEffect(()=>()=>copper.dispose(),[copper]);
  const pressed=useRef<{id:number;x:number;y:number}>(undefined);
  return <mesh name="Free brown heater flex · bare strands" matrix={frame} matrixAutoUpdate={false}
    geometry={copper} userData={{heaterCopperWire:wire.id}}
    onPointerDown={e=>{
      e.stopPropagation();
      pressed.current=e.button===0&&!blocked?.current?{id:e.pointerId,x:e.clientX,y:e.clientY}:undefined;
    }}
    onPointerUp={e=>{
      e.stopPropagation();const start=pressed.current;pressed.current=undefined;
      if(start?.id===e.pointerId&&!blocked?.current&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<=5)onCopperPick?.(wire);
    }}
    onPointerOut={()=>{pressed.current=undefined;}} onPointerCancel={()=>{pressed.current=undefined;}} onClick={e=>e.stopPropagation()}>
    <meshStandardMaterial name="Exposed heater flex copper" color="#c48050" roughness={.35} metalness={.63}/>
  </mesh>;
}
export function FittedHeaterFlex({site,doc,open,blockProbes=false,onCopperPick,blocked}:{site:JobSite;doc:CircuitDocument;open:boolean;blockProbes?:boolean}&CopperHit){
  const run=heaterFlexRun(doc),fcu=site.items.find(i=>i.fixture?.fusedHeater),heater=site.items.find(i=>i.id==='fixed');
  if(!fcu||!heater)return null;
  const copper=heaterExposedCopper(doc,site,open);
  const tails:{points:Vec3[];colour:string;id:string;radius:number;stripe?:string;flexible?:boolean}[]=[];
  if(run)tails.push({points:[gripEnd(fcu,open),...heaterFlexPath(fcu,heater,open)],id:run.id,colour:'#ebe6da',radius:.0032,flexible:true});
  if(open){
    for(const wire of doc.wires){
      const out=heaterFlexRoute(doc,site,wire,true);
      if(out){
        const lead=(wire.from.component===fcu.id?out:[...out].reverse()).slice(0,6);
        if(copper?.wire.id===wire.id)lead[0]=heaterInsulationStart(copper.frame);
        tails.push({points:lead,id:wire.id,...colour(wire),radius:.00105});
      }else{
        const incoming=fusedIncomingLead(doc,fcu,wire,true);
        if(incoming)tails.push({points:incoming,id:wire.id,...colour(wire),radius:.0011});
      }
    }
  }
  return <group userData={{heaterFlex:true}}><FittedWireTails tails={tails} blockProbes={blockProbes}/>
    {copper&&<LooseCopper {...copper} onCopperPick={onCopperPick} blocked={blocked}/>}
  </group>;
}
