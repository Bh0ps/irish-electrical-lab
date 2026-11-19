import { cableMeshFrames } from '../lib/cable-mesh.ts';
import { coreRadius } from '../lib/cable-form.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS,definitionFor } from '../lib/components.ts';
import { createBoundedWireCurve, WIRE_CORNER_RADIUS } from '../lib/Equipment.tsx';
import { LESSONS } from '../lib/lessons.ts';
import { auditRoutes,routeCircuit, SHEATH_RADIUS, WIRE_RADIUS } from '../lib/routing.ts';
import { getComponentTerminals } from '../lib/terminal-layout.ts';
import { isBoard, mountScale, mountRoll, dinBodyWidth } from '../lib/board-assembly.ts';
import { Box3,Mesh,Matrix4,Euler,Ray,Triangle,Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3, Wire } from '../lib/types.ts';

// This checks the exact ring centres used by TubeGeometry, independently of the
// planner's segment-distance, spatial index and auditRoutes implementation.
const EPSILON = 1e-5;
const MINIMUM_GAP = 2 * WIRE_RADIUS + EPSILON;
// Conductors intentionally converge in a common physical terminal bore. At
// .14 bench units from that bore the distinct exit directions must have split.
// This exemption applies only to a pair sharing the same component/terminal.
const COMMON_BORE_RADIUS = .14;
interface Segment { a: Vec3; b: Vec3 }
interface RenderedWire { wire: Wire; source: Vec3[]; points: Vec3[]; segments: Segment[]; radius:number }
interface Issue { kind: string; wire: string; other?: string; distance?: number; position?: Vec3 }
const difference = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normSquared = (a: Vec3) => dot(a, a);
const distanceSquared = (a: Vec3, b: Vec3) => normSquared(difference(a, b));
const interpolate = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const segmentsFor = (points: Vec3[]): Segment[] => points.slice(1).map((b, index) => ({ a: points[index], b }));

function pointDistanceSquared(point: Vec3, a: Vec3, b: Vec3): number {
  const delta = difference(b, a), length = normSquared(delta);
  return distanceSquared(point, interpolate(a, b, length ? clamp(dot(difference(point, a), delta) / length) : 0));
}

/** Independent constrained minimum: interior solution plus all four edges. */
function segmentGap(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = difference(b, a), v = difference(d, c), w = difference(a, c);
  const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  const determinant = aa * cc - bb * bb;
  let minimum = Math.min(pointDistanceSquared(a, c, d), pointDistanceSquared(b, c, d), pointDistanceSquared(c, a, b), pointDistanceSquared(d, a, b));
  if (determinant > 1e-20) {
    const s = (bb * ee - cc * dd) / determinant, t = (aa * ee - bb * dd) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) minimum = Math.min(minimum, distanceSquared(interpolate(a, b, s), interpolate(c, d, t)));
  }
  return Math.sqrt(Math.max(0, minimum));
}

function boxesNear(a: Segment, b: Segment, gap = MINIMUM_GAP): boolean {
  let distance = 0;
  for (let axis = 0; axis < 3; axis++) {
    const delta = Math.max(0, Math.min(a.a[axis], a.b[axis]) - Math.max(b.a[axis], b.b[axis]), Math.min(b.a[axis], b.b[axis]) - Math.max(a.a[axis], a.b[axis]));
    distance += delta * delta;
  }
  return distance < gap * gap;
}

function outsideSphere(segment: Segment, center: Vec3, radius: number): Segment[] {
  const delta = difference(segment.b, segment.a), offset = difference(segment.a, center), aa = normSquared(delta);
  if (aa < 1e-24) return normSquared(offset) >= radius * radius ? [segment] : [];
  const bb = 2 * dot(offset, delta), cc = normSquared(offset) - radius * radius, discriminant = bb * bb - 4 * aa * cc;
  const fractions = [0, 1];
  if (discriminant > 0) {
    for (const root of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) if (root > 0 && root < 1) fractions.push(root);
  }
  fractions.sort((a, b) => a - b);
  const result: Segment[] = [];
  for (let index = 1; index < fractions.length; index++) {
    const start = fractions[index - 1], end = fractions[index];
    if (distanceSquared(interpolate(segment.a, segment.b, (start + end) / 2), center) >= radius * radius - 1e-12) result.push({ a: interpolate(segment.a, segment.b, start), b: interpolate(segment.a, segment.b, end) });
  }
  return result;
}

function physicalTerminal(document: CircuitDocument, endpoint: Endpoint): Vec3 {
  const component = document.components.find(c => c.id === endpoint.component);
  assert.ok(component, `Missing component ${endpoint.component}`);
  const terminal = getComponentTerminals(component, COMPONENTS[component.type]).find(t => t.id === endpoint.terminal);
  assert.ok(terminal, `Missing terminal ${endpoint.component}.${endpoint.terminal}`);
  const [x, y, z] = new Vector3(...terminal.anchor).applyMatrix4(seatingMatrix(component)).toArray(), cosine = Math.cos(component.rotation), sine = Math.sin(component.rotation);
  return [component.position[0] + x * cosine + z * sine, component.position[1] + y, component.position[2] - x * sine + z * cosine];
}
function sharedBores(document: CircuitDocument, a: RenderedWire, b: RenderedWire): Vec3[] {
  return [a.wire.from, a.wire.to].flatMap((endpoint,i) => {
    const common=[b.wire.from,b.wire.to].some(other=>endpoint.component===other.component&&endpoint.terminal===other.terminal);
    if(!common)return [];
    return [endpoint.component.startsWith('@')?(i?a.source.at(-1)!:a.source[0]):physicalTerminal(document,endpoint)];
  });
}
function clippedSegments(segments: Segment[], bores: Vec3[]): Segment[] {
  return bores.reduce((current, bore) => current.flatMap(segment => outsideSphere(segment, bore, COMMON_BORE_RADIUS)), segments);
}
function minimumWireGap(document: CircuitDocument, a: RenderedWire, b: RenderedWire): number {
  const bores = sharedBores(document, a, b);
  const left = bores.length ? clippedSegments(a.segments, bores) : a.segments;
  const right = bores.length ? clippedSegments(b.segments, bores) : b.segments;
  let minimum = Infinity;
  for (const one of left) for (const two of right) if (boxesNear(one, two,a.radius+b.radius+EPSILON)) minimum = Math.min(minimum, segmentGap(one.a, one.b, two.a, two.b));
  return minimum;
}

function seatingMatrix(component: ComponentInstance) {
  return new Matrix4().makeRotationFromEuler(new Euler(0,0,mountRoll(component))).scale(new Vector3(...mountScale(component)));
}
function inLocal(component: ComponentInstance, point: Vec3): Vec3 {
  const [x, y, z] = difference(point, component.position), cosine = Math.cos(component.rotation), sine = Math.sin(component.rotation);
  const local:Vec3=[x * cosine - z * sine, y, x * sine + z * cosine];
  return component.mount?new Vector3(...local).applyMatrix4(seatingMatrix(component).invert()).toArray():local;
}
function entersBox(a: Vec3, b: Vec3, low: Vec3, high: Vec3): boolean {
  let first = 0, last = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) { if (a[axis] < low[axis] || a[axis] > high[axis]) return false; }
    else {
      const one = (low[axis] - a[axis]) / delta, two = (high[axis] - a[axis]) / delta;
      first = Math.max(first, Math.min(one, two)); last = Math.min(last, Math.max(one, two));
      if (first > last) return false;
    }
  }
  return true;
}
function sameHousing(document: CircuitDocument, owner: string, component: ComponentInstance): boolean {
  if (owner === component.id) return true;
  const original = document.components.find(c => c.id === owner);
  if (!original || original.type !== 'switch' || component.type !== 'switch' || !original.params.gangGroup || original.params.gangGroup !== component.params.gangGroup) return false;
  const delta = inLocal(original, component.position);
  return ['left', 'right'].includes(String(original.params.gangModule)) && component.params.gangModule === (original.params.gangModule === 'left' ? 'right' : 'left') && Math.abs(delta[0] - (original.params.gangModule === 'left' ? .46 : -.46)) < 1e-6 && Math.abs(delta[1]) < 1e-6 && Math.abs(delta[2]) < 1e-6 && Math.abs(original.rotation - component.rotation) < 1e-6;
}
function isTerminalAccess(document: CircuitDocument, rendered: RenderedWire, segment: Segment, housing: ComponentInstance): boolean {
  const first = rendered.source[0], second = rendered.source[1], last = rendered.source[rendered.source.length - 1], beforeLast = rendered.source[rendered.source.length - 2];
  const closeTo = (a: Vec3, b: Vec3) => [segment.a, segment.b].every(p => pointDistanceSquared(p, a, b) <= (WIRE_CORNER_RADIUS + EPSILON) ** 2);
  return (sameHousing(document, rendered.wire.from.component, housing) && closeTo(first, second)) || (sameHousing(document, rendered.wire.to.component, housing) && closeTo(beforeLast, last));
}

// The open space below a DIN device is a real wire entry route. Measure the
// device, stand foot, upright, and rail separately from the exported meshes.
// This check does not reuse the planner's envelopes.
interface MeasuredTriangle { vertices:Triangle; bounds:Box3; part:string }
interface FixtureGeometry { groups:Map<string,Box3>; triangles:MeasuredTriangle[] }
const modelKey=(c:ComponentInstance)=>c.variant?c.type+':'+c.variant:c.type;
async function measuredFixtures(low=false) {
  const byType=new Map<string,FixtureGeometry>(),loader=new GLTFLoader();
  for(const type of ['mcb','mcb3','rcd','rcd3','rcbo','fan:xf100s','isolator3:fan-isolator','switch:dc-rocker']){
    const named=type.includes(':'),stem=named?type.replace(':','_'):type+'_default';
    const bytes=readFileSync(new URL('../public/models/'+stem+(low?'.low':'')+'.glb',import.meta.url));
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    scene.updateMatrixWorld(true);
    const groups=new Map<string,Box3>(),triangles:MeasuredTriangle[]=[];
    scene.traverse(node=>{
      if(!(node instanceof Mesh))return;
      let key='device';
      for(let owner=node.parent;owner;owner=owner.parent)if(owner.userData.standMember)key=owner.userData.standMember;
      const bounds=groups.get(key)??new Box3();
      bounds.union(new Box3().setFromObject(node,true));groups.set(key,bounds);
      if(type==='fan:xf100s'){
        const g=node.geometry,p=g.getAttribute('position'),indices=g.index;
        const vertex=(i:number)=>new Vector3().fromBufferAttribute(p,indices?indices.getX(i):i).applyMatrix4(node.matrixWorld);
        for(let i=0;i<(indices?.count??p.count);i+=3){
          const vertices=new Triangle(vertex(i),vertex(i+1),vertex(i+2));
          triangles.push({vertices,bounds:new Box3().setFromPoints([vertices.a,vertices.b,vertices.c]),part:node.name});
        }
      }
    });
    assert.deepEqual([...groups.keys()].sort(),named?['device']:['device','foot','leg','rail']);
    byType.set(type,{groups,triangles});
  }
  return byType;
}
// The XF's rear feed slot, front service chamber and clamp mouths are genuine
// openings. Test the swept wire against mesh triangles inside the housing
// instead of granting the whole wire or compartment an exemption.
function hitsFanSurface(a:Vec3,b:Vec3,radius:number,triangles:MeasuredTriangle[]){
  const start=new Vector3(...a),end=new Vector3(...b),bounds=new Box3().setFromPoints([start,end]).expandByScalar(radius);
  const ray=new Ray(start,end.clone().sub(start).normalize()),length=start.distanceToSquared(end),point=new Vector3();
  return triangles.find(({vertices:t,bounds:box})=>{
    if(!box.intersectsBox(bounds))return false;
    if(ray.intersectTriangle(t.a,t.b,t.c,false,point)&&point.distanceToSquared(start)<=length)return true;
    if(t.closestPointToPoint(start,point).distanceTo(start)<radius||t.closestPointToPoint(end,point).distanceTo(end)<radius)return true;
    const v=[t.a.toArray(),t.b.toArray(),t.c.toArray()];
    return v.some((p,i)=>segmentGap(a,b,p,v[(i+1)%3])<radius);
  });
}
function fixtureIssues(document: CircuitDocument, rendered: RenderedWire, measured:Map<string,FixtureGeometry>): Issue[] {
  const issues: Issue[] = [];
  for (const component of document.components) {
    const definition = definitionFor(component), terminals = getComponentTerminals(component, definition);
    // Housing bounds include its rear terminal carriers. Only that fixture's
    // own immediate entry segments can enter this radius-inflated envelope.
    const low: Vec3 = [-definition.size[0] / 2, -.015, Math.min(-definition.size[2] / 2, ...terminals.map(t => t.anchor[2] - .015))];
    const high: Vec3 = [definition.size[0] / 2, definition.size[1] * 1.05, definition.size[2] / 2];
    const width=dinBodyWidth(component);
    if(width){
      low[0]=Math.min(-width/2,...terminals.map(t=>t.anchor[0]-.018));high[0]=Math.max(width/2,...terminals.map(t=>t.anchor[0]+.018));
      low[1]=Math.min(definition.size[1]*.10,...terminals.map(t=>t.anchor[1]-.032));high[1]=Math.max(definition.size[1]*.86,...terminals.map(t=>t.anchor[1]+.032));
    }
    if(isBoard(component.type))high[2]=low[2]+.07;
    if (component.params.gangModule === 'left') { low[0] = Math.min(low[0], .23 - .565 * definition.size[0] / 1.3); high[0] = Math.max(high[0], .23 + .565 * definition.size[0] / 1.3); }
    const scale=mountScale(component);
    const actual=measured.get(modelKey(component))??measured.get(component.type);
    const regions=actual?[...actual.groups.entries()].filter(([key])=>key==='device'||!component.mount).map(([,box])=>[box.min.toArray(),box.max.toArray()]):[[low,high]];
    for(const [min,max] of regions){
      const inflatedLow = min.map((value,i) => value - (rendered.radius + EPSILON)/scale[i]) as Vec3, inflatedHigh = max.map((value,i) => value + (rendered.radius + EPSILON)/scale[i]) as Vec3;
      let surface:MeasuredTriangle|undefined;
      const hit = rendered.segments.find(segment=>{
        const a=inLocal(component,segment.a),b=inLocal(component,segment.b);
        if(!entersBox(a,b,inflatedLow,inflatedHigh))return false;
        if(actual?.triangles.length){surface=hitsFanSurface(a,b,rendered.radius,actual.triangles);return Boolean(surface);}
        return !isTerminalAccess(document,rendered,segment,component);
      });
      if (hit) issues.push({ kind: surface?'rendered tube touches '+surface.part:'rendered tube enters fixture clearance', wire: rendered.wire.id, other: component.id, position: hit.a });
    }
  }
  return issues;
}

function renderedWire(wire: Wire, source: Vec3[],radius=WIRE_RADIUS): RenderedWire {
  const curve = createBoundedWireCurve(source);
  const points = Array.from({ length: curve.tubularSegments + 1 }, (_, i) => curve.getPointAt(i / curve.tubularSegments).toArray() as Vec3);
  return { wire, source, points, segments: segmentsFor(points),radius };
}

test('independent rendered audit detects crossings, close parallel tubes and skew nearest points', () => {
  assert.equal(segmentGap([0, 0, 0], [1, 0, 0], [.5, -1, 0], [.5, 1, 0]), 0);
  assert.ok(Math.abs(segmentGap([0, 0, 0], [1, 0, 0], [.5, -1, .03], [.5, 1, .03]) - .03) < 1e-12);
  assert.ok(segmentGap([0, 0, 0], [1, 0, 0], [0, .035, 0], [1, .035, 0]) < MINIMUM_GAP);
  assert.ok(segmentGap([0, 0, 0], [1, 0, 0], [0, .04, 0], [1, .04, 0]) > MINIMUM_GAP);
  assert.equal(segmentGap([0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]), 1);
});

test('shared-bore clipping removes only the common joint neighbourhood', () => {
  const pieces = outsideSphere({ a: [-1, 0, 0], b: [1, 0, 0] }, [0, 0, 0], COMMON_BORE_RADIUS);
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0].b[0] + COMMON_BORE_RADIUS) < 1e-12);
  assert.ok(Math.abs(pieces[1].a[0] - COMMON_BORE_RADIUS) < 1e-12);
  assert.equal(outsideSphere({ a: [0, 0, 0], b: [.05, 0, 0] }, [0, 0, 0], COMMON_BORE_RADIUS).length, 0);
  assert.equal(outsideSphere({ a: [0, .2, 0], b: [.5, .2, 0] }, [0, 0, 0], COMMON_BORE_RADIUS).length, 1);
  const document = LESSONS[0].circuit, source = document.components[0];
  const [first, second] = getComponentTerminals(source, COMPONENTS[source.type]);
  const common = { component: source.id, terminal: first.id }, separate = { component: source.id, terminal: second.id };
  const anchor = physicalTerminal(document, common);
  const a: Wire = { id: 'a', from: common, to: { component: 'end-a', terminal: 'L' }, role: 'L', resistance: .01, bends: [] };
  const b: Wire = { ...a, id: 'b', to: { component: 'end-b', terminal: 'L' } };
  const one = renderedWire(a, [anchor, [anchor[0], anchor[1], anchor[2] - .5]]);
  const two = renderedWire(b, [anchor, [anchor[0] + .5, anchor[1], anchor[2] - .5]]);
  assert.ok(minimumWireGap(document, one, two) >= MINIMUM_GAP);
  // Coincident geometry is still a collision when the logical terminal differs.
  assert.equal(minimumWireGap(document, one, { ...two, wire: { ...b, from: separate } }), 0);
});

test('all 80 configurations have non-overlapping rendered tubes and clear fixture paths', async () => {
  const measured=await measuredFixtures();
  assert.equal(LESSONS.length, 80);
  const failures: { lesson: number; issues: Issue[] }[] = [];
  let wires = 0, meshSegments = 0;
  for (const lesson of LESSONS) {
    const document = lesson.circuit, plan = routeCircuit(document), issues: Issue[] = [];
    issues.push(...plan.issues.map(issue => ({ kind: issue.message, wire: issue.wire })));
    const rendered:RenderedWire[]=[];
    const head=(id:string,side:number)=>({component:'@'+id,terminal:String(side)});
    for(const wire of document.wires){
      const source = plan.routes.get(wire.id);
      if (!source || source.length < 2) { issues.push({kind:'missing route',wire:wire.id});continue; }
      wires++;
      assert.ok(distanceSquared(source[0],physicalTerminal(document,wire.from))<1e-20,`${lesson.id}/${wire.id}: starting bore moved`);
      assert.ok(distanceSquared(source.at(-1)!,physicalTerminal(document,wire.to))<1e-20,`${lesson.id}/${wire.id}: ending bore moved`);
      if(!wire.cable){rendered.push(renderedWire(wire,source));continue;}
      const {runId,reversed}=wire.cable;
      const radius=coreRadius(document.cableRuns!.find(run=>run.id===runId)!.kind);
      const tails=plan.cables?.get(runId)?.tails.get(wire.id);
      assert.ok(tails);
      rendered.push(renderedWire({...wire,from:reversed?wire.to:wire.from,to:head(runId,0)},tails[0],radius),
        renderedWire({...wire,from:head(runId,1),to:reversed?wire.from:wire.to},tails[1],radius));
    }
    for(const run of document.cableRuns??[]){
      const geometry=plan.cables?.get(run.id);assert.ok(geometry?.sheath.length);
      const jacket:Wire={id:run.id,from:head(run.id,0),to:head(run.id,1),role:'output',resistance:.01,bends:[]};
      const jacketPoints=cableMeshFrames(geometry.sheath,geometry.faces,run.kind).map(frame=>frame.point.toArray() as Vec3);
      rendered.push({wire:jacket,source:geometry.sheath,points:jacketPoints,segments:segmentsFor(jacketPoints),radius:SHEATH_RADIUS});
      for(const [i,open] of geometry.open.entries()){
        const side=open.side;
        rendered.push(renderedWire({...jacket,id:run.id+' free '+i,from:head(run.id,side),to:head(run.id,2+i)},open.points,coreRadius(run.kind)));
      }
    }
    for(const model of rendered){
      const {wire,source}=model;meshSegments+=model.segments.length;
      // The finite tube mesh, not just its ring centres, must stay inside the
      // chosen corner corridor. Distance to a source segment is convex, so
      // three samples also check each actual rendered linear mesh interval.
      for (const segment of model.segments) for (const point of [segment.a, interpolate(segment.a, segment.b, .5), segment.b]) {
        const nearest = Math.sqrt(Math.min(...segmentsFor(source).map(line => pointDistanceSquared(point, line.a, line.b))));
        if (nearest > WIRE_CORNER_RADIUS + EPSILON) issues.push({ kind: 'corner exceeds source corridor', wire: wire.id, distance: nearest, position: point });
      }
      issues.push(...fixtureIssues(document, model, measured));
    }
    for (let left = 0; left < rendered.length; left++) for (let right = left + 1; right < rendered.length; right++) {
      const gap = minimumWireGap(document, rendered[left], rendered[right]);
      if (gap < rendered[left].radius+rendered[right].radius+EPSILON) issues.push({ kind: 'rendered tubes overlap outside joint', wire: rendered[left].wire.id, other: rendered[right].wire.id, distance: gap });
    }
    if (issues.length) failures.push({ lesson: lesson.id, issues });
  }
  console.log(`Rendered routing audit: ${LESSONS.length} configurations, ${wires} wires, ${meshSegments} mesh intervals; centreline clearance threshold ${MINIMUM_GAP} bench units; shared terminal radius ${COMMON_BORE_RADIUS} bench units.`);
  assert.equal(wires, LESSONS.reduce((count, lesson) => count + lesson.circuit.wires.length, 0), 'Every lesson wire must have rendered geometry');
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});

test('both extractor leads pass through the exported rear inlet at eight bench rotations', async()=>{
  const course=LESSONS.find(l=>l.id===36)!.circuit,fan=course.components.find(c=>c.id==='fan')!;
  const source=course.components.filter(c=>['fan','runon','fan-isolation'].includes(c.id));
  const connected=course.wires.filter(w=>w.to.component==='fan');
  assert.equal(connected.length,2);
  const full=await measuredFixtures(),low=await measuredFixtures(true);
  for(const models of [full,low]){
    const extractor=models.get('fan:xf100s')!,bounds=extractor.groups.get('device')!;
    assert.ok(Math.abs(bounds.max.x-bounds.min.x-1.63)<.012);
    const plate=models.get('isolator3:fan-isolator')!.groups.get('device')!;
    assert.ok(Math.abs(plate.max.x-plate.min.x-.86)<.003&&Math.abs(plate.max.y-plate.min.y-.86)<.003);
    // Verify solid material beside the hole and air inside it in the GLB.
    assert.ok(hitsFanSurface([-.71,.95,-.025],[-.71,.95,.035],.001,extractor.triangles));
    for(const x of [-.64,-.548]){
      assert.equal(hitsFanSurface([x,.95,-.025],[x,.95,.035],WIRE_RADIUS,extractor.triangles),undefined);
    }
    for(let turn=0;turn<8;turn++){
      const rotation=turn*Math.PI/4;
      const doc={...course,components:source.map(c=>({...c,rotation})),wires:connected.map((w,i)=>
        (turn+i)%2?{...w,from:w.to,to:w.from}:w)};
      const plan=routeCircuit(doc);
      assert.deepEqual(auditRoutes(doc,plan),[],`rotation ${turn}: routed lead clearance`);
      const wires=doc.wires.map(w=>{
        const points=plan.routes.get(w.id)!;
        const reversed=w.to.component===fan.id,fromFan=reversed?[...points].reverse():points;
        const fixed=doc.components.find(c=>c.id===fan.id)!,local=fromFan.map(p=>inLocal(fixed,p));
        assert.ok(Math.abs(local[0][1]-1.106)<1e-6&&Math.abs(local[0][2]-.122)<1e-6);
        assert.ok(Math.abs(local[1][0]-local[0][0])<1e-6&&Math.abs(local[1][1]-1.073)<1e-6&&Math.abs(local[1][2]-.122)<1e-6);
        // Intersect the actual rounded mesh centreline with the dry-side face.
        const rendered=renderedWire(w,points);
        const atSlot=rendered.segments.map(s=>[inLocal(fixed,s.a),inLocal(fixed,s.b)]).find(([a,b])=>
          a[2]*b[2]<=0&&a[1]>.89&&a[1]<1.01&&Math.abs(a[0]+.595)<.084);
        assert.ok(atSlot,`wire ${w.id} missed the cable inlet`);
        const [p,q]=atSlot,hit=interpolate(p,q,-p[2]/(q[2]-p[2]));
        assert.ok(Math.abs(hit[0]+.595)+WIRE_RADIUS<.085&&Math.abs(hit[1]-.95)+WIRE_RADIUS<.055);
        assert.deepEqual(fixtureIssues(doc,rendered,models),[],`wire ${w.id} touches a fitting at yaw ${turn}`);
        return rendered;
      });
      assert.ok(minimumWireGap(doc,wires[0],wires[1])>=MINIMUM_GAP);
    }
  }
});
