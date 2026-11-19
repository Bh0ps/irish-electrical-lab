import type {Vec3} from './types';

/** The D814 has two interchangeable screws. These are locations on the back,
 * in bench units of 50 mm. The screw shoulder stays clear of the landed wire. */
export function sesameProbeContact(id:string):{position:Vec3;normal:Vec3}|undefined {
  if(id!=='COM'&&id!=='NO')return;
  const outside=id==='COM'?1:-1;
  return {position:[.021,.55+outside*(15.1+.9)/50,.0421],normal:[0,0,-1]};
}
