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

// The surface box belongs to this kitchen. Its thin front panel supports the
// snap-in rocker. The rear cable entry stays fixed during inspection.
export const ROCKER_BOX={
  width:.065,height:.060,depth:.060,wall:.002,panel:.0015,
  cutWidth:.013,cutHeight:.0276,modelCentreY:.48,modelScale:.04,
  rearYaw:Math.PI*.90,draw:[.043,-.019,.076] as Vec3,
};

export function rockerPanelCentre(origin:Vec3,open:boolean):Vec3{
  const b=ROCKER_BOX;
  return [origin[0]+(open?b.draw[0]:0),origin[1]+b.modelCentreY*b.modelScale+(open?b.draw[1]:0),origin[2]+(open?b.draw[2]:0)];
}

/** Model origin and yaw relative to the same panel seat, installed or withdrawn. */
export function rockerPose(origin:Vec3,open:boolean){
  const centre=rockerPanelCentre(origin,open),b=ROCKER_BOX;
  return {position:[centre[0],centre[1]-b.modelCentreY*b.modelScale,centre[2]] as Vec3,rotation:open?b.rearYaw:0};
}

/** Two independent cores run through the rear entry, with slack inside the box. */
export function rockerLead(origin:Vec3,pin:Vec3,id:string,open=false):Vec3[]{
  const centre=rockerPanelCentre(origin,false),hand=id==='COM'?-1:1;
  const entry:Vec3=[centre[0]-.012+hand*.0018,centre[1]-.015,centre[2]-ROCKER_BOX.depth];
  let slack:Vec3[];
  if(open){
    const radius=id==='OUT'?.014:.008,straight=.0035,dx=-Math.sin(ROCKER_BOX.rearYaw),dz=-Math.cos(ROCKER_BOX.rearYaw);
    slack=Array.from({length:5},(_,i)=>{
      const angle=i*Math.PI/8,travel=straight+radius*Math.sin(angle);
      return [pin[0]+travel*dx,pin[1]-radius*(1-Math.cos(angle)),pin[2]+travel*dz] as Vec3;
    });
    slack.push([pin[0]+(straight+radius)*dx,centre[1]-.044,pin[2]+(straight+radius)*dz],
      [centre[0]+.017+hand*.003,centre[1]-.063+hand*.002,centre[2]+.108+hand*.004],
      [centre[0]+.020+hand*.003,centre[1]-.067,centre[2]+.075],
      [centre[0]+.023+hand*.003,centre[1]-.021,centre[2]+.008]);
  }else{
    // Stow the service slack behind the two push-on connectors. The staggered
    // depth keeps each loop clear of the rocker and the adjacent conductor.
    slack=[[pin[0],pin[1],pin[2]-.004]];
    for(let i=0;i<=24;i++){
      const fraction=i/24,angle=Math.PI*(.33+fraction*(id==='COM'?3.18:3.38)),r=.0198+hand*.0008;
      slack.push([centre[0]+r*Math.cos(angle),centre[1]+r*Math.sin(angle),centre[2]-.046-fraction*.006+hand*.0017]);
    }
  }
  return [pin,...slack,[entry[0]+.012,entry[1]-.004,centre[2]-.035],entry,[entry[0],entry[1],entry[2]-.065]];
}
