import type {ComponentInstance,Vec3,Wire} from './types';

/** Rear conductor mouths and recessed screw heads are separate on the BG 812. */
export function bg812Contact(id:string):{position:Vec3;normal:Vec3}|undefined {
  if(id!=='COM'&&id!=='T1'&&id!=='T2')return;
  const upper=id==='COM',x=upper?0:id==='T1'?-.059:.059;
  return {position:[x+.006,upper?.8505:.4495,-.086],normal:[0,upper?1:-1,0]};
}

/** Each occupied terminal shows its wire end independently, also after Undo. */
export function connectedRockerTerminals(c:Pick<ComponentInstance,'id'|'type'|'variant'>,wires:readonly Wire[]):string|undefined {
  const ids=c.type==='switch2'?['COM','T1','T2']:c.type==='switch'&&c.variant==='dc-rocker'?['COM','OUT']:undefined;
  if(!ids)return;
  return ids.filter(id=>wires.some(w=>[w.from,w.to].some(e=>e.component===c.id&&e.terminal===id))).join(' ');
}
