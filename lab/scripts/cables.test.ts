import test from 'node:test';
import assert from 'node:assert/strict';
import {addCableConnection, cleanCableRuns, markedRole, suggestedCableChoice} from '../lib/cables.ts';
import {assessConnections} from '../lib/assessment.ts';
import {LESSONS} from '../lib/lessons.ts';
import {routeCircuit,auditRoutes,terminalPosition,segmentDistance} from '../lib/routing.ts';
import {simulate} from '../lib/simulation.ts';
import {validateCircuit} from '../lib/storage.ts';
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createBoundedWireCurve} from '../lib/Equipment.tsx';
import {cableProfile,coreRadius,coreSeat} from '../lib/cable-form.ts';
import {createCableMesh,createBareTip} from '../lib/cable-mesh.ts';
import type {CableKind,CircuitDocument,Wire} from '../lib/types.ts';

function fixture() {
  const example=structuredClone(LESSONS[6].circuit);
  const base: CircuitDocument={...example,lessonId:undefined,components:example.components.filter(c=>c.id==='supply'||c.id==='light'),wires:[]};
  const cores: Wire[]=(['L','N','PE'] as const).map((role,i)=>({
    id:'test-'+i,role,from:{component:'supply',terminal:role},to:{component:'light',terminal:role},resistance:.01,bends:[],
  }));
  return {base,cores};
}
function build(kind:CableKind) {
  const {base,cores}=fixture();
  return cores.reduce((doc,wire)=>addCableConnection(doc,wire,{kind}).document,base);
}
test('three real cores share one sheath and the actual graph gives identical lamp power and individual currents',()=>{
  const single=build('single'),flat=build('flat'),flex=build('flex'),expected=simulate(single);
  assert.equal(single.cableRuns,undefined);
  for(const doc of [flat,flex]){
    assert.equal(doc.cableRuns!.length,1);
    assert.deepEqual(doc.wires.map(w=>w.cable?.core),['brown','blue','green-yellow']);
    assert.deepEqual(simulate(doc).wireCurrents,expected.wireCurrents);
    assert.deepEqual(simulate(doc).componentPower,expected.componentPower);
    assert.deepEqual(validateCircuit(JSON.parse(JSON.stringify(doc))),Object.fromEntries(Object.entries(doc).filter(([,v])=>v!==undefined)));
    const routing=routeCircuit(doc),physical=routing.cables!.get(doc.cableRuns![0].id)!;
    assert.equal(physical.tails.size,3);
    assert.equal(physical.open.length,0);
    assert.ok(physical.sheath.length>=2);
    assert.deepEqual(auditRoutes(doc,routing),[]);
    for(const w of doc.wires){
      const route=routing.routes.get(w.id)!;
      assert.deepEqual(route[0],terminalPosition(doc,w.from));
      assert.deepEqual(route.at(-1),terminalPosition(doc,w.to));
    }
  }
});
test('a removed core is visibly open at each end and never conducts through its sheath; restoring the snapshot restores operation',()=>{
  const original=build('flat'),doc={...original,wires:original.wires.filter(w=>w.role!=='N')},r=routeCircuit(doc);
  assert.equal(r.routes.size,2);
  assert.deepEqual(r.cables!.values().next().value!.open.map(p=>p.core),['blue','blue']);
  assert.ok((simulate(doc).componentPower.light??0)<.001);
  assert.ok(simulate(original).componentPower.light>50);
  const empty={...doc,wires:[]},open=routeCircuit(empty);
  assert.equal(open.routes.size,0);assert.equal(open.cables!.size,1);assert.equal(open.cables!.values().next().value!.open.length,6);
  assert.deepEqual(auditRoutes(empty,open),[]);
});
test('manual identification can land the wrong physical core, reversed endpoints share a sheath, and occupied cores cannot be reused',()=>{
  const {base,cores}=fixture();
  const blue=addCableConnection(base,cores[0],{kind:'flat',core:'blue'}).document;
  assert.equal(blue.wires[0].role,'N');assert.deepEqual(blue.wires[0].from,cores[0].from);
  assert.ok(assessConnections(blue,{...base,wires:[cores[0]]}).some(item=>item.id==='identity:test-0'&&item.status==='fail'));
  const runId=blue.cableRuns![0].id;
  const wrong={...cores[2],from:{component:'light',terminal:'N'},to:{component:'supply',terminal:'PE'}};
  const doc=addCableConnection(blue,wrong,{kind:'flat',core:'green-yellow',runId}).document;
  assert.equal(doc.wires[1].cable!.reversed,true);assert.deepEqual(doc.wires[1].from,wrong.from);
  assert.ok(simulate(doc).diagnostics.some(d=>d.category==='protection'));
  const route=routeCircuit(doc).routes.get(wrong.id)!;
  assert.deepEqual(route[0],terminalPosition(doc,wrong.from));assert.deepEqual(route.at(-1),terminalPosition(doc,wrong.to));
  assert.throws(()=>addCableConnection(doc,{...cores[1],id:'again'},{kind:'flat',core:'blue',runId}),/already connected/);
  assert.equal(markedRole('brown','control'),'control');
});
test('reject malformed cable links before import and clean removed equipment without modifying an old snapshot',()=>{
  const original=build('flex'),bad=structuredClone(original);bad.wires[1].cable=bad.wires[0].cable;
  assert.throws(()=>validateCircuit(bad),/marked cable core|already been terminated/);
  assert.throws(()=>validateCircuit({...original,cableRuns:[]}),/missing cable/);
  assert.throws(()=>validateCircuit({...original,cableRuns:[...original.cableRuns!,...original.cableRuns!]}),/duplicates another cable/);
  const clean=cleanCableRuns({...original,components:original.components.slice(0,1),wires:[]});
  assert.equal(clean.cableRuns?.length,0);assert.equal(original.cableRuns?.length,1);
  for(const lesson of LESSONS)assert.deepEqual(validateCircuit(lesson.circuit),lesson.circuit);
});
test('a shared flat run is suggested only when a real set of endpoints supports its available core markings',()=>{
  const radial=LESSONS[16].circuit;
  const between=radial.wires.find(w=>w.from.component==='socket-a'&&w.to.component==='socket-b')!;
  assert.equal(suggestedCableChoice({...radial,wires:[]},between,radial).kind,'flat');
  const light=LESSONS[6].circuit,switched=light.wires.find(w=>w.from.component==='switch'&&w.to.component==='light')!;
  assert.equal(suggestedCableChoice(light,switched,light).kind,'single');
  const d=light.wires.reduce((doc,wire)=>addCableConnection(doc,wire,{kind:'flat'}).document,{...light,wires:[]} as CircuitDocument);
  assert.deepEqual(auditRoutes(d),[]);
});

test('a bell return and a cool LED channel get the same core whichever terminal is picked first', () => {
  for (const [id,kind,expected] of [[72,'bell-pair','white'],[69,'multi-strip','yellow']] as const) {
    const circuit = structuredClone(LESSONS.find(lesson=>lesson.id===id)!.circuit);
    const original = circuit.wires.find(w=>w.cable?.core===expected)!;
    assert.ok(original);
    circuit.wires = [];
    circuit.cableRuns = [];
    for (const [from,to] of [[original.from,original.to],[original.to,original.from]]) {
      const {document} = addCableConnection(circuit,{...original,from,to},{kind});
      assert.equal(document.wires[0].cable?.core,expected);
    }
  }
});


test('each connected or loose core emerges from its own seat on both cut faces',()=>{
  const seen=new Set<CableKind>();
  for(const lesson of LESSONS.filter(l=>l.circuit.cableRuns?.length)){
    const doc=lesson.circuit,plan=routeCircuit(doc);
    for(const run of doc.cableRuns!){
      seen.add(run.kind);
      const routed=plan.cables!.get(run.id)!,faces=routed.faces;
      const radius=coreRadius(run.kind);
      const positions=createCableMesh(run.kind,routed.sheath,faces);
      const mesh=positions.getAttribute('position');
      for(const side of [0,1] as const){
        const connected=doc.wires.filter(w=>w.cable?.runId===run.id).map(w=>{
          const tail=routed.tails.get(w.id)![side];
          return {core:w.cable!.core, points:side?tail:[...tail].reverse()};
        });
        const all=[...connected,...routed.open.filter(e=>e.side===side)].map(entry=>{
          const lead=entry.points.slice(0,run.kind==='multi-strip'?6:4);
          const curve=createBoundedWireCurve(lead);
          const path=Array.from({length:curve.tubularSegments+1},(_,j)=>curve.getPointAt(j/curve.tubularSegments).toArray() as [number,number,number]);
          return {...entry,path};
        });
        assert.equal(all.length,Object.keys(cableProfile(run.kind).centres).length);
        const face=faces[side],out=new Vector3(...face.tangent).multiplyScalar(side?1:-1);
        const pc=new Vector3(...face.centre).addScaledVector(out,-.006);
        const radial=new Vector3(...face.across);
        const ray=new Raycaster(pc.clone().addScaledVector(radial,.15),radial.clone().negate());
        const material=new MeshBasicMaterial();
        assert.ok(ray.intersectObject(new Mesh(positions,material)).length,run.kind+' can be clicked at its cut end');
        material.dispose();
        for(const [i,{core,points,path}] of all.entries()){
          const seat=new Vector3(...coreSeat(run.kind,face,core));
          assert.deepEqual(points[0],seat.toArray());
          assert.ok(new Vector3(...points[1]).sub(seat).normalize().dot(out)>.999999,'leave the cut squarely');
          // The opening in a jacket, or the edge of a bonded core, is present
          // in the emitted GPU geometry at the same point used by the meter.
          let ringPoints=0;
          const delta=new Vector3();
          for(let j=0;j<mesh.count;j++){
            delta.fromBufferAttribute(mesh,j).sub(seat);
            if(Math.abs(delta.dot(out))<2e-6&&Math.abs(delta.length()-radius)<2e-6)ringPoints++;
          }
          assert.ok(ringPoints>=8,run.kind+' '+core+' has a physical rim at this seat');
          for(const other of all.slice(0,i)){
            for(let a=1;a<path.length;a++){
              for(let b=1;b<other.path.length;b++){
                const gap=segmentDistance(path[a-1],path[a],other.path[b-1],other.path[b]);
                assert.ok(gap>=2*radius-1e-6,run.kind+' cores cross in the breakout');
              }
            }
          }
        }
      }
      positions.dispose();
    }
  }
  assert.deepEqual([...seen].sort(),['bell-pair','flat','flex','led-pair','multi-strip']);
});

test('fine-stranded and solid loose ends have exposed copper beyond the insulation',()=>{
  const line:[[number,number,number],[number,number,number]]=[[0,0,0],[0,0,1]];
  const sizes=['flat','flex'].map(kind=>{
    const tip=createBareTip(kind as 'flat'|'flex','brown',line);
    tip.computeBoundingBox();assert.ok(tip.boundingBox!.max.z>1);
    const vertices=tip.getAttribute('position').count;tip.dispose();return vertices;
  });
  assert.ok(sizes[1]>sizes[0]*3,'fine flex uses a visible bundle of separate strand tips');
});
