import { Html } from '@react-three/drei';
import {useRef,type RefObject} from 'react';
import {fusedProbePose,sesameSiteProbe,siteContacts,type SiteTestFitting} from '../../lib/site-meter';
import {rockerProbeApproach} from '../../lib/dc-rocker';
import {ROCKER_BOX} from '../../lib/kitchen-lighting';
import {MeterProbe} from './MeterProbe';
import type { Endpoint,Vec3 } from '../../lib/types';

export interface SiteMeter {
  probe:'red'|'black';
  red?:Endpoint;
  black?:Endpoint;
}

export default function SiteMeterPads({fitting,open,showLabels,meter,pick,blocked}:{
  fitting:SiteTestFitting; open:boolean; showLabels:boolean; meter:SiteMeter; pick:(point:Endpoint)=>void; blocked:RefObject<boolean>;
}){
  const pressed=useRef<Endpoint|undefined>(undefined);
  const contacts=siteContacts(fitting,open);
  return <>{contacts.map(({position,endpoint,label})=>{
    const here=(point?:Endpoint)=>point?.component===endpoint.component&&point.terminal===endpoint.terminal;
    const leads=[here(meter.red)?'Red':'',here(meter.black)?'Black':''].filter(Boolean).join(' + ');
    const positive=endpoint.terminal==='L'||endpoint.terminal==='OUT';
    if(fitting.kind==='fcu'||fitting.kind==='sesame'){
      return <group key={endpoint.terminal}>{(['red','black'] as const).map(lead=>{
        if(!here(meter[lead]))return null;
        const probe=fitting.kind==='sesame'?sesameSiteProbe:fusedProbePose;
        const seat=probe(fitting.item,fitting.component,endpoint.terminal,lead==='black'&&here(meter.red));
        return seat&&<group key={lead} position={seat.position}><MeterProbe red={lead==='red'} direction={seat.approach}/></group>;
      })}</group>;
    }
    const tip=(red:boolean):Vec3=>{
      if(fitting.kind==='chime'){
        const other=red?meter.black:meter.red;
        const at=contacts.find(p=>p.endpoint.component===other?.component&&p.endpoint.terminal===other.terminal);
        const above=at&&at.position[1]!==position[1]?position[1]>at.position[1]:red;
        return [.61,above?.52:-.27,.70];
      }
      if(fitting.kind==='strip')return [red?-.68:.68,-.47,.40];
      const [x,y]=rockerProbeApproach,angle=ROCKER_BOX.rearYaw;
      return [x*Math.cos(angle),y+(!red&&here(meter.red)?.20:0),-x*Math.sin(angle)];
    };
    return <group key={endpoint.terminal} position={position}>
      {here(meter.red)&&<MeterProbe red direction={tip(true)}/>}
      {here(meter.black)&&<MeterProbe red={false} direction={tip(false)}/>}
      {showLabels&&fitting.kind!=='chime'&&<Html center zIndexRange={[2,1]}>
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
