import type {Vec3} from './types';
import type {SitePose} from './site-camera';
import {looseRockerPose} from './dc-rocker';

/** Positions in the Oakfield joinery. The LED driver casing follows the
 * HLG-100H blank-type drawing. The two connection boxes belong to this house. */
export const KITCHEN_LIGHTS={
  left:-4.65,right:-3.83,top:2.309,bottom:1.527,back:-2.748,
  profileZ:-2.405,profileWidth:.0171,profileHeight:.008,
  driver:[-4.65,2.309,-2.58] as Vec3,caseSize:[.220,.0388,.068] as Vec3,
  boxOffset:.299,boxZ:.035,boxSize:[.078,.034,.054] as Vec3,
  switchHeight:1.135,tileFace:-2.802,railY:1.523,railZ:-2.735,backGapZ:-2.783,
};
/** Stand low enough to see both diffusers and the light they cast on the worktops. */
export function worktopOverview(aspect:number,standing=false):SitePose {
  const k=KITCHEN_LIGHTS,span=k.right-k.left+.505;
  const distance=Math.max(1.04,(span+.20)/(.912*Math.max(.32,aspect)));
  const eye=standing?1.56:1.25;
  return {position:[(k.left+k.right)/2,eye,k.profileZ+distance],yaw:0,pitch:Math.atan2(1.18-eye,distance),fitOnResize:true};
}
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
export function rockerLead(origin:Vec3,pin:Vec3,id:string,open=false,loose=false):Vec3[]{
  const centre=rockerPanelCentre(origin,false),hand=id==='COM'?-1:1;
  const entry:Vec3=[centre[0]-.012+hand*.0018,centre[1]-.015,centre[2]-ROCKER_BOX.depth];
  let slack:Vec3[];
  const yaw=(open?ROCKER_BOX.rearYaw:0)+(loose?looseRockerPose.yaw:0);
  const dx=-Math.sin(yaw),dz=-Math.cos(yaw);
  if(loose&&!open){
    // The free socket lies beside its tab. Stow this lead in the side bay
    // so neither the metal crimp nor its core crosses the intact feed.
    const point=(x:number,y:number,z:number):Vec3=>[centre[0]+x,centre[1]+y,centre[2]+z];
    const loop=Array.from({length:31},(_,i)=>{
      const f=i/30,a=-1.2+f*1.68*2*Math.PI;
      return point(.022+f*.004,.019*Math.cos(a),-.032+.0205*Math.sin(a));
    });
    return [pin,[pin[0]+.004*dx,pin[1],pin[2]+.004*dz],...loop,point(.022,-.009,-.052),
      point(.007,-.012,-.056),[entry[0],entry[1],centre[2]-.057],entry,[entry[0],entry[1],entry[2]-.065]];
  }
  if(open){
    const radius=id==='OUT'?.014:.008,straight=.0035;
    slack=Array.from({length:5},(_,i)=>{
      const angle=i*Math.PI/8,travel=straight+radius*Math.sin(angle);
      return [pin[0]+travel*dx,pin[1]-radius*(1-Math.cos(angle)),pin[2]+travel*dz] as Vec3;
    });
    slack.push([pin[0]+(straight+radius)*dx,centre[1]-.044,pin[2]+(straight+radius)*dz],
      [centre[0]+.017+hand*.003,centre[1]-(loose?.069:.063)+hand*.002,centre[2]+.108+hand*.004],
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
