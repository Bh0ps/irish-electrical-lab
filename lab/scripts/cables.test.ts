import test from 'node:test';
import assert from 'node:assert/strict';
import {addCableConnection, cleanCableRuns, markedRole, suggestedCableChoice} from '../lib/cables.ts';
import {assessConnections} from '../lib/assessment.ts';
import {LESSONS} from '../lib/lessons.ts';
import {routeCircuit,auditRoutes,terminalPosition} from '../lib/routing.ts';
import {simulate} from '../lib/simulation.ts';
import {validateCircuit} from '../lib/storage.ts';
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
