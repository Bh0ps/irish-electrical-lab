import { COMPONENTS } from './components';
import type { JobSite,SiteItem } from './job-site';
import {getComponentTerminals} from './terminal-layout';
import type { CircuitDocument, ComponentInstance, Vec3, Wire } from './types';

// BG 877 surface box. The BG 851 mounts on the front rim, with the lead leaving below it.
export const FCU_BOX={width:.086,depth:.050,originY:.85,wallZ:-.90,fixingPitch:.0603};
export const FCU_ROCKER:Vec3=[.108,.46,.143];
export const FCU_OUTLET:Vec3=[-.16,.03,.050];
const FCU_SCALE=.1;

type Pose=Pick<SiteItem,'position'|'rotation'>;
function placed(pose:Pose,[x,y,z]:Vec3):Vec3 {
  const [px,py,pz]=pose.position,cos=Math.cos(pose.rotation),sin=Math.sin(pose.rotation);
  return [px+x*cos+z*sin,py+y,pz+z*cos-x*sin];
}
const metres=(v:Vec3):Vec3=>[v[0]*FCU_SCALE,v[1]*FCU_SCALE,v[2]*FCU_SCALE];
export function fusedPlatePose(item:SiteItem,open:boolean):Pose {
  if(!open)return item;
  return {position:placed(item,[.079,0,.093]),rotation:item.rotation+Math.PI-.24};
}
export function fusedPlateView(item:SiteItem,open:boolean,touch:boolean) {
  // Leave the box at the left and show the rear of the withdrawn plate at the right.
  const distance=open?(touch?.61:.36):.24;
  const target=open?placed(fusedPlatePose(item,true),[-.005,.049,-.008]):placed(item,[.004,.046,.011]);
  const position=placed(item,[open?.085:.022,open?.066:.061,distance]);
  const dx=target[0]-position[0],dz=target[2]-position[2];
  return {position,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(target[1]-position[1],Math.hypot(dx,dz))};
}
export function heaterFlexRun(doc:CircuitDocument){
  if(doc.lessonId!==20||!doc.components.some(c=>c.id==='fcu-switch'&&c.type==='fcu'))return;
  return doc.cableRuns?.find(run=>run.kind==='flex'&&(run.from.component==='fcu-switch'&&run.to.component==='fixed'||run.to.component==='fcu-switch'&&run.from.component==='fixed'));
}
function cordPoint(item:SiteItem,p:Vec3):Vec3{return placed(item,p.map(n=>n*item.scale) as Vec3);}
function cubic(a:Vec3,b:Vec3,c:Vec3,d:Vec3,t:number):Vec3{
  const f=1-t;
  return a.map((v,i)=>f*f*f*v+3*f*f*t*b[i]+3*f*t*t*c[i]+t*t*t*d[i]) as Vec3;
}
export function heaterFlexPath(fcu:SiteItem,heater:SiteItem,open:boolean):Vec3[]{
  const pose=fusedPlatePose(fcu,open);
  const a=placed(pose,metres(FCU_OUTLET));
  // The tail turns behind the heater at the edge of its rear terminal compartment.
  const d=cordPoint(heater,[.58,.40,-.465]);
  const b:Vec3=[a[0],a[1]-(open?.29:.54),a[2]];
  const c=placed({position:d,rotation:heater.rotation},[.13,-.09,0]);
  return Array.from({length:25},(_,i)=>cubic(a,b,c,d,i/24));
}
export function looseHeaterCore(doc:CircuitDocument,wire:Wire){
  return doc.faults.some(f=>f.enabled&&f.wire===wire.id&&['open-live','open-wire'].includes(f.type));
}
// Jacket continues 20 mm up from the outlet, through the moulded saddle at y=16.85 mm.
export function gripEnd(item:SiteItem,open:boolean):Vec3{
  return placed(fusedPlatePose(item,open),[-.016,.023,.005]);
}
function coreEnd(doc:CircuitDocument,wire:Wire,component:ComponentInstance,item:SiteItem,open:boolean){
  const end=wire.from.component===component.id?wire.from:wire.to;
  const contact=getComponentTerminals(component,COMPONENTS[component.type]).find(p=>p.id===end.terminal);
  if(!contact)return;
  const isFcu=component.type==='fcu';
  const pose=isFcu?fusedPlatePose(item,open):item;
  const local=contact.anchor.map(n=>n*item.scale) as Vec3;
  const loose=isFcu&&open&&looseHeaterCore(doc,wire);
  if(loose){local[0]-=.007;local[1]-=.007;local[2]-=.009;}
  const pin=placed(pose,local);
  const clearance=placed(pose,loose?[local[0]-.0015,local[1]-.006,local[2]-.0025]:[local[0],local[1],local[2]-.006]);
  return {pin,clearance,pose,loose};
}
/** The brown, blue and protective cores each retain their real two endpoints. Selecting
 * one shows its route through the common sheath. Legacy examples lack this fitted box. */
export function heaterFlexRoute(doc:CircuitDocument,site:JobSite,wire:Wire,open=false):Vec3[]|undefined{
  const run=heaterFlexRun(doc);if(!run||wire.cable?.runId!==run.id)return;
  const fcu=site.items.find(i=>i.id==='fcu-switch'),heater=site.items.find(i=>i.id==='fixed');
  if(!fcu||!heater||![wire.from.component,wire.to.component].includes(fcu.id)||![wire.from.component,wire.to.component].includes(heater.id))return;
  const src=doc.components.find(c=>c.id===fcu.id)!,dst=doc.components.find(c=>c.id===heater.id)!;
  const a=coreEnd(doc,wire,src,fcu,open),b=coreEnd(doc,wire,dst,heater,false);
  if(!a||!b)return;
  const spread=wire.cable?.core==='blue'?.0014:wire.cable?.core==='green-yellow'?-.0014:0;
  const y=wire.cable?.core==='brown'?.0011:-.0004;
  const jacket=placed(a.pose,[-.016+spread,.023,.005+y]);
  const fan=placed(a.pose,[-.025+spread,.029,-.005+y]);
  const bend=placed(a.pose,[-.022+spread,.024,.001+y]);
  const sweep=placed(a.pose,[wire.role==='PE'?-.029:wire.role==='N'?.013:-.016,wire.role==='PE'?.031:.036,-.018]);
  const path=[a.pin,a.clearance,sweep,fan,bend,jacket,...heaterFlexPath(fcu,heater,open),b.clearance,b.pin];
  return wire.from.component===fcu.id?path:path.reverse();
}
/** Only the existing live circuit wires enter the surface box. Yellow/green stays identifiable. */
export function fusedIncomingLead(doc:CircuitDocument,item:SiteItem,wire:Wire,open:boolean):Vec3[]|undefined{
  if(!item.fixture?.fusedHeater||![wire.from.component,wire.to.component].includes(item.id))return;
  const component=doc.components.find(c=>c.id===item.id)!;
  const core=coreEnd(doc,wire,component,item,open);if(!core)return;
  const n=wire.role==='N'?.004:wire.role==='PE'?-.004:0;
  const entry=placed(item,[n,.062,-FCU_BOX.depth+.0009]);
  // Behind the plate the incoming cores loop out of the rear knockout to the same terminals.
  const side=wire.role==='PE'?-.032:wire.role==='N'?.026:.010;
  const controlA=placed(core.pose,[side,wire.role==='N'?.019:.070,-(open?.043:.023)]);
  const controlB=placed(item,[n,.073,open?.070:-.025]);
  const arc=Array.from({length:12},(_,i)=>cubic(core.clearance,controlA,controlB,entry,i/11));
  return [core.pin,...arc];
}
