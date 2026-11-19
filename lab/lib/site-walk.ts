import {homeVisit, isDoorstep,isStairStation, STAIR_EYE, STAIR_LANDING} from './home-floorplan';
import {serviceVisit} from './service-floorplan';
import type {JobSite, SiteItem} from './job-site';
import type {SitePose} from './site-camera';
import {fittedHeaterView} from './fused-heater-site';
import type {Vec3} from './types';
import {cupboardView} from './consumer-unit-site';
import {worktopOverview} from './kitchen-lighting';

/** At arm's reach a tap operates the fitting; farther away it takes a closer look. */
export function withinFittingReach(eye:Vec3|undefined,cap:Vec3){
  return !!eye&&Math.hypot(eye[0]-cap[0],eye[1]-cap[1],eye[2]-cap[2])<=.85;
}

/** Enter from standing space in the same room. A fitting close-up can sit over a sink or behind a board. */
export function standingView(site:JobSite,item?:SiteItem,aspect=1):SitePose {
  const stair=site.kind==='home'&&site.building.rooms[1]==='Stair hall';
  const room=item?.room??site.room;
  if(room===0&&item?.fixture?.tapeProfile&&['left','right'].every(id=>site.items.some(i=>i.id===id&&i.fixture?.tapeProfile)))return worktopOverview(aspect,true);
  const board=site.cupboardBoard&&site.items.find(i=>i.id===site.cupboardBoard);
  if(board&&room===board.room)return cupboardView(board,'walk',aspect);
  const heater=site.items.find(i=>i.fixture?.panelHeater);
  if(room===0&&heater?.room===room)return fittedHeaterView(heater,'walk',aspect);
  const visit=(site.kind==='home'?homeVisit(room,stair,site.doorsteps,aspect):serviceVisit(site,room))??{position:[0,STAIR_EYE,1.6] as [number,number,number],yaw:0,pitch:0};
  if(site.doorsteps&&isDoorstep(room))return visit;
  if(!item)return visit;
  if(stair&&isStairStation(item.id)&&room===STAIR_LANDING.id)return visit;
  const [x,y,z]=visit.position,dx=item.position[0]-x,dz=item.position[2]-z;
  return {...visit,yaw:Math.atan2(-dx,-dz),pitch:Math.max(-.72,Math.min(.72,Math.atan2(item.position[1]+.06-y,Math.hypot(dx,dz))))};
}

/** Screen-relative stick. Ignore a resting thumb near the centre, cap diagonal travel at walking speed. */
export function walkStick(x:number,y:number,radius:number):[number,number] {
  const distance=Math.hypot(x,y),dead=radius*.15;
  if(distance<=dead||radius<=dead)return [0,0];
  const intensity=Math.min(1,(distance-dead)/(radius-dead));
  return [x/distance*intensity,-y/distance*intensity];
}

/** Pinching a close-up changes the lens, leaving the camera on its side of the wall. */
export function fittingZoom(current:number,delta:number,requested?:number){
  return Math.max(1,Math.min(3,requested??current*Math.exp(delta*2)));
}

/** Shared by DOM input and the R3F frame. Input events wake an idle scene. */
export class SiteWalkInput {
  keys=new Set<string>();
  stick:[number,number]=[0,0];
  turn:[number,number]=[0,0];
  nudge:[number,number]=[0,0];
  zoom=0;
  requestedZoom?:number;
  moved=false;
  thumb=false;
  wake=()=>{};
  setWake(fn:()=>void){this.wake=fn;}
  moveThumb(x:number,forward:number){this.thumb=true;this.stick=[x,forward];this.wake();}
  liftThumb(){this.thumb=false;this.stick=[0,0];}
  step(dir:string){this.nudge=[dir==='left'?-.25:dir==='right'?.25:0,dir==='up'?.25:dir==='down'?-.25:0];this.wake();}
  /** Radians of yaw this frame. Drag-to-look keeps its own independent input. */
  advanceSteering(dt:number){return this.stick[0]*1.8*Math.min(.045,Math.max(0,dt));}
  turnStep(right:boolean){this.turnBy((right?1:-1)*Math.PI/12/.003,0);}
  turnBy(x:number,y:number){this.turn[0]+=x;this.turn[1]+=y;this.wake();}
  zoomBy(z:number){this.zoom+=z;this.wake();}
  setZoom(value:number){this.requestedZoom=value;this.wake();}
  consumeMotion(){this.turn=[0,0];this.nudge=[0,0];this.zoom=0;this.requestedZoom=undefined;}
  markMoved(){this.moved=true;}
  startView(){this.consumeMotion();this.moved=false;}
  stop(){this.keys.clear();this.liftThumb();this.consumeMotion();}
}
