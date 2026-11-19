import { FCU_BOX,KITCHEN_PANEL,heaterFlexRoute,fusedIncomingLead } from './fused-heater-site';
import { COMPONENTS } from './components';
import {BELL_CUPBOARD as serviceBoard,bellPrimaryLead,bellSecondaryLead,chimeEnvelope} from './bell-cupboard';
import {cromaLeadPath} from './croma-chime';
import {BOARD_STUDY_ID,UTILITY_BOARD,mountedStudyControl,outgoingBoardLead} from './consumer-unit-site';
import { GARDEN_DOOR, HOME_BACK, HOME_POINTS, HOME_STAIR, REAR_GARDEN, STAIR_TOP, STAIR_HALF, STAIR_LANDING } from './home-floorplan';
import { SERVICE_AREAS } from './service-floorplan';
import type { JobSite, SiteItem } from './job-site';
import { fixturePoint,installedTerminalPoint, type FixturePose } from './site-fixtures';
import {KITCHEN_LIGHTS as kitchen,ROCKER_BOX,rockerLead,rockerPose,stripLead} from './kitchen-lighting';
import {rockerWireEntry} from './dc-rocker';
import {worktopLooseEnd} from './worktop-connector';
import {BATH_EXTRACT as bath} from './bathroom-extract';
import { getComponentTerminals } from './terminal-layout';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3, Wire } from './types';

/** The fixing is on the finished face. Depth offsets put rear chambers in the wall. */
interface WallFixing {room:number; face:Vec3; yaw:number}
const back=(room:number,x:number,y:number,z=-2.8):WallFixing=>({room,face:[x,y,z-.01],yaw:0});
const side=(room:number,wallX:number,y:number,z:number,normal:1|-1):WallFixing=>
  ({room,face:[wallX+normal*.06,y,z],yaw:normal*Math.PI/2});
const rear=(spot:typeof HOME_POINTS[keyof typeof HOME_POINTS],height:number)=>back(spot.room,spot.x,height,spot.z);
const kitchenA=back(0,-4.47,1.12);
const ring={
  'socket-a':rear(HOME_POINTS.sittingWest,.48),
  'socket-b':rear(HOME_POINTS.sittingEast,.48),
  'socket-c':rear(HOME_POINTS.bedroom,.48),
};
const outsideBath=side(2,2.2,1.18,-.05,1);
const frontPush:WallFixing={room:3,face:[1.00,1.17,2.875],yaw:0};
const gardenPush:WallFixing={room:REAR_GARDEN.id,face:[GARDEN_DOOR.centre-GARDEN_DOOR.width/2-.105,1.17,HOME_BACK-.15],yaw:Math.PI};
const houseFixings:Record<number,Record<string,WallFixing>>={
  1:{meter:{room:3,face:[2.89,1.24,2.865],yaw:0},supply:{room:3,face:[3.18,.90,2.865],yaw:0},light:back(1,.42,1.84)},
  2:{load2:kitchenA,load1:back(1,.42,1.94),supply:back(2,5.08,1.50),[BOARD_STUDY_ID]:back(2,UTILITY_BOARD.x,UTILITY_BOARD.bottom)},
  3:{load1:back(1,.42,1.84),load2:kitchenA},
  9:{near:{room:1,face:[HOME_STAIR.divider-.035,1.04,.97],yaw:-Math.PI/2},
    far:side(STAIR_LANDING.id,HOME_STAIR.east,STAIR_TOP+1.04,.97,-1),
    light:back(1,-1.53,STAIR_HALF+2.03)},
  17:{'socket-a':kitchenA,'socket-b':back(0,-3.18,1.12),'socket-c':side(0,-6.6,.48,-1.04,1)},
  18:ring,
  19:{...ring,'branch-fuse':rear(HOME_POINTS.study,1.04),fixed:rear(HOME_POINTS.study,.18)},
  20:{'fcu-switch':back(0,-3.39,1.12),fuse:back(0,-3.17,1.12),fixed:side(0,-2.2,.25,-1.61,-1)},
  21:{'grid-a':back(0,-4.43,1.12),'grid-b':back(0,-4.32,1.12),
    'outlet-a':side(0,-6.6,.52,-1.64,1),'outlet-b':side(0,-2.2,.52,-1.64,-1)},
  22:{local:back(0,-3.43,1.16)},
  23:{local:outsideBath},
  35:{switch:outsideBath},
  36:{'light-switch':side(2,2.2,1.15,bath.switchZ,1),'fan-isolation':side(2,2.2,1.72,bath.switchZ,1),
    'fan-fcu':side(2,2.2,1.32,-.82,1),runon:side(2,2.2,1.63,-.82,1),
    fan:{room:1,face:[bath.fanX,bath.fanY-.088,bath.wallInside],yaw:Math.PI},
    'fan-cpc':{room:1,face:[bath.fanX-.21,bath.fanY-.005,bath.wallInside],yaw:Math.PI}},
  37:{override:outsideBath},
  66:{'left-switch':back(0,kitchen.left,kitchen.switchHeight,kitchen.tileFace+.01),'right-switch':back(0,kitchen.right,kitchen.switchHeight,kitchen.tileFace+.01)},
  71:{front:frontPush,rear:gardenPush,bell:back(1,.59,1.82)},
  72:{front:frontPush,back:gardenPush,chime:back(1,.59,1.82)},
  73:{call:frontPush},
  80:{push:frontPush},
};
export function houseFixing(id:number,c:ComponentInstance,panelBranch=false){if(c.mount)return;
  if(id===19){
    if(c.id==='branch-fuse'&&c.type==='fcu'&&panelBranch)return back(HOME_POINTS.study.room,3.24,FCU_BOX.originY,HOME_BACK);
    if(c.id==='fixed'&&c.type==='heater'&&c.variant==='plx050e')return back(HOME_POINTS.study.room,2.68,KITCHEN_PANEL.originY,HOME_BACK);
  }
  if(id===20&&c.id==='fcu-switch'&&c.type==='fcu')return side(0,-2.2,FCU_BOX.originY,FCU_BOX.wallZ,-1);
  if(id===20&&c.id==='fixed'&&c.type==='heater'&&c.variant==='plx050e')return side(0,-2.2,KITCHEN_PANEL.originY,KITCHEN_PANEL.wallZ,-1);
  return houseFixings[id]?.[c.id];}
export function onWall(fixing:WallFixing,c:ComponentInstance,scale:number,fixture?:FixturePose):Vec3{
  let depth=COMPONENTS[c.type].size[2]*scale/2;
  if(fixture?.fusedHeater)depth=FCU_BOX.depth;
  else if(fixture?.panelHeater)depth=0;
  else if(fixture?.worktopRocker)depth=ROCKER_BOX.depth;
  else if(fixture?.croma)depth=0;
  else if(fixture?.hallChime)depth=-chimeEnvelope(c.type).back*fixture.scale[2];
  else if(fixture?.extractor)depth=0;
  else if(fixture?.serviceBox)depth=fixture.serviceBox==='timer'?bath.timerOffset:bath.cpcOffset;
  else if(fixture?.flushPlate)depth=c.type==='switch2'?.0014:.0001;
  else if(fixture?.bellPush)depth=c.variant==='sesame'?0:.220*fixture.scale[2];
  else if(fixture?.batten)depth=.161*fixture.scale[2];
  else if(fixture&&['switch','switch2','intermediate'].includes(c.type))
    depth=.0005-(c.type==='switch'?.081:.103)*fixture.scale[2];
  return [fixing.face[0]+Math.sin(fixing.yaw)*depth,fixing.face[1],fixing.face[2]+Math.cos(fixing.yaw)*depth];
}

interface InstalledEnd {pin:Vec3; chase:Vec3; riser:number; item:SiteItem; component:ComponentInstance;lead?:Vec3[]}
export function installedEnd(doc:CircuitDocument,site:JobSite,end:Endpoint,openRocker?:string|ReadonlySet<string>,wire?:Wire):InstalledEnd|undefined{
  const component=doc.components.find(c=>c.id===end.component),item=site.items.find(c=>c.id===end.component);
  if(!component||!item)return;
  const terminal=getComponentTerminals(component,COMPONENTS[component.type]).find(t=>t.id===end.terminal);
  if(!terminal)return;
  const pin=installedTerminalPoint(item,component,terminal);
  if(doc.lessonId===2&&wire&&mountedStudyControl(component)){
    const board=site.items.find(i=>i.id===component.mount!.board);
    const lead=board&&outgoingBoardLead(board,component,pin,end.terminal,wire.role);
    if(lead)return {pin,chase:lead[lead.length-1],riser:-2.87,item,component,lead};
  }
  if(doc.lessonId===36&&item.fixture?.ceilingLight){
    return {pin,chase:[pin[0],bath.circuitHeight,pin[2]],riser:pin[2],item,component};
  }
  const fixing=site.kind==='home'?houseFixing(doc.lessonId??0,component,item.fixture?.fusedHeater):undefined;
  const service=site.kind!=='home'&&item.room===4?SERVICE_AREAS[site.kind]:undefined;
  const chase:Vec3=[...pin];
  if(fixing&&Math.abs(Math.sin(fixing.yaw))>.5)chase[0]=fixing.face[0]-Math.sin(fixing.yaw)*.065;
  else if(service&&Math.abs(Math.sin(item.rotation))>.5)chase[0]=service.side*6.6;
  else chase[2]=fixing?fixing.face[2]-Math.cos(fixing.yaw)*.065:service?service.back-.02:item.room===3?2.8:-2.87;
  // The rear wing and front rooms have separate routes in the ceiling void.
  const rearWing=item.room===REAR_GARDEN.id||(item.room>=4&&item.room<=7);
  const riser=site.kind==='home'&&rearWing?HOME_BACK-.04:service?service.back-.02:-2.87;
  if(item.fixture?.fusedHeater&&wire){
    const open=typeof openRocker==='string'?openRocker===component.id:!!openRocker?.has(component.id);
    const lead=fusedIncomingLead(doc,item,wire,open);
    if(lead){
      const entry=lead[lead.length-1],behind:Vec3=fixing&&Math.abs(Math.sin(fixing.yaw))>.5
        ?[chase[0],entry[1],entry[2]]:[entry[0],entry[1],chase[2]];
      return {pin:lead[0],chase:behind,riser,item,component,lead:[...lead,behind]};
    }
  }
  if(item.fixture?.croma){
    const lead=cromaLeadPath(end.terminal).map(p=>fixturePoint(item.position,item.scale,item.fixture,component,p,item.rotation));
    if(lead.length){
      const entry=lead[lead.length-1];
      const behind:Vec3=[entry[0],entry[1],chase[2]];
      return {pin,chase:behind,riser,item,component,lead:[...lead,behind]};
    }
  }
  if(item.fixture?.worktopRocker){
    const open=typeof openRocker==='string'?openRocker===item.id:!!openRocker?.has(item.id),pose=rockerPose(item.position,open);
    const detached=worktopLooseEnd(doc,wire),loose=detached?.component===end.component&&detached.terminal===end.terminal;
    const contact=fixturePoint(pose.position,item.scale,item.fixture,component,rockerWireEntry(terminal.id,loose),pose.rotation);
    const lead=rockerLead(item.position,contact,terminal.id,open,loose);
    return {pin:contact,chase:lead[lead.length-1],riser,item,component,lead};
  }
  if(doc.lessonId===36&&item.fixture?.bellService){
    const x=serviceBoard.x+bath.outgoingOffset,top=serviceBoard.y+serviceBoard.breakerSize[1]/2,z=serviceBoard.z+serviceBoard.conduitZ;
    const lead:Vec3[]=[pin,[pin[0],pin[1],z],[x,pin[1],z],[x,top,z]];
    return {pin,chase:lead[3],riser,item,component,lead};
  }
  if(item.fixture?.extractor){
    // Both insulated cores enter through the oval hole below the terminal block.
    // The wider spacing at the terminals narrows slightly inside the shared grommet.
    const x=terminal.id==='L'?-.615:-.575;
    const entry=fixturePoint(item.position,item.scale,item.fixture,component,[x,.950,.011],item.rotation);
    const lead:Vec3[]=[pin,[pin[0],entry[1],pin[2]],[entry[0],entry[1],pin[2]],entry,[entry[0],entry[1],bath.wallInside+.065]];
    return {pin,chase:lead[lead.length-1],riser,item,component,lead};
  }
  if(doc.lessonId===36&&item.fixture?.serviceBox){
    // Rear entry on each surface box. The concealed core turns behind the plaster.
    const lead:Vec3[]=item.fixture.serviceBox==='timer'
      ? [pin,[pin[0],item.position[1]+.069,pin[2]],[2.202,item.position[1]+.069,pin[2]]]
      : [pin,[pin[0],pin[1]+.020,pin[2]],[pin[0],pin[1]+.020,bath.wallInside+.059]];
    return {pin,chase:lead[2],riser,item,component,lead};
  }
  if(item.fixture?.tapeProfile){
    const lead=stripLead(pin,item.position[0],terminal.id);
    return {pin,chase:lead[lead.length-1],riser,item,component,lead};
  }
  if(item.fixture?.kitchenDriver){
    // Each pair leaves through the slot facing the back wall of its own box.
    const y=item.position[1]+.006;
    const exit:Vec3=[pin[0],y,item.position[2]+kitchen.boxZ-kitchen.boxSize[2]/2];
    const behind:Vec3=[exit[0],y,kitchen.backGapZ];
    return {pin,chase:behind,riser,item,component,lead:[pin,[pin[0],y,pin[2]],exit,behind]};
  }
  if(item.fixture?.bellService==='tx'&&(end.terminal==='+'||end.terminal==='-')){
    const lead=bellSecondaryLead(pin);
    return {pin,chase:lead[lead.length-1],riser,item,component,lead};
  }
  return {pin,chase,riser,item,component};
}
const same=(a:Vec3,b:Vec3)=>a.every((v,k)=>Math.abs(v-b[k])<.000001);
/** One selected, actually connected core. Routes show this house's example installation.
 * Cable lengths, diagram coordinates and off-site bench bends are independent. */
export function installedWireRoute(doc:CircuitDocument,site:JobSite,wire:Wire,openRocker?:string|ReadonlySet<string>):Vec3[]|undefined{
  const a=installedEnd(doc,site,wire.from,openRocker,wire),b=installedEnd(doc,site,wire.to,openRocker,wire);
  if(!a||!b)return;
  const fuse=doc.lessonId===19?'branch-fuse':'fcu-switch';
  const withdrawn=typeof openRocker==='string'?openRocker===fuse:!!openRocker?.has(fuse);
  const flex=heaterFlexRoute(doc,site,wire,withdrawn);
  if(flex)return flex;
  const points:Vec3[]=[];
  function through(...corners:Vec3[]){for(const p of corners)if(!points.length||!same(points[points.length-1],p))points.push(p);}
  const assembly=(e:InstalledEnd)=>e.component.mount?.board??e.component.id;
  const partA=a.item.fixture?.bellService,partB=b.item.fixture?.bellService;
  if(partA&&partB){
    if((partA==='tx')!==(partB==='tx')){
      through(...bellPrimaryLead(a.pin,partA),...bellPrimaryLead(b.pin,partB).reverse());
    }else{
      // Incoming terminals and the top of the RCBO share the left enclosure.
      const z=Math.min(a.pin[2],b.pin[2])-.004;
      through(a.pin,[a.pin[0],a.pin[1],z],[b.pin[0],a.pin[1],z],[b.pin[0],b.pin[1],z],b.pin);
    }
    return points;
  }
  if(doc.lessonId===9){
    // The two landings share an enclosed floor edge. The default route runs
    // through open air above the lower flight if taken along the stair divider.
    const stairs=(e:InstalledEnd)=>e.component.type==='switch2'&&['near','far'].includes(e.component.id);
    if((stairs(a)||stairs(b))&&assembly(a)!==assembly(b)){
      const y=STAIR_TOP-.075,spine=HOME_STAIR.east;
      const route=(e:InstalledEnd):Vec3[]=>{
        const [x,,z]=e.chase;
        if(stairs(e))return [e.pin,e.chase,[x,y,z],[spine,y,z]];
        return [...(e.lead??[e.pin,e.chase]),[x,y,z],[x,y,e.riser],[spine,y,e.riser]];
      };
      through(...route(a),...route(b).reverse());
      return points;
    }
  }
  const shortWallDrop=a.item.room===b.item.room&&Math.hypot(a.chase[0]-b.chase[0],a.chase[2]-b.chase[2])<.13;
  if(doc.lessonId===36&&!shortWallDrop&&assembly(a)!==assembly(b)){
    // Each wall drop rises to the ceiling void at its own fixing. The short
    // crossing runs straight from the dry-side partition to the bathroom.
    const y=bath.circuitHeight;
    through(...(a.lead??[a.pin,a.chase]),[a.chase[0],y,a.chase[2]],
      [b.chase[0],y,a.chase[2]],[b.chase[0],y,b.chase[2]],...(b.lead?[...b.lead].reverse():[b.chase,b.pin]));
    return points;
  }
  const cupboard=site.kind==='home'&&[13,65,66,68,69].includes(doc.lessonId??0)&&a.item.room===0&&b.item.room===0;
  if(cupboard&&doc.lessonId!==65&&assembly(a)!==assembly(b)&&(a.item.fixture?.tapeProfile||b.item.fixture?.tapeProfile||a.item.fixture?.kitchenDriver||b.item.fixture?.kitchenDriver)){
    // Follow the cabinet underside. At a wall switch the cable first drops in
    // the wall; at a strip it enters the open end of the aluminium channel.
    function toRail(e:InstalledEnd):Vec3[]{
      if(e.item.fixture?.tapeProfile)return e.lead!;
      const x=e.chase[0];
      return [...(e.lead??[e.pin,e.chase]),[x,kitchen.railY,e.chase[2]],[x,kitchen.railY,kitchen.railZ]];
    }
    through(...toRail(a),...toRail(b).reverse());
    return points;
  }
  through(a.pin);
  if(assembly(a)===assembly(b)){
    // The links between rail-mounted devices stay inside their own board.
    through([a.pin[0],a.pin[1],Math.min(a.pin[2],b.pin[2])-.008],
      [b.pin[0],a.pin[1],Math.min(a.pin[2],b.pin[2])-.008],
      [b.pin[0],b.pin[1],Math.min(a.pin[2],b.pin[2])-.008],b.pin);
    return points;
  }
  through(...(a.lead??[a.chase]));
  if(shortWallDrop){
    through([a.chase[0],b.chase[1],a.chase[2]],[b.chase[0],b.chase[1],a.chase[2]]);
  }else{
    const y=cupboard?Math.max(a.chase[1],b.chase[1]):2.955;
    const ar=cupboard?a.chase[2]:a.riser,br=cupboard?b.chase[2]:b.riser;
    through([a.chase[0],y,a.chase[2]],[a.chase[0],y,ar]);
    if(cupboard)through([b.chase[0],y,ar]);
    else if(ar!==br){
      // Cross rows over a partition leading to the rear bedroom or sitting room.
      const wing=a.riser===HOME_BACK-.04?a:b;
      const cross=site.kind!=='home'?SERVICE_AREAS[site.kind].side*6.6:wing.item.room===5?3.6:-.6;
      through([cross,y,ar],[cross,y,br]);
    }
    through([b.chase[0],y,br],[b.chase[0],y,b.chase[2]]);
  }
  through(...(b.lead?[...b.lead].reverse():[b.chase,b.pin]));
  return points;
}
