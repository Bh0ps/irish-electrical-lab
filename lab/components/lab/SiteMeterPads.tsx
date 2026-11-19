import { Html } from '@react-three/drei';
import type { RefObject } from 'react';
import type { SiteTestStrip } from '../../lib/site-meter';
import type { Endpoint } from '../../lib/types';

export interface SiteMeter {
  probe:'red'|'black';
  red?:Endpoint;
  black?:Endpoint;
}

export default function SiteMeterPads({strip,meter,pick,blocked}:{
  strip:SiteTestStrip; meter:SiteMeter; pick:(point:Endpoint)=>void; blocked:RefObject<boolean>;
}){
  return <>{strip.pads.map(({position,endpoint,label})=>{
    const here=(point?:Endpoint)=>point?.component===endpoint.component&&point.terminal===endpoint.terminal;
    const leads=[here(meter.red)?'Red':'',here(meter.black)?'Black':''].filter(Boolean).join(' + ');
    const positive=endpoint.terminal==='L';
    return <group key={endpoint.terminal} position={position}>
      <Html center zIndexRange={[2,1]}>
        <div className={'site-pad '+(positive?'site-pad-positive':'site-pad-negative')}>
          <i aria-hidden="true"/>
          <button type="button" aria-label={`Place ${meter.probe} probe on ${strip.component.label} ${label}${leads?', '+leads+' here':''}`}
            onClick={event=>{event.stopPropagation();if(!event.detail||!blocked.current)pick(endpoint);}}>
            <b>{label}</b>{leads&&<small>{leads}</small>}
          </button>
        </div>
      </Html>
    </group>;
  })}</>;
}
