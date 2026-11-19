import type {Vec3} from './types';

/** Positions in the Oakfield joinery. The LED driver casing follows the
 * HLG-100H blank-type drawing. The two connection boxes belong to this house. */
export const KITCHEN_LIGHTS={
  left:-4.65,right:-3.83,top:2.309,bottom:1.527,back:-2.748,
  profileZ:-2.405,profileWidth:.0171,profileHeight:.008,
  driver:[-4.65,2.309,-2.58] as Vec3,caseSize:[.220,.0388,.068] as Vec3,
  boxOffset:.299,boxZ:.035,boxSize:[.078,.034,.054] as Vec3,
  switchHeight:1.135,tileFace:-2.802,railY:1.523,railZ:-2.735,backGapZ:-2.783,
};
export function driverContact(id:string):Vec3{
  const k=KITCHEN_LIGHTS,dc=id==='+'||id==='-';
  const offset=dc?(id==='+'?-.008:.008):id==='L'?-.014:id==='N'?0:.014;
  return [dc?k.boxOffset:-k.boxOffset,.020,k.boxZ+offset];
}
export function fittedKitchenDriver(id:number,type:string,name:string,variant?:string){
  return [13,65,66,68,69].includes(id)&&type==='driver'&&name==='driver'&&variant!=='constant-current';
}
/** A separate tail runs off each pad and through the slotted end cap. */
export function stripLead(pin:Vec3,centreX:number,terminal:string):Vec3[]{
  const edge=centreX-.253,x=edge-(terminal==='N'||terminal==='C'?.012:terminal==='W'?.010:.008);
  return [pin,[edge,pin[1],pin[2]],[x,pin[1],pin[2]],[x,KITCHEN_LIGHTS.railY,pin[2]],[x,KITCHEN_LIGHTS.railY,KITCHEN_LIGHTS.railZ]];
}
