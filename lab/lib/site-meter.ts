import { COMPONENTS } from './components';
import { fixturePoint,installedTerminalPoint } from './site-fixtures';
import {rockerPanelCentre,rockerPose} from './kitchen-lighting';
import {rockerProbeContact} from './dc-rocker';
import { getComponentTerminals } from './terminal-layout';
import type { JobSite, SiteItem } from './job-site';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3 } from './types';

export interface SiteTestFitting {
  kind:'strip'|'rocker'; item:SiteItem; component:ComponentInstance;
}
export interface SiteContact {endpoint:Endpoint;label:string;position:Vec3}
export function worktopTestPoints(doc:CircuitDocument,site:JobSite):SiteTestFitting[]{
  if(site.kind!=='home'||![66,68].includes(doc.lessonId??0))return [];
  const fittings:SiteTestFitting[]=[];
  for(const component of doc.components){
    const item=site.items.find(entry=>entry.id===component.id);
    if(!item?.fixture)continue;
    if(component.type==='led'&&component.variant==='strip'&&item.fixture.tape)fittings.push({kind:'strip',item,component});
    else if(item.fixture.worktopRocker)fittings.push({kind:'rocker',item,component});
  }
  return fittings;
}

export function siteContacts({kind,item,component}:SiteTestFitting,open:boolean):SiteContact[]{
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
