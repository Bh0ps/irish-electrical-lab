import { COMPONENTS } from './components';
import type { JobSite,SiteItem } from './job-site';
import type {SitePose} from './site-camera';
import {PLXE_BODY_BOTTOM,PLXE_FLEX_EXIT,PLXE_MM_PER_UNIT} from './plxe';
import {installedTerminalPoint} from './site-fixtures';
import {getComponentTerminals} from './terminal-layout';
import type { CircuitDocument, ComponentInstance, Vec3, Wire } from './types';

// BG 877 surface box. The BG 851 mounts on the front rim, with the lead leaving below it.
export const FCU_BOX={width:.086,depth:.050,originY:.85,wallZ:-.90,fixingPitch:.0603};
export const FCU_ROCKER:Vec3=[.108,.46,.143];
export const FCU_OUTLET:Vec3=[-.16,.03,.050];
const FCU_SCALE=.1;
// Kitchen-side wall. This is the room's mounting choice; the heater's lower edge
// is 320 mm above the floor, and the switch is to its right, out of the hot air.
export const KITCHEN_PANEL={originY:.32-PLXE_BODY_BOTTOM*PLXE_MM_PER_UNIT/1000,wallZ:-1.46,width:.450,height:.430,depth:.108};

type Pose=Pick<SiteItem,'position'|'rotation'>;
function placed(pose:Pose,[x,y,z]:Vec3):Vec3 {
  const [px,py,pz]=pose.position,cos=Math.cos(pose.rotation),sin=Math.sin(pose.rotation);
  return [px+x*cos+z*sin,py+y,pz+z*cos-x*sin];
}
const metres=(v:Vec3):Vec3=>[v[0]*FCU_SCALE,v[1]*FCU_SCALE,v[2]*FCU_SCALE];
function lookFrom(position:Vec3,target:Vec3):SitePose{
  const dx=target[0]-position[0],dz=target[2]-position[2];
  return {position,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(target[1]-position[1],Math.hypot(dx,dz))};
}
/** Face the two fittings squarely across the clear kitchen floor. A narrow
 * portrait canvas needs more distance across the panel than a landscape one. */
export function fittedHeaterView(heater:SiteItem,shot:'overview'|'walk'|'appliance',aspect:number):SitePose{
  const appliance=shot==='appliance',walk=shot==='walk';
  const width=appliance?.56:.985,aspectRatio=Math.max(.32,aspect);
  const distance=Math.max(appliance?.69:walk?1.0:1.31,width/(.912*aspectRatio));
  const x=appliance?.025:.190;
  const y=(appliance?.534:walk?.605:.595)-heater.position[1];
  const target=placed(heater,[x,y,.062]);
  const height=walk?1.56-heater.position[1]:y+(appliance?.29+.36*distance:.25);
  const position=placed(heater,[x+(appliance?.125:.035),height,distance+.062]);
  const view=lookFrom(position,target);
  return {...view,fitOnResize:true};
}
/** Rotating a phone can reframe a fresh arrival. Once someone has turned or
 * taken a step, keep that person's spot and heading through the resize. */
export function sameSiteView(a:SitePose,b:SitePose){
  return a.position.every((v,i)=>Math.abs(v-b.position[i])<.00001)
    &&Math.abs(a.yaw-b.yaw)<.00001&&Math.abs(a.pitch-b.pitch)<.00001;
}
export function fusedPlatePose(item:SiteItem,open:boolean):Pose {
  if(!open)return item;
  return {position:placed(item,[.079,0,.093]),rotation:item.rotation+Math.PI-.24};
}
export function fusedPlateView(item:SiteItem,open:boolean,touch:boolean) {
  // Leave the box at the left and show the rear of the withdrawn plate at the right.
  const distance=open?(touch?.61:.36):.24;
  const target=open?placed(fusedPlatePose(item,true),[-.005,.049,-.008]):placed(item,[.004,.046,.011]);
  const position=placed(item,[open?.085:.022,open?.066:.061,distance]);
  return lookFrom(position,target);
}
export function heaterFlexRun(doc:CircuitDocument){
  const id=doc.lessonId===20?'fcu-switch':doc.lessonId===19&&doc.components.some(c=>c.id==='fixed'&&c.variant==='plx050e')?'branch-fuse':undefined;
  if(!id||!doc.components.some(c=>c.id===id&&c.type==='fcu'))return;
  return doc.cableRuns?.find(run=>run.kind==='flex'&&(run.from.component===id&&run.to.component==='fixed'||run.to.component===id&&run.from.component==='fixed'));
}
function cordPoint(item:SiteItem,p:Vec3):Vec3{return placed(item,p.map(n=>n*item.scale) as Vec3);}
function cubic(a:Vec3,b:Vec3,c:Vec3,d:Vec3,t:number):Vec3{
  const f=1-t;
  return a.map((v,i)=>f*f*f*v+3*f*f*t*b[i]+3*f*t*t*c[i]+t*t*t*d[i]) as Vec3;
}
export function heaterFlexPath(fcu:SiteItem,heater:SiteItem,open:boolean):Vec3[]{
  const pose=fusedPlatePose(fcu,open);
  const a=placed(pose,metres(FCU_OUTLET));
  if(heater.fixture?.panelHeater){
    // The 1.3 m factory flex may be shortened to fit. Both ends point down.
    // The isolated plate draws slack up from this same 0.93 m installed length.
    const d=cordPoint(heater,PLXE_FLEX_EXIT);
    const bendY=d[1]-(open?.1292:.2034);
    return Array.from({length:29},(_,i)=>cubic(a,[a[0],bendY,a[2]],[d[0],bendY,d[2]],d,i/28));
  }
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
  const fcu=site.items.find(i=>i.fixture?.fusedHeater),heater=site.items.find(i=>i.id==='fixed');
  if(!fcu||!heater||![wire.from.component,wire.to.component].includes(fcu.id)||![wire.from.component,wire.to.component].includes(heater.id))return;
  const src=doc.components.find(c=>c.id===fcu.id)!,dst=doc.components.find(c=>c.id===heater.id)!;
  const a=coreEnd(doc,wire,src,fcu,open);
  const terminal=wire.from.component===heater.id?wire.from.terminal:wire.to.terminal;
  const pin=getComponentTerminals(dst,COMPONENTS[dst.type]).find(p=>p.id===terminal);
  if(!a||!pin)return;
  const spread=wire.cable?.core==='blue'?.0014:wire.cable?.core==='green-yellow'?-.0014:0;
  const y=wire.cable?.core==='brown'?.0011:-.0004;
  const jacket=placed(a.pose,[-.016+spread,.023,.005+y]);
  const fan=placed(a.pose,[-.025+spread,.029,-.005+y]);
  const bend=placed(a.pose,[-.022+spread,.024,.001+y]);
  const sweep=placed(a.pose,[wire.role==='PE'?-.029:wire.role==='N'?.013:-.016,wire.role==='PE'?.031:.036,-.018]);
  const path=[a.pin,a.clearance,sweep,fan,bend,jacket,...heaterFlexPath(fcu,heater,open)];
  if(heater.fixture?.panelHeater)path.push(installedTerminalPoint(heater,dst,pin));
  else{
    const b=coreEnd(doc,wire,dst,heater,false)!;
    path.push(b.clearance,b.pin);
  }
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
  // When withdrawn, carry the incoming earth loop above the row of clamp
  // screws. The same core stays seated and returns to its normal box route.
  const aboveScrews=open&&wire.role==='PE';
  const controlA=placed(core.pose,[side,aboveScrews?.108:wire.role==='N'?.019:.070,-(open?.043:.023)]);
  const controlB=placed(item,[n,aboveScrews?.097:.073,open?.070:-.025]);
  const arc=Array.from({length:12},(_,i)=>cubic(core.clearance,controlA,controlB,entry,i/11));
  return [core.pin,...arc];
}
