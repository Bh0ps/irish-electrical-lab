import { COMPONENTS } from './components';
import { fixturePoint,installedTerminalPoint } from './site-fixtures';
import {rockerPanelCentre,rockerPose} from './kitchen-lighting';
import {rockerProbeContact} from './dc-rocker';
import {cromaProbeContact} from './croma-chime';
import { getComponentTerminals } from './terminal-layout';
import type { JobSite, SiteItem } from './job-site';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3 } from './types';

export interface SiteTestFitting {
  kind:'strip'|'rocker'|'chime'; item:SiteItem; component:ComponentInstance;
}
export interface SiteContact {endpoint:Endpoint;label:string;position:Vec3}
export function installedTestFittings(doc:CircuitDocument,site:JobSite):SiteTestFitting[]{
  if(site.kind!=='home'||![66,68,72].includes(doc.lessonId??0))return [];
  const fittings:SiteTestFitting[]=[];
  for(const component of doc.components){
    const item=site.items.find(entry=>entry.id===component.id);
    if(!item?.fixture)continue;
    if(item.fixture.croma)fittings.push({kind:'chime',item,component});
    else if(component.type==='led'&&component.variant==='strip'&&item.fixture.tape)fittings.push({kind:'strip',item,component});
    else if(item.fixture.worktopRocker)fittings.push({kind:'rocker',item,component});
  }
  return fittings;
}

export function siteContacts({kind,item,component}:SiteTestFitting,open:boolean):SiteContact[]{
  if(kind==='chime'){
    if(!open)return [];
    return getComponentTerminals(component,COMPONENTS[component.type]).flatMap(t=>{
      const screw=cromaProbeContact(t.id);
      return screw?[{endpoint:{component:component.id,terminal:t.id},label:t.label,
        position:fixturePoint(item.position,item.scale,item.fixture,component,screw.position,item.rotation)}]:[];
    });
  }
  if(kind==='rocker'&&!open)return [];
  const pose=rockerPose(item.position,true);
  return getComponentTerminals(component,COMPONENTS[component.type]).map(terminal=>({
    endpoint:{component:component.id,terminal:terminal.id},
    label:kind==='rocker'?(terminal.id==='OUT'?'1 · To strip':'2 · From driver'):terminal.label,
    // The wire fits on the end. The simulated probe touches the side of the
    // same blade, in the gap between the case and the fitted receptacle.
    position:kind==='rocker'?fixturePoint(pose.position,item.scale,item.fixture,component,rockerProbeContact(terminal.id),pose.rotation)
      :installedTerminalPoint(item,component,terminal)
  }));
}

export function padCamera(fitting:SiteTestFitting,open:boolean,touch:boolean){
  if(fitting.kind==='chime'){
    const [x,y,z]=fitting.item.position;
    if(!open)return {position:[x-.008,y+.106,z+.34] as Vec3,yaw:-.02,pitch:-.03};
    const centre=siteContacts(fitting,true).find(p=>p.endpoint.terminal==='FRONT')!.position;
    // Look down slightly so each marking is visible above the core in its cage.
    const dz=touch?.065:.081,dy=dz*.49;
    return {position:[centre[0],centre[1]+dy,centre[2]+dz] as Vec3,yaw:0,pitch:-Math.atan2(dy,dz)};
  }
  if(fitting.kind==='rocker'){
    const p=rockerPanelCentre(fitting.item.position,open);
    const distance=open?(touch?.095:.087):.14;
    return {position:[p[0]+.048,p[1]+.040,p[2]+distance] as Vec3,yaw:Math.atan2(.048,distance),pitch:-Math.atan2(.040,Math.hypot(.048,distance))};
  }
  const [a,b]=siteContacts(fitting,open);
  const centre=a.position.map((n,i)=>(n+b.position[i])/2) as Vec3;
  const position:Vec3=[centre[0],centre[1]-.072,centre[2]+.056];
  return {position,yaw:0,pitch:Math.atan2(.072,.056)};
}
