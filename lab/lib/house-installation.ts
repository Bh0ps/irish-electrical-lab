import { COMPONENTS } from './components';
import { HOME_BACK, HOME_POINTS, HOME_STAIR, STAIR_TOP, STAIR_HALF, STAIR_LANDING } from './home-floorplan';
import { SERVICE_AREAS } from './service-floorplan';
import type { JobSite, SiteItem } from './job-site';
import { fixturePoint, type FixturePose } from './site-fixtures';
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
const houseFixings:Record<number,Record<string,WallFixing>>={
  1:{meter:{room:3,face:[2.89,1.24,2.865],yaw:0},supply:{room:3,face:[3.18,.90,2.865],yaw:0},light:back(1,.42,1.84)},
  2:{load2:kitchenA},
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
  36:{'light-switch':outsideBath,'fan-isolation':side(2,2.2,1.72,-.05,1)},
  37:{override:outsideBath},
};
export function houseFixing(id:number,c:ComponentInstance){return c.mount?undefined:houseFixings[id]?.[c.id];}
export function onWall(fixing:WallFixing,c:ComponentInstance,scale:number,fixture?:FixturePose):Vec3{
  let depth=COMPONENTS[c.type].size[2]*scale/2;
  if(fixture?.flushPlate)depth=.0001;
  else if(fixture?.batten)depth=.161*fixture.scale[2];
  else if(fixture&&['switch','switch2','intermediate'].includes(c.type))
    depth=.0005-(c.type==='switch'?.081:.103)*fixture.scale[2];
  return [fixing.face[0]+Math.sin(fixing.yaw)*depth,fixing.face[1],fixing.face[2]+Math.cos(fixing.yaw)*depth];
}

interface InstalledEnd {pin:Vec3; chase:Vec3; riser:number; item:SiteItem; component:ComponentInstance}
function installedEnd(doc:CircuitDocument,site:JobSite,end:Endpoint):InstalledEnd|undefined{
  const component=doc.components.find(c=>c.id===end.component),item=site.items.find(c=>c.id===end.component);
  if(!component||!item)return;
  const terminal=getComponentTerminals(component,COMPONENTS[component.type]).find(t=>t.id===end.terminal);
  if(!terminal)return;
  const pin=fixturePoint(item.position,item.scale,item.fixture,component,terminal.anchor,item.rotation);
  const fixing=site.kind==='home'?houseFixing(doc.lessonId??0,component):undefined;
  const service=site.kind!=='home'&&item.room===4?SERVICE_AREAS[site.kind]:undefined;
  const chase:Vec3=[...pin];
  if(fixing&&Math.abs(Math.sin(fixing.yaw))>.5)chase[0]=fixing.face[0]-Math.sin(fixing.yaw)*.065;
  else if(service&&Math.abs(Math.sin(item.rotation))>.5)chase[0]=service.side*6.6;
  else chase[2]=fixing?fixing.face[2]-.065:service?service.back-.02:item.room===3?2.8:-2.87;
  // The rear wing and front rooms have separate routes in the ceiling void.
  const riser=site.kind==='home'&&item.room>=4&&item.room<=7?HOME_BACK-.04:service?service.back-.02:-2.87;
  return {pin,chase,riser,item,component};
}
const same=(a:Vec3,b:Vec3)=>a.every((v,k)=>Math.abs(v-b[k])<.000001);
/** One selected, actually connected core. Routes show this house's example installation.
 * Cable lengths, diagram coordinates and off-site bench bends are independent. */
export function installedWireRoute(doc:CircuitDocument,site:JobSite,wire:Wire):Vec3[]|undefined{
  const a=installedEnd(doc,site,wire.from),b=installedEnd(doc,site,wire.to);
  if(!a||!b)return;
  const points:Vec3[]=[];
  function through(...corners:Vec3[]){for(const p of corners)if(!points.length||!same(points[points.length-1],p))points.push(p);}
  const assembly=(e:InstalledEnd)=>e.component.mount?.board??e.component.id;
  const shortWallDrop=a.item.room===b.item.room&&Math.hypot(a.chase[0]-b.chase[0],a.chase[2]-b.chase[2])<.13;
  const cupboard=site.kind==='home'&&[13,65,66,68,69].includes(doc.lessonId??0)&&a.item.room===0&&b.item.room===0;
  through(a.pin);
  if(assembly(a)===assembly(b)){
    // The links between rail-mounted devices stay inside their own board.
    through([a.pin[0],a.pin[1],Math.min(a.pin[2],b.pin[2])-.008],
      [b.pin[0],a.pin[1],Math.min(a.pin[2],b.pin[2])-.008],
      [b.pin[0],b.pin[1],Math.min(a.pin[2],b.pin[2])-.008],b.pin);
    return points;
  }
  through(a.chase);
  if(shortWallDrop){
    through([a.chase[0],b.chase[1],a.chase[2]],[b.chase[0],b.chase[1],a.chase[2]]);
  }else{
    const y=cupboard?Math.max(a.chase[1],b.chase[1]):2.955;
    const ar=cupboard?a.chase[2]:a.riser,br=cupboard?b.chase[2]:b.riser;
    through([a.chase[0],y,a.chase[2]],[a.chase[0],y,ar]);
    if(ar!==br){
      // Cross rows over a partition leading to the rear bedroom or sitting room.
      const wing=a.riser===HOME_BACK-.04?a:b;
      const cross=site.kind!=='home'?SERVICE_AREAS[site.kind].side*6.6:wing.item.room===5?3.6:-.6;
      through([cross,y,ar],[cross,y,br]);
    }
    through([b.chase[0],y,br],[b.chase[0],y,b.chase[2]]);
  }
  through(b.chase,b.pin);
  return points;
}
