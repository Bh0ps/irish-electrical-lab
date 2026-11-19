import profiles from './cable-profiles.json' with { type: 'json' };
import type { CableCore, CableRun, Vec3 } from './types.ts';

type Kind = CableRun['kind'];
export type CableFace = {centre: Vec3; across: Vec3; up: Vec3; tangent: Vec3};
type Profile = {form: string; width: number; height: number; coreDiameter: number; copperDiameter: number; stranded: boolean; centres: Partial<Record<CableCore, number[]>>};
export const cableProfile = (kind: Kind): Profile => profiles[kind];
// All samples fit in the reserved jacket corridor. Small signal wire is enlarged
// slightly for picking; core size, position and copper diameter scale together.
export const profileScale = (kind: Kind) => .09 / Math.sqrt(10.4 * profiles[kind].width);
export const coreRadius = (kind: Kind) => cableProfile(kind).coreDiameter * profileScale(kind) / 2;
export const bareRadius = (kind: Kind) => cableProfile(kind).copperDiameter * profileScale(kind) / 2;
const dot = (a:Vec3,b:Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit = (a:Vec3):Vec3 => {const n=Math.hypot(...a)||1;return [a[0]/n,a[1]/n,a[2]/n];};
const cross = (a:Vec3,b:Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function cableFace(kind:Kind,centre:Vec3,tangent:Vec3,leads:{core:CableCore;towards:Vec3}[]):CableFace {
  const axis=unit(tangent);
  const across=unit(cross(Math.abs(axis[1])>.97?[0,0,1]:[0,1,0],axis));
  const up=cross(axis,across);
  // Turn the cut face towards the fan of tails so, for example, the two outside
  // cores of a flat cable leave on their respective sides of the centre earth.
  let x=0,y=0;
  for(const {core,towards} of leads){
    const offset=cableProfile(kind).centres[core];
    if(!offset)continue;
    const direction=unit([towards[0]-centre[0],towards[1]-centre[1],towards[2]-centre[2]]);
    const u=dot(direction,across),v=dot(direction,up);
    x+=offset[0]*u+offset[1]*v;
    y+=offset[0]*v-offset[1]*u;
  }
  const angle=Math.atan2(y,x),c=Math.cos(angle),s=Math.sin(angle);
  return {centre,tangent:axis,across:across.map((n,i)=>c*n+s*up[i]) as Vec3,up:up.map((n,i)=>c*n-s*across[i]) as Vec3};
}

export function coreSeat(kind:Kind,face:CableFace,core:CableCore):Vec3 {
  const [x,y]=cableProfile(kind).centres[core]!;
  const scale=profileScale(kind);
  return face.centre.map((n,i)=>n+scale*(x*face.across[i]+y*face.up[i])) as Vec3;
}
