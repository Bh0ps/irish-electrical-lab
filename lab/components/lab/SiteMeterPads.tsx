import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {useRef,type RefObject} from 'react';
import {siteContacts,type SiteTestFitting} from '../../lib/site-meter';
import {rockerProbeApproach} from '../../lib/dc-rocker';
import {ROCKER_BOX} from '../../lib/kitchen-lighting';
import type { Endpoint,Vec3 } from '../../lib/types';

export interface SiteMeter {
  probe:'red'|'black';
  red?:Endpoint;
  black?:Endpoint;
}

/** The end of the metal tip rests at the contact. The handle leaves on the accessible side. */
function PlacedProbe({direction,red}:{direction:Vec3;red:boolean}){
  const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...direction).normalize());
  const grip=red?'#9b302b':'#282c31';
  return <group quaternion={orientation}>
    <mesh position={[0,.0016,0]} raycast={()=>{}}><cylinderGeometry args={[.00048,.00010,.0032,12]}/><meshStandardMaterial color="#a6acae" metalness={.76} roughness={.31}/></mesh>
    <mesh position={[0,.0072,0]} raycast={()=>{}}><cylinderGeometry args={[.00155,.00075,.008,12]}/><meshStandardMaterial color={grip}/></mesh>
    <mesh position={[0,.0122,0]} raycast={()=>{}}><cylinderGeometry args={[.0037,.0032,.002,16]}/><meshStandardMaterial color={grip}/></mesh>
    <mesh position={[0,.043,0]} raycast={()=>{}}><cylinderGeometry args={[.0025,.0028,.060,16]}/><meshStandardMaterial color={grip}/></mesh>
    <mesh position={[0,.077,0]} raycast={()=>{}}><cylinderGeometry args={[.00125,.0024,.008,12]}/><meshStandardMaterial color={grip}/></mesh>
    <mesh position={[0,.141,0]} raycast={()=>{}}><cylinderGeometry args={[.0011,.0011,.12,10]}/><meshStandardMaterial color={grip}/></mesh>
  </group>;
}
export default function SiteMeterPads({fitting,open,showLabels,meter,pick,blocked}:{
  fitting:SiteTestFitting; open:boolean; showLabels:boolean; meter:SiteMeter; pick:(point:Endpoint)=>void; blocked:RefObject<boolean>;
}){
  const pressed=useRef<Endpoint|undefined>(undefined);
  return <>{siteContacts(fitting,open).map(({position,endpoint,label})=>{
    const here=(point?:Endpoint)=>point?.component===endpoint.component&&point.terminal===endpoint.terminal;
    const leads=[here(meter.red)?'Red':'',here(meter.black)?'Black':''].filter(Boolean).join(' + ');
    const positive=endpoint.terminal==='L'||endpoint.terminal==='OUT';
    const tip=(red:boolean):Vec3=>{
      if(fitting.kind==='strip')return [red?-.68:.68,-.47,.40];
      const [x,y]=rockerProbeApproach,angle=ROCKER_BOX.rearYaw;
      return [x*Math.cos(angle),y+(!red&&here(meter.red)?.20:0),-x*Math.sin(angle)];
    };
    return <group key={endpoint.terminal} position={position}>
      {here(meter.red)&&<PlacedProbe red direction={tip(true)}/>}
      {here(meter.black)&&<PlacedProbe red={false} direction={tip(false)}/>}
      {showLabels&&<Html center zIndexRange={[2,1]}>
        <div className={'site-pad '+(positive?'site-pad-positive':'site-pad-negative')+(fitting.kind==='rocker'?' site-pad-rocker':'')}>
          <i aria-hidden="true"/>
          <button type="button" aria-label={`Place ${meter.probe} probe on ${fitting.component.label} ${label}${leads?', '+leads+' here':''}`}
            onPointerDown={event=>{
              const r=event.currentTarget.getBoundingClientRect();
              pressed.current=event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom?endpoint:undefined;
            }} onPointerCancel={()=>{pressed.current=undefined;}}
            onClick={event=>{event.stopPropagation();if(!event.detail||(!blocked.current&&here(pressed.current)))pick(endpoint);pressed.current=undefined;}}>
            <b>{label}</b>{leads&&<small>{leads}</small>}
          </button>
        </div>
      </Html>}
    </group>;
  })}</>;
}
