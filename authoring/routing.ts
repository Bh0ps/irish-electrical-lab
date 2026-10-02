import { COMPONENTS } from './components.ts';
import { getComponentTerminals } from './terminal-layout.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3, Wire } from './types.ts';

// Shared with the renderer: selection changes colour, never the cable diameter.
export const WIRE_RADIUS = .018;
export const WIRE_CLEARANCE = .025;
// Includes two .012 corner deviations and a small numerical margin.
export const ROUTE_SPACING = .09;
const BODY_CLEARANCE = .05;
const GRID = .14;
const HASH_CELL = .42;
const MAX_ROUTE_SPAN = 80;
export interface RoutingIssue { wire: string; message: string }
export interface CircuitRoutes { routes: Map<string, Vec3[]>; issues: RoutingIssue[] }
interface Segment { a: Vec3; b: Vec3; wire: string; joint?: string }
interface Obstacle { component: ComponentInstance; min: Vec3; max: Vec3; worldMin: Vec3; worldMax: Vec3 }
const keyOf = (e: Endpoint) => `${e.component}\u0000${e.terminal}`;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
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
  return c&&t?localToWorld(c,t.anchor):[0,0,0];
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
    const def=COMPONENTS[component.type];if(!def)return [];
    const terminals=getComponentTerminals(component,def);
    const min:Vec3=[-def.size[0]/2,-.015,Math.min(-def.size[2]/2,...terminals.map(t=>t.anchor[2]-.015))];
    const max:Vec3=[def.size[0]/2,def.size[1]*1.05,def.size[2]/2];
    if(component.params.gangModule==='left'){min[0]=Math.min(min[0],.23-.565*def.size[0]/1.3);max[0]=Math.max(max[0],.23+.565*def.size[0]/1.3);}
    const corners=[min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>localToWorld(component,[x,y,z]))));
    return [{component,min,max,worldMin:[0,1,2].map(a=>Math.min(...corners.map(p=>p[a]))-BODY_CLEARANCE) as Vec3,worldMax:[0,1,2].map(a=>Math.max(...corners.map(p=>p[a]))+BODY_CLEARANCE) as Vec3}];
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
        const length=distance(s.a,s.b),v=sub(s.b,s.a),trim=Math.min(.14,length*.45);
        const tip:Vec3=[s.b[0]-v[0]*trim/length,s.b[1]-v[1]*trim/length,s.b[2]-v[2]*trim/length];
        if(segmentDistance(a,b,s.a,tip)<ROUTE_SPACING-1e-7)return true;
        continue;
      }
      if(joint&&s.joint===joint)continue;
      const required=joint&&s.joint?spacing:Math.max(ROUTE_SPACING,spacing);
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
interface Context { obstacles:Obstacle[]; occupied:SegmentIndex; low:Vec3; high:Vec3; rear:number; anchors?:[Vec3,Vec3]; selfSegments?:[Vec3,Vec3][] }
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
/** Geometry-only identity; supply, simulation and inspection edits do not reroute. */
export function circuitRoutingKey(doc:CircuitDocument):string {
  return JSON.stringify([
    obstaclesFor(doc).sort((a,b)=>a.component.id.localeCompare(b.component.id)).map(o=>[o.component.id,o.component.position,o.component.rotation,o.min,o.max,o.component.params.gangGroup??'',o.component.params.gangModule??'',getComponentTerminals(o.component,COMPONENTS[o.component.type]).map(t=>[t.id,t.anchor])]),
    [...doc.wires].sort((a,b)=>a.id.localeCompare(b.id)).map(w=>[w.id,w.from,w.to,w.bends]),
  ]);
}
/** Plans the whole harness together. Routing never edits saved bends or topology. */
export function routeCircuit(doc:CircuitDocument):CircuitRoutes {
  const ordered=[...doc.wires].sort((a,b)=>a.id.localeCompare(b.id));
  const obstacles=obstaclesFor(doc);
  const signature=circuitRoutingKey(doc);
  const cached=routeCache.get(signature);if(cached)return cached;
  const result:CircuitRoutes={routes:new Map(),issues:[]};
  const occupied=new SegmentIndex(),exits=new Map<string,[Vec3,Vec3]>(),invalid=new Set<string>();
  const neighbours=new Map<string,string[]>();
  for(const w of ordered)for(const e of [w.from,w.to]){const key=keyOf(e),ids=neighbours.get(key)??[];if(!ids.includes(w.id))ids.push(w.id);neighbours.set(key,ids);}
  const entries=ordered.flatMap(w=>[['from',w.from],['to',w.to]].map(([label,endpoint])=>({w,label:label as string,e:endpoint as Endpoint})))
    .sort((a,b)=>neighbours.get(keyOf(b.e))!.length-neighbours.get(keyOf(a.e))!.length||keyOf(a.e).localeCompare(keyOf(b.e))||a.w.id.localeCompare(b.w.id));
  const anchors=new Map(entries.map(({e})=>[keyOf(e),terminalPosition(doc,e)]));
  function runway(c:ComponentInstance,b:Vec3):Vec3 {
    const x=-Math.sin(c.rotation),z=-Math.cos(c.rotation);
    return Math.abs(x)>Math.abs(z)?[b[0]+Math.sign(x)*GRID*3,b[1],b[2]]:[b[0],b[1],b[2]+Math.sign(z)*GRID*3];
  }
  function exit(w:Wire,e:Endpoint):[Vec3,Vec3]|undefined {
    const a=anchors.get(keyOf(e))!,c=doc.components.find(c=>c.id===e.component);if(!c)return undefined;
    const co=Math.cos(c.rotation),si=Math.sin(c.rotation),own=occupied.segments.filter(s=>s.joint===keyOf(e));
    // Allocate a compact cone of rear ports, not a widening horizontal fan.
    // Try alternative angles/depths when adjacent terminal rows occupy a cone.
    for(const depth of [.34,.50,.70,.94])for(const radius of [0,.12,.18,.24,.32,.44,.60])for(let angle=0;angle<(radius?16:1);angle++) {
      const x=Math.cos(angle*Math.PI/8)*radius,y=Math.sin(angle*Math.PI/8)*radius;
      const b=[a[0]+x*co-depth*si,a[1]+y,a[2]-x*si-depth*co].map(v=>Math.round(v/GRID)*GRID) as Vec3;
      const lead=runway(c,b);
      if(b[1]<.07||hitsBody(a,b,obstacles,e.component)||hitsBody(b,b,obstacles))continue;
      if(occupied.hit(a,b,w.id,keyOf(e),2*WIRE_RADIUS+WIRE_CLEARANCE+.001)||occupied.hit(b,b,w.id,undefined))continue;
      if(occupied.segments.some(s=>s.wire!==w.id&&s.joint&&segmentDistance(a,b,s.b,s.b)<ROUTE_SPACING-1e-7))continue;
      if(hitsBody(b,lead,obstacles)||occupied.hit(b,lead,w.id))continue;
      if([...anchors].some(([key,p])=>key!==keyOf(e)&&segmentDistance(a,b,p,p)<2*WIRE_RADIUS+WIRE_CLEARANCE+.001))continue;
      const direction=sub(b,a),length=distance(a,b);
      if(own.some(s=>{const other=sub(s.b,s.a),cosine=dot(direction,other)/(length*distance(s.a,s.b));return cosine>.955||distance(b,s.b)<ROUTE_SPACING;}))continue;
      return [a,b];
    }
    return undefined;
  }
  // Reserve every terminal access corridor before routing any trunk, so an early
  // wire cannot obstruct a later wire's rear entry (including aligned terminals).
  for(const {w,label,e} of entries) {
    const access=exit(w,e);
    if(!access) {
      invalid.add(w.id);result.issues.push({wire:w.id,message:'A rear terminal entry is obstructed. Separate the fixtures or use a junction for crowded connections.'});
      continue;
    }
    const [a,b]=access;exits.set(`${w.id}:${label}`,[a,b]);
    occupied.insert({a,b,wire:w.id,joint:keyOf(e)});
    occupied.insert({a:b,b:runway(doc.components.find(c=>c.id===e.component)!,b),wire:w.id});
  }
  const extent=obstacles.length?obstacles:[];
  const low:Vec3=[0,1,2].map(a=>Math.min(...extent.map(o=>o.worldMin[a]),...Array.from(exits.values()).map(e=>e[1][a]),a===1?.10:0)-(a===1?0:1.25)) as Vec3;
  const high:Vec3=[0,1,2].map(a=>Math.max(...extent.map(o=>o.worldMax[a]),...Array.from(exits.values()).map(e=>e[1][a]),a===1?1:0)+(a===1?.8:1.25)) as Vec3;
  low[1]=Math.min(.10,...Array.from(exits.values()).map(e=>e[1][1]));
  const ctx:Context={obstacles,occupied,low,high,rear:Math.min(...obstacles.map(o=>o.worldMin[2]),0)};
  // Mandatory manual waypoints get first choice of corridors; auto paths adapt.
  const crowding=(w:Wire)=>Math.max(neighbours.get(keyOf(w.from))!.length,neighbours.get(keyOf(w.to))!.length);
  const span=(w:Wire)=>distance(terminalPosition(doc,w.from),terminalPosition(doc,w.to));
  for(const w of [...ordered].sort((a,b)=>Number(b.bends.length>0)-Number(a.bends.length>0)||crowding(b)-crowding(a)||span(b)-span(a)||a.id.localeCompare(b.id))) {
    if(invalid.has(w.id))continue;
    const [a,ea]=exits.get(`${w.id}:from`)!,[b,eb]=exits.get(`${w.id}:to`)!;
    if(w.bends.some(p=>hitsBody(p,p,obstacles))){result.issues.push({wire:w.id,message:'A saved bend is inside equipment. Move that bend to clear space.'});continue;}
    // Include manual waypoints outside the scene in this wire's bounded search.
    const waypoints=[ea,...w.bends,eb],localMin=[0,1,2].map(axis=>Math.min(...waypoints.map(p=>p[axis]))),localMax=[0,1,2].map(axis=>Math.max(...waypoints.map(p=>p[axis])));
    if(localMax.some((v,i)=>v-localMin[i]>MAX_ROUTE_SPAN)){result.issues.push({wire:w.id,message:'This wire spans more than the 80-unit routing area. Bring the equipment and saved bends closer together.'});continue;}
    const wireCtx:Context={...ctx,low:localMin.map((v,i)=>Math.max(Math.min(low[i],v-.5),v-2)) as Vec3,high:localMax.map((v,i)=>Math.min(Math.max(high[i],v+.5),v+2)) as Vec3,rear:Math.max(ctx.rear,localMin[2]-1.5),anchors:w.bends.length?undefined:[a,b]};
    const path:Vec3[]=[a,ea];let failed=false;
    for(let i=1;i<waypoints.length;i++) {
      if(i>1){
        // Reserve completed portions of this same conductor. Trim only the
        // immediate bend join, so a normal rounded corner can meet itself.
        const earlier=path.slice(1);let remaining=.14;
        while(earlier.length>1&&remaining>0){const end=earlier.at(-1)!,start=earlier.at(-2)!,length=distance(start,end);
          if(length<=remaining){earlier.pop();remaining-=length;}else{earlier[earlier.length-1]=end.map((v,axis)=>v+(start[axis]-v)*remaining/length) as Vec3;remaining=0;}}
        wireCtx.selfSegments=earlier.slice(1).map((end,index)=>[earlier[index],end]);
      }
      const section=search(waypoints[i-1],waypoints[i],wireCtx,w.id);
      if(!section){failed=true;break;}path.push(...section.slice(1));
    }
    if(failed){result.issues.push({wire:w.id,message:w.bends.length?'Saved bends leave no clear path or make this wire double back. Move those bends.':'No clear route was found within the workbench. Space the equipment out or add clear bend waypoints.'});continue;}
    path.push(b);
    const route=simplify(path,new Set([a,ea,eb,b,...w.bends])).map(p=>[...p] as Vec3);
    if(selfOverlap(route)){result.issues.push({wire:w.id,message:w.bends.length?'Saved bends make this wire double back or cross itself. Move those bends.':'This route crosses itself. Move the equipment or add clear bend waypoints.'});continue;}
    result.routes.set(w.id,route);
    for(let i=2;i<route.length-1;i++)occupied.insert({a:route[i-1],b:route[i],wire:w.id});
  }
  routeCache.set(signature,result);if(routeCache.size>6)routeCache.delete(routeCache.keys().next().value!);
  return result;
}
/** Compatibility accessor; the shared planner is cached across all wires. */
export function routeWire(doc:CircuitDocument,wire:Wire):Vec3[] {return routeCircuit(doc).routes.get(wire.id)??[];}

/** Independent final-route audit for regression tests and reports. */
export function auditRoutes(doc:CircuitDocument,routing=routeCircuit(doc)):RoutingIssue[] {
  const issues=[...routing.issues],obstacles=obstaclesFor(doc),index=new SegmentIndex();
  for(const w of [...doc.wires].sort((a,b)=>a.id.localeCompare(b.id))) {
    const path=routing.routes.get(w.id);if(!path)continue;
    if(selfOverlap(path))issues.push({wire:w.id,message:'Route crosses itself.'});
    for(let i=1;i<path.length;i++) {
      const joint=i===1?keyOf(w.from):i===path.length-1?keyOf(w.to):undefined;
      const owner=i===1?w.from.component:i===path.length-1?w.to.component:undefined;
      if(hitsBody(path[i-1],path[i],obstacles,owner))issues.push({wire:w.id,message:'Route crosses an equipment clearance.'});
      if(index.hit(path[i-1],path[i],w.id,joint,joint?2*WIRE_RADIUS+WIRE_CLEARANCE+.001:ROUTE_SPACING))issues.push({wire:w.id,message:'Route crosses another conductor clearance.'});
      index.insert({a:path[i-1],b:path[i],wire:w.id,joint});
    }
  }return issues;
}
