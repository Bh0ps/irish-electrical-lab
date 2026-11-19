import type {Vec3} from './types';

/** Millimetres from the faceplate centre, as seen from its front. These are
 * the stable wire mouths used by both saved circuits and meter registration. */
export const fcuWireMouths:Readonly<Record<string,Vec3>>={
  LIN:[9,10,-10.4], NOUT:[19,10,-10.4], LOUT:[-13,13,-10.4],
  NIN:[18,-20,-10.4], PE:[-27,7,-6], PE2:[-27,-7,-6],
};

/** Original 851 study fixture, dimensions in mm in the maker's rear elevation.
 * Wire entries retain the existing saved document coordinates. A probe contacts
 * the head of the separate clamping screw, beside its screwdriver slot. */
export function fcuProbeContact(id:string):{position:Vec3;normal:Vec3}|undefined {
  const mouth=fcuWireMouths[id];if(!mouth)return;
  const earth=id==='PE'||id==='PE2',upper=id==='LIN'||id==='NOUT',sign=id==='PE2'||id==='NIN'?-1:1;
  const axis:Vec3=earth?[.777,sign*.629,0]:upper?[0,1,0]:[sign,0,0];
  const length=Math.hypot(...axis),nx=axis[0]/length,ny=axis[1]/length;
  const x=-mouth[0]+(earth?3.60:upper?0:sign*6.25)+nx*.575;
  const y=mouth[1]+(earth?sign*2.92:upper?6.25:0)+ny*.575;
  const z=-mouth[2]+(earth?-2.85:-4.30)+.96;
  return {position:[-x/100,.46+y/100,-z/100],normal:[-nx,ny,0]};
}
