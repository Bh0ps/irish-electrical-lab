import type {JobSite} from './job-site';
import type {SavedSitePose} from './site-camera';
import {BELL_FORECOURT,HOME_ROOMS,HOME_WALLS,SIDE_PASSAGE,REAR_GARDEN,STAIR_LANDING,alignWall,wallSpans,homeRoomAt} from './home-floorplan';
import {serviceSpaces,serviceWalls,serviceRoomAt} from './service-floorplan';

export interface MapLocation {room:number;name:string;x?:number;z?:number;yaw?:number;walking:boolean}

/** A walking arrow belongs to the live viewpoint. When inspecting, mark the fitting itself. */
export function locateOnMap(site:JobSite,job:string,focus:number,view:SavedSitePose|undefined,walking:boolean,room:number,fitting?:string):MapLocation {
  if(walking&&view?.walking&&view.job===job&&view.focus===focus){
    const [x,,z]=view.position;
    const area=site.kind==='home'?homeRoomAt(x,z,site.building.rooms[1]==='Stair hall',site.doorsteps):serviceRoomAt(site.kind,x,z);
    return {room:area,name:site.location(area),x,z,yaw:view.yaw,walking:true};
  }
  const item=!walking&&site.items.find(i=>i.id===fitting);
  if(item)return {room:item.room,name:site.location(item.room),x:item.position[0],z:item.position[2],walking:false};
  return {room,name:site.location(room),walking:false};
}

export function siteMapLayout(site:JobSite){
  const stairs=site.kind==='home'&&site.building.rooms[1]==='Stair hall';
  const rooms=(site.kind==='home'?[...HOME_ROOMS,...(site.doorsteps?[SIDE_PASSAGE]:[]),...(stairs?[STAIR_LANDING]:[])]:serviceSpaces(site.kind))
    .map(r=>({...r,name:site.location(r.id),...(site.doorsteps&&(r.id===3||r.id===REAR_GARDEN.id)?{left:SIDE_PASSAGE.left,...(r.id===3?{front:BELL_FORECOURT}:{})}:{})}));
  const service=site.kind==='home'?undefined:serviceWalls(site.kind);
  const walls=service?[...service.original,...service.annex]:HOME_WALLS.flatMap(w=>
    wallSpans(w,site.building.rooms[1]==='Bathroom',stairs,site.doorsteps).map(([a,b])=>alignWall(w,(a+b)/2,0,b-a,.12)));
  return {rooms,walls,stairs};
}
