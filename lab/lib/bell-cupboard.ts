import { DIN_UNIT } from './din-devices';
import type {ComponentInstance,Vec3} from './types';

// Finished utility wall. The two boxes share a short side conduit.
export const BELL_CUPBOARD={x:4.12,y:1.45,z:-2.81,transformerOffset:.255,
  breakerSize:[.110,.180,.082] as Vec3, transformerSize:[.200,.150,.080] as Vec3,
  conduitY:-.020, conduitZ:.041, secondaryX:.062, feedX:-.029};
export type BellServicePart='supply'|'protect'|'tx';
export function bellServicePart(lesson:number,c:ComponentInstance):BellServicePart|undefined{
  if(![36,71,72].includes(lesson)||c.mount)return;
  if(c.id==='supply'&&c.type==='source')return 'supply';
  if(c.id==='protect'&&c.type==='rcbo')return 'protect';
  if(lesson!==36&&c.id==='tx'&&c.type==='transformer')return 'tx';
}
export function bellServicePose(part:BellServicePart){
  const b=BELL_CUPBOARD,scale=part==='protect'?.001/DIN_UNIT:part==='tx'?.093:.025;
  // The RCBO's operating handle sits in the 45 mm opening. The electrical
  // supply boundary is inside the incoming compartment, behind the mask.
  const offset:Vec3=part==='protect'?[-.015,-.080,.047]:part==='tx'?[b.transformerOffset,-.055,.034]:[b.feedX,.047,.030];
  return {position:[b.x+offset[0],b.y+offset[1],b.z+offset[2]] as Vec3,scale};
}
export function chimeEnvelope(type:string){
  return type==='callchime'
    ? {size:[.191,.163,.051] as Vec3,model:[1.067,.8978,.4515] as Vec3,back:-.243}
    : {size:[.116,.116,.051] as Vec3,model:[.8462,.4904,.3473] as Vec3,back:-.1459};
}
// A wire entering the shared conduit approaches its mouth from inside its own box.
// Endpoints remain the same ones available on the workbench.
export function bellPrimaryLead(pin:Vec3,part:BellServicePart):Vec3[]{
  const b=BELL_CUPBOARD,z=b.z+b.conduitZ,y=b.y+b.conduitY;
  const wallX=part==='tx'?b.x+b.transformerOffset-b.transformerSize[0]/2:b.x+b.breakerSize[0]/2;
  return [pin,[pin[0],pin[1],z],[pin[0],y,z],[wallX,y,z]];
}
export function bellSecondaryLead(pin:Vec3):Vec3[]{
  const b=BELL_CUPBOARD,x=b.x+b.transformerOffset+b.secondaryX,z=b.z+b.conduitZ,top=b.y+b.transformerSize[1]/2;
  return [pin,[pin[0],pin[1],z],[x,pin[1],z],[x,top,z]];
}
