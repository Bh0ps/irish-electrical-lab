import type {Vec3} from './types';
import type {Object3D} from 'three';
export {connectedRockerTerminals} from './wall-rocker';

// Switch Components RG1-1A-DC-1-B, drawing rev B. 40 mm per bench unit.
// Face centre [0,.48,0], front +Z. Only stations 1 and 2 have metal blades.
export function rockerBladeY(id:string){return id==='OUT'?.7125:.48;}
export const rockerSleeveEndZ=-1.050;
// Installed service pose, measured in the model's 40 mm units. The loose
// female terminal hangs on its core to the side of the stationary male tab.
export const looseRockerPose={offset:[.32,.095,-.1175] as Vec3,yaw:-Math.PI/10};
export const rockerBladeTipZ=-.7725;
export function rockerWireEntry(id:string,loose=false):Vec3{
  const y=rockerBladeY(id);
  if(!loose)return [0,y,rockerSleeveEndZ];
  const {offset:[x,dy,z],yaw}=looseRockerPose,d=rockerSleeveEndZ-rockerBladeTipZ;
  return [x+Math.sin(yaw)*d,y+dy,rockerBladeTipZ+z+Math.cos(yaw)*d];
}
export function rockerProbeContact(id:string):Vec3{return [-.066,rockerBladeY(id)+.010,-.590];}
// Approach from outside the side of the tab, clear of the neighbouring blade.
export const rockerProbeApproach:Vec3=[-2/Math.sqrt(5),1/Math.sqrt(5),0];
export function rockerConductiveSurface(name:string){return name==='Plated male blade'||name==='Tinned push-on tab spring';}

/** An unseated socket is still on its own wire. Touching its exposed spring
 * cannot give a reading at the switch's male blade. */
export function rockerLooseConnector(hit:Object3D):string|undefined {
  for(let n:Object3D|null=hit;n;n=n.parent){
    if(n.userData.looseRockerContact===true)return n.userData.matingBlade;
  }
}
export function rockerProbeTerminal(hit:Object3D,materialName?:string):string|undefined {
  if(!materialName||!rockerConductiveSurface(materialName))return;
  for(let n:Object3D|null=hit;n;n=n.parent){
    if(!n.visible||n.userData.looseRockerContact)return;
    const id=n.userData.terminalId;
    if(id==='COM'||id==='OUT')return id;
  }
}
