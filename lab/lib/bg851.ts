import type {Vec3} from './types';
import type {Object3D} from 'three';

/** Millimetres from the faceplate centre, as seen from its front. These are
 * the stable wire mouths used by both saved circuits and meter registration. */
export const fcuWireMouths:Readonly<Record<string,Vec3>>={
  LIN:[9,10,-10.4], NOUT:[19,10,-10.4], LOUT:[-13,13,-10.4],
  NIN:[18,-20,-10.4], PE:[-27,7,-6], PE2:[-27,-7,-6],
};

// Lateral and rearward components of each probe handle around the clamp's
// own axis. The two seats clear the actual shrouds, wire dress and each other.
const screwApproaches:Record<string,[[number,number],[number,number]]>={
  LIN:[[.35,.95],[-.35,.64]], NOUT:[[-.35,.64],[.35,.64]],
  LOUT:[[-.90,.38],[-.18,.25]], NIN:[[-.50,.64],[.18,.38]],
  PE:[[-.18,.64],[.50,.64]], PE2:[[.35,.64],[-.35,.64]],
};

/** Original 851 study fixture, dimensions in mm in the maker's rear elevation.
 * Wire entries retain the existing saved document coordinates. A probe contacts
 * the head of the separate clamping screw, beside its screwdriver slot. */
export function fcuProbeContact(id:string,second=false):{position:Vec3;normal:Vec3;approach:Vec3}|undefined {
  if(!Object.hasOwn(fcuWireMouths,id))return;
  const mouth=fcuWireMouths[id];
  const earth=id==='PE'||id==='PE2',upper=id==='LIN'||id==='NOUT',sign=id==='PE2'||id==='NIN'?-1:1;
  const axis:Vec3=earth?[.777,sign*.629,0]:upper?[0,1,0]:[sign,0,0];
  const length=Math.hypot(...axis),nx=axis[0]/length,ny=axis[1]/length;
  const x=-mouth[0]+(earth?3.60:upper?0:sign*6.25)+nx*.575;
  const y=mouth[1]+(earth?sign*2.92:upper?6.25:0)+ny*.575;
  const z=-mouth[2]+(earth?-2.85:-4.30)+.96;
  const normal:Vec3=[-nx,ny,0],tangent:Vec3=[-ny,-nx,0];
  // Seat the two tips on opposite sides of the same steel land. Let the
  // handles diverge into the open space behind the withdrawn faceplate.
  const side=(id==='LIN'||id==='PE2'?1:-1)*(second?-1:1);
  const position:Vec3=[(-x+side*tangent[0]*.95)/100,.46+(y+side*tangent[1]*.95)/100,-z/100];
  const [lateral,rearward]=screwApproaches[id][second?1:0];
  const ax=normal[0]+lateral*tangent[0],ay=normal[1]+lateral*tangent[1],az=-rearward;
  const lengthOfApproach=Math.hypot(ax,ay,az);
  return {position,normal,approach:[ax/lengthOfApproach,ay/lengthOfApproach,az/lengthOfApproach]};
}

/** The insulated clamp body shares a terminal identity for wiring. For the
 * meter, only the actual plated head under the corresponding screw group counts. */
export function fcuProbeScrew(hit:Object3D,materialName:string|undefined):string|undefined {
  if(materialName!=='Zinc plated steel')return;
  let screw:string|undefined;
  for(let node:Object3D|null=hit;node;node=node.parent){
    if(typeof node.userData.probeTerminal==='string')screw=node.userData.probeTerminal;
    if(typeof node.userData.terminalId==='string'){
      return screw&&screw===node.userData.terminalId&&Object.hasOwn(fcuWireMouths,screw)?screw:undefined;
    }
  }
}
