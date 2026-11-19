import type {Vec3} from './types';
import {BATH_KITCHEN_COUNTER,BATH_RACK,BATH_SHOWER} from './bathroom-extract';

// Original training house. Room proportions, furniture clearances and door swings
// were reviewed against Roscommon County Council drawing 22571-PLA-6, House Type C.
// https://www.roscommoncoco.ie/en/about_us/part-8-local-authority-own-developments/housing/part-8-sli-an-choiste-monksland/22571-pla-6.pdf
export const HOME_BACK=-7.2;
export interface FloorRoom {id:number;name:string;left:number;right:number;back:number;front:number}
export const REAR_GARDEN:FloorRoom={id:9,name:'Back entrance',left:-6.6,right:6.6,back:HOME_BACK-3.88,front:HOME_BACK};
export const HOME_ROOMS:FloorRoom[]=[
  {id:0,name:'Kitchen',left:-6.6,right:-2.2,back:-2.8,front:2.8},
  {id:1,name:'Entrance hall',left:-2.2,right:2.2,back:-2.8,front:2.8},
  {id:2,name:'Utility cupboard',left:2.2,right:6.6,back:-2.8,front:2.8},
  {id:3,name:'Front entrance',left:-6.6,right:6.6,back:2.8,front:6},
  {id:4,name:'Sitting room',left:-6.6,right:-.6,back:HOME_BACK,front:-2.8},
  {id:5,name:'Bedroom',left:3.6,right:6.6,back:HOME_BACK,front:-2.8},
  {id:6,name:'Back hall',left:-.6,right:3.6,back:-5,front:-2.8},
  {id:7,name:'Study',left:-.6,right:3.6,back:HOME_BACK,front:-5},
  REAR_GARDEN,
];
export const HOME_POINTS={
  sittingWest:{room:4,x:-5.70,z:HOME_BACK},sittingEast:{room:4,x:-1.32,z:HOME_BACK},
  bedroom:{room:5,x:4.10,z:HOME_BACK},study:{room:7,x:2.60,z:HOME_BACK},
} as const;
/** Standing eye positions in clear floor space; yaw zero looks toward the rear wall. */
export const HOME_VISITS:Record<number,{position:Vec3;yaw:number;pitch:number}>={
  0:{position:[-3.08,1.56,.84],yaw:.42,pitch:-.13},1:{position:[.04,1.56,1.75],yaw:.02,pitch:-.04},
  2:{position:[4.25,1.56,.86],yaw:-.03,pitch:-.03},3:{position:[.24,1.56,5.16],yaw:.08,pitch:-.03},
  4:{position:[-1.18,1.56,-3.96],yaw:1.06,pitch:-.17},5:{position:[4.04,1.56,-3.97],yaw:-.61,pitch:-.23},
  6:{position:[1.25,1.56,-3.14],yaw:-.06,pitch:-.11},7:{position:[1.56,1.56,-5.37],yaw:.68,pitch:-.18},
  [REAR_GARDEN.id]:{position:[-3.10,1.56,HOME_BACK-3.48],yaw:Math.PI+.25,pitch:-.14},
};
// axis is the direction along the wall. Door leaves are shown standing open.
export interface FloorWall {id:string;axis:'x'|'z';fixed:number;start:number;end:number}
export interface FloorDoor {wall:string;centre:number;width:number;side:1|-1;hinge:1|-1;hallOnly?:boolean}
export const GARDEN_DOOR:FloorDoor={wall:'rear',centre:-1.98,width:.94,hinge:1,side:1};
export const HOME_WALLS:FloorWall[]=[
  {id:'west',axis:'z',fixed:-6.6,start:HOME_BACK,end:2.8},{id:'east',axis:'z',fixed:6.6,start:HOME_BACK,end:2.8},
  {id:'rear',axis:'x',fixed:HOME_BACK,start:-6.6,end:6.6},{id:'front',axis:'x',fixed:2.8,start:-6.6,end:6.6},
  {id:'kitchen-hall',axis:'z',fixed:-2.2,start:-2.8,end:2.8},{id:'hall-utility',axis:'z',fixed:2.2,start:-2.8,end:2.8},
  {id:'kitchen-back',axis:'x',fixed:-2.8,start:-6.6,end:-2.2},{id:'hall-back',axis:'x',fixed:-2.8,start:-2.2,end:2.2},
  {id:'utility-back',axis:'x',fixed:-2.8,start:2.2,end:6.6},
  {id:'sitting',axis:'z',fixed:-.6,start:HOME_BACK,end:-2.8},{id:'bedroom',axis:'z',fixed:3.6,start:HOME_BACK,end:-2.8},
  {id:'study',axis:'x',fixed:-5,start:-.6,end:3.6},
];
export const HOME_DOORS:FloorDoor[]=[
  GARDEN_DOOR,
  {wall:'front',centre:0,width:1.48,hinge:-1,side:-1},
  {wall:'kitchen-hall',centre:.95,width:1.25,hinge:1,side:-1},{wall:'hall-utility',centre:.95,width:1.25,hinge:1,side:1},
  {wall:'hall-back',centre:1.60,width:.94,hinge:1,side:-1,hallOnly:true},
  {wall:'utility-back',centre:2.95,width:.94,hinge:1,side:-1},
  {wall:'sitting',centre:-3.9,width:.94,hinge:1,side:-1},{wall:'bedroom',centre:-3.9,width:.94,hinge:1,side:1},
  {wall:'study',centre:1.50,width:.94,hinge:-1,side:-1},
];
export interface FloorBox {x:number;z:number;w:number;d:number}

// Lesson 9 uses the western part of the hall. The two flights share a turning landing.
export const HOME_STAIR = {
  west: -2.14, divider: -.95, east: .24, back: -2.8, turn: -1.62,
  landingEnd: 1.58, going: .275, rise: 2.94 / 16, risersPerFlight: 8,
};
const stairRun = HOME_STAIR.going * (HOME_STAIR.risersPerFlight - 1);
export const STAIR_FOOT = HOME_STAIR.turn + stairRun;
export const STAIR_HALF = HOME_STAIR.rise * HOME_STAIR.risersPerFlight;
export const STAIR_TOP = 2 * STAIR_HALF;
export const STAIR_EYE = 1.56;
export type StairStation='near'|'far';
export function isStairStation(id?:string):id is StairStation{return id==='near'||id==='far';}

/** Camera approaches the switch from its own level, with the stair or
 * upstairs door still in view. +Z faces out of each installed faceplate. */
export function stairSwitchView(station:StairStation){
  const upstairs=station==='far',level=upstairs?STAIR_TOP:0;
  const position:Vec3=upstairs?[-.50,level+1.34,.48]:[-1.58,1.33,1.71];
  const look:Vec3=upstairs?[.16,level+1.17,1.04]:[-1.07,1.15,.87];
  const dx=look[0]-position[0],dy=look[1]-position[1],dz=look[2]-position[2];
  return {position,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};
}
const stairVisit = {position: [-1.63, STAIR_EYE, 1.62] as Vec3, yaw: 0, pitch: .02};
export const STAIR_LANDING:FloorRoom = {
  id:8,name:'First-floor landing',left:HOME_STAIR.divider,right:HOME_STAIR.east,back:STAIR_FOOT,front:HOME_STAIR.landingEnd,
};
const upperVisit = {position:[-.70, STAIR_EYE+STAIR_TOP, .45] as Vec3,yaw:-2.26,pitch:-.26};
export function homeVisit(room:number,stair:boolean){
  if(stair&&room===1)return stairVisit;
  if(stair&&room===STAIR_LANDING.id)return upperVisit;
  return HOME_VISITS[room];
}

/** Finished tread or landing height under a walker's feet. */
export function stairFloor(x:number,z:number){
  const s=HOME_STAIR;
  if(x<s.west||x>s.east||z<s.back||z>s.landingEnd)return 0;
  if(z<=s.turn)return STAIR_HALF;
  const belowTurn=Math.max(0,Math.ceil((z-s.turn)/s.going-1e-9));
  if(x<s.divider)return Math.max(0,s.risersPerFlight-belowTurn)*s.rise;
  return Math.min(STAIR_TOP,STAIR_HALF+belowTurn*s.rise);
}

function stairBarriers():FloorBox[]{
  const s=HOME_STAIR;
  return [
    {x:s.divider,z:(s.turn+s.landingEnd)/2,w:.07,d:s.landingEnd-s.turn},
    {x:s.east,z:(s.back+s.landingEnd)/2,w:.12,d:s.landingEnd-s.back},
    {x:(s.divider+s.east)/2,z:s.landingEnd,w:s.east-s.divider,d:.12},
  ];
}
export const HOUSE_FURNITURE={
  sofa:{x:-6.03,z:-5.23,w:.90,d:2.2},coffee:{x:-4.68,z:-5.14,w:.68,d:1.08},
  television:{x:-.90,z:-5.76,w:.43,d:1.60},bed:{x:5.52,z:-5.95,w:1.44,d:2.04},
  wardrobe:{x:5.66,z:-3.13,w:1.43,d:.53},desk:{x:.28,z:-6.82,w:1.38,d:.60},
  deskChair:{x:.28,z:-6.10,w:.49,d:.50},bookcase:{x:3.19,z:-5.94,w:.40,d:1.14},
  locker:{x:4.53,z:-6.82,w:.38,d:.38},shoeBench:{x:2.77,z:-4.76,w:1.0,d:.32},
};
// The stair hall's front door opens into the clear passage beside the upper flight.
const stairEntrance:FloorDoor={wall:'front',centre:1.18,width:.98,hinge:1,side:-1};
const serviceEntrance:FloorDoor={wall:'front',centre:3.40,width:1.02,hinge:-1,side:-1};
const kitchenRearDoor:FloorDoor={wall:'kitchen-back',centre:-2.92,width:.88,hinge:1,side:-1};
export function doorsOn(wall:FloorWall,bathroom:boolean,stair=false){
  if(stair&&wall.id==='front')return [stairEntrance];
  if(bathroom&&wall.id==='front')return [serviceEntrance];
  if(bathroom&&wall.id==='kitchen-back')return [kitchenRearDoor];
  if(bathroom&&wall.id==='kitchen-hall')return [];
  return HOME_DOORS.filter(d=>d.wall===wall.id&&!(bathroom&&d.hallOnly));
}
export function wallSpans(wall:FloorWall,bathroom:boolean,stair=false):[number,number][]{
  const result:[number,number][]=[];let start=wall.start;
  for(const door of doorsOn(wall,bathroom,stair)){
    result.push([start,door.centre-door.width/2]);start=door.centre+door.width/2;
  }
  result.push([start,wall.end]);return result;
}
export function alignWall(wall:FloorWall,along:number,depth:number,length:number,thickness:number):FloorBox{
  return wall.axis==='x'?{x:along,z:wall.fixed+depth,w:length,d:thickness}:{x:wall.fixed+depth,z:along,w:thickness,d:length};
}
export function doorLeaf(wall:FloorWall,door:FloorDoor){
  return alignWall(wall,door.centre+door.hinge*(door.width/2-.022),door.side*door.width/2,.044,door.width);
}
export function homeRoomAt(x:number,z:number,stair=false){
  if(stair&&x>STAIR_LANDING.left&&x<STAIR_LANDING.right&&z>STAIR_FOOT&&z<STAIR_LANDING.front)return STAIR_LANDING.id;
  return HOME_ROOMS.find(r=>x>=r.left&&x<=r.right&&z>=r.back&&z<=r.front)?.id??3;
}
function collisionBoxes(bathroom:boolean,stair:boolean){
  const boxes=Object.values(HOUSE_FURNITURE).slice() as FloorBox[];
  for(const wall of HOME_WALLS){
    for(const [a,b] of wallSpans(wall,bathroom,stair))boxes.push(alignWall(wall,(a+b)/2,0,b-a,.12));
    for(const door of doorsOn(wall,bathroom,stair))boxes.push(doorLeaf(wall,door));
  }
  boxes.push(bathroom?BATH_KITCHEN_COUNTER:{x:-4.4,z:-2.49,w:3.65,d:.59},bathroom?BATH_RACK:{x:3.13,z:-.65,w:1.36,d:.54},{x:5.6,z:-2.49,w:1.4,d:.59});
  if(bathroom)boxes.push(BATH_SHOWER,{x:1.32,z:-2.47,w:1.3,d:.59});
  else if(stair)boxes.push(...stairBarriers());
  else boxes.push({x:.64,z:-2.48,w:.80,d:.74});
  return boxes;
}
const collisions=new Map<string,FloorBox[]>();
export function walkHome(from:Vec3,dx:number,dz:number,bathroom:boolean,stair:boolean,appliance?:FloorBox):Vec3{
  const key=[bathroom,stair,appliance?.x,appliance?.z,appliance?.w,appliance?.d].join('/');
  if(!collisions.has(key)){
    const boxes=collisionBoxes(bathroom,stair);
    if(appliance)boxes.push(appliance);
    collisions.set(key,boxes);
  }
  const boxes=collisions.get(key)!,radius=.16;
  const advance=(axis:'x'|'z',fromAxis:number,across:number,delta:number)=>{
    let next=fromAxis+delta;
    for(const box of boxes){
      const [along,cross,half,side]=axis==='x'?[box.x,box.z,box.w/2,box.d/2]:[box.z,box.x,box.d/2,box.w/2];
      if(Math.abs(across-cross)>=side+radius)continue;
      const low=along-half-radius,high=along+half+radius;
      if(delta>0&&fromAxis<=low+.00001)next=Math.min(next,low);
      if(delta<0&&fromAxis>=high-.00001)next=Math.max(next,high);
    }
    return Math.max(axis==='x'?-6.6+radius:REAR_GARDEN.back+radius,Math.min(axis==='x'?6.6-radius:6,next));
  };
  const x=advance('x',from[0],from[2],dx);
  const z=advance('z',from[2],x,dz);
  return [x,from[1]+(stair?stairFloor(x,z)-stairFloor(from[0],from[2]):0),z];
}
