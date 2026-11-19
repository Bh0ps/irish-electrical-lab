'use client';
import {useMemo} from 'react';
import * as THREE from 'three';
import {FCU_BOX,fusedIncomingLead,heaterFlexPath,gripEnd,heaterFlexRoute,heaterFlexRun,looseHeaterCore} from '../../lib/fused-heater-site';
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
export function FittedHeaterFlex({site,doc,open}:{site:JobSite;doc:CircuitDocument;open:boolean}){
  const run=heaterFlexRun(doc),fcu=site.items.find(i=>i.fixture?.fusedHeater),heater=site.items.find(i=>i.id==='fixed');
  if(!fcu||!heater)return null;
  const tails:{points:Vec3[];colour:string;id:string;radius:number;stripe?:string;flexible?:boolean}[]=[];
  if(run)tails.push({points:[gripEnd(fcu,open),...heaterFlexPath(fcu,heater,open)],id:run.id,colour:'#ebe6da',radius:.0032,flexible:true});
  if(open){
    for(const wire of doc.wires){
      const out=heaterFlexRoute(doc,site,wire,true);
      if(out){
        const lead=(wire.from.component===fcu.id?out:[...out].reverse()).slice(0,6);
        const loose=looseHeaterCore(doc,wire);
        if(loose){
          const [end,away]=lead;
          const tip=end.map((p,i)=>p*.60+away[i]*.40) as Vec3;
          tails.push({points:[end,tip],id:wire.id+':tip',colour:'#b56c39',radius:.00059});lead[0]=tip;
        }
        tails.push({points:lead,id:wire.id,...colour(wire),radius:.00105});
      }else{
        const incoming=fusedIncomingLead(doc,fcu,wire,true);
        if(incoming)tails.push({points:incoming,id:wire.id,...colour(wire),radius:.0011});
      }
    }
  }
  return <group userData={{heaterFlex:true}}><FittedWireTails tails={tails}/></group>;
}
