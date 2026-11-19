import type { CircuitDocument, ComponentInstance, ConfigurationLesson, Vec3 } from './types';
import { fixturePoint, physicalFixture, isStrip, type FixturePose } from './site-fixtures.ts';
import {seatPosition} from './board-assembly';
import {KITCHEN_PANEL} from './fused-heater-site';
import {PLXE_MM_PER_UNIT} from './plxe';
import { COMPONENTS } from './components';
import {bellServicePart,bellServicePose} from './bell-cupboard';
import {fittedKitchenDriver,KITCHEN_LIGHTS as kitchen} from './kitchen-lighting';
import {BATH_EXTRACT as bath} from './bathroom-extract';
import { houseFixing, onWall } from './house-installation';
import { HOME_ROOMS, REAR_GARDEN, SIDE_PASSAGE, STAIR_LANDING, walkHome,type FloorBox } from './home-floorplan';
import { SERVICE_AREAS, serviceFixing, walkService } from './service-floorplan';

export type SiteKind = 'home' | 'plant' | 'shop' | 'workshop' | 'works';
export interface Building { name:string; rooms:[string,string,string]; walls:[string,string,string]; floor:string }
export const BUILDINGS:Record<SiteKind,Building> = {
  home:{name:'Oakfield house',rooms:['Kitchen','Entrance hall','Utility cupboard'],walls:['#d2dbcc','#e7ded1','#dce1e1'],floor:'#b69a78'},
  plant:{name:'Heating plant room',rooms:['Heating controls','Boiler room','Service intake'],walls:['#d6dedb','#cbd4d5','#dbe0d9'],floor:'#8d9490'},
  shop:{name:'Market Street shop',rooms:['Shop floor','Service corridor','Stockroom'],walls:['#e5d8bc','#c0d3d0','#dae0dd'],floor:'#a8a399'},
  workshop:{name:'Joinery workshop',rooms:['Machine bay','Assembly shop','Switch room'],walls:['#bccacb','#c4cbc4','#d7ddda'],floor:'#93968b'},
  works:{name:'Riverside works',rooms:['Process bay','Production floor','Electrical room'],walls:['#afc2c6','#c2cecb','#d2d9d8'],floor:'#959c99'},
};
export const ROOM_WALLS = [-6.6,-2.2,2.2,6.6] as const;
export const ROOM_CENTRES = [-4.4,0,4.4] as const;
export const BACK = -2.8, FRONT = 2.8, DOOR_Z = .95, DOOR_WIDTH = 1.25;
type Job = [SiteKind,number,string];
const home=(room:number,spot:string):Job=>['home',room,spot];
const plant=(room:number,spot:string):Job=>['plant',room,spot];
const shop=(room:number,spot:string):Job=>['shop',room,spot];
const work=(room:number,spot:string):Job=>['workshop',room,spot];
const works=(room:number,spot:string):Job=>['works',room,spot];
/** Each job gets an installation location, an arrival position and a name for its drawing. */
export const JOBS: Record<number,Job> = {
  1:home(2,'Service intake'),2:home(2,'Consumer unit'),3:home(2,'Lighting protection'),4:work(2,'Remote board'),5:home(2,'Surge protection'),6:home(2,'Priority controls'),
  7:home(1,'Hall light'),8:shop(0,'Display lighting'),9:home(1,'Staircase'),10:shop(1,'Corridor switching'),11:home(0,'Kitchen lighting'),12:home(1,'Hall dimmer'),13:home(0,'Cabinet lighting'),
  14:home(3,'Entrance lighting'),15:shop(3,'Outside lighting'),16:home(1,'Hall controls'),17:home(0,'Kitchen sockets'),18:home(1,'Socket ring'),19:home(0,'Fused branch'),
  20:home(0,'Kitchen heater'),21:home(0,'Kitchen isolators'),22:home(0,'Cooker'),23:home(1,'Shower room'),24:home(1,'Shaver outlet'),
  25:plant(1,'Hot-water cylinder'),26:plant(1,'Dual immersion'),27:plant(0,'Immersion controls'),28:plant(0,'Room demand'),29:plant(1,'Two heating zones'),
  30:plant(1,'Three-port valve'),31:home(1,'Heated floor'),32:plant(0,'Manifold'),33:home(1,'Storage heater'),34:plant(3,'Outdoor heat pump'),
  35:home(1,'Ventilation'),36:home(1,'Timed extract'),37:home(1,'Humidity control'),38:plant(1,'Sump'),39:plant(1,'Booster set'),40:work(0,'Motor starter'),41:work(3,'Roller shutter'),
  42:home(1,'Interlinked alarms'),43:home(3,'Front doorbell'),44:shop(1,'Exit light'),45:shop(1,'Escape route'),46:home(3,'EV charging'),47:home(2,'Solar inverter'),
  48:home(2,'Essential supplies'),49:shop(3,'Shop sign'),50:shop(2,'Cold store'),51:work(0,'Air compressor'),52:works(3,'Yard gate'),
  53:works(2,'Distribution board'),54:works(1,'Industrial socket'),55:works(0,'Motor starter'),56:works(1,'Reversing drive'),57:works(0,'Star-delta starter'),
  58:works(0,'Variable-speed drive'),59:works(1,'Heater bank'),60:works(1,'Two start stations'),61:works(1,'Conveyor line'),62:works(0,'Duty pumps'),
  63:works(1,'PLC station'),64:works(1,'Safety relay'),65:home(0,'Cupboard lighting'),66:home(0,'Worktop lighting'),67:shop(0,'Long display strip'),
  68:home(0,'Under-cabinet dimmer'),69:home(0,'Tunable-white lighting'),70:shop(0,'Series downlights'),71:home(3,'Two entrance pushes'),72:home(3,'Front and back calls'),
  73:home(1,'Visual doorbell'),74:shop(3,'Door annunciator'),75:plant(0,'Room thermostat'),76:plant(1,'Valve actuator'),77:plant(1,'Condensate alarm'),
  78:work(0,'Proximity switch'),79:works(2,'DC distribution'),80:home(3,'Entrance installation'),
};
export interface SiteItem { id:string; ref:string; room:number; position:Vec3; rotation:number; scale:number; fixture?:FixturePose }
export interface JobSite {kind:SiteKind; building:Building; name:string; room:number; items:SiteItem[]; first?:string; floorObstacle?:FloorBox; doorsteps?:boolean; location:(room:number)=>string}
const letters:Record<string,string>={source:'U',source3:'U',meter:'P',panel:'DB',gammaboard:'DB',invictaboard:'DB',mcb:'QF',mcb3:'QF',rcbo:'QF',rcd:'FI',rcd3:'FI',isolator:'QS',isolator3:'QS',fuse:'F',transformer:'T',driver:'PS',dcsupply:'PS',relay:'K',contactor:'KM',motor:'M',motor3:'M',valve:'Y',valve3:'Y',fan:'M',pump:'M',lamp:'E',led:'E',indicator:'H',chime:'HA',heater:'R',socket:'X',shaveroutlet:'X',socket3:'X',terminal:'X',pushbutton:'S',switch:'S',switch2:'S',sensor:'B',plc:'A',thermostat:'B'};
const isSupply=(c:ComponentInstance)=>/^(source3?|mcb3?|rcbo|rcd3?|meter|panel|earthbar|neutralbar|spd|board|enclosure|busbar|invictaboard|gammaboard)$/.test(c.type)||/^(supply|protect|board|group|branch\d+|main-isolator)$/.test(c.id);
function roomFor(c:ComponentInstance,id:number,room:number) {
  if(id===2&&c.id==='load1')return 1;
  if(id===2&&c.id==='load2')return 0;
  if(id===53&&c.id.startsWith('phase-load'))return c.id==='phase-load1'?0:1;
  if(id===4&&/remote|outgoing|load/.test(c.id))return 0;
  if(isSupply(c))return 2;
  if([43,71,72,73,74,80].includes(id)){
    if(/transfor|dcsupply|relay|timer|fuse|driver/.test(c.type))return 2;
    if(c.id==='courtesy')return 3;
    if((id===71||id===72)&&(c.id==='back'||c.id==='rear'))return REAR_GARDEN.id;
    if(/pushbutton|doorcontact/.test(c.type)||/push|reed|button|contact/.test(c.id))return 3;
    return 1;
  }
  if(/^(driver|plc|vfd|timer|smartrelay|dcsupply)$/.test(c.type)&&room===3)return 2;
  if(id===10&&c.id==='far')return 2;
  if([10,60].includes(id)&&/far|middle|stop-b|start-b/.test(c.id))return 0;
  if(id===42&&c.id==='heat')return 0;
  return room;
}
function height(c:ComponentInstance) {
  if(/lamp|led|strip|emergency|alarm|chime|beacon/.test(c.type))return 2.00;
  if(/socket|pump|motor|heater|cooker|battery/.test(c.type))return .58;
  return 1.24;
}
function physicalHeight(c:ComponentInstance){
  if(/lamp|led|driver|switch|socket|pushbutton|sensor|thermostat|indicator|terminal|chime/.test(c.type))return .15;
  if(/mcb|rcbo|rcd|fuse|relay|timer|overload|contactor|dcsupply|isolator|transformer/.test(c.type))return .14;
  if(c.type==='invictaboard')return .68;
  if(/panel|board|enclosure/.test(c.type))return .50;
  if(/motor|boiler|heatpump|shower|heater|cooker/.test(c.type))return .60;
  return .27;
}
export function jobSite(doc:CircuitDocument,reference?:CircuitDocument):JobSite{
  const id=doc.lessonId??0;
  const [kind,room,name]=JOBS[id]??work(1,'Custom installation');
  const base=BUILDINGS[kind];
  const rooms:[string,string,string]=[...base.rooms];
  if([23,24,35,36,37].includes(id)){rooms[1]='Bathroom';rooms[2]='Service hall';}
  if(id===9)rooms[1]='Stair hall';
  if(id===10)rooms[1]='Switching corridor';
  if(id===50)rooms[2]='Cold store';
  const building={...base,rooms};
  const all=[...(reference?.components??doc.components)];
  const known=new Set(all.map(c=>c.id));
  for(const c of doc.components)if(!known.has(c.id))all.push(c);
  const panelBranch=id===19&&all.some(c=>c.id==='fixed'&&c.type==='heater'&&c.variant==='plx050e');
  const counts:Record<string,number>={}, slots=new Map<string,number>();
  const items=all.map(c=>{
    const area=roomFor(c,id,room), prefix=letters[c.type]??(/led|light|strip/.test(c.type)?'E':/sensor|proximity/.test(c.type)?'B':'A');
    const ref=prefix+String(counts[prefix]=(counts[prefix]??0)+1);
    const tier=height(c),key=area+'-'+tier,index=slots.get(key)??0;slots.set(key,index+1);
    const outside=area===3,span=[0,-.54,.54,-1.08,1.08,-1.62,1.62];
    let x=(outside?0:ROOM_CENTRES[area]??0)+span[index%span.length], y=tier-Math.floor(index/span.length)*.24;
    let z=outside?FRONT+.10:BACK+.11;
    if(outside)x+=1.25;
    if(kind==='home'&&area===0&&c.type==='socket')y=1.13;
    if(kind==='home'&&area===0&&c.type==='cooker'){y=.02;z=-1.82;x=-2.79;}
    if((kind==='plant'||kind==='works'||kind==='workshop')&&['pump','motor','motor3','compressor'].includes(c.type)){
      y=.12;z=-1.53;
    }
    if(id===11&&c.params.gangGroup){x=-4.35+(c.params.gangModule==='right'?.057:-.057);y=1.16;}
    if(id===34&&c.type==='heatpump'){y=.04;z=FRONT+.47;x=1.98;}
    if(id===3&&/rcbo/.test(c.type))y=1.25;

    if(id===7&&c.id==='light'){x=.42;y=1.84;}
    if(id===7&&c.id==='switch'){x=0;y=1.24;}
    if(id===80&&c.id==='courtesy'){x=.99;y=2.07;z=FRONT+.11;}
    const cabinets = kind === 'home' && area === 0 && [13,65,66,68,69].includes(id);
    const atBackWall = !outside && Math.abs(z - (BACK + .11)) < .0001;
    const mapped=kind==='home'?houseFixing(id,c,panelBranch):undefined;
    if(id===36&&!c.mount&&c.id==='light'&&c.type==='lamp'&&c.variant==='downlight'){
      // The bezel is 86 mm across. Its face points down into a ceiling cut-out.
      const scale:Vec3=[.086/.556,.086/.649,.11];
      return {id:c.id,ref,room:1,position:[bath.lightX,bath.ceiling+.014,bath.lightZ-.628*scale[1]] as Vec3,
        rotation:0,scale:scale[1],fixture:{scale,tilt:Math.PI/2,ceilingLight:true}};
    }
    const servicePart=bellServicePart(id,c);
    if(servicePart){
      const pose=bellServicePose(servicePart),s=pose.scale;
      return {id:c.id,ref,room:2,position:pose.position,rotation:0,scale:s,fixture:{scale:[s,s,s] as Vec3,bellService:servicePart}};
    }
    if(cabinets&&fittedKitchenDriver(id,c.type,c.id,c.variant)&&!c.mount){
      return {id:c.id,ref,room:0,position:[...kitchen.driver] as Vec3,rotation:0,scale:.1,fixture:{scale:[.1,.1,.1] as Vec3,kitchenDriver:true}};
    }
    let fixture = physicalFixture(c, !!mapped||atBackWall, cabinets,!!mapped&&(id===71||id===72));
    if((id===20&&c.id==='fcu-switch'||panelBranch&&c.id==='branch-fuse')&&c.type==='fcu'&&fixture)fixture={...fixture,fusedHeater:true};
    if((id===19||id===20)&&c.id==='fixed'&&c.type==='heater'&&c.variant==='plx050e'&&mapped){
      const s=PLXE_MM_PER_UNIT/1000;
      fixture={scale:[s,s,s],panelHeater:true};
    }
    if(id===36&&!c.mount&&c.id==='runon'&&c.type==='timer')fixture={scale:[.044,.052,.088],serviceBox:'timer'};
    if(id===36&&!c.mount&&c.id==='fan-cpc'&&c.type==='terminal')fixture={scale:[.024,.026,.029],serviceBox:'cpc'};
    let scale = physicalHeight(c) / Math.max(.1, COMPONENTS[c.type]?.size[1] ?? 1);
    if (fixture) scale = fixture.scale[1];
    // Plaster face is BACK - .01. Only the flush switch faceplate projects into the room.
    if (atBackWall && fixture && ['switch','switch2','intermediate'].includes(c.type) && !c.variant)
      z = BACK - .01 - (c.type === 'switch' ? .081 : .103)*fixture.scale[2] + .0005;
    if (fixture && ['gammaboard','invictaboard'].includes(c.type))
      z = BACK - .01 + COMPONENTS[c.type].size[2]*scale/2;
    if (fixture?.flushPlate) z=BACK-.01+(c.type==='switch2'?.0014:.0001);
    if (id===24&&c.type==='shaveroutlet'){x=.73;y=1.36;}
    if (id===24&&c.id==='isolation'&&all.some(p=>p.type==='shaveroutlet')){
      // The two working components share one wall unit. Only the outlet plate is visible from the room.
      x=.73;y=1.39;z=BACK-.04;scale=.04;
    }
    if (fixture?.batten) z = BACK - .01 + .161*fixture.scale[2];
    if (id === 65 && c.id === 'door') { x = -4.274; y = 2.137; z = -2.3585; }
    if(id===13&&area===0&&c.type==='led'&&!isStrip(c)){x=-4.61;y=1.44;z=BACK+.39;}
    if (cabinets && isStrip(c)) {
      const centre=c.type==='cctstrip'?.387:.43;
      y=id===65?2.282:kitchen.bottom-.0015-(c.type==='cctstrip'?.0008:0);
      z=(id===65?-2.498:kitchen.profileZ)-centre*fixture!.scale[1];
      x=c.id==='right'?kitchen.right:kitchen.left;
      fixture!.tapeProfile=id!==65;
    }
    const station=kind!=='home'&&!c.mount?serviceFixing(id,c,kind):undefined;
    return {id:c.id,ref,room:mapped?.room??station?.room??area,position:mapped?onWall(mapped,c,scale,fixture):station?.position??[x,y,z] as Vec3,rotation:mapped?.yaw??station?.rotation??0,scale:station?.scale??scale,fixture};
  });
  // Mounted devices retain their enclosure's physical origin and orientation on site.
  const installed=new Map(doc.components.map(c=>[c.id,c]));
  for(const item of items){
    const c=installed.get(item.id)??all.find(e=>e.id===item.id);
    if(!c?.mount)continue;
    const board=installed.get(c.mount.board)??all.find(e=>e.id===c.mount!.board);
    const parent=items.find(e=>e.id===board?.id);if(!parent||!board)continue;
    const local=seatPosition({...board,position:[0,0,0],rotation:0},c,c.mount);
    item.room=parent.room;
    item.position=fixturePoint(parent.position,parent.scale,parent.fixture,board,local,parent.rotation);
    item.rotation=parent.rotation;
    item.scale=parent.scale;
  }
  const load=(id===24?all.find(c=>c.type==='shaveroutlet'):undefined)??all.find(c=>['gammaboard','invictaboard'].includes(c.type))
    ??(id===3?all.find(c=>c.type==='rcbo'):id===5?all.find(c=>c.type==='spd'):undefined)
    ??all.find(c=>/switch|pushbutton|dimmer|pwmcontrol/.test(c.type)&&roomFor(c,id,room)===room)??all.find(c=>roomFor(c,id,room)===room&&!isSupply(c));
  const panel=items.find(i=>i.fixture?.panelHeater&&installed.has(i.id));
  const kitchenPanel=panel?.room===0;
  const floorObstacle=panel?{x:panel.position[0]-(kitchenPanel?KITCHEN_PANEL.depth/2:0),z:panel.position[2]+(kitchenPanel?0:KITCHEN_PANEL.depth/2),
    w:kitchenPanel?KITCHEN_PANEL.depth:KITCHEN_PANEL.width,d:kitchenPanel?KITCHEN_PANEL.width:KITCHEN_PANEL.depth}:undefined;
  const doorsteps=id===71||id===72;
  return {kind,building,name,room,items,floorObstacle,doorsteps,first:load?.id??items.find(c=>c.room===room)?.id??items[0]?.id,location:r=>doorsteps&&r===SIDE_PASSAGE.id?SIDE_PASSAGE.name:r===3?(kind==='home'?'Front entrance':'Service yard'):id===9&&r===STAIR_LANDING.id?STAIR_LANDING.name:rooms[r]??(kind==='home'?HOME_ROOMS.find(space=>space.id===r)?.name:r===4?SERVICE_AREAS[kind].name:undefined)??name};
}
export function drawingKind(lesson?:ConfigurationLesson):'ladder'|'schedule'|'wiring'{
  if(!lesson)return 'wiring';
  if([1,2,3,4,5,6,53,79].includes(lesson.id))return 'schedule';
  return [40,41,49,50,51,52,55,56,57,60,61,62,63,64,74,75,76,77,78,80].includes(lesson.id)?'ladder':'wiring';
}
/** Stop at the walls while allowing passage through the same openings shown on the floor plan. */
export function walkStep(from:Vec3,dx:number,dz:number,site?:JobSite):Vec3{
  if(site?.kind==='home')return walkHome(from,dx,dz,site.building.rooms[1]==='Bathroom',site.building.rooms[1]==='Stair hall',site.floorObstacle,site.doorsteps);
  if(site)return walkService(from,dx,dz,site.kind);
  const radius=.16;let [x,y,z]=from;
  const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
  const testX=clamp(x+dx,ROOM_WALLS[0]+radius,ROOM_WALLS[3]-radius);
  const gate=(a:number,b:number,wall:number)=>(a<wall&&b>a&&b>wall-radius)||(a>=wall&&b<a&&b<wall+radius);
  if(z>FRONT+radius||Math.abs(z-DOOR_Z)<DOOR_WIDTH/2-radius||!ROOM_WALLS.slice(1,3).some(w=>gate(x,testX,w)))x=testX;
  const testZ=clamp(z+dz,BACK+radius,6.0);
  if(Math.abs(x)<.68-radius||!gate(z,testZ,FRONT))z=testZ;
  return [x,y,z];
}
