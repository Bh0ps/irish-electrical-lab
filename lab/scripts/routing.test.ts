import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCircuit, routeWire, terminalPosition, auditRoutes, circuitRoutingKey, segmentDistance, WIRE_RADIUS } from '../lib/routing.ts';
import { LESSONS } from '../lib/lessons.ts';
import type { CircuitDocument, Endpoint, Vec3, Wire } from '../lib/types.ts';
const ep=(component:string,terminal:string):Endpoint=>({component,terminal});
function fixture():CircuitDocument {
  const wire=(id:string,from:Endpoint,to:Endpoint):Wire=>({id,from,to,role:'L',resistance:.01,bends:[]});
  return {version:1,id:'route-test',name:'Shared terminal',revision:0,supply:{enabled:false,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[
    {id:'switch',type:'switch',label:'Switch',position:[0,0,0],rotation:0,params:{}},
    ...['a','b','c'].map((id,i)=>({id,type:'socket',label:id,position:[3+i*2,0,2] as Vec3,rotation:0,params:{}})),
  ],wires:[wire('a',ep('switch','COM'),ep('a','L')),wire('b',ep('b','L'),ep('switch','COM')),wire('c',ep('switch','COM'),ep('c','L'))],faults:[]};
}
function valid(doc:CircuitDocument) {
  const routing=routeCircuit(doc);assert.equal(routing.routes.size,doc.wires.length,JSON.stringify(routing.issues));assert.deepEqual(auditRoutes(doc,routing),[]);
  for(const w of doc.wires){const path=routing.routes.get(w.id)!;assert.deepEqual(path[0],terminalPosition(doc,w.from));assert.deepEqual(path.at(-1),terminalPosition(doc,w.to));}
  return routing;
}
test('all 931 wires in 64 examples have complete equipment/wire-clear routes',()=>{
  assert.equal(LESSONS.length,64);let total=0;for(const lesson of LESSONS){valid(lesson.circuit);total+=lesson.circuit.wires.length;}assert.equal(total,931);
});
test('common-bore conductors have distinct rear ports and no incidental trunk intersections',()=>{
  const doc=fixture(),routing=valid(doc);
  const ports=doc.wires.map(w=>{const p=routing.routes.get(w.id)!;return w.from.component==='switch'?p[1]:p.at(-2)!;});
  assert.equal(new Set(ports.map(p=>p.join(','))).size,3);
  for(const p of ports)assert.ok(p[2]<terminalPosition(doc,ep('switch','COM'))[2]-.2);
});
test('component/wire array reorder gives identical deterministic routes',()=>{
  const doc=structuredClone(LESSONS[61].circuit),before=routeCircuit(doc);doc.wires.reverse();doc.components.reverse();
  const after=valid(doc);assert.equal(circuitRoutingKey(doc),circuitRoutingKey(LESSONS[61].circuit));
  for(const [id,path] of before.routes)assert.deepEqual(after.routes.get(id),path);
});
test('separate terminals aligned in X/Z retain clear approach legs',()=>{
  const doc=fixture();doc.wires=[doc.wires[0],{...doc.wires[1],to:ep('switch','OUT')}];valid(doc);
});
test('rotated and moved equipment keeps exact terminal endpoints and clear routes',()=>{
  for(const rotation of [Math.PI/2,Math.PI,Math.PI*1.5,.43]){const doc=fixture();doc.components[0].rotation=rotation;doc.components[0].position=[-2,.3,-1];valid(doc);}
  const vfd=structuredClone(LESSONS[57].circuit);const drive=vfd.components.find(c=>c.id==='drive')!;drive.rotation=Math.PI/2;drive.position=[-3,0,2];const motor=vfd.components.find(c=>c.type==='motor3')!;motor.rotation=-Math.PI/2;valid(vfd);
});
test('shared two-gang housing remains clear after group rotation and movement',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const doc=structuredClone(LESSONS[10].circuit),a=doc.components.find(c=>c.params.gangModule==='left')!,b=doc.components.find(c=>c.params.gangModule==='right')!;
    a.position=[-1,0,2];a.rotation=angle;b.rotation=angle;b.position=[a.position[0]+.46*Math.cos(angle),0,a.position[2]-.46*Math.sin(angle)];valid(doc);
  }
});
test('manual bends stay in their saved order while the planner inserts clear detours',()=>{
  const doc=fixture(),wire=doc.wires[0];wire.bends=[[1.5,.8,-1.4],[5,.8,-1.4]];
  const before=structuredClone(doc),routing=valid(doc),path=routing.routes.get(wire.id)!;
  let last=-1;for(const bend of wire.bends){const index=path.findIndex((p,i)=>i>last&&p.every((v,j)=>v===bend[j]));assert.ok(index>last);last=index;}
  assert.deepEqual(doc,before);doc.components[0].position=[-1,0,-2];valid(doc);assert.deepEqual(wire.bends,before.wires[0].bends);
});
test('impossible saved bends and obstructed fixture placement produce explicit issues, never unchecked paths',()=>{
  const doc=fixture(),before=structuredClone(doc);doc.wires[0].bends=[[3,.5,2]];
  const result=routeCircuit(doc);assert.ok(result.issues.some(i=>i.wire==='a'&&/inside equipment/.test(i.message)));assert.equal(result.routes.has('a'),false);
  doc.wires[0].bends=[];doc.components[1].position=[0,0,0];const obstructed=routeCircuit(doc);assert.ok(obstructed.issues.length);assert.deepEqual(before.wires,doc.wires);
});
test('mandatory bends that retrace the same conductor are reported without drawing self-overlap',()=>{
  const doc=fixture();doc.components=doc.components.slice(0,2);doc.wires=[doc.wires[0]];doc.wires[0].bends=[[1,1,-3],[4,1,-3],[2,1,-3]];
  const before=structuredClone(doc),result=routeCircuit(doc);assert.equal(result.routes.has('a'),false);assert.ok(result.issues.some(i=>/double back|cross itself/.test(i.message)));assert.deepEqual(doc,before);
});
test('inspection and operating state share cached routes while geometry changes invalidate them',()=>{
  const doc=fixture(),before=routeCircuit(doc),key=circuitRoutingKey(doc);doc.supply.enabled=true;doc.revision++;doc.components.forEach(c=>{c.params.coverOpen=true;c.params.inspectionView='exploded';c.params.closed=true;});
  assert.equal(circuitRoutingKey(doc),key);assert.strictEqual(routeCircuit(doc),before);
  doc.components[0].rotation=.25;assert.notEqual(circuitRoutingKey(doc),key);valid(doc);
});
test('large imported coordinates and out-of-range spans terminate with preserved documents',()=>{
  const doc=fixture();doc.wires=[doc.wires[0]];doc.components=doc.components.slice(0,2);doc.components.forEach(c=>{c.position=c.position.map(v=>v+9990) as Vec3;});
  const before=structuredClone(doc);valid(doc);assert.deepEqual(doc,before);
  doc.wires[0].bends=[[0,0,-9990]];const start=performance.now(),result=routeCircuit(doc);assert.ok(result.issues.some(i=>/80-unit/.test(i.message)));assert.ok(performance.now()-start<1000);
});
test('elevated blocked circuits keep detours near the terminals rather than dropping to world floor',()=>{
  for(const height of [100,9990]){const doc=fixture();doc.components=[
    {id:'left',type:'source',label:'Left',position:[0,height,0],rotation:0,params:{}},
    {id:'right',type:'source',label:'Right',position:[6,height,0],rotation:0,params:{}},
    {id:'obstacle',type:'panel',label:'Obstacle',position:[3,height-.5,-.7],rotation:0,params:{}},
  ];doc.wires=[{id:'link',from:ep('left','L'),to:ep('right','L'),role:'L',resistance:.01,bends:[]}];const routing=valid(doc);
  for(const p of routing.routes.get('link')!)assert.ok(Math.abs(p[1]-height)<3,`route dropped to ${p[1]}`);}
});
test('maximum-size disconnected board and 300-wire harness stay bounded and give honest results',()=>{
  const doc=fixture();doc.components=Array.from({length:80},(_,i)=>({id:`c${i}`,type:'socket',label:'Socket',position:[(i%10)*2,0,Math.floor(i/10)*2] as Vec3,rotation:0,params:{}}));
  doc.wires=Array.from({length:300},(_,i)=>({id:`w${i}`,from:ep(`c${i%80}`,'L'),to:ep(`c${(i+1)%80}`,'N'),role:'L' as const,resistance:.01,bends:[]}));
  const before=structuredClone(doc),start=performance.now(),result=routeCircuit(doc);assert.ok(performance.now()-start<15000);assert.deepEqual(doc,before);
  assert.equal(new Set([...result.routes.keys(),...result.issues.map(i=>i.wire)]).size,300);
  const collisionIssues=auditRoutes(doc,result).filter(i=>i.message.startsWith('Route crosses'));assert.deepEqual(collisionIssues,[]);
});
test('segment distance handles crossings, skew, parallel and degenerate segments',()=>{
  assert.equal(segmentDistance([0,0,0],[2,0,0],[1,-1,0],[1,1,0]),0);
  assert.equal(segmentDistance([0,0,0],[2,0,0],[0,0,1],[2,0,1]),1);
  assert.equal(segmentDistance([0,0,0],[0,0,0],[2,0,0],[4,0,0]),2);
  assert.equal(segmentDistance([0,0,0],[2,0,0],[3,0,0],[4,0,0]),1);
  assert.equal(WIRE_RADIUS,.018);
});
