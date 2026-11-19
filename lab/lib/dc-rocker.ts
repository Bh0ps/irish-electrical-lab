import type {Vec3} from './types';
export {connectedRockerTerminals} from './wall-rocker';

// Switch Components RG1-1A-DC-1-B, drawing rev B. 40 mm per bench unit.
// Face centre [0,.48,0], front +Z. Only stations 1 and 2 have metal blades.
export function rockerBladeY(id:string){return id==='OUT'?.7125:.48;}
export const rockerSleeveEndZ=-1.050;
export function rockerWireEntry(id:string):Vec3{return [0,rockerBladeY(id),rockerSleeveEndZ];}
export function rockerProbeContact(id:string):Vec3{return [-.066,rockerBladeY(id)+.010,-.590];}
// Approach from outside the side of the tab, clear of the neighbouring blade.
export const rockerProbeApproach:Vec3=[-2/Math.sqrt(5),1/Math.sqrt(5),0];
export function rockerConductiveSurface(name:string){return name==='Plated male blade'||name==='Tinned push-on tab spring';}
