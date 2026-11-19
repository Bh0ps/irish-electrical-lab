import {BELL_FORECOURT,BELL_FRONT_DOOR,GARDEN_DOOR,HOME_BACK,SIDE_PASSAGE,doorLeaf} from '../../lib/home-floorplan';
import type {Vec3} from '../../lib/types';

type Add=(position:Vec3,dimensions:Vec3,material:string,shape?:'box'|'cylinder'|'gable',rotation?:Vec3)=>void;
/** Oakfield, drawn for the two-entrance jobs. The front door opens inwards.
 * The narrow glazed panel on the latch side stays in the frame. */
export function frontDoorway(add:Add){
  const front=2.8,face=2.875,height=2.11,latch=.22;
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:string)=>add([x,y,z],[w,h,d],m);
  for(const side of [-1,1]){
    box(side*1.47,1.43,front,1.46,2.86,.15,'brick');
    box(side*.735,1.07,front,.074,2.14,.18,'trim');
  }
  box(0,2.50,front,1.52,.72,.15,'brick');
  box(0,2.132,front,1.54,.072,.18,'trim');
  box((latch+.74)/2,1.06,front,.48,2.06,.025,'pane');
  for(const y of [.15,.94,1.98])box(.479,y,front,.51,.059,.113,'white');
  box(latch,1.057,front,.067,height,.125,'trim');
  box(.478,.08,front,.48,.15,.12,'trim');
  box(-.254,.015,face-.016,.94,.026,.185,'metal');
  const door=doorLeaf({id:'front',axis:'x',fixed:front,start:-2.2,end:2.2},BELL_FRONT_DOOR);
  const {x,z}=door;
  box(x,1.045,z,.053,2.08,.93,'doorBlue');
  for(const side of [-1,1]){
    const skin=x+side*.029;
    for(const pos of [-.21,.21]){
      box(skin,.576,z+pos,.012,.82,.374,'doorRecess');
      box(skin+side*.005,.576,z+pos,.015,.745,.305,'doorBlue');
    }
    box(skin,1.62,z,.014,.72,.75,'doorRecess');box(skin+side*.010,1.62,z,.009,.65,.69,'glass');
    for(const p of [-.12,.12])box(skin+side*.019,1.62,z+p,.016,.66,.018,'doorBlue');
    box(skin+side*.016,1.12,z,.022,.059,.288,'brass');box(skin+side*.027,1.124,z,.004,.022,.247,'iron');
    box(skin+side*.010,.96,z-.365,.020,.188,.043,'metal');box(skin+side*.034,1.01,z-.362,.047,.021,.022,'metal');
    box(skin+side*.056,1.01,z-.312,.018,.021,.119,'metal');
  }
  // Folded metal canopy with a hemmed edge, brackets and a pale soffit.
  add([.07,2.49,front+.43],[2.68,.078,1.02],'slate','box',[.041,0,0]);
  box(.07,2.442,front+.91,2.70,.113,.043,'gutter');box(.07,2.446,front+.44,2.60,.022,.89,'cream');
  for(const side of [-1,1]){box(.07+side*1.32,2.46,front+.44,.039,.087,.94,'gutter');
    box(.07+side*.92,2.28,face+.028,.038,.28,.058,'iron');
    add([.07+side*.92,2.318,face+.217],[.030,.048,.456],'iron','box',[-.50,0,0]);}
}

/** Paved approaches, a sheltered front threshold, an open side gate and a
 * drained rear patio. The walking boundary follows the inside of the fencing. */
export function doorbellGrounds(add:Add){
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:string)=>add([x,y,z],[w,h,d],m);
  const pipe=(x:number,y:number,z:number,r:number,h:number,m:string)=>add([x,y,z],[r,h,r],m,'cylinder');
  const west=SIDE_PASSAGE.left,mid=(west+SIDE_PASSAGE.right)/2,front=2.8;
  box(-.85,-.119,5.1,15.30,.18,5.13,'lawn');
  // Cast concrete flags, with thin physical joints rather than a repeated grid on each flag.
  const flags=(x:number,z:number,w:number,d:number,cols:number,rows:number)=>{
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
      box(x-w/2+(i+.5)*w/cols,-.013,z-d/2+(j+.5)*d/rows,w/cols-.006,.026,d/rows-.006,(i+2*j)%4?'stoneFlag':'stoneFlagLight');
    }
  };
  flags(.12,5.15,1.65,4.56,3,8);
  const sideEdge=mid+1.51/2,frontEdge=.12-1.65/2,patioEdge=GARDEN_DOOR.centre-.88;
  flags((sideEdge+frontEdge)/2,4.26,frontEdge-sideEdge,1.18,10,2);
  box(mid,-.072,-2.335,1.63,.10,14.37,'concrete');
  flags(mid,-2.335,1.51,14.37,3,24);
  flags((sideEdge+patioEdge)/2,HOME_BACK-1.03,patioEdge-sideEdge,1.15,7,2);
  for(const [left,right] of [[west,-.705],[.945,6.64]]){
    box((left+right)/2,.041,BELL_FORECOURT+.068,right-left,.10,.13,'stoneFlagLight');
  }
  const channel=(x:number,z:number,w:number)=>{
    box(x,.002,z,w,.008,.082,'iron');
    for(let i=0;i<Math.floor(w/.061);i++)box(x-w/2+.044+i*.061,.008,z,.039,.004,.054,'steel');
  };
  channel(-.12,3.04,1.48);channel(GARDEN_DOOR.centre,HOME_BACK-.255,.96);
  // A separate lean-to over the garden door shelters the other unlit push.
  const rearX=GARDEN_DOOR.centre-.10,rearZ=HOME_BACK-.15;
  box(rearX,2.48,rearZ-.029,2.08,.12,.063,'gutter');
  add([rearX,2.401,rearZ-.49],[2.12,.028,1.02],'opal','box',[-.13,0,0]);
  box(rearX,2.326,rearZ-.986,2.12,.059,.040,'gutter');
  for(const side of [-1,1]){
    const x=rearX+side*.98;
    add([x,2.379,rearZ-.50],[.038,.062,1.03],'sage','box',[-.13,0,0]);
    box(x,2.276,rearZ-.035,.046,.317,.055,'sage');
    add([x,2.268,rearZ-.307],[.031,.041,.64],'sage','box',[.42,0,0]);
  }
  // Boundary rails and boarded gate are alongside the paving, leaving the through route clear.
  for(let z=HOME_BACK-3.65;z<=BELL_FORECOURT;z+=1.46)box(west-.040,.80,z,.085,1.59,.088,'trim');
  for(const y of [.31,1.10])box(west-.07,y,-1.82,.069,.077,18.70,'sage');
  for(let z=HOME_BACK-3.69;z<BELL_FORECOURT;z+=.173)box(west-.094,.703,z,.039,1.39,.165,'boundary');
  const gateX=west+.076;
  for(let i=0;i<7;i++)box(gateX,.735,1.44+i*.159,.045,1.40,.154,'sage');
  for(const h of [.27,1.20])box(gateX+.035,h,1.92,.030,.084,1.10,'trim');
  add([gateX+.035,.73,1.92],[.030,.082,1.38],'trim','box',[-.69,0,0]);
  for(const h of [.34,1.14])box(gateX+.056,h,2.33,.014,.046,.263,'iron');
  box(gateX+.065,.88,1.47,.025,.153,.047,'iron');
  for(const z of [1.36,2.52])box(west+.023,.81,z,.095,1.63,.10,'trim');
  // Slated roof above the existing interior ceiling. Both ends have a solid gable.
  const half=5.33,rise=2.40,pitch=Math.atan2(rise,half),ridge=-2.20,height=2.94;
  for(const side of [-1,1]){
    add([0,height+rise/2,ridge+side*half/2],[13.66,.079,Math.hypot(half,rise)],'slate','box',[side*pitch,0,0]);
    box(0,height-.045,ridge+side*half,13.68,.137,.073,'gutter');
    box(0,height-.117,ridge+side*(half-.14),13.55,.039,.27,'white');
    add([side*6.601,height+rise/2,ridge],[.12,rise,2*half],'wall0','gable');
  }
  box(0,height+rise+.027,ridge,13.72,.088,.153,'gutter');
  // Rainwater pipe to the front gully. The rear has its own downpipe and threshold.
  pipe(-6.37,1.45,front+.129,.041,2.77,'gutter');
  for(const h of [.58,1.72,2.60])box(-6.37,h,front+.103,.11,.031,.099,'iron');
  box(-6.37,.012,front+.153,.187,.024,.164,'iron');
}
