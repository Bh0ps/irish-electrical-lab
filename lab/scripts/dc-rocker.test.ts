import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Box3,Raycaster,Vector3,type Material} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {COMPONENTS,definitionFor} from '../lib/components';
import {connectedRockerTerminals,rockerBladeY,rockerProbeApproach,rockerProbeContact,rockerWireEntry} from '../lib/dc-rocker';
import {equipmentAsset,equipmentReferences} from '../lib/equipment-assets';
import {getLesson} from '../lib/lessons';
import {auditRoutes,probeContact,routeCircuit,terminalPosition} from '../lib/routing';
import {simulate} from '../lib/simulation';
import {validateCircuit} from '../lib/storage';
import {getComponentTerminals} from '../lib/terminal-layout';
import type {Endpoint,Vec3} from '../lib/types';

const original=getLesson(66)!.circuit;
const sw=original.components.find(c=>c.id==='right-switch')!;
const keys=['COM','OUT'];
const source=(file:string)=>new URL('../public/models/switch_dc-rocker'+file+'.glb',import.meta.url);
const bladeMaterial=(material:Material|Material[])=>!Array.isArray(material)&&material.name==='Plated male blade';

test('the new worktop example uses two rated DC rockers and keeps previous switches and saved wiring intact',()=>{
  const switches=original.components.filter(c=>c.type==='switch');
  assert.deepEqual(switches.map(c=>c.variant),['dc-rocker','dc-rocker']);
  const def=definitionFor(sw);
  assert.match(def.abstraction!,/10 A at 28 V DC/);
  assert.deepEqual(getComponentTerminals(sw,def).map(t=>[t.id,t.label,t.role]),[['COM','2','DC+'],['OUT','1','DC+']]);
  const refs=equipmentReferences(sw,def).map(r=>r.url),{allowedReference}=createRequire(import.meta.url)('../desktop/app/security.cjs');
  assert.equal(refs.length,2);assert.ok(refs.every(allowedReference));
  assert.equal(allowedReference('https://www.switchcomp.com/unrelated'),false);
  const legacy=structuredClone(original);
  for(const item of legacy.components.filter(c=>c.type==='switch'))delete item.variant;
  const restored=validateCircuit(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(restored.wires,validateCircuit(original).wires);
  assert.equal(equipmentAsset(restored.components.find(c=>c.id===sw.id)!,COMPONENTS.switch)?.galleryKey,'switch:single-rocker');
  for(const example of [original,restored]){
    for(const left of [true,false])for(const right of [true,false]){
      const doc=structuredClone(example);
      doc.components.find(c=>c.id==='left-switch')!.params.closed=left;
      doc.components.find(c=>c.id==='right-switch')!.params.closed=right;
      const result=simulate(doc);
      assert.equal(result.converged,true);
      assert.equal(result.deviceStates.left.energized,left);
      assert.equal(result.deviceStates.right.energized,right);
    }
  }
});

test('both GLBs expose a selectable rocker, the real numbered rear blades and independently fitted push-on terminals',async()=>{
  for(const suffix of ['', '.low']){
    const bytes=readFileSync(source(suffix)),loader=new GLTFLoader();
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const model=prepareBlenderModel(scene,suffix==='.low');
    const hits=(at:Vector3,direction:Vector3)=>new Raycaster(at,direction).intersectObject(model.scene,true);
    for(const connected of ['', 'COM', 'OUT', 'COM OUT']){
      presentBlenderModel(model,'normal',sw,undefined,undefined,connected);
      model.scene.updateMatrixWorld(true);
      assert.deepEqual(model.receptacles.filter(r=>r.node.visible).map(r=>r.terminal).sort(),connected.split(' ').filter(Boolean));
      const front=hits(new Vector3(0,.48,2),new Vector3(0,0,-1))[0];
      assert.equal(semanticOwner(front.object).part,'actuator','click on the working face');
      for(const key of keys){
        const shoulder=new Vector3(...rockerProbeContact(key)),normal=new Vector3(...rockerProbeApproach);
        const touch=hits(shoulder.clone().addScaledVector(normal,.36),normal.clone().negate())[0];
        assert.equal(semanticOwner(touch.object).terminal,key);
        assert.ok(model.meshes.some(m=>m.node===touch.object&&bladeMaterial(m.material)));
        assert.ok(touch.point.distanceTo(shoulder)<.0015,suffix+'/'+key+' probe lands on exposed metal, clear of the connector and the other blade');
        const blade=model.meshes.filter(m=>semanticOwner(m.node).terminal===key&&bladeMaterial(m.material));
        assert.ok(blade.length);
        const box=blade.reduce((b,m)=>b.union(new Box3().setFromObject(m.node,true)),new Box3());
        assert.ok(Math.abs(box.min.z+.7725)<.003 && Math.abs(box.getCenter(new Vector3()).y-rockerBladeY(key))<.001);
        if(connected.includes(key)){
          const sleeve=model.receptacles.find(r=>r.terminal===key)!.node;
          assert.ok(Math.abs(new Box3().setFromObject(sleeve,true).min.z-rockerWireEntry(key)[2])<.002);
        }
      }
      const cap=model.motions.find(m=>m.node.userData.partId==='actuator')!;
      animateBlenderModel(model,sw,undefined,.04,true);const on=cap.node.quaternion.clone();
      animateBlenderModel(model,{...sw,params:{...sw.params,closed:false}},undefined,.04,true);
      assert.ok(on.angleTo(cap.node.quaternion)>.3);
    }
    for(const m of model.owned)m.dispose();
  }
});

test('wired blades keep their independent sleeves, axial wire entry and a clear side approach at every bench rotation',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    const doc=structuredClone(original),item=doc.components.find(c=>c.id===sw.id)!;
    item.rotation=yaw;
    const plan=routeCircuit(doc);
    assert.deepEqual(auditRoutes(doc,plan),[]);
    assert.equal(connectedRockerTerminals(item,doc.wires),'COM OUT');
    for(const key of keys){
      const e:Endpoint={component:sw.id,terminal:key};
      const same=(p:Endpoint)=>p.component===e.component&&p.terminal===key;
      const w=doc.wires.find(w=>same(w.from)||same(w.to))!;
      const saved=doc.wires.filter(other=>other.id!==w.id);
      assert.equal(connectedRockerTerminals(item,saved),key==='COM'?'OUT':'COM');
      assert.equal(connectedRockerTerminals(item,[...saved,w]),'COM OUT');
      const axial=(p:Vec3)=>new Vector3(...p).applyAxisAngle(new Vector3(0,1,0),yaw).add(new Vector3(...item.position));
      const path=[...plan.routes.get(w.id)!];if(same(w.to))path.reverse();
      const tip=terminalPosition(doc,e),exit=rockerWireEntry(key);
      assert.deepEqual(tip,path[0]);assert.ok(new Vector3(...path[1]).distanceTo(axial([exit[0],exit[1],exit[2]-.075]))<1e-6);
      assert.ok(new Vector3(...probeContact(doc,e).position).distanceTo(axial(rockerProbeContact(key)))<1e-6);
    }
  }
});
