import { COMPONENTS } from './components';
import { installedTerminalPoint } from './site-fixtures';
import { getComponentTerminals } from './terminal-layout';
import type { JobSite, SiteItem } from './job-site';
import type { CircuitDocument, ComponentInstance, Vec3 } from './types';

export function worktopTestPoints(doc:CircuitDocument,site:JobSite){
  // These are the exposed single-colour strips fitted under the kitchen cabinets.
  // The cupboard-door strip and enclosed drivers do not offer these access points.
  if(site.kind!=='home'||![66,68].includes(doc.lessonId??0))return [];
  return doc.components.flatMap(component=>{
    if(component.type!=='led'||component.variant!=='strip')return [];
    const item=site.items.find(entry=>entry.id===component.id);
    if(!item?.fixture?.tape)return [];
    return [{item,component,pads:tapePads(item,component)}];
  });
}

function tapePads(item:SiteItem,component:ComponentInstance){
  return getComponentTerminals(component,COMPONENTS[component.type]).map(terminal=>({
    endpoint:{component:component.id,terminal:terminal.id},
    label:terminal.label, position:installedTerminalPoint(item,component,terminal)
  }));
}
export type SiteTestStrip = ReturnType<typeof worktopTestPoints>[number];

export function padCamera(strip:SiteTestStrip){
  const [a,b]=strip.pads;
  const centre=a.position.map((n,i)=>(n+b.position[i])/2) as Vec3;
  const position:Vec3=[centre[0],centre[1]-.072,centre[2]+.056];
  return {position,yaw:0,pitch:Math.atan2(.072,.056)};
}
