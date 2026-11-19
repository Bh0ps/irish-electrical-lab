import { dinForm, DIN_UNIT, DIN_BENCH_LIFT } from './din-devices.ts';
import type { CircuitDocument, ComponentInstance, RailMount, Vec3 } from './types.ts';
import { COMPONENTS } from './components.ts';

export const isBoard = (type: string) => type === 'gammaboard' || type === 'invictaboard';
/** Gamma pre-marked side entries opened on the training shell; local y/z panel extents. */
export function boardSidePanels(type:string,h:number,d:number):[number,number,number,number][]{
  const z=d/2;
  if(type!=='gammaboard')return [[0,h,-z,z]];
  const bands=[0,.73,1.33,5.94,6.54,h];
  return bands.slice(0,-1).flatMap((lo,i):[number,number,number,number][]=>i%2?[[lo,bands[i+1],-z,-.33],[lo,bands[i+1],.33,z]]:[[lo,bands[i+1],-z,z]]);
}
export function dinBodyWidth(c:ComponentInstance){
  if(!c.mount||COMPONENTS[c.type].model!=='protection')return undefined;
  if(dinForm(c.type))return COMPONENTS[c.type].size[0];
  return COMPONENTS[c.type].size[0]*(['mcb','fuse'].includes(c.type)?.56:.8)/1.3;
}
export function filledWays(board:ComponentInstance,parts:ComponentInstance[]){
  if(!isBoard(board.type))return undefined;
  return JSON.stringify(parts.filter(c=>c.mount?.board===board.id&&c.mount.row<5).map(c=>[c.mount!.row,c.mount!.slot,railWidth(c.type),c.label]));
}
const modules: Record<string, number> = { mcb:1, mcb3:3, rcbo:2, rcd:2, rcd3:4, isolator:2, isolator3:4, spd:2, fuse:1, timer:2, transformer:2, dcsupply:3, contactor:3, relay:1, neutralbar:1, earthbar:1 };
export const railWidth = (type: string) => type==='terminal'?1:(modules[type] ?? 0);
export interface Rail { index:number; name:string; ways:number }
export function boardRails(type:string): Rail[] {
  const rows=type==='gammaboard' ? [{index:0,name:'Upper rail',ways:13},{index:1,name:'Lower rail',ways:13}]
    : type==='invictaboard' ? [{index:2,name:'Left outgoing bank',ways:6},{index:3,name:'Right outgoing bank',ways:6},{index:4,name:'Incomer',ways:4}]:[];
  return rows.length ? [...rows,{index:5,name:'Neutral bar carrier',ways:1},{index:6,name:'Earth bar carrier',ways:1},...(type==='gammaboard'?[{index:7,name:'Supply comb support',ways:1}]:[{index:7,name:'L1 distribution support',ways:1},{index:8,name:'L2 distribution support',ways:1},{index:9,name:'L3 distribution support',ways:1}])]:[];
}

export function fitsRail(c:ComponentInstance,board:ComponentInstance,row:Rail) {
  if (!isBoard(board.type)||!railWidth(c.type)||c.variant==='fan-isolator') return false;
  if(row.index===5 || row.index===6) return c.type===(row.index===5?'neutralbar':'earthbar');
  if(row.index>=7)return c.type==='terminal'&&c.variant==='comb-busbar';
  if(c.type==='terminal')return false;
  if(['neutralbar','earthbar'].includes(c.type)) return false;
  if(row.index===4)return ['isolator3','mcb3','rcd3'].includes(c.type);
  return row.index<2 || ['mcb','mcb3','rcbo','rcd'].includes(c.type);
}
export function mountError(components:ComponentInstance[],device:ComponentInstance,m:RailMount) {
  const board=components.find(c=>c.id===m.board),row=board&&boardRails(board.type).find(r=>r.index===m.row),width=railWidth(device.type);
  if(!board||!row||!fitsRail(device,board,row)||!Number.isInteger(m.slot)||m.slot<0||m.slot+width>row.ways)return 'This device does not fit this position.';
  if(row.index>=2 && row.index<=3 && width===3 && m.slot%3!==0)return 'Choose the beginning of a three-phase way.';
  return components.some(c=>c.id!==device.id && c.mount?.board===m.board && c.mount.row===m.row && c.mount.slot<m.slot+width && c.mount.slot+railWidth(c.type)>m.slot)?'Another device occupies this position.':undefined;
}
export const mountRoll = (c:ComponentInstance) => c.mount?.row===2?Math.PI/2:c.mount?.row===3?-Math.PI/2:0;
export function mountScale(c:ComponentInstance):Vec3 {
  if(!c.mount)return [1,1,1];
  const [w,h,d]=COMPONENTS[c.type].size;
  if(dinForm(c.type)){const scale=.02/DIN_UNIT;return [scale,scale,scale];}
  if(c.mount.row>=5)return [1.10/w,.46/h,.50/d];
  return [railWidth(c.type)*.35/(dinBodyWidth(c)??w),1.63/h,1.15/d];
}
export function mountVector(c:ComponentInstance,v:Vec3,scale=true):Vec3 {
  if(!c.mount)return v;
  const [sx,sy,sz]=scale?mountScale(c):[1,1,1],r=mountRoll(c),x=v[0]*sx,y=v[1]*sy;
  return [x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r),v[2]*sz];
}
export function boardPosition(board:ComponentInstance,p:Vec3):Vec3{
  const co=Math.cos(board.rotation),si=Math.sin(board.rotation);
  return [board.position[0]+co*p[0]+si*p[2],board.position[1]+p[1],board.position[2]+co*p[2]-si*p[0]];
}
export function seatPosition(board:ComponentInstance,c:ComponentInstance,m:RailMount):Vec3 {
  const commercial=board.type==='invictaboard';
  if(m.row>=7)return boardPosition(board,commercial?[(m.row-8)*2.20,3.43,-.30]:[.20,5.58,-.27]);
  if(m.row>=5)return boardPosition(board,[(m.row===5?-1:1)*(commercial?2.82:1.25),commercial?8.95:6.72,-.12]);
  const center=(m.slot+railWidth(c.type)/2)*.36;
  if(dinForm(c.type)){
    const mid=(DIN_BENCH_LIFT+41.5*DIN_UNIT)*.02/DIN_UNIT;
    const depth= commercial?.265:.135;
    if(m.row===4)return boardPosition(board,[center-.72,1.48-mid,depth]);
    if(m.row>=2)return boardPosition(board,[(m.row===2?-1:1)*(1.67-mid),7.4-center,depth]);
    return boardPosition(board,[-2.34+center,(m.row===0?4.82:2.32)-mid,depth]);
  }
  if(m.row===4)return boardPosition(board,[(center-.72),.67,.185]);
  if(m.row>=2)return boardPosition(board,[m.row===2?-.83:.83,7.4-center,.185]);
  return boardPosition(board,[-2.34+center,(m.row===0?4.82:2.32)-.815,.065]);
}
/** Recompute fixed rail poses after a board move/turn; removing a shell leaves its devices and circuit intact. */
export function normalizeBoardMounts(next:CircuitDocument,_before?:CircuitDocument):CircuitDocument{
  if(!next.components.some(c=>c.mount))return next;
  const boards=new Map(next.components.filter(c=>isBoard(c.type)).map(c=>[c.id,c]));
  let changed=false;
  const components=next.components.map(c=>{
    if(!c.mount)return c;
    const board=boards.get(c.mount.board);
    if(!board){changed=true;const out={...c};delete out.mount;return out;}
    const p=seatPosition(board,c,c.mount);
    if(c.rotation===board.rotation && p.every((x,i)=>Math.abs(x-c.position[i])<1e-8))return c;
    changed=true;return {...c,position:p,rotation:board.rotation};
  });
  return changed?{...next,components}:next;
}
export function mountDevice(doc:CircuitDocument,id:string,m:RailMount):CircuitDocument{
  const c=doc.components.find(c=>c.id===id);
  if(!c)throw Error('Choose a device first.');
  const reason=mountError(doc.components,c,m);if(reason)throw Error(reason);
  return normalizeBoardMounts({...doc,components:doc.components.map(x=>x.id===id?{...x,mount:m}:x)});
}
export function unmountDevice(doc:CircuitDocument,id:string):CircuitDocument{
  const c=doc.components.find(c=>c.id===id),board=doc.components.find(b=>b.id===c?.mount?.board);
  if(!c||!board)return doc;
  const out={...c,position:boardPosition(board,[COMPONENTS[board.type].size[0]/2+1.1,0,1.5])};
  delete out.mount;
  return {...doc,components:doc.components.map(x=>x.id===id?out:x)};
}
