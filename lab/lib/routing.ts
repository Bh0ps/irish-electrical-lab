import { dinForm, DIN_BENCH_LIFT, DIN_UNIT } from './din-devices.ts';
import { COMPONENTS, definitionFor } from './components.ts';
import { b22SeatDepth, equipmentVariant, getComponentTerminals, lampForm } from './terminal-layout.ts';
import { isBoard, mountVector, dinBodyWidth, boardSidePanels } from './board-assembly.ts';
import type { CableCore, CableRun, CircuitDocument, ComponentInstance, Endpoint, Vec3, Wire } from './types.ts';
import { cableCores } from './cables.ts';
import { cableFace, cableProfile, coreSeat, type CableFace } from './cable-form.ts';
import {rockerProbeApproach,rockerProbeContact,rockerSleeveEndZ} from './dc-rocker';
import {bg812Contact} from './wall-rocker';
import {CROMA_ENVELOPE,cromaLeadPath,cromaProbeContact} from './croma-chime';

// Shared with the renderer: selection changes colour, never the cable diameter.
export const WIRE_RADIUS = .018;
export const SHEATH_RADIUS = .045;
export const WIRE_CLEARANCE = .025;
// Includes two .012 corner deviations and a small numerical margin.
export const ROUTE_SPACING = .09;
const BODY_CLEARANCE = .05;
const GRID = .14;
const HASH_CELL = .42;
const MAX_ROUTE_SPAN = 80;
export interface RoutingIssue { wire: string; message: string }
export interface CableGeometry { sheath: Vec3[]; tails: Map<string,[Vec3[],Vec3[]]>; faces: [CableFace,CableFace]; open: {core:CableCore; side:0|1; points:Vec3[]}[] }
export interface CircuitRoutes { routes: Map<string, Vec3[]>; issues: RoutingIssue[]; cables?: Map<string,CableGeometry> }
interface Segment { a: Vec3; b: Vec3; wire: string; joint?: string }
interface Obstacle { component: ComponentInstance; min: Vec3; max: Vec3; worldMin: Vec3; worldMax: Vec3 }
const keyOf = (e: Endpoint) => `${e.component}\u0000${e.terminal}`;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const scale = (a:Vec3,k:number):Vec3 => [a[0]*k,a[1]*k,a[2]*k];
const unit = (a:Vec3):Vec3 => scale(a,1/(Math.hypot(...a)||1));
const cross = (a:Vec3,b:Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const distance = (a: Vec3,b: Vec3) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const clamp = (v:number) => Math.max(0,Math.min(1,v));
function localToWorld(c: ComponentInstance, p: Vec3): Vec3 {
  const co=Math.cos(c.rotation),si=Math.sin(c.rotation);
  return [c.position[0]+p[0]*co+p[2]*si,c.position[1]+p[1],c.position[2]-p[0]*si+p[2]*co];
}
function worldToLocal(c: ComponentInstance,p: Vec3): Vec3 {
  const v=sub(p,c.position),co=Math.cos(c.rotation),si=Math.sin(c.rotation);
  return [v[0]*co-v[2]*si,v[1],v[0]*si+v[2]*co];
}

/** Covers and exploded assemblies are presentation only; anchors stay fixed. */
export function terminalPosition(doc:CircuitDocument,e:Endpoint):Vec3 {
  const c=doc.components.find(c=>c.id===e.component),def=c&&COMPONENTS[c.type];
  const t=c&&def&&getComponentTerminals(c,def).find(t=>t.id===e.terminal);
  return c&&t?localToWorld(c,mountVector(c,t.anchor)):[0,0,0];
}

function rotateDirection(rotation:number, p:Vec3):Vec3 {
  const co=Math.cos(rotation),si=Math.sin(rotation);
  return unit([p[0]*co+p[2]*si,p[1],p[2]*co-p[0]*si]);
}
export function terminalDirection(doc:CircuitDocument,e:Endpoint):Vec3 {
  const c=doc.components.find(c=>c.id===e.component),def=c&&COMPONENTS[c.type];
  const terminal=c&&def&&getComponentTerminals(c,def).find(t=>t.id===e.terminal);
  const axis=terminal?.entryDirection??[0,0,-1] as Vec3;
  return rotateDirection(c?.rotation??0,c?mountVector(c,axis):axis);
}

export function probeContact(doc:CircuitDocument,e:Endpoint):{position:Vec3;normal:Vec3} {
  const c=doc.components.find(item=>item.id===e.component);
  if(c?.type==='lamp'&&lampForm(equipmentVariant(c,COMPONENTS.lamp))==='bulb'){
    const t=getComponentTerminals(c,COMPONENTS.lamp).find(t=>t.id===e.terminal);
    if(t){
      // The clamp head is separate from its occupied conductor bore.
      const local:Vec3=[t.anchor[0],t.anchor[1]+.046,t.anchor[2]+b22SeatDepth(e.terminal)-.0025];
      return {position:localToWorld(c,mountVector(c,local)),normal:terminalDirection(doc,e)};
    }
  }
  if(c?.type==='callchime'&&c.variant==='croma-100a'){
    const contact=cromaProbeContact(e.terminal);
    if(contact)return {position:localToWorld(c,contact.position),normal:rotateDirection(c.rotation,contact.normal)};
  }
  if(c?.type==='switch'&&c.variant==='dc-rocker'&&['COM','OUT'].includes(e.terminal))
    return {position:localToWorld(c,rockerProbeContact(e.terminal)),normal:rotateDirection(c.rotation,rockerProbeApproach)};
  if(c?.type==='switch2'){
    const contact=bg812Contact(e.terminal);
    if(contact)return {position:localToWorld(c,contact.position),normal:rotateDirection(c.rotation,contact.normal)};
  }
  return {position:terminalPosition(doc,e),normal:terminalDirection(doc,e)};
}

/** Installed lead dress between an enclosed fan clamp and its rear cable inlet.
 * Local positions are in 100 mm units, measured against the XF100S study mesh.
 * Keep the shafts parallel as they share the 17 × 11 mm hole in the backplate.
 */
function terminalPassage(c:ComponentInstance|undefined,anchor:Vec3,singleCore=true,pin?:string):Vec3[] {
  if(c?.type==='callchime'&&c.variant==='croma-100a'&&pin){
    const passage=cromaLeadPath(pin);
    if(passage.length){
      // Keep the normal trunk spacing after the five insulated wires leave
      // the smaller K1 aperture. The installed tails end at the backplate.
      const end=passage[passage.length-1],tail:Vec3=[(end[0]+.04)*3-.04,(end[1]-.937)*3+.937,-.25];
      return [anchor,...[...passage.slice(1),tail].map(p=>localToWorld(c,p))];
    }
  }
  if(c?.type==='switch2'&&singleCore){
    // A single core leaves the rear clamp straight before it bends. Shared
    // mouths keep the router's normal per-core fan-out and distinct paths.
    return [anchor,add(anchor,scale(rotateDirection(c.rotation,[0,0,-1]),.115))];
  }
  if(c?.type==='switch'&&c.variant==='dc-rocker'){
    const local=worldToLocal(c,anchor);
    // The crimp grips the wire along the blade; keep the insulation straight
    // through its barrel and past the sleeve before allowing the first bend.
    return [anchor,localToWorld(c,[local[0],local[1],rockerSleeveEndZ-.075])];
  }
  if(c?.type!=='fan'||c.variant!=='xf100s')return [anchor];
  const [x,y,z]=worldToLocal(c,anchor);
  return [anchor,...([[x,y-.033,z],[x,.950,.057],[x,.950,-.56]] as Vec3[]).map(p=>localToWorld(c,p))];
}

/** Closest distance between finite 3D segments, including parallel/zero-length cases. */
export function segmentDistance(a:Vec3,b:Vec3,c:Vec3,d:Vec3):number {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  let s=0,t=0;
  if(aa<1e-14&&cc<1e-14)return distance(a,c);
  if(aa<1e-14)t=clamp(ee/cc);
  else if(cc<1e-14)s=clamp(-dd/aa);
  else {
    const denominator=aa*cc-bb*bb;
    s=denominator>1e-14?clamp((bb*ee-cc*dd)/denominator):0;
    t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}
  }
  return distance(add(a,[u[0]*s,u[1]*s,u[2]*s]),add(c,[v[0]*t,v[1]*t,v[2]*t]));
}
function intersectsBox(a:Vec3,b:Vec3,min:Vec3,max:Vec3):boolean {
  let near=0,far=1;
  for(let axis=0;axis<3;axis++) {
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-12){if(a[axis]<min[axis]-1e-9||a[axis]>max[axis]+1e-9)return false;}
    else {const x=(min[axis]-1e-9-a[axis])/delta,y=(max[axis]+1e-9-a[axis])/delta;near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y));if(near>far)return false;}
  }
  return true;
}
function obstaclesFor(doc:CircuitDocument):Obstacle[] {
  return doc.components.flatMap(component=>{
    const def=definitionFor(component);if(!def)return [];
    const terminals=getComponentTerminals(component,def);
    let min:Vec3=[-def.size[0]/2,-.015,-def.size[2]/2].map((v,i)=>Math.min(v,...terminals.map(t=>t.anchor[i]-.015))) as Vec3;
    let max:Vec3=[def.size[0]/2,def.size[1]*1.05,def.size[2]/2].map((v,i)=>Math.max(v,...terminals.map(t=>t.anchor[i]+.015))) as Vec3;
    if(component.type==='fan'&&component.variant==='xf100s'){
      min=[-.815,.065,-.45];max=[.815,1.695,.30];
    }
    if(component.type==='callchime'&&component.variant==='croma-100a'){
      min=[-CROMA_ENVELOPE[0]/2,0,0];max=[CROMA_ENVELOPE[0]/2,CROMA_ENVELOPE[1],CROMA_ENVELOPE[2]];
    }
    if(component.type==='switch'&&component.variant==='dc-rocker'){
      min=[-.232,.052,-1.05];max=[.232,.908,.165];
    }
      if(component.type==='switch2'){
        min=[-.431,.220,-.146];max=[.431,1.082,.093];
      }
    const din=dinForm(component.type);
    if(din){
      min[1]=DIN_BENCH_LIFT;max[1]=def.size[1];
      min[2]=-30*DIN_UNIT;max[2]=(din.depth-30)*DIN_UNIT;
    }
    if(component.mount){
      const width=dinBodyWidth(component);
      if(width&&!din){
        min[0]=Math.min(-width/2,...terminals.map(t=>t.anchor[0]-.018));max[0]=Math.max(width/2,...terminals.map(t=>t.anchor[0]+.018));
        min[1]=Math.min(def.size[1]*.10,...terminals.map(t=>t.anchor[1]-.032));max[1]=Math.max(def.size[1]*.86,...terminals.map(t=>t.anchor[1]+.032));
      }
      const points=[min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>mountVector(component,[x,y,z]))));
      min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))) as Vec3;max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))) as Vec3;
    }
    if(component.params.gangModule==='left'){min[0]=Math.min(min[0],.23-.565*def.size[0]/1.3);max[0]=Math.max(max[0],.23+.565*def.size[0]/1.3);}
    const regions:{min:Vec3;max:Vec3}[]=[{min,max}];
    if(din&&!component.mount){
      const halfWidth=(din.upper.length*17.5+4.5)*DIN_UNIT/2;
      regions.push(
        {min:[-halfWidth,0,-36.6*DIN_UNIT],max:[halfWidth,2.4*DIN_UNIT,-18.6*DIN_UNIT]},
        {min:[min[0],0,-35.2*DIN_UNIT],max:[max[0],DIN_BENCH_LIFT+41.5*DIN_UNIT,-32.8*DIN_UNIT]},
        {min:[-halfWidth,DIN_BENCH_LIFT+24*DIN_UNIT,-32.7*DIN_UNIT],max:[halfWidth,DIN_BENCH_LIFT+59*DIN_UNIT,-24.1*DIN_UNIT]}
      );
    }
    if(isBoard(component.type)){
      const [w,h,d]=def.size, x=w/2,z=d/2;
      // Model the back pan and sidewalls. Top/bottom entry zones remain open
      // for the external circuits, independent of door and front presentation.
      const front=component.type==='gammaboard'?.64:.77;
      regions.splice(0,1,{min:[-x,0,-z+.06],max:[x,h,-z+.20]},
        {min:[-x+.06,.025,front-.036],max:[x-.06,h-.025,front+.036]});
      for(const [lo,hi,back,edge] of boardSidePanels(component.type,h,d))for(const left of [-x,x-.082]){
        regions.push({min:[left,lo,back],max:[left+.082,hi,edge]});
      }
      for(const y of [0,h-.1])for(const xcenter of [-x+.20,0,x-.20]){
        regions.push({min:[xcenter-.17,y,-z+.14],max:[xcenter+.17,y+.1,z]});
      }
      for(const y of [0,h-.10])for(const [lo,hi] of [[-z,-.34*z],[.34*z,z]]){
        regions.push({min:[-x+.08,y,lo],max:[x-.08,y+.10,hi]});
      }
    }
    return regions.map(({min,max})=>{
      const corners=[min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>localToWorld(component,[x,y,z]))));
      return {component,min,max,worldMin:[0,1,2].map(a=>Math.min(...corners.map(p=>p[a]))-BODY_CLEARANCE) as Vec3,worldMax:[0,1,2].map(a=>Math.max(...corners.map(p=>p[a]))+BODY_CLEARANCE) as Vec3};
    });
  });
}
function sharedGang(a:ComponentInstance|undefined,b:ComponentInstance):boolean {
  if(!a||a.type!=='switch'||b.type!=='switch'||typeof a.params.gangGroup!=='string'||!a.params.gangGroup||a.params.gangGroup!==b.params.gangGroup)return false;
  if(!['left','right'].includes(String(a.params.gangModule))||b.params.gangModule!==(a.params.gangModule==='left'?'right':'left'))return false;
  if(Math.abs(Math.sin(a.rotation-b.rotation))>1e-7||Math.cos(a.rotation-b.rotation)<.999999)return false;
  const delta=worldToLocal(a,b.position);
  return Math.abs(delta[0]-(a.params.gangModule==='left'?.46:-.46))<1e-6&&Math.abs(delta[1])<1e-6&&Math.abs(delta[2])<1e-6;
}
function hitsBody(a:Vec3,b:Vec3,obstacles:Obstacle[],owner?:string):boolean {
  const owning=owner?obstacles.find(o=>o.component.id===owner)?.component:undefined;
  return obstacles.some(o=>{
    if(o.component.id===owner||sharedGang(owning,o.component))return false;
    if(!intersectsBox(a,b,o.worldMin,o.worldMax))return false;
    return intersectsBox(worldToLocal(o.component,a),worldToLocal(o.component,b),o.min.map(v=>v-BODY_CLEARANCE) as Vec3,o.max.map(v=>v+BODY_CLEARANCE) as Vec3);
  });
}
class SegmentIndex {
  private pairedPads = new Map<string,string>();
  private chimePorts = new Map<string,string>();
  constructor(doc:CircuitDocument,private reserveBreakouts=true) {
    for(const chime of doc.components.filter(c=>c.type==='callchime'&&c.variant==='croma-100a')){
      for(const pin of getComponentTerminals(chime,definitionFor(chime)))this.chimePorts.set(keyOf({component:chime.id,terminal:pin.id}),chime.id);
    }
    for(const component of doc.components) if(component.type==='led'&&component.variant==='strip'){
      const positive=keyOf({component:component.id,terminal:'L'}), negative=keyOf({component:component.id,terminal:'N'});
      this.pairedPads.set(positive,negative);this.pairedPads.set(negative,positive);
    }
  }
  nearTerminalSpacing(a:string,b:string,normal:number):number {
    // On 8 mm tape these two solder lands are closer than the usual spare
    // clearance. The insulation must still clear right up to each pad.
    return this.pairedPads.get(a)===b || this.chimePorts.has(a)&&this.chimePorts.get(a)===this.chimePorts.get(b) ? 2*WIRE_RADIUS+.001 : normal;
  }
  segments:Segment[]=[];
  buckets=new Map<string,number[]>();
  cells(a:Vec3,b:Vec3):string[] {
    const min=a.map((v,i)=>Math.floor((Math.min(v,b[i])-ROUTE_SPACING)/HASH_CELL));
    const max=a.map((v,i)=>Math.floor((Math.max(v,b[i])+ROUTE_SPACING)/HASH_CELL));
    const cells:string[]=[];
    const ranges=max.map((v,i)=>v-min[i]+1);
    if(ranges.reduce((n,v)=>n*v,1)>256&&ranges.filter(v=>v<=3).length<2) {
      // Traverse the segment's cells rather than filling a diagonal's entire
      // bounding-box volume. A one-cell halo covers the cable clearance.
      const current=a.map(v=>Math.floor(v/HASH_CELL)),target=b.map(v=>Math.floor(v/HASH_CELL));
      const delta=sub(b,a),step=delta.map(Math.sign),dt=delta.map(v=>v?HASH_CELL/Math.abs(v):Infinity);
      const next=delta.map((v,i)=>v?((current[i]+(step[i]>0?1:0))*HASH_CELL-a[i])/v:Infinity);
      const found=new Set<string>(),limit=current.reduce((n,v,i)=>n+Math.abs(v-target[i]),4);
      for(let count=0;count<limit;count++) {
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)found.add(`${current[0]+x},${current[1]+y},${current[2]+z}`);
        if(current.every((v,i)=>v===target[i]))break;
        const axis=next[0]<=next[1]&&next[0]<=next[2]?0:next[1]<=next[2]?1:2;
        current[axis]+=step[axis];next[axis]+=dt[axis];
      }
      return [...found];
    }
    for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++)cells.push(`${x},${y},${z}`);
    return cells;
  }
  insert(s:Segment) {
    const id=this.segments.length;this.segments.push(s);
    for(const key of this.cells(s.a,s.b)){const list=this.buckets.get(key);if(list)list.push(id);else this.buckets.set(key,[id]);}
  }
  hit(a:Vec3,b:Vec3,wire:string,joint?:string,spacing=ROUTE_SPACING,avoidOwn=false):boolean {
    const seen=new Set<number>();
    for(const key of this.cells(a,b))for(const id of this.buckets.get(key)??[]) {
      if(seen.has(id))continue;seen.add(id);const s=this.segments[id];
      // A physical junction has one bore. Only its short access segments may meet.
      if(s.wire===wire) {
        if(!avoidOwn||!s.joint)continue;
        const length=distance(s.a,s.b),v=sub(s.b,s.a),trim=.14;
        if(length<=trim)continue;
        const tip:Vec3=[s.b[0]-v[0]*trim/length,s.b[1]-v[1]*trim/length,s.b[2]-v[2]*trim/length];
        if(segmentDistance(a,b,s.a,tip)<ROUTE_SPACING-1e-7)return true;
        continue;
      }
      if(joint&&s.joint===joint)continue;
      const envelope=(id:string,at?:string)=>id.startsWith('@sheath-')?SHEATH_RADIUS-WIRE_RADIUS
        :this.reserveBreakouts&&id.startsWith('@tail-')&&at?.startsWith('@sheath-') ? .045 : 0;
      const required=(joint&&s.joint?this.nearTerminalSpacing(joint,s.joint,spacing):Math.max(ROUTE_SPACING,spacing))+envelope(wire,joint)+envelope(s.wire,s.joint);
      if(segmentDistance(a,b,s.a,s.b)<required-1e-7)return true;
    }
    return false;
  }
}
class MinHeap {
  data:{state:number;node:number;axis:number;cost:number;score:number}[]=[];
  push(item:MinHeap['data'][number]) {let i=this.data.length;this.data.push(item);while(i){const p=(i-1)>>1;if(this.data[p].score<=item.score)break;this.data[i]=this.data[p];i=p;}this.data[i]=item;}
  pop() {const top=this.data[0],last=this.data.pop();if(this.data.length&&last){let i=0;while(i*2+1<this.data.length){let child=i*2+1;if(child+1<this.data.length&&this.data[child+1].score<this.data[child].score)child++;if(this.data[child].score>=last.score)break;this.data[i]=this.data[child];i=child;}this.data[i]=last;}return top;}
}
const axisOrders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function simplify(points:Vec3[],required:Set<Vec3>=new Set()):Vec3[] {
  const result:Vec3[]=[];
  for(const p of points){if(result.length&&distance(p,result[result.length-1])<1e-8){if(required.has(p))result[result.length-1]=p;continue;}
    while(result.length>1&&!required.has(result[result.length-1])) {const a=sub(result[result.length-1],result[result.length-2]),b=sub(p,result[result.length-1]);if(dot(a,b)<0||Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-8)break;result.pop();}
    result.push(p);
  }return result;
}
function selfOverlap(path:Vec3[]):boolean {
  const along=[0];for(let i=1;i<path.length;i++)along.push(along[i-1]+distance(path[i-1],path[i]));
  for(let i=1;i<path.length;i++) {
    const direction=sub(path[i],path[i-1]);if(dot(direction,direction)<1e-12)continue;
    if(i>1){const previous=sub(path[i-1],path[i-2]);if(dot(previous,direction)<0&&Math.hypot(previous[1]*direction[2]-previous[2]*direction[1],previous[2]*direction[0]-previous[0]*direction[2],previous[0]*direction[1]-previous[1]*direction[0])<1e-8)return true;}
    for(let j=1;j<i-1;j++)if(along[i-1]-along[j]>.14&&distance(path[j-1],path[j])>1e-8&&segmentDistance(path[i-1],path[i],path[j-1],path[j])<2*WIRE_RADIUS+.008)return true;
  }
  return false;
}
interface Context { obstacles:Obstacle[]; occupied:SegmentIndex; low:Vec3; high:Vec3; rear:number; anchors?:[Vec3,Vec3]; selfSegments?:[Vec3,Vec3][]; checkpoint?:()=>void }
function pathClear(path:Vec3[],ctx:Context,wire:string):boolean {
  for(let i=1;i<path.length;i++)if(hitsBody(path[i-1],path[i],ctx.obstacles)||ctx.occupied.hit(path[i-1],path[i],wire,undefined,ROUTE_SPACING,true))return false;
  if(ctx.selfSegments)for(let i=1;i<path.length;i++)if(ctx.selfSegments.some(([a,b])=>segmentDistance(path[i-1],path[i],a,b)<ROUTE_SPACING-1e-7))return false;
  return true;
}
function search(start:Vec3,end:Vec3,ctx:Context,wire:string):Vec3[]|undefined {
  const acceptable=(path:Vec3[])=>pathClear(path,ctx,wire)&&(!ctx.anchors||!selfOverlap([ctx.anchors[0],...path,ctx.anchors[1]]));
  if(distance(start,end)<1e-8)return [start,end];
  // Try compact rectilinear routes first. Every approach leg is checked too.
  for(const order of axisOrders){const path=[start];let p=[...start] as Vec3;for(const a of order){p=[...p] as Vec3;p[a]=end[a];path.push(p);}path[path.length-1]=end;const compact=simplify(path,new Set([start,end]));if(acceptable(compact))return compact;}
  for(let lane=0;lane<15;lane++) {
    const z=ctx.rear-.18-Math.floor(lane/5)*GRID,y=Math.max(ctx.low[1],Math.min(ctx.high[1],.14+(lane%5)*GRID));
    const path:Vec3[]=[start,[start[0],start[1],z],[start[0],y,z],[end[0],y,z],[end[0],end[1],z],end];
    const compact=simplify(path,new Set([start,end]));if(acceptable(compact))return compact;
  }
  // Bounded 3D A*: six axial neighbours, an obstacle/segment spatial index,
  // and exact checked bridges from real terminal exits to the lattice.
  const lo=ctx.low.map(v=>Math.floor(v/GRID)),hi=ctx.high.map(v=>Math.ceil(v/GRID));
  const ny=hi[1]-lo[1]+1,nz=hi[2]-lo[2]+1;
  const encode=(v:number[])=>((v[0]-lo[0])*ny+(v[1]-lo[1]))*nz+v[2]-lo[2];
  const decode=(n:number):number[]=>{const z=n%nz+lo[2],q=Math.floor(n/nz),y=q%ny+lo[1];return [Math.floor(q/ny)+lo[0],y,z];};
  const point=(n:number):Vec3=>decode(n).map(v=>v*GRID) as Vec3;
  const inside=(v:number[])=>v.every((n,i)=>n>=lo[i]&&n<=hi[i]);
  function bridges(p:Vec3):{node:number;distance:number}[] {
    const rounded=p.map(v=>Math.round(v/GRID)),out:{node:number;distance:number}[]=[];
    for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++) {
      const v=[rounded[0]+x,rounded[1]+y,rounded[2]+z];if(!inside(v))continue;const node=encode(v),q=point(node);
      if(pathClear([p,q],ctx,wire))out.push({node,distance:distance(p,q)});
    }
    return out.sort((a,b)=>a.distance-b.distance||a.node-b.node).slice(0,48);
  }
  const starts=bridges(start),goals=bridges(end),goalMap=new Map(goals.map(g=>[g.node,g.distance]));
  if(!starts.length||!goals.length)return undefined;
  const heap=new MinHeap(),costs=new Map<number,number>(),previous=new Map<number,number>(),edgeCache=new Map<string,boolean>();
  const heuristic=(n:number)=>{const p=point(n);return Math.max(0,Math.abs(p[0]-end[0])+Math.abs(p[1]-end[1])+Math.abs(p[2]-end[2])-.3)*1.06;};
  for(const s of starts){const state=s.node*4+3;costs.set(state,s.distance);previous.set(state,-1);heap.push({state,node:s.node,axis:3,cost:s.distance,score:s.distance+heuristic(s.node)});}
  let visited=0;
  while(heap.data.length&&visited++<96000) {
    if(visited%128===0)ctx.checkpoint?.();
    const current=heap.pop();if(current.cost!==costs.get(current.state))continue;
    if(goalMap.has(current.node)) {
      const nodes:Vec3[]=[];let state=current.state;
      while(state!==-1){nodes.push(point(Math.floor(state/4)));state=previous.get(state)!;}
      const path=simplify([start,...nodes.reverse(),end],new Set([start,end]));if(acceptable(path))return path;
    }
    const v=decode(current.node),p=point(current.node);
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
      const next=[...v];next[axis]+=sign;if(!inside(next))continue;const node=encode(next),state=node*4+axis;
      const cost=current.cost+GRID+(current.axis!==axis&&current.axis!==3?.035:0);
      if(cost>=(costs.get(state)??Infinity))continue;
      const edge=current.node<node?`${current.node}:${node}`:`${node}:${current.node}`;
      let clear=edgeCache.get(edge);if(clear===undefined){clear=pathClear([p,point(node)],ctx,wire);edgeCache.set(edge,clear);}if(!clear)continue;
      costs.set(state,cost);previous.set(state,current.state);heap.push({state,node,axis,cost,score:cost+heuristic(node)});
    }
  }
  return undefined;
}
const routeCache=new Map<string,CircuitRoutes>();
interface CableHead { point:Vec3; outward:Vec3; rotation:number }
interface Harness {
  wires: Wire[]; heads: Map<string,CableHead>;
  runs: {run:CableRun; trunk:Wire; tails:{wire:Wire; a:Wire; b:Wire}[]}[];
}
function createHarness(doc:CircuitDocument,obstacles:Obstacle[]):Harness {
  const harness:Harness={wires:[],heads:new Map(),runs:[]};
  const mounted=new Set<string>();
  for(const run of doc.cableRuns??[]) {
    const members=doc.wires.filter(w=>w.cable?.runId===run.id);
    const ends=[run.from,run.to].map((endpoint,side)=>{
      const owner=doc.components.find(c=>c.id===endpoint.component)!;
      const passage=terminalPassage(owner,terminalPosition(doc,endpoint),true,endpoint.terminal);
      const anchor=passage.at(-1)!;
      const normal=passage.length>1?rotateDirection(owner.rotation,[0,0,-1]):terminalDirection(doc,endpoint);
      const right=rotateDirection(owner.rotation,[1,0,0]);
      let point:Vec3=add(anchor,scale(normal,1.05));
      // Leave enough exposed insulation to fan out from each sheath. Offset
      // additional cables on the same equipment to their own unobstructed entry.
      let found=false;
      for(const depth of [1.25,1.6,2,2.4]) {
        for(const offset of [0,.42,-.42,.84,-.84,1.26,-1.26]) {
          const p=add(add(anchor,scale(normal,depth)),scale(right,offset));p[1]=Math.max(.65,p[1]);
          if(hitsBody(p,p,obstacles)||[...harness.heads.values()].some(head=>distance(head.point,p)<.70))continue;
          point=p;found=true;break;
        }
        if(found)break;
      }
      const id='@sheath-'+side+'-'+run.id;
      harness.heads.set(id,{point,outward:normal,rotation:owner.rotation});
      return {component:id,terminal:'mouth'};
    });
    const physical=(id:string,from:Endpoint,to:Endpoint,bends:Vec3[]=[]):Wire=>({id,from,to,bends,role:'output',resistance:.01});
    const trunk=physical('@sheath-'+run.id,ends[0],ends[1]);
    harness.wires.push(trunk);
    const tails=members.map(wire=>{
      mounted.add(wire.id);
      const reverse=wire.cable!.reversed, first=reverse?wire.to:wire.from, last=reverse?wire.from:wire.to;
      // Per-core waypoints dress the exposed portion at the wire's first end.
      const a=physical('@tail-a-'+wire.id,first,ends[0],reverse?[]:wire.bends);
      const b=physical('@tail-b-'+wire.id,ends[1],last,reverse?[...wire.bends].reverse():[]);
      harness.wires.push(a,b);return {wire,a,b};
    });
    harness.runs.push({run,trunk,tails});
  }
  harness.wires.push(...doc.wires.filter(w=>!mounted.has(w.id)));
  return harness;
}
/** Geometry-only identity; supply, simulation and inspection edits do not reroute. */
export function circuitRoutingKey(doc:CircuitDocument):string {
  return JSON.stringify([
    obstaclesFor(doc).sort((a,b)=>a.component.id.localeCompare(b.component.id)).map(o=>[o.component.id,o.component.position,o.component.rotation,o.min,o.max,o.component.params.gangGroup??'',o.component.params.gangModule??'',getComponentTerminals(o.component,COMPONENTS[o.component.type]).map(t=>[t.id,t.anchor,t.entryDirection])]),
    [...doc.wires].sort((a,b)=>a.id.localeCompare(b.id)).map(w=>[w.id,w.from,w.to,w.bends,w.cable]),
    doc.cableRuns,
  ]);
}
// The jacket is much wider than a single wire. Ease its corners on the
// planned centreline so the inside wall does not fold back on itself.
function dressSheath(points:Vec3[],ctx:Context,wire:string):Vec3[]{
  if(points.length<3)return points;
  const dressed=[points[0]];
  for(let i=1;i<points.length-1;i++){
    const corner=points[i],inward=sub(points[i-1],corner),outward=sub(points[i+1],corner);
    const incoming=unit(inward),outgoing=unit(outward);
    if(Math.abs(dot(incoming,outgoing))>.99999){dressed.push(corner);continue;}
    const alpha=Math.acos(Math.max(-1,Math.min(1,dot(incoming,outgoing))));
    const turn=Math.PI-alpha;
    const limit=Math.min(.18,Math.hypot(...inward)*(i===1?.8:.48),Math.hypot(...outward)*(i===points.length-2?.8:.48));
    let fitted=false;
    for(const trim of [limit,limit*.65,limit*.4]){
      const centre=add(corner,scale(unit(add(incoming,outgoing)),trim/Math.cos(alpha/2)));
      const from=sub(add(corner,scale(incoming,trim)),centre);
      const to=sub(add(corner,scale(outgoing,trim)),centre);
      const lateral=cross(unit(cross(from,to)),from);
      const section:Vec3[]=[];
      for(let j=0;j<=8;j++){
        const angle=turn*j/8;
        section.push(add(centre,add(scale(from,Math.cos(angle)),scale(lateral,Math.sin(angle)))));
      }
      if(section.slice(1).some((p,j)=>hitsBody(section[j],p,ctx.obstacles)||ctx.occupied.hit(section[j],p,wire)))continue;
      dressed.push(...section);fitted=true;break;
    }
    if(!fitted)dressed.push(corner);
  }
  return [...dressed,points.at(-1)!];
}
/** Plans the whole harness together. Routing never edits saved bends or topology. */
export function routeCircuit(doc:CircuitDocument,checkpoint?:()=>void):CircuitRoutes {
  const signature=circuitRoutingKey(doc);
  const cached=routeCache.get(signature);if(cached)return cached;
  let result=planHarness(doc,new Set(),true,checkpoint);
  // A crowded fan-out can trap a later route between previously allocated
  // corridors. Give that connection first choice on one bounded retry.
  const blocked=result.issues.filter(i=>i.message.startsWith('No clear route')||i.message.startsWith('A terminal entry is obstructed'));
  if(blocked.length){
    const priority=new Set(blocked.flatMap(({wire})=>[wire,'@tail-a-'+wire,'@tail-b-'+wire,'@sheath-'+wire]));
    const retry=planHarness(doc,priority,false,checkpoint);
    if(retry.routes.size>result.routes.size || retry.routes.size===result.routes.size&&retry.issues.length<result.issues.length)result=retry;
  }
  routeCache.set(signature,result);if(routeCache.size>6)routeCache.delete(routeCache.keys().next().value!);
  return result;
}
function planHarness(doc:CircuitDocument,priority:Set<string>,reserveBreakouts:boolean,checkpoint?:()=>void):CircuitRoutes {
  const obstacles=obstaclesFor(doc),harness=createHarness(doc,obstacles);
  const ordered=harness.wires.sort((a,b)=>a.id.localeCompare(b.id));
  const result:CircuitRoutes={routes:new Map(),issues:[]};
  const occupied=new SegmentIndex(doc,reserveBreakouts),exits=new Map<string,Vec3[]>(),invalid=new Set<string>();
  const neighbours=new Map<string,string[]>();
  for(const w of ordered)for(const e of [w.from,w.to]){const key=keyOf(e),ids=neighbours.get(key)??[];if(!ids.includes(w.id))ids.push(w.id);neighbours.set(key,ids);}
  const entries=ordered.flatMap(w=>[['from',w.from],['to',w.to]].map(([label,endpoint])=>({w,label:label as string,e:endpoint as Endpoint})))
    .sort((a,b)=>Number(priority.has(b.w.id))-Number(priority.has(a.w.id))||neighbours.get(keyOf(b.e))!.length-neighbours.get(keyOf(a.e))!.length||keyOf(a.e).localeCompare(keyOf(b.e))||a.w.id.localeCompare(b.w.id));
  const owners=new Map(doc.components.map(c=>[c.id,c]));
  const anchors=new Map(entries.map(({e})=>[keyOf(e),harness.heads.get(e.component)?.point??terminalPosition(doc,e)]));
  const passages=new Map(entries.map(({e})=>[keyOf(e),terminalPassage(owners.get(e.component),anchors.get(keyOf(e))!,neighbours.get(keyOf(e))!.length===1,e.terminal)]));
  const directions=new Map(entries.map(({e})=>{
    const sleeve=passages.get(keyOf(e))!;
    return [keyOf(e),sleeve.length>1?rotateDirection(owners.get(e.component)!.rotation,[0,0,-1]):harness.heads.get(e.component)?.outward??terminalDirection(doc,e)];
  }));
  function approach(w:Wire,e:Endpoint):Vec3 {
    const normal=directions.get(keyOf(e))!;
    if(!harness.heads.has(e.component))return normal;
    // The jacket approaches the cut face from the back. Cores fan out
    // towards the equipment on the other side of that same cut.
    if(w.id.startsWith('@sheath-'))return normal;
    return scale(normal,-1);
  }
  function runway(normal:Vec3,b:Vec3,e:Endpoint):Vec3 {
    if(harness.heads.has(e.component))return b;
    const dominant=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const p=[...b] as Vec3;p[dominant]+=Math.sign(normal[dominant])*GRID*(owners.get(e.component)?.mount?1:3);
    if(p[1]<.08)p[1]=.08;
    return p;
  }
  function exit(w:Wire,e:Endpoint):Vec3[]|undefined {
    const sleeve=passages.get(keyOf(e))!,a=sleeve.at(-1)!,normal=approach(w,e),rotation=owners.get(e.component)?.rotation??harness.heads.get(e.component)!.rotation;
    const side=rotateDirection(rotation,[1,0,0]),basis=Math.abs(dot(side,normal))>.94?[0,1,0] as Vec3:side;
    const right=unit(sub(basis,scale(normal,dot(basis,normal)))),up=unit(cross(right,normal));
    const own=occupied.segments.filter(s=>s.joint===keyOf(e));
    if(sleeve.length>1&&(own.length||sleeve.slice(1).some((p,i)=>
      hitsBody(sleeve[i],p,obstacles,e.component)||occupied.hit(sleeve[i],p,w.id,owners.get(e.component)?.variant==='croma-100a'?keyOf(e):undefined))))return undefined;
    // Allocate a compact cone around the physical cable-entry direction.
    const depths=harness.heads.has(e.component)?[.22,.34,.5,.7]:owners.get(e.component)?.mount?[.20,.28,.34,.50,.70,.94]:priority.size?[.5,.34,.70,.94]:[.34,.50,.70,.94];
    for(const depth of depths)for(const radius of [0,.12,.18,.24,.32,.44,.60])for(let angle=0;angle<(radius?16:1);angle++) {
      const x=Math.cos(angle*Math.PI/8)*radius,y=Math.sin(angle*Math.PI/8)*radius;
      const offset=add(scale(normal,depth),add(scale(right,x),scale(up,y)));
      const b=add(a,offset).map(v=>Math.round(v/GRID)*GRID) as Vec3;
      const lead=runway(normal,b,e);
      if(b[1]<.07||hitsBody(a,b,obstacles,e.component)||hitsBody(b,b,obstacles))continue;
      const bore=sleeve.length===1?keyOf(e):undefined;
      if(occupied.hit(a,b,w.id,bore,bore?2*WIRE_RADIUS+WIRE_CLEARANCE+.001:ROUTE_SPACING)||occupied.hit(b,b,w.id,undefined))continue;
      if(occupied.segments.some(s=>s.wire!==w.id&&s.joint&&segmentDistance(a,b,s.b,s.b)<ROUTE_SPACING-1e-7))continue;
      if(hitsBody(b,lead,obstacles)||occupied.hit(b,lead,w.id))continue;
      if([...anchors].some(([key,p])=>key!==keyOf(e)&&segmentDistance(a,b,p,p)<occupied.nearTerminalSpacing(keyOf(e),key,2*WIRE_RADIUS+WIRE_CLEARANCE+.001)))continue;
      const direction=sub(b,a),length=distance(a,b);
      if(own.some(s=>{const other=sub(s.b,s.a),cosine=dot(direction,other)/(length*distance(s.a,s.b));return cosine>.955||distance(b,s.b)<ROUTE_SPACING;}))continue;
      return [...sleeve,b];
    }
    return undefined;
  }
  // Reserve every terminal access corridor before routing any trunk, so an early
  // wire cannot obstruct a later wire's rear entry (including aligned terminals).
  for(const {w,label,e} of entries) {
    const access=exit(w,e);
    checkpoint?.();
    if(!access) {
      const name=harness.heads.has(e.component)?'the cable end':(owners.get(e.component)?.label??e.component)+' '+e.terminal;
      invalid.add(w.id);result.issues.push({wire:w.id,message:'A terminal entry is obstructed at '+name+'. Separate the equipment or use a junction for crowded connections.'});
      continue;
    }
    const b=access.at(-1)!;exits.set(`${w.id}:${label}`,access);
    for(let i=1;i<access.length;i++)occupied.insert({a:access[i-1],b:access[i],wire:w.id,joint:keyOf(e)});
    occupied.insert({a:b,b:runway(approach(w,e),b,e),wire:w.id});
  }
  const extent=obstacles.length?obstacles:[];
  const tips=[...exits.values()].map(access=>access.at(-1)!);
  const low:Vec3=[0,1,2].map(a=>Math.min(...extent.map(o=>o.worldMin[a]),...tips.map(p=>p[a]),a===1?.10:0)-(a===1?0:1.25)) as Vec3;
  const high:Vec3=[0,1,2].map(a=>Math.max(...extent.map(o=>o.worldMax[a]),...tips.map(p=>p[a]),a===1?1:0)+(a===1?.8:1.25)) as Vec3;
  low[1]=Math.min(.10,...tips.map(p=>p[1]));
  const ctx:Context={obstacles,occupied,low,high,rear:Math.min(...obstacles.map(o=>o.worldMin[2]),0),checkpoint};
  // Mandatory manual waypoints get first choice of corridors; auto paths adapt.
  const crowding=(w:Wire)=>Math.max(neighbours.get(keyOf(w.from))!.length,neighbours.get(keyOf(w.to))!.length);
  const span=(w:Wire)=>distance(anchors.get(keyOf(w.from))!,anchors.get(keyOf(w.to))!);
  for(const w of [...ordered].sort((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id))||Number(b.bends.length>0)-Number(a.bends.length>0)||crowding(b)-crowding(a)||span(b)-span(a)||a.id.localeCompare(b.id))) {
    checkpoint?.();
    if(invalid.has(w.id))continue;
    const from=exits.get(`${w.id}:from`)!,to=exits.get(`${w.id}:to`)!;
    const a=from.at(-2)!,ea=from.at(-1)!,b=to.at(-2)!,eb=to.at(-1)!;
    if(w.bends.some(p=>hitsBody(p,p,obstacles))){result.issues.push({wire:w.id,message:'A saved bend is inside equipment. Move that bend to clear space.'});continue;}
    // Include manual waypoints outside the scene in this wire's bounded search.
    const waypoints=[ea,...w.bends,eb],localMin=[0,1,2].map(axis=>Math.min(...waypoints.map(p=>p[axis]))),localMax=[0,1,2].map(axis=>Math.max(...waypoints.map(p=>p[axis])));
    if(localMax.some((v,i)=>v-localMin[i]>MAX_ROUTE_SPAN)){result.issues.push({wire:w.id,message:'This wire spans more than the 80-unit routing area. Bring the equipment and saved bends closer together.'});continue;}
    const wireCtx:Context={...ctx,low:localMin.map((v,i)=>Math.max(Math.min(low[i],v-.5),v-2)) as Vec3,high:localMax.map((v,i)=>Math.min(Math.max(high[i],v+.5),v+2)) as Vec3,rear:Math.max(ctx.rear,localMin[2]-1.5),anchors:w.bends.length?undefined:[a,b]};
    // A conductor entering a panel may have to pass its top entry even if
    // both electrical endpoints are lower down. Include the actual opening.
    const inside=[w.from,w.to].map(e=>{const c=owners.get(e.component);return c?.mount?.board??(c&&isBoard(c.type)?c.id:undefined);});
    if(inside[0]!==inside[1])for(const id of inside){const board=id&&owners.get(id);if(board)wireCtx.high[1]=Math.max(wireCtx.high[1],board.position[1]+COMPONENTS[board.type].size[1]+.5);}
    const path:Vec3[]=[...from];let failed=false;
    for(let i=1;i<waypoints.length;i++) {
      if(i>1){
        // Reserve completed portions of this same conductor. Trim only the
        // immediate bend join, so a normal rounded corner can meet itself.
        const earlier=path.slice(1);let remaining=.14;
        while(earlier.length>1&&remaining>0){const end=earlier.at(-1)!,start=earlier.at(-2)!,length=distance(start,end);
          if(length<=remaining){earlier.pop();remaining-=length;}else{earlier[earlier.length-1]=end.map((v,axis)=>v+(start[axis]-v)*remaining/length) as Vec3;remaining=0;}}
        wireCtx.selfSegments=earlier.slice(1).map((end,index)=>[earlier[index],end]);
      }
      let section=search(waypoints[i-1],waypoints[i],wireCtx,w.id);
      // An overhead gland can be behind the starting direction of a high
      // neutral bar. A long single A* search chases the lamp below the board
      // and exhausts its budget before it climbs back to the opening.
      if(!section&&!w.bends.length&&inside.filter(Boolean).length===1){
        const board=owners.get((inside[0]||inside[1])!)!;
        const entry=inside[0]?ea:eb,local=worldToLocal(board,entry);
        const height=COMPONENTS[board.type].size[1];
        const gland=localToWorld(board,[local[0],height+.40,0]);
        const via={...wireCtx,anchors:undefined};
        const first=search(ea,gland,via,w.id);
        const last=first&&search(gland,eb,via,w.id);
        if(first&&last){
          const detour=simplify([...first,...last.slice(1)]);
          if(!selfOverlap([a,...detour,b]))section=detour;
        }
      }
      if(!section){failed=true;break;}path.push(...section.slice(1));
    }
    if(failed){result.issues.push({wire:w.id,message:w.bends.length?'Saved bends leave no clear path or make this wire double back. Move those bends.':'No clear route was found within the workbench. Space the equipment out or add clear bend waypoints.'});continue;}
    path.push(...to.slice(0,-1).reverse());
    const route=simplify(path,new Set([...from,...to,...w.bends])).map(p=>[...p] as Vec3);
    if(selfOverlap(route)){result.issues.push({wire:w.id,message:w.bends.length?'Saved bends make this wire double back or cross itself. Move those bends.':'This route crosses itself. Move the equipment or add clear bend waypoints.'});continue;}
    result.routes.set(w.id,route);
    for(let i=2;i<route.length-1;i++)occupied.insert({a:route[i-1],b:route[i],wire:w.id});
  }
  if(harness.runs.length) {
    const physical=new Map(result.routes);result.cables=new Map();
    for(const {run,trunk,tails} of harness.runs){
      checkpoint?.();
      const centreline=physical.get(trunk.id);
      const sheath=centreline&&dressSheath(centreline,ctx,trunk.id);
      result.routes.delete(trunk.id);
      const used=new Set(tails.map(t=>t.wire.cable!.core));
      const heads=[trunk.from,trunk.to].map(end=>harness.heads.get(end.component)!);
      const leads=tails.map(({wire,a,b})=>({wire,a,b,start:physical.get(a.id),finish:physical.get(b.id)}));
      const faces=heads.map((head,side)=>{
        const tangent=sheath?.length && sheath.length>1
          ? side?sub(sheath.at(-1)!,sheath.at(-2)!):sub(sheath[1],sheath[0])
          : scale(head.outward,side?-1:1);
        const attached=leads.flatMap(({wire,start,finish})=>{
          const towards=side?finish?.[1]:start?.at(-2);
          return towards?[{core:wire.cable!.core,towards}]:[];
        });
        return cableFace(run.kind,head.point,tangent,attached);
      }) as [CableFace,CableFace];
      function breakout(face:CableFace,core:CableCore,side:0|1,towards?:Vec3):Vec3[]{
        const seat=coreSeat(run.kind,face,core),out=scale(face.tangent,side?1:-1);
        const flare=sub(seat,face.centre);
        const mouth=add(seat,scale(out,.014));
        if(run.kind==='multi-strip'){
          // Peel the outer wires away first. The two inside wires can then
          // spread without cutting across the insulation of a neighbour.
          const outside=Math.abs(cableProfile(run.kind).centres[core]![0])>cableProfile(run.kind).width/4;
          const peel=add(add(seat,scale(out,.032)),scale(flare,outside?1:0));
          const bend=add(add(seat,scale(out,.060)),scale(flare,1.4));
          if(towards){
            const v=sub(towards,face.centre),length=Math.hypot(...v);
            return [seat,mouth,peel,bend,add(face.centre,scale(v,Math.min(.8,.145/length)))];
          }
          return [seat,mouth,peel,bend];
        }
        return [seat,mouth,add(add(seat,scale(out,.049)),flare)];
      }
      const geometry:CableGeometry={sheath:sheath??[],faces,tails:new Map(),open:[]};
      for(const {wire,a,b,start,finish} of leads) {
        result.routes.delete(a.id);result.routes.delete(b.id);
        const core=wire.cable!.core;
        const first=start?[...start.slice(0,-1),...breakout(faces[0],core,0,start.at(-2)).reverse()]:[];
        const last=finish?[...breakout(faces[1],core,1,finish[1]),...finish.slice(1)]:[];
        if(start||finish)geometry.tails.set(wire.id,[first,last]);
        if(start&&finish&&sheath){
          const full=[...first,...sheath.slice(1,-1),...last];
          result.routes.set(wire.id,wire.cable!.reversed?full.reverse():full);
        }
        for(const issue of result.issues)if(issue.wire===a.id||issue.wire===b.id)issue.wire=wire.id;
      }
      for(const side of [0,1] as const){
        const face=faces[side],out=scale(face.tangent,side?1:-1);
        for(const core of cableCores(run.kind)){
          if(used.has(core))continue;
          const seat=coreSeat(run.kind,face,core);
          const spread=scale(sub(seat,face.centre),2.2);
          geometry.open.push({core,side,points:[...breakout(face,core,side),add(add(seat,scale(out,.115)),spread)]});
        }
      }
      result.cables.set(run.id,geometry);
      for(const issue of result.issues)if(issue.wire===trunk.id)issue.wire=run.id;
    }
  }
  return result;
}
/** Compatibility accessor; the shared planner is cached across all wires. */
export function routeWire(doc:CircuitDocument,wire:Wire):Vec3[] {return routeCircuit(doc).routes.get(wire.id)??[];}

/** Independent final-route audit for regression tests and reports. */
export function auditRoutes(doc:CircuitDocument,routing=routeCircuit(doc)):RoutingIssue[] {
  const issues=[...routing.issues],obstacles=obstaclesFor(doc),index=new SegmentIndex(doc,false);
  const harness=createHarness(doc,obstacles),physical=new Map(routing.routes);
  const atCableFace=(e:Endpoint,n:Vec3)=>{
    const head=harness.heads.get(e.component);
    return head&&distance(head.point,n)<=.14;
  };
  for(const {run,trunk,tails} of harness.runs){
    const geometry=routing.cables?.get(run.id);if(!geometry)continue;
    physical.set(trunk.id,geometry.sheath);
    for(const {wire,a,b} of tails){
      const paths=geometry.tails.get(wire.id);if(paths){physical.set(a.id,paths[0]);physical.set(b.id,paths[1]);}
    }
  }
  for(const w of harness.wires.sort((a,b)=>a.id.localeCompare(b.id))) {
    const path=physical.get(w.id);if(!path)continue;
    const passages=[w.from,w.to].map(end=>{
      const owner=doc.components.find(c=>c.id===end.component);
      return owner?terminalPassage(owner,terminalPosition(doc,end),true,end.terminal):[];
    });
    const isCroma=[w.from,w.to].map(e=>doc.components.find(c=>c.id===e.component)?.variant==='croma-100a');
    const matchesPassage=(start:Vec3,end:Vec3,sleeve:Vec3[])=>sleeve.slice(1).some((p,i)=>
      distance(start,sleeve[i])<1e-7&&distance(end,p)<1e-7);
    if(selfOverlap(path))issues.push({wire:w.id,message:'Route crosses itself.'});
    for(let i=1;i<path.length;i++) {
      const packedFrom=isCroma[0]&&matchesPassage(path[i-1],path[i],passages[0]);
      const packedTo=isCroma[1]&&matchesPassage(path[i],path[i-1],passages[1]);
      const joint=i===1||packedFrom||atCableFace(w.from,path[i-1])?keyOf(w.from)
        :i===path.length-1||packedTo||atCableFace(w.to,path[i])?keyOf(w.to):undefined;
      const owner=i===1||matchesPassage(path[i-1],path[i],passages[0])?w.from.component:
        i===path.length-1||matchesPassage(path[i],path[i-1],passages[1])?w.to.component:undefined;
      if(hitsBody(path[i-1],path[i],obstacles,owner))issues.push({wire:w.id,message:'Route crosses an equipment clearance.'});
      if(index.hit(path[i-1],path[i],w.id,joint,joint?2*WIRE_RADIUS+WIRE_CLEARANCE+.001:ROUTE_SPACING))issues.push({wire:w.id,message:'Route crosses another conductor clearance.'});
      index.insert({a:path[i-1],b:path[i],wire:w.id,joint});
    }
  }return issues;
}
