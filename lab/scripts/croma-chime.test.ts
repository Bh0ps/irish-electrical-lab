import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Mesh,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {CROMA_ENVELOPE,CROMA_K1,CROMA_PINS,cromaLeadPath,cromaProbeContact} from '../lib/croma-chime';
import {definitionFor} from '../lib/components';
import {getLesson} from '../lib/lessons';
import {probeContact,segmentDistance,terminalPosition} from '../lib/routing';
import {validateCircuit} from '../lib/storage';
import {connectedRockerTerminals} from '../lib/wall-rocker';
import type {Vec3} from '../lib/types';

const doc=getLesson(72)!.circuit,chime=doc.components.find(x=>x.id==='chime')!;
const v=(p:Vec3)=>new Vector3(...p);

test('the real five-way K1 block and the old four-input model each round-trip their own circuit',()=>{
  assert.equal(chime.variant,'croma-100a');
  const pins=definitionFor(chime).terminals;
  assert.deepEqual(pins.map(t=>[t.id,t.label]),[['AC2','=/~'],['AC1','8/12V'],['FRONT','C1'],['REAR','C2'],['V','V']]);
  assert.deepEqual(validateCircuit(structuredClone(doc)).wires,doc.wires);
  const alternative=structuredClone(doc),feed=alternative.wires.find(w=>w.to.component==='back'&&w.to.terminal==='COM')!;
  feed.from={component:chime.id,terminal:'V'};
  assert.equal(validateCircuit(JSON.parse(JSON.stringify(alternative))).wires.find(w=>w.id===feed.id)?.from.terminal,'V');
  const old=structuredClone(doc);delete old.components.find(x=>x.id==='chime')!.variant;
  assert.deepEqual(definitionFor(old.components.find(x=>x.id==='chime')!).terminals.map(t=>t.id),['AC1','AC2','FRONT','REAR']);
  assert.deepEqual(validateCircuit(old).wires,doc.wires);
  assert.deepEqual(connectedRockerTerminals(chime,doc.wires)?.split(' '),CROMA_PINS.slice(0,4));
});

test('each front screw is visible only behind the opened lid and stays fixed across inspection modes at both detail levels',async()=>{
  for(const suffix of ['', '.low']){
    const raw=readFileSync(new URL('../public/models/callchime_croma-100a'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
    const model=prepareBlenderModel(scene,true),positions=new Map<string,Vec3>();
    model.scene.updateMatrixWorld(true);
    const size=new Box3().setFromObject(model.scene,true).getSize(new Vector3());
    assert.ok(size.distanceTo(v(CROMA_ENVELOPE))<.013,JSON.stringify(size));
    const lids=model.covers;
    assert.equal(lids.length,1);assert.ok(lids[0].node.userData.leftHandChimeLid);
    const terminalMarks=new Map<string,string>();
    model.scene.traverse(n=>{if(n.userData.terminalId){const id=String(n.userData.terminalId);assert.ok(!terminalMarks.has(id));terminalMarks.set(id,String(n.userData.fieldMarking));positions.set(id,n.getWorldPosition(new Vector3()).toArray());}});
    const wired=connectedRockerTerminals(chime,doc.wires);
    for(const view of ['normal','open','exploded','cutaway'] as const){
      presentBlenderModel(model,view,chime,undefined,undefined,wired);
      for(const t of definitionFor(chime).terminals){
        const probe=cromaProbeContact(t.id)!;
        assert.equal(terminalMarks.get(t.id),t.label);
        assert.ok(v(positions.get(t.id)!).distanceTo(v(t.anchor))<.00001);
        const origin=v(probe.position).addScaledVector(v(probe.normal),.94);
        const first=new Raycaster(origin,v(probe.normal).negate()).intersectObject(model.scene,true)[0];
        assert.ok(first);
        if(view==='normal')assert.equal(semanticOwner(first.object).part,'cover');
        else{
          assert.equal(semanticOwner(first.object).terminal,t.id,view+' '+suffix+' '+t.id);
          const material=(first.object as Mesh).material;
          assert.equal(Array.isArray(material)?material[0].name:material.name,'K1 clamp screw steel');
          assert.ok(first.point.distanceTo(v(probe.position))<.002);
        }
      }
      assert.deepEqual(model.receptacles.filter(n=>n.node.visible).map(n=>n.terminal).sort(),[...CROMA_PINS.slice(0,4)].sort());
    }
    presentBlenderModel(model,'open',chime,undefined,undefined,'V');
    assert.deepEqual(model.receptacles.filter(n=>n.node.visible).map(n=>n.terminal),['V']);
  }
});

test('all five side entries reach K1 with separate insulated cores and separate front probe points',()=>{
  const paths=CROMA_PINS.map(cromaLeadPath);
  for(const [i,path] of paths.entries()){
    const id=CROMA_PINS[i],e={component:'chime',terminal:id};
    const mouth=terminalPosition(doc,e),tip=probeContact(doc,e);
    assert.ok(v(mouth).distanceTo(v(tip.position))>.07);
    const rear=path.at(-1)!;
    assert.ok(Math.abs(rear[0]-CROMA_K1.centre[0])<=CROMA_K1.width/2-.018);
    assert.ok(Math.abs(rear[1]-CROMA_K1.centre[1])<=CROMA_K1.height/2-.018);
    assert.ok(rear[2]<0);
    for(const other of paths.slice(i+1))for(let a=1;a<path.length;a++)for(let b=1;b<other.length;b++)
      assert.ok(segmentDistance(path[a-1],path[a],other[b-1],other[b])>=.0365);
  }
});
