import type {JobSite,SiteKind} from './job-site';
import type {ComponentInstance,Vec3} from './types';

export type ServiceKind=Exclude<SiteKind,'home'>;
type Rect={x:number;z:number;w:number;d:number};
export interface ServiceArea {
  name:string; left:number;right:number; back:number;front:number;
  side:-1|1;door:number;opening:number; station:Rect; visit:{position:Vec3;yaw:number;pitch:number};
}
/** Each annex connects to an existing room. Original fixing points and room IDs stay valid. */
export const SERVICE_AREAS:Record<ServiceKind,ServiceArea>={
  shop:{name:'Goods receiving',left:6.6,right:11.2,back:-2.8,front:2.8,side:1,door:1.20,opening:1.45,
    station:{x:9.75,z:-1.62,w:1.84,d:.91},visit:{position:[7.20,1.53,1.28],yaw:-.72,pitch:-.16}},
  plant:{name:'Pump gallery',left:6.6,right:10.5,back:-3.65,front:1.95,side:1,door:.76,opening:1.18,
    station:{x:8.95,z:-2.72,w:2.14,d:.82},visit:{position:[7.17,1.53,.69],yaw:-.46,pitch:-.20}},
  workshop:{name:'Extraction bay',left:-12.2,right:-6.6,back:-2.8,front:2.8,side:-1,door:1.18,opening:1.45,
    station:{x:-10.37,z:-1.87,w:2.55,d:.92},visit:{position:[-7.39,1.55,1.28],yaw:.74,pitch:-.12}},
  works:{name:'Packing line',left:-13.1,right:-6.6,back:-4.25,front:2.8,side:-1,door:1.05,opening:1.65,
    station:{x:-9.90,z:-2.83,w:3.85,d:.92},visit:{position:[-7.56,1.53,.71],yaw:.56,pitch:-.17}},
};
export function serviceSpaces(kind:ServiceKind){
  const a=SERVICE_AREAS[kind];
  return [...[-6.6,-2.2,2.2].map((left,id)=>({id,left,right:left+4.4,back:-2.8,front:2.8})),
    {id:3,left:-6.6,right:6.6,back:2.8,front:6},{...a,id:4}];
}
const wallThickness=.12;
function horizontal(x1:number,x2:number,z:number):Rect{return {x:(x1+x2)/2,z,w:x2-x1,d:wallThickness};}
function vertical(x:number,z1:number,z2:number):Rect{return {x,z:(z1+z2)/2,w:wallThickness,d:z2-z1};}
export function serviceWalls(kind:ServiceKind){
  const a=SERVICE_AREAS[kind],wall=a.side*6.6,far=a.side===1?a.right:a.left,lo=a.door-a.opening/2,hi=a.door+a.opening/2;
  // Shared host wall covers both footprints, even when the gallery extends beyond the host.
  const annex=[vertical(wall,Math.min(-2.8,a.back),lo),vertical(wall,hi,Math.max(2.8,a.front)),
    vertical(far,a.back,a.front),horizontal(a.left,a.right,a.front),horizontal(a.left,a.right,a.back)];
  const original=[vertical(-wall,-2.8,2.8),horizontal(-6.6,6.6,-2.8),horizontal(-6.6,-.74,2.8),horizontal(.74,6.6,2.8)];
  for(const x of [-2.2,2.2])original.push(vertical(x,-2.8,.325),vertical(x,1.575,2.8));
  return {annex,original};
}
export function serviceRoomAt(kind:ServiceKind,x:number,z:number){
  const a=SERVICE_AREAS[kind];
  if(x>=a.left&&x<=a.right&&z>=a.back&&z<=a.front)return 4;
  return z>2.8?3:x < -2.2?0:x>2.2?2:1;
}
export function serviceFixing(lesson:number,c:ComponentInstance,kind:ServiceKind){
  const a=SERVICE_AREAS[kind],s=a.station;
  let position:Vec3|undefined,rotation=0,scale:number|undefined;
  if((lesson===44||lesson===45)&&c.type==='emergency'){
    // Over the goods-in doorway, seen from the receiving side.
    position=[6.71,2.25,a.door];rotation=Math.PI/2;
  }else if(lesson===39&&c.id==='pump')position=[s.x,.12,s.z+.15];
  else if(lesson===40&&c.id==='motor')position=[s.x,.86,s.z+.14];
  else if(lesson===61&&c.id==='motor-a'){position=[s.x-1.51,.47,s.z+.75];rotation=Math.PI/2;}
  else if(lesson===61&&(c.id==='start-a'||c.id==='stop-a')){
    // Separate 68 mm station faces. The actual start/stop GLBs share a rear base at Z=-.26635.
    scale=.068/.803846;
    position=[s.x+(c.id==='start-a'?.046:-.046),1.08,a.back+.067+.26635*scale];
  }
  return position?{room:4,position,rotation,scale}:undefined;
}
const furniture:Record<ServiceKind,number[][]>={
  plant:[[-1.33,-2.15,.69,.69],[1.33,-2.15,.69,.69],[5.83,-.70,1.36,.54]],
  shop:[[-5.84,-2.43,1.36,.54],[-3.10,-2.49,1.35,.57],[5.68,-.70,1.36,.54]],
  workshop:[[-5.40,-2.30,1.90,.74],[.8,-2.30,1.90,.74],[5.68,-.70,1.36,.54]],
  works:[[-5.40,-2.30,1.90,.74],[.8,-2.30,1.90,.74],[5.68,-.70,1.36,.54]],
};
const cached=new Map<ServiceKind,Rect[]>();
function obstacles(kind:ServiceKind):Rect[]{
  const known=cached.get(kind);if(known)return known;
  const a=SERVICE_AREAS[kind],walls=serviceWalls(kind);
  const list=[...walls.annex,...walls.original,a.station,...furniture[kind].map(([x,z,w,d])=>({x,z,w,d}))];
  // The front yard currently ends at the original site's boundary.
  list.push(vertical(-6.6,2.8,6.1),vertical(6.6,2.8,6.1));
  if(kind==='works')list.push({x:a.station.x,z:a.station.z+1.28,w:3.15,d:.08});
  cached.set(kind,list);return list;
}
export function walkService(from:Vec3,dx:number,dz:number,kind:ServiceKind):Vec3{
  const a=SERVICE_AREAS[kind],r=.16,boxes=obstacles(kind);
  function slide(axis:'x'|'z',v:number,cross:number,delta:number){
    let next=v+delta;
    for(const b of boxes){
      const mid=b[axis],half=(axis==='x'?b.w:b.d)/2;
      if(Math.abs(cross-(axis==='x'?b.z:b.x))>=(axis==='x'?b.d:b.w)/2+r)continue;
      if(delta>0&&v<=mid-half-r+.00001)next=Math.min(next,mid-half-r);
      if(delta<0&&v>=mid+half+r-.00001)next=Math.max(next,mid+half+r);
    }
    const lo=axis==='x'?Math.min(-6.6,a.left):Math.min(-2.8,a.back),hi=axis==='x'?Math.max(6.6,a.right):6;
    return Math.max(lo+r,Math.min(hi-(axis==='x'?r:0),next));
  }
  const x=slide('x',from[0],from[2],dx);
  return [x,from[1],slide('z',from[2],x,dz)];
}
export function serviceVisit(site:JobSite,room:number){
  if(site.kind==='home')return;
  if(room===4)return SERVICE_AREAS[site.kind].visit;
  if(room===3)return {position:[.8,1.56,4.7] as Vec3,yaw:.36,pitch:-.04};
  if(room>=0&&room<=2)return {position:[(room-1)*4.4+.26,1.56,1.94] as Vec3,yaw:.12,pitch:-.09};
}
